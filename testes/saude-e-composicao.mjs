// Indicadores de saúde do contrato e composições dos gráficos de rosca.
//
// Os números do caso base vêm da mesma simulação real anonimizada usada em
// caso-caixa-real.mjs.

import {
  saudeDoContrato,
  indicadorPontualidade,
  indicadorAportes,
  indicadorComprometimento,
  indicadorVsPlano,
} from "../js/calc/saude.js";
import { composicaoDoImovel, composicaoDoDesembolso } from "../js/calc/composicao.js";
import { montarAportes } from "../js/calc/cenarios.js";

let falhas = 0;
function eq(obtido, esperado, msg, eps = 0.01) {
  const ok = typeof obtido === "number" ? Math.abs(obtido - esperado) <= eps : obtido === esperado;
  if (!ok) {
    console.error(`FALHA: ${msg}\n   esperado ${esperado}, obtido ${obtido}`);
    falhas++;
  } else console.log(`OK: ${msg} = ${obtido}`);
}
function truthy(cond, msg) {
  if (!cond) {
    console.error(`FALHA: ${msg}`);
    falhas++;
  } else console.log(`OK: ${msg}`);
}

function casoBase() {
  return {
    id: "teste",
    nome: "Cliente Fictício",
    criadoEm: "2026-08-01T00:00:00.000Z",
    versaoModelo: 4,
    aprovacao: {
      valorImovel: 260000,
      valorAvaliacao: 260000,
      valorFinanciamento: 165810.07,
      valorSubsidio: 4211,
      prazoMeses: 420,
      sistema: "PRICE",
      jurosNominalAnual: 0.045,
      trAnual: 0,
      primeiraPrestacaoDoc: 817.26,
      rendaBruta: 2724.2,
      comprometimentoMax: 0.3,
    },
    entrada: {
      sinal: 10000,
      fgtsNaEntrada: 25000,
      serieMensal: { quantidade: 24, valor: 2290.79, mesInicial: 1 },
      baloes: [],
      inccMensal: 0.005,
      prazoObraMeses: 0,
      taxaMensalObra: 0,
    },
    estrategia: {
      salarioBruto: 2724.2,
      usarFGTS: true,
      intervaloSaqueFGTSMeses: 24,
      valor13: 2270,
      usar13: true,
      aportesAvulsos: [],
    },
    acompanhamento: { dataBaseISO: "2026-08", mesEntregaChaves: 25, meses: {} },
  };
}

console.log("=== Composição do imóvel (rosca 1) ===");
{
  const c = casoBase();
  const comp = composicaoDoImovel(c);
  eq(comp.fatias.length, 3, "três fatias: financiamento, subsídio e entrada", 0);
  // A rosca precisa somar exatamente o valor de compra e venda
  eq(comp.total, 260000, "as fatias somam o valor do imóvel", 0.01);
  eq(
    comp.fatias.find((f) => f.chave === "entrada").valor,
    89978.93,
    "fatia da entrada bate com a derivada do documento"
  );
  // Fatias com valor zero não podem virar fatia (rosca com fatia invisível)
  const semSubsidio = casoBase();
  semSubsidio.aprovacao.valorSubsidio = 0;
  eq(composicaoDoImovel(semSubsidio).fatias.length, 2, "sem subsídio, só duas fatias", 0);
}

console.log("\n=== Para onde vai o dinheiro (rosca 2) ===");
{
  const c = casoBase();
  const d = composicaoDoDesembolso(c);

  truthy(d.fatias.length >= 3 && d.fatias.length <= 4, "entre 3 e 4 fatias (limite de leitura da rosca)");
  truthy(d.fatias.length <= 6, "nunca passa de 6 fatias");

  // O total tem de ser a soma das fatias, sem sobra
  const soma = d.fatias.reduce((acc, f) => acc + f.valor, 0);
  eq(soma, d.total, "total é exatamente a soma das fatias", 0.01);

  // Patrimônio = entrada + principal financiado (o subsídio não sai do bolso)
  eq(d.patrimonio, 89978.93 + 165810.07, "patrimônio = entrada + valor financiado", 0.01);
  eq(d.custo, d.total - d.patrimonio, "custo é o complemento do patrimônio", 0.01);
  truthy(d.proporcaoCusto > 0 && d.proporcaoCusto < 1, "proporção de custo entre 0 e 1");
  console.log(
    `   desembolso R$ ${d.total.toFixed(2)} | patrimônio R$ ${d.patrimonio.toFixed(2)} | custo ${(d.proporcaoCusto * 100).toFixed(1)}%`
  );

  // Sem obra e sem INCC, a fatia de correção desaparece
  const semIncc = casoBase();
  semIncc.entrada.inccMensal = 0;
  const d2 = composicaoDoDesembolso(semIncc);
  truthy(!d2.fatias.find((f) => f.chave === "incc"), "sem INCC, não há fatia de correção");
  truthy(d2.total < d.total, "sem INCC o desembolso total é menor");
}

console.log("\n=== Pontualidade ===");
{
  // Antes do contrato começar, nada venceu
  const antes = indicadorPontualidade(casoBase(), new Date("2026-07-15"));
  eq(antes.status, "neutro", "antes do contrato, status neutro");

  // 3 meses vencidos, nada pago
  const atrasado = indicadorPontualidade(casoBase(), new Date("2026-10-15"));
  eq(atrasado.status, "critico", "3 meses vencidos sem pagar é crítico");
  truthy(atrasado.rotulo.includes("aberto"), "rótulo fala de meses em aberto");

  // Todos pagos
  const c = casoBase();
  for (let m = 1; m <= 3; m++) c.acompanhamento.meses[String(m)] = { pago: true };
  const emDia = indicadorPontualidade(c, new Date("2026-10-15"));
  eq(emDia.status, "bom", "com tudo marcado, status bom");
  eq(emDia.valor, 1, "proporção de pagamento é 100%");

  // Exatamente 1 em aberto vira atenção, não crítico
  const um = casoBase();
  um.acompanhamento.meses["1"] = { pago: true };
  um.acompanhamento.meses["2"] = { pago: true };
  eq(indicadorPontualidade(um, new Date("2026-10-15")).status, "atencao",
    "1 mês em aberto é atenção, não crítico");
}

console.log("\n=== Cumprimento dos aportes ===");
{
  // Antes das chaves, não há aporte a cobrar
  eq(indicadorAportes(casoBase(), new Date("2027-01-15")).status, "neutro",
    "antes das chaves, aportes ficam neutros");

  // Depois de um saque de FGTS previsto e não feito
  const c = casoBase();
  const fgts = montarAportes(c).find((a) => a.origem === "FGTS");
  const mesDoFGTS = fgts.mes + c.acompanhamento.mesEntregaChaves - 1;
  // avança o "hoje" para depois desse mês
  const anos = Math.floor((mesDoFGTS + 1) / 12);
  const hojeDepois = new Date(2026 + anos, 8, 15);
  const naoFez = indicadorAportes(c, hojeDepois);
  truthy(["critico", "atencao"].includes(naoFez.status),
    "aporte previsto e não feito derruba o indicador");
  console.log(`   status sem cumprir: ${naoFez.status} (${naoFez.rotulo})`);

  // Registrando só UM dos aportes previstos, o indicador ainda cobra o resto —
  // até esse mês o plano previa também os 13º de cada dezembro.
  const parcial = casoBase();
  parcial.acompanhamento.meses[String(mesDoFGTS)] = { aporte: fgts.valor };
  truthy(
    ["critico", "atencao"].includes(indicadorAportes(parcial, hojeDepois).status),
    "cumprir só parte dos aportes previstos não deixa o indicador bom"
  );

  // Cumprindo TODOS os aportes que o plano previa até aqui, fica bom
  const c2 = casoBase();
  const chaves = c2.acompanhamento.mesEntregaChaves;
  const corte = mesDoFGTS - chaves + 1;
  for (const a of montarAportes(c2).filter((x) => x.mes <= corte)) {
    const mesContrato = String(a.mes + chaves - 1);
    const atual = c2.acompanhamento.meses[mesContrato] || {};
    c2.acompanhamento.meses[mesContrato] = { ...atual, aporte: (atual.aporte || 0) + a.valor };
  }
  const fez = indicadorAportes(c2, hojeDepois);
  eq(fez.status, "bom", "cumprindo todos os aportes previstos, o indicador fica bom");
  truthy(fez.feitoAteHoje >= fez.previstoAteHoje - 0.01, "o feito alcança o previsto");
}

console.log("\n=== Peso na renda ===");
{
  const c = casoBase();
  const ind = indicadorComprometimento(c);
  // No documento real a prestação é exatamente 30% da renda: no teto, não acima
  eq(ind.status, "bom", "prestação exatamente no teto de 30% é considerada boa");
  eq(Math.round(ind.valor * 100), 30, "peso na renda é 30%");

  // Renda menor estoura o teto
  const apertado = casoBase();
  apertado.aprovacao.rendaBruta = 2000;
  eq(indicadorComprometimento(apertado).status, "critico", "renda menor torna o peso crítico");

  // Sem renda informada, neutro em vez de dividir por zero
  const semRenda = casoBase();
  semRenda.aprovacao.rendaBruta = 0;
  eq(indicadorComprometimento(semRenda).status, "neutro", "sem renda informada, status neutro");
}

console.log("\n=== Ritmo vs plano ===");
{
  eq(indicadorVsPlano(casoBase(), new Date("2027-01-15")).status, "neutro",
    "antes das chaves, ritmo é neutro");

  // Seguindo o plano exatamente: em linha
  const c = casoBase();
  const emLinha = indicadorVsPlano(c, new Date("2028-09-15"));
  eq(emLinha.status, "bom", "seguindo o plano, ritmo bom");

  // Aporte extra grande deixa adiantado
  const adiantado = casoBase();
  adiantado.acompanhamento.meses["26"] = { aporte: 40000 };
  const ind = indicadorVsPlano(adiantado, new Date("2028-09-15"));
  eq(ind.status, "bom", "aporte extra mantém o ritmo bom");
  truthy(ind.prazoReal < ind.prazoPlano, "prazo real fica menor que o do plano");
  truthy(ind.rotulo.includes("adiantado"), "rótulo diz que está adiantado");
}

console.log("\n=== Diagnóstico geral ===");
{
  // Caso saudável: tudo pago, nada previsto ainda
  const bom = casoBase();
  for (let m = 1; m <= 3; m++) bom.acompanhamento.meses[String(m)] = { pago: true };
  const s = saudeDoContrato(bom, new Date("2026-10-15"));
  eq(s.geral, "bom", "tudo pago em dia dá diagnóstico bom");
  eq(s.indicadores.length, 4, "quatro indicadores no diagnóstico", 0);
  truthy(s.mensagem.length > 0, "diagnóstico traz mensagem em texto");

  // O pior indicador manda no geral
  const ruim = casoBase();
  const sRuim = saudeDoContrato(ruim, new Date("2026-12-15"));
  eq(sRuim.geral, "critico", "meses vencidos sem pagar tornam o geral crítico");

  // Todo indicador precisa de rótulo textual — status nunca vai só como cor
  for (const ind of sRuim.indicadores) {
    truthy(
      typeof ind.rotulo === "string" && ind.rotulo.length > 0 && ind.titulo.length > 0,
      `indicador "${ind.chave}" tem título e rótulo em texto`
    );
    truthy(
      ["bom", "atencao", "critico", "neutro"].includes(ind.status),
      `indicador "${ind.chave}" tem status válido`
    );
  }
}

console.log(falhas ? `\n❌ ${falhas} verificação(ões) falharam` : "\n✅ Saúde e composições consistentes");
process.exitCode = falhas ? 1 : 0;
