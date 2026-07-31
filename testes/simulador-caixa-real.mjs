// Regressão contra uma simulação REAL do aplicativo Habitação da Caixa,
// anonimizada: só os valores financeiros, sem nome, CPF, endereço ou número de
// contrato.
//
// Contrato em andamento: 360 meses contratados, juros nominais 6% a.a.,
// 235 prestações restantes. Os valores abaixo foram lidos das telas
// "Resumo do contrato" e "Reduzir saldo ou quitar".
//
// Se algum destes quebrar, o app mostra número diferente do que o cliente vê
// no banco — e é isso que destrói a confiança na ferramenta.

import {
  repartirAporte,
  prazoParaQuitar,
  simularAporte,
  estimarLiquidacao,
  sugestoesDeAporte,
  jurosTotais,
} from "../js/calc/simulador.js";
import { taxaMensalCaixa } from "../js/calc/caixa.js";
import { fatorCorrecao, taxaPosChaves } from "../js/calc/correcao.js";

let falhas = 0;
function eq(obtido, esperado, msg, eps = 0.01) {
  // Infinity - Infinity dá NaN, e NaN reprova qualquer comparação: trata à parte
  const ok =
    obtido === esperado || (Number.isFinite(obtido) && Number.isFinite(esperado) && Math.abs(obtido - esperado) <= eps);
  if (!ok) {
    console.error(`FALHA: ${msg}\n   esperado ${esperado}, obtido ${obtido}`);
    falhas++;
  } else console.log(`OK: ${msg} = ${typeof obtido === "number" ? obtido.toFixed(2) : obtido}`);
}
function truthy(cond, msg) {
  if (!cond) {
    console.error(`FALHA: ${msg}`);
    falhas++;
  } else console.log(`OK: ${msg}`);
}

// ---- Valores lidos das telas do app ----
const CONTRATO = {
  saldoDevedor: 91853.78,
  prazoRestante: 235,
  prestacao: 869.41,
  valorFinanciado: 121032.81,
  prazoContratado: 360,
  jurosNominalAnual: 0.06,
};
// Tela "Reduzir saldo ou quitar", modo Prazo, aporte de uma prestação:
const SIMULACAO_APP = {
  aporte: 869.41,
  jurosDiarios: 3.6,
  amortizacaoEfetiva: 865.81,
  novoSaldo: 90987.97,
  prazoNovo: 231,
  dias: 25, // 06/jul (vencimento) até 31/jul (data da simulação)
};
const LIQUIDACAO_APP = { total: 92216.8, jurosDiarios: 382.56 };

const i = taxaMensalCaixa(CONTRATO.jurosNominalAnual, 0);

console.log("=== Taxa mensal ===");
eq(i, 0.005, "6% nominal / 12 = 0,5% ao mês", 1e-12);

console.log("\n=== Repartição do aporte (juros corridos vs amortização) ===");
{
  const r = repartirAporte({ aporte: SIMULACAO_APP.aporte, taxaMensal: i, dias: SIMULACAO_APP.dias });
  eq(r.jurosDiarios, SIMULACAO_APP.jurosDiarios, "juros diários batem com o app", 0.01);
  eq(r.amortizacaoEfetiva, SIMULACAO_APP.amortizacaoEfetiva, "amortização efetiva bate com o app", 0.01);
  // As duas partes têm de recompor o valor pago, sem sobra
  eq(r.jurosDiarios + r.amortizacaoEfetiva, SIMULACAO_APP.aporte, "as partes recompõem o aporte", 0.005);

  // Pagando no dia do vencimento, o aporte inteiro amortiza
  const noDia = repartirAporte({ aporte: 1000, taxaMensal: i, dias: 0 });
  eq(noDia.jurosDiarios, 0, "sem dias corridos, não há juros a descontar", 1e-9);
  eq(noDia.amortizacaoEfetiva, 1000, "aporte inteiro vira amortização", 1e-9);
}

console.log("\n=== Prazo restante conferido pela fórmula ===");
{
  // A parcela de amortização + juros implícita no contrato
  const parcelaBase = (CONTRATO.saldoDevedor * i) / (1 - Math.pow(1 + i, -CONTRATO.prazoRestante));
  console.log(`   parcela base implícita: R$ ${parcelaBase.toFixed(2)}`);
  console.log(`   seguros embutidos:      R$ ${(CONTRATO.prestacao - parcelaBase).toFixed(2)} (23% da prestação)`);

  // Aplicando a amortização efetiva do app, o prazo tem de cair para o que o app mostra
  const prazoDepois = prazoParaQuitar({
    saldo: SIMULACAO_APP.novoSaldo,
    taxaMensal: i,
    parcela: parcelaBase,
  });
  eq(Math.ceil(prazoDepois), SIMULACAO_APP.prazoNovo, "novo prazo bate com o app (231 meses)", 0);
  console.log(`   prazo exato: ${prazoDepois.toFixed(2)} meses -> arredonda para ${Math.ceil(prazoDepois)}`);
}

console.log("\n=== Simulação completa nos dois modos ===");
{
  const parcelaBase = (CONTRATO.saldoDevedor * i) / (1 - Math.pow(1 + i, -CONTRATO.prazoRestante));
  const seguros = CONTRATO.prestacao - parcelaBase;

  const s = simularAporte({
    saldoAtual: CONTRATO.saldoDevedor,
    prazoRestanteMeses: CONTRATO.prazoRestante,
    taxaMensal: i,
    parcelaBase,
    segurosMensais: seguros,
    aporte: SIMULACAO_APP.aporte,
    dias: SIMULACAO_APP.dias,
  });

  eq(s.prazo.novoSaldo, SIMULACAO_APP.novoSaldo, "novo saldo devedor bate com o app", 0.01);
  eq(s.prazo.prazoMeses, SIMULACAO_APP.prazoNovo, "modo prazo: 231 meses", 0);
  eq(s.prazo.mesesEconomizados, 4, "modo prazo: economiza 4 meses", 0);
  eq(s.prazo.prestacao, CONTRATO.prestacao, "modo prazo mantém a prestação", 0.01);

  // Modo prestação: mesmo prazo, parcela menor
  eq(s.prestacao.prazoMeses, CONTRATO.prazoRestante, "modo prestação mantém o prazo", 0);
  truthy(s.prestacao.prestacao < CONTRATO.prestacao, "modo prestação reduz a prestação");
  truthy(s.prestacao.alivioMensal > 0, "modo prestação dá alívio mensal");
  console.log(`   modo prestação: alívio de R$ ${s.prestacao.alivioMensal.toFixed(2)}/mês`);

  // A lição que o cliente precisa aprender: reduzir prazo economiza mais juros
  truthy(
    s.prazo.jurosEconomizados > s.prestacao.jurosEconomizados,
    "reduzir PRAZO economiza mais juros que reduzir PRESTAÇÃO"
  );
  console.log(
    `   juros economizados: prazo R$ ${s.prazo.jurosEconomizados.toFixed(2)} vs prestação R$ ${s.prestacao.jurosEconomizados.toFixed(2)}`
  );

  // Aporte que cobre o saldo inteiro não pode deixar saldo negativo
  const quitando = simularAporte({
    saldoAtual: CONTRATO.saldoDevedor,
    prazoRestanteMeses: CONTRATO.prazoRestante,
    taxaMensal: i,
    parcelaBase,
    segurosMensais: seguros,
    aporte: 200000,
    dias: 0,
  });
  eq(quitando.prazo.novoSaldo, 0, "aporte maior que o saldo zera a dívida, sem negativo", 0.01);
  eq(quitando.prazo.prazoMeses, 0, "com o saldo zerado, não sobram prestações", 0);
}

console.log("\n=== Estimativa de liquidação ===");
{
  const est = estimarLiquidacao({
    saldoAtual: CONTRATO.saldoDevedor,
    taxaMensal: i,
    dias: LIQUIDACAO_APP.jurosDiarios / ((CONTRATO.saldoDevedor * i) / 30),
  });
  eq(est.jurosCorridos, LIQUIDACAO_APP.jurosDiarios, "juros corridos da liquidação", 0.01);

  // Com 25 dias, a estimativa fica a menos de 0,1% do valor que o app cobra.
  // A diferença restante vem de ajustes que a tela do app não detalha, então o
  // número é rotulado como estimativa na interface.
  const est25 = estimarLiquidacao({ saldoAtual: CONTRATO.saldoDevedor, taxaMensal: i, dias: 25 });
  const desvio = Math.abs(est25.total - LIQUIDACAO_APP.total) / LIQUIDACAO_APP.total;
  truthy(desvio < 0.001, `estimativa de liquidação a menos de 0,1% do app (desvio ${(desvio * 100).toFixed(3)}%)`);
  console.log(`   estimado R$ ${est25.total.toFixed(2)} vs app R$ ${LIQUIDACAO_APP.total.toFixed(2)}`);
}

console.log("\n=== Guardas do simulador ===");
{
  // Parcela que não cobre os juros nunca quita: prazo infinito, não laço eterno
  eq(prazoParaQuitar({ saldo: 100000, taxaMensal: 0.01, parcela: 500 }), Infinity,
    "parcela abaixo dos juros devolve prazo infinito", 0);
  eq(jurosTotais({ saldo: 100000, taxaMensal: 0.01, parcela: 500, meses: Infinity }), 0,
    "juros totais com prazo infinito devolve zero em vez de travar", 0);
  eq(prazoParaQuitar({ saldo: 0, taxaMensal: 0.005, parcela: 800 }), 0, "saldo zero, prazo zero", 0);

  const sug = sugestoesDeAporte({ prestacao: 869.41, saldoAtual: 91853.78 });
  truthy(sug.length === 4, "quatro atalhos de aporte");
  truthy(sug.every((s) => s.valor < 91853.78), "nenhum atalho passa do saldo devedor");
}

console.log("\n=== Correção da entrada em duas fases ===");
{
  const params = {
    mesEntregaChaves: 24,
    inccMensal: 0.005,
    taxaPosChavesMensal: taxaPosChaves({ jurosMensal: 0.01, inflacaoMensal: 0.004 }),
  };

  // 1% + IPCA compõe geometricamente, não soma
  eq(params.taxaPosChavesMensal, 1.01 * 1.004 - 1, "1% + IPCA compõe geometricamente", 1e-12);
  truthy(params.taxaPosChavesMensal > 0.014, "a composição é maior que a soma simples");

  // Antes das chaves só o INCC incide
  eq(fatorCorrecao(12, params), Math.pow(1.005, 12), "mês 12 só tem INCC", 1e-12);
  eq(fatorCorrecao(24, params), Math.pow(1.005, 24), "no mês da entrega, ainda só INCC", 1e-12);

  // Depois das chaves as duas fases se encadeiam
  const esperado30 = Math.pow(1.005, 24) * Math.pow(1 + params.taxaPosChavesMensal, 6);
  eq(fatorCorrecao(30, params), esperado30, "mês 30 encadeia INCC da obra + índice pós-chaves", 1e-12);
  truthy(fatorCorrecao(30, params) > fatorCorrecao(24, params), "correção segue subindo após as chaves");

  // A troca de índice tem efeito real: pós-chaves encarece mais rápido
  const passoObra = fatorCorrecao(12, params) / fatorCorrecao(11, params);
  const passoPos = fatorCorrecao(30, params) / fatorCorrecao(29, params);
  truthy(passoPos > passoObra, "parcela pós-chaves sobe mais rápido que durante a obra");
  console.log(`   passo mensal: obra ${((passoObra - 1) * 100).toFixed(3)}% -> pós-chaves ${((passoPos - 1) * 100).toFixed(3)}%`);

  // Sem entrega definida, tudo cai na fase de obra
  eq(fatorCorrecao(30, { inccMensal: 0.005 }), Math.pow(1.005, 30),
    "sem mês de entrega, tudo é fase de obra", 1e-12);
}

console.log(falhas ? `\n❌ ${falhas} verificação(ões) falharam` : "\n✅ Simulador bate com o app da Caixa");
process.exitCode = falhas ? 1 : 0;
