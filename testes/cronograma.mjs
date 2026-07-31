// Cronograma mês a mês: datas, encadeamento das duas fases e reação do saldo
// à realidade registrada pelo cliente.
//
// Usa os valores do mesmo caso real anonimizado de caso-caixa-real.mjs.

import {
  mesCalendario,
  rotuloMes,
  mesContratoDe,
  mesContratoHoje,
  partesDataBase,
} from "../js/calc/calendario.js";
import {
  construirCronograma,
  resumoControle,
  aportesReais,
  simularComRealidade,
} from "../js/calc/cronograma.js";
import { montarAportes } from "../js/calc/cenarios.js";
import { gerarAportes13 } from "../js/calc/fgts.js";

let falhas = 0;
function eq(obtido, esperado, msg, eps = 0.01) {
  const ok = typeof obtido === "number" ? Math.abs(obtido - esperado) <= eps : obtido === esperado;
  if (!ok) {
    console.error(`FALHA: ${msg}\n   esperado ${esperado}, obtido ${obtido}`);
    falhas++;
  } else {
    console.log(`OK: ${msg} = ${obtido}`);
  }
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
    acompanhamento: {
      dataBaseISO: "2026-08",
      mesEntregaChaves: 25,
      meses: {},
    },
  };
}

console.log("=== Calendário: mês do contrato <-> mês real ===");
eq(partesDataBase("2026-08").ano, 2026, "data-base interpretada");
eq(mesCalendario("2026-08", 1).mes, 8, "mês 1 do contrato = agosto");
eq(mesCalendario("2026-08", 6).mes, 1, "mês 6 = janeiro");
eq(mesCalendario("2026-08", 6).ano, 2027, "mês 6 já virou o ano");
eq(rotuloMes("2026-08", 1), "ago/26", "rótulo do mês 1");
eq(rotuloMes("2026-08", 25, { comAnoCompleto: true }), "ago/2028", "rótulo do mês 25 (chaves)");
eq(mesContratoDe("2026-08", 2026, 8), 1, "ida e volta: agosto/2026 = mês 1");
eq(mesContratoDe("2026-08", 2028, 8), 25, "agosto/2028 = mês 25");
eq(mesContratoHoje("2026-08", new Date("2027-02-15")), 7, "fevereiro/2027 é o mês 7 do contrato");
eq(partesDataBase("bagunça"), null, "data-base inválida devolve null");

console.log("\n=== 13º cai em dezembro de verdade ===");
{
  // Amortização começando em agosto (mês 8): o 1º dezembro é o 5º mês
  const comCalendario = gerarAportes13(2270, 30, { mesCalendarioInicial: 8 });
  eq(comCalendario[0].mes, 5, "1º 13º cai no mês 5 da amortização (dezembro)");
  eq(comCalendario[1].mes, 17, "2º 13º cai 12 meses depois");
  // Sem informação de calendário, mantém o comportamento antigo
  const semCalendario = gerarAportes13(2270, 30);
  eq(semCalendario[0].mes, 12, "sem calendário, cai a cada 12 meses");
}

console.log("\n=== Encadeamento das duas fases ===");
{
  const cliente = casoBase();
  const { linhas } = construirCronograma(cliente);

  const mes1 = linhas.find((l) => l.mesContrato === 1);
  eq(mes1.fase, "pre-chaves", "mês 1 é fase de construtora");
  eq(mes1.compromissos[0].tipo, "construtora", "compromisso do mês 1 é da construtora");

  const mes24 = linhas.find((l) => l.mesContrato === 24);
  eq(mes24.fase, "pre-chaves", "mês 24 (última parcela) ainda é pré-chaves");

  const mes25 = linhas.find((l) => l.mesContrato === 25);
  eq(mes25.fase, "pos-chaves", "mês 25 vira pós-chaves");
  eq(mes25.compromissos[0].tipo, "caixa", "compromisso do mês 25 é a prestação da Caixa");
  // A prestação exibida tem de bater com a do documento (encargo total)
  eq(mes25.compromissos[0].valor, 817.26, "1ª prestação no cronograma = a do documento", 0.02);

  truthy(mes25.saldoDevedor > 0 && mes25.saldoDevedor < 165810.07, "saldo devedor cai no 1º mês");

  // O INCC encarece as parcelas ao longo da obra
  truthy(
    mes24.totalPrevisto > mes1.totalPrevisto,
    "parcela do mês 24 é maior que a do mês 1 por causa do INCC"
  );
  console.log(
    `   parcela mês 1: R$ ${mes1.totalPrevisto.toFixed(2)} -> mês 24: R$ ${mes24.totalPrevisto.toFixed(2)}`
  );

  // Nenhum mês fica sem compromisso entre 1 e 24
  const semCompromisso = [];
  for (let m = 1; m <= 24; m++) if (!linhas.find((l) => l.mesContrato === m)) semCompromisso.push(m);
  eq(semCompromisso.length, 0, "todos os meses de 1 a 24 têm compromisso");
}

console.log("\n=== Imóvel em obra: juros de obra entram no mês ===");
{
  const cliente = casoBase();
  cliente.entrada.prazoObraMeses = 24;
  cliente.entrada.taxaMensalObra = 0.01;
  const { linhas } = construirCronograma(cliente);
  const mes12 = linhas.find((l) => l.mesContrato === 12);
  const tipos = mes12.compromissos.map((c) => c.tipo);
  truthy(tipos.includes("construtora") && tipos.includes("obra"),
    "mês 12 acumula parcela da construtora + juros de obra");
  console.log(`   compromissos do mês 12: ${mes12.compromissos.map((c) => c.descricao).join(" + ")}`);
}

console.log("\n=== O saldo reage ao que o cliente registra ===");
{
  const semNada = resumoControle(casoBase(), new Date("2028-09-15"));

  const comAporte = casoBase();
  // Cliente registrou um aporte de 20 mil no 2º mês de amortização
  comAporte.acompanhamento.meses["26"] = { pago: true, aporte: 20000 };
  const depois = resumoControle(comAporte, new Date("2028-09-15"));

  eq(depois.totalAportesRegistrados, 20000, "aporte registrado é somado");
  truthy(
    depois.prazoAtual < semNada.prazoAtual,
    "aporte real registrado antecipa a quitação"
  );
  console.log(
    `   prazo: ${semNada.prazoAtual} -> ${depois.prazoAtual} meses (economia de ${depois.mesesEconomizados} meses vs mínimo)`
  );
  truthy(depois.economiaJurosAtual > semNada.economiaJurosAtual,
    "aporte real aumenta a economia de juros");

  // O aporte tem de aparecer na linha do tempo da amortização, não na do contrato
  const reais = aportesReais(comAporte);
  eq(reais.length, 1, "um aporte real detectado");
  eq(reais[0].mes, 2, "mês 26 do contrato = mês 2 da amortização (chaves no mês 25)");
}

console.log("\n=== Aporte registrado conta mesmo antes do contrato começar ===");
{
  // Cenário que já quebrou uma vez: hoje é ANTES da data-base, então o mês
  // corrente do contrato é 0. O aporte registrado não pode ser descartado.
  const semAporte = casoBase();
  const antesDeComecar = new Date("2026-07-15"); // data-base é 2026-08
  const base = resumoControle(semAporte, antesDeComecar);
  eq(base.mesContratoHoje, 0, "contrato ainda não começou");

  const comAporte = casoBase();
  comAporte.acompanhamento.meses["25"] = { aporte: 20000 };
  const depois = resumoControle(comAporte, antesDeComecar);

  eq(depois.totalAportesRegistrados, 20000, "aporte registrado é somado");
  truthy(
    depois.prazoAtual < base.prazoAtual,
    "aporte registrado antecipa a quitação mesmo com o contrato não iniciado"
  );
  console.log(`   prazo: ${base.prazoAtual} -> ${depois.prazoAtual} meses`);
}

console.log("\n=== Aporte real não é somado em dobro com o projetado ===");
{
  // O plano prevê FGTS no mês 24 da amortização (= mês 48 do contrato).
  // Se o cliente registra um aporte nesse mesmo mês, vale só o registrado.
  const cliente = casoBase();
  const doPlano = montarAportes(cliente).find((x) => x.origem === "FGTS");
  truthy(!!doPlano, "plano prevê saque de FGTS");
  const mesContratoDoFGTS = doPlano.mes + cliente.acompanhamento.mesEntregaChaves - 1;

  cliente.acompanhamento.meses[String(mesContratoDoFGTS)] = { aporte: 1000 };
  const { aportesUsados } = simularComRealidade(cliente, { mesContratoCorte: 0 });
  const noMes = aportesUsados.filter((x) => x.mes === doPlano.mes);
  eq(noMes.length, 1, "só um aporte no mês em que há registro do cliente");
  eq(noMes[0].valor, 1000, "vale o valor registrado, não o projetado");
}

console.log("\n=== Plano não cumprido empurra a quitação ===");
{
  // Passamos o corte para depois de um saque de FGTS previsto que o cliente
  // não registrou: ele deve ser descartado, não presumido como feito.
  const cliente = casoBase();
  const fgts = montarAportes(cliente).find((x) => x.origem === "FGTS");
  const corteDepois = fgts.mes + cliente.acompanhamento.mesEntregaChaves + 1;

  const comoPlanejado = simularComRealidade(cliente, { mesContratoCorte: 0 }).meses.length;
  const semCumprir = simularComRealidade(cliente, { mesContratoCorte: corteDepois }).meses.length;

  truthy(
    semCumprir > comoPlanejado,
    "não cumprir um aporte previsto aumenta o prazo em vez de ser ignorado"
  );
  console.log(`   prazo planejado ${comoPlanejado} -> sem cumprir ${semCumprir} meses`);
}

console.log("\n=== Atraso é detectado ===");
{
  const cliente = casoBase();
  // Em fev/2027 (mês 7), nada foi marcado como pago
  const resumo = resumoControle(cliente, new Date("2027-02-15"));
  eq(resumo.mesContratoHoje, 7, "estamos no mês 7 do contrato");
  eq(resumo.mesesEmAtraso, 7, "7 meses vencidos e nenhum marcado como pago");
  truthy(resumo.valorEmAtraso > 0, "valor em atraso é somado");

  // Marcando os 7 primeiros como pagos, o atraso zera
  for (let m = 1; m <= 7; m++) cliente.acompanhamento.meses[String(m)] = { pago: true };
  const emDia = resumoControle(cliente, new Date("2027-02-15"));
  eq(emDia.mesesEmAtraso, 0, "depois de marcar, não há atraso");
  truthy(emDia.totalPagoRegistrado > 0, "total pago passa a ser contabilizado");
  truthy(emDia.proximoVencimento?.mesContrato === 8, "próximo vencimento é o mês 8");
}

console.log("\n=== Valor real pago substitui a estimativa do INCC ===");
{
  const cliente = casoBase();
  cliente.acompanhamento.meses["1"] = { pago: true, valorPago: 2000 };
  const resumo = resumoControle(cliente, new Date("2026-08-15"));
  eq(resumo.totalPagoRegistrado, 2000, "usa o valor realmente pago, não o previsto");
}

console.log("\n=== Sem datas configuradas, nada estoura ===");
{
  const cliente = casoBase();
  cliente.acompanhamento = { dataBaseISO: "", mesEntregaChaves: 0, meses: {} };
  const { linhas } = construirCronograma(cliente);
  truthy(linhas.length > 0, "cronograma da construtora ainda é montado sem datas");
  truthy(linhas.every((l) => l.fase === "pre-chaves"),
    "sem mês de chaves, nenhuma linha é pós-chaves");
  const resumo = resumoControle(cliente);
  eq(resumo.mesContratoHoje, 0, "sem data-base, não há mês corrente");
  eq(resumo.saldoDevedorAtual, null, "sem data-base, saldo atual fica indefinido");
}

console.log("\n=== 'O plano previa' não ecoa o que o cliente digitou ===");
{
  const cliente = casoBase();
  const fgts = montarAportes(cliente).find((x) => x.origem === "FGTS");
  const mesContratoDoFGTS = fgts.mes + cliente.acompanhamento.mesEntregaChaves - 1;

  // Mês SEM previsão do plano, em que o cliente registra um aporte por conta
  const mesLivre = mesContratoDoFGTS + 1;
  cliente.acompanhamento.meses[String(mesLivre)] = { aporte: 5000 };

  const { linhas } = construirCronograma(cliente);
  const linhaLivre = linhas.find((l) => l.mesContrato === mesLivre);
  eq(linhaLivre.aportePlanejado, 0, "mês sem previsão do plano mostra planejado zero");
  eq(linhaLivre.aporteAplicado, 5000, "mas o aporte registrado foi aplicado");

  const linhaFGTS = linhas.find((l) => l.mesContrato === mesContratoDoFGTS);
  truthy(linhaFGTS.aportePlanejado > 0, "mês do FGTS mostra o valor que o plano previa");
}

console.log("\n=== Fonte única de aportes projetados ===");
{
  // O 13º precisa sair igual em cenarios.js e no cronograma
  const cliente = casoBase();
  const doPlano = montarAportes(cliente).filter((a) => a.origem === "13º salário");
  truthy(doPlano.length > 0, "plano gera aportes de 13º");
  // chaves em ago/2028 -> 1º dezembro é o 5º mês da amortização
  eq(doPlano[0].mes, 5, "13º do plano já respeita dezembro real");
}

console.log(
  falhas ? `\n❌ ${falhas} verificação(ões) falharam` : "\n✅ Cronograma consistente"
);
process.exitCode = falhas ? 1 : 0;
