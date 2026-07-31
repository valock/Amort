// Patrimônio, extrato ano a ano e visão de carteira do corretor.
//
// O caso de patrimônio usa a proporção de um imóvel real relatada pelo usuário
// (comprado por 130 mil, valendo cerca de 300 mil hoje), sem qualquer dado
// pessoal — só a relação entre os valores.

import { patrimonio, composicaoPatrimonio, efeitoDoAporteNoPatrimonio } from "../js/calc/patrimonio.js";
import { extratoAnual, anoDaVirada } from "../js/calc/extratoAnual.js";
import {
  resumirParaHub,
  ordenarParaHub,
  totaisDaCarteira,
  filtrarPorNome,
} from "../js/calc/carteira.js";

let falhas = 0;
function eq(obtido, esperado, msg, eps = 0.01) {
  const ok =
    obtido === esperado ||
    (Number.isFinite(obtido) && Number.isFinite(esperado) && Math.abs(obtido - esperado) <= eps);
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

function casoBase(extra = {}) {
  return {
    id: "teste",
    nome: "Cliente Fictício",
    criadoEm: "2026-08-01T00:00:00.000Z",
    versaoModelo: 6,
    aprovacao: {
      valorImovel: 260000,
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
      jurosPosChavesMensal: 0.01,
      inflacaoPosChavesMensal: 0.004,
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
    mercado: { valorAtual: 0, dataISO: "", fonte: "" },
    acompanhamento: { dataBaseISO: "2026-08", mesEntregaChaves: 25, meses: {} },
    ...extra,
  };
}

console.log("=== Patrimônio ===");
{
  // Proporção do imóvel relatado: comprado por 130 mil, hoje ~300 mil
  const p = patrimonio({ valorMercado: 300000, saldoDevedor: 90000, valorCompra: 130000 });
  eq(p.liquido, 210000, "patrimônio = mercado - dívida");
  eq(p.valorizacao, 170000, "valorização = mercado - preço de compra");
  eq(Math.round(p.proporcaoValorizacao * 100), 131, "valorizou 131% sobre a compra");
  eq(Math.round(p.proporcaoQuitada * 100), 70, "70% do imóvel já é do cliente");
  truthy(p.temMercado, "reconhece que há valor de mercado");

  // Sem valor de mercado, nada é inventado
  const sem = patrimonio({ valorMercado: 0, saldoDevedor: 90000, valorCompra: 130000 });
  truthy(!sem.temMercado, "sem valor informado, não finge ter mercado");
  eq(sem.valorizacao, 0, "sem mercado, valorização é zero e não uma projeção");
  eq(sem.proporcaoQuitada, 0, "sem mercado, proporção quitada é zero");

  // Dívida acima do valor de mercado: patrimônio negativo é real e não some
  const afundado = patrimonio({ valorMercado: 200000, saldoDevedor: 240000, valorCompra: 210000 });
  eq(afundado.liquido, -40000, "patrimônio negativo é mostrado como é");
  eq(afundado.proporcaoQuitada, 0, "proporção quitada não fica negativa");

  // Rosca: duas fatias somando o valor de mercado
  const comp = composicaoPatrimonio(p);
  eq(comp.fatias.length, 2, "duas fatias: sua e do banco", 0);
  eq(comp.total, 300000, "as fatias somam o valor de mercado");
  truthy(!composicaoPatrimonio(sem).fatias.length, "sem mercado, não há rosca");
}

console.log("\n=== Aporte vira patrimônio na hora ===");
{
  const p = patrimonio({ valorMercado: 300000, saldoDevedor: 90000, valorCompra: 130000 });
  const efeito = efeitoDoAporteNoPatrimonio({ amortizacaoEfetiva: 10000, patrimonioAtual: p });
  eq(efeito.liquidoAntes, 210000, "patrimônio antes do aporte");
  eq(efeito.liquidoDepois, 220000, "cada real amortizado vira um real de patrimônio");
  eq(Math.round(efeito.proporcaoDepois * 100), 73, "proporção sobe de 70% para 73%");
}

console.log("\n=== Extrato ano a ano ===");
{
  const { anos, totais } = extratoAnual(casoBase());
  truthy(anos.length > 0, "gera linhas por ano");

  // O primeiro ano da amortização começa em ago/2028 (mês 25), então tem 5 meses
  eq(anos[0].ano, 2028, "primeiro ano do financiamento é 2028");
  eq(anos[0].parcelas, 5, "2028 tem 5 parcelas (ago a dez)", 0);

  // Anos completos no meio têm 12 parcelas
  const cheio = anos.find((a) => a.ano === 2030);
  eq(cheio.parcelas, 12, "2030 é ano cheio, 12 parcelas", 0);

  // Cada linha fecha: prestações = amortização + juros + seguros
  const desfecha = anos.filter(
    (a) => Math.abs(a.amortizacao + a.juros + a.seguros - a.prestacoes) > 0.05
  );
  eq(desfecha.length, 0, "toda linha anual fecha amortização + juros + seguros", 0);

  // No começo paga-se mais juros que dívida — o número que motiva o aporte
  truthy(anos[0].razaoJurosAmortizacao > 1, "no primeiro ano os juros superam a amortização");
  console.log(
    `   1º ano: R$ ${anos[0].juros.toFixed(2)} de juros contra R$ ${anos[0].amortizacao.toFixed(2)} de abatimento (${anos[0].razaoJurosAmortizacao.toFixed(2)}x)`
  );

  // O saldo tem de cair de ano em ano e terminar zerado
  let subiu = 0;
  for (let i = 1; i < anos.length; i++) if (anos[i].saldoFinal > anos[i - 1].saldoFinal + 0.01) subiu++;
  eq(subiu, 0, "saldo no fim do ano nunca sobe", 0);
  eq(anos[anos.length - 1].saldoFinal, 0, "último ano termina com saldo zero", 0.01);

  // Os totais anuais têm de fechar com o financiamento
  eq(
    totais.amortizacao + totais.aportes,
    casoBase().aprovacao.valorFinanciamento,
    "amortização + aportes somados nos anos zeram o financiado",
    0.5
  );

  // O ano da virada existe e é depois do primeiro
  const virada = anoDaVirada(anos);
  truthy(virada && virada > anos[0].ano, `ano da virada (${virada}) vem depois do primeiro`);

  // Sem data-base não há como agrupar por ano
  const semData = casoBase();
  semData.acompanhamento.dataBaseISO = "";
  eq(extratoAnual(semData).anos.length, 0, "sem data-base, extrato anual vazio", 0);
}

console.log("\n=== Hub do corretor ===");
{
  const completo = casoBase();
  const semDatas = casoBase({ id: "b", nome: "Sem Datas" });
  semDatas.acompanhamento = { dataBaseISO: "", mesEntregaChaves: 0, meses: {} };
  const comMercado = casoBase({ id: "c", nome: "Com Mercado" });
  comMercado.mercado = { valorAtual: 320000, dataISO: "2026-07", fonte: "anúncio" };

  const hoje = new Date("2030-01-15");
  const resumos = [completo, semDatas, comMercado].map((c) => resumirParaHub(c, hoje));

  const r0 = resumos[0];
  eq(r0.nome, "Cliente Fictício", "resume o nome");
  eq(r0.valorFinanciamento, 165810.07, "traz o valor financiado");
  truthy(r0.configurado, "caso com datas aparece como configurado");
  truthy(["bom", "atencao", "critico"].includes(r0.status), "caso configurado recebe status real");
  truthy(r0.proximoTexto.length > 0, "traz o próximo compromisso em texto");

  const r1 = resumos[1];
  truthy(!r1.configurado, "caso sem datas aparece como não configurado");
  eq(r1.statusTexto, "Faltam as datas", "diz o que falta em vez de dar status falso");
  eq(r1.saldoDevedor, null, "sem datas, não inventa saldo");

  const r2 = resumos[2];
  truthy(r2.patrimonioLiquido !== null, "com valor de mercado, calcula o patrimônio");
  truthy(r2.patrimonioLiquido > 0, "patrimônio positivo neste cenário");

  // Ordenação: quem pede ação vem primeiro
  const ordenados = ordenarParaHub(resumos);
  const pos = ordenados.map((r) => r.status);
  const idxCritico = pos.indexOf("critico");
  const idxBom = pos.indexOf("bom");
  if (idxCritico >= 0 && idxBom >= 0) {
    truthy(idxCritico < idxBom, "casos críticos vêm antes dos que estão em dia");
  } else {
    console.log(`OK: ordenação aplicada (status na ordem: ${pos.join(", ")})`);
  }

  const t = totaisDaCarteira(resumos);
  eq(t.clientes, 3, "conta 3 clientes", 0);
  eq(t.financiado, 165810.07 * 3, "soma os financiamentos", 0.05);
  eq(t.semDatas, 1, "conta 1 caso sem datas", 0);

  // Busca tolera acento e caixa
  eq(filtrarPorNome(resumos, "mercado").length, 1, "busca encontra por parte do nome", 0);
  eq(filtrarPorNome(resumos, "FICTÍCIO").length, 1, "busca ignora caixa e acento", 0);
  eq(filtrarPorNome(resumos, "").length, 3, "busca vazia devolve tudo", 0);
  eq(filtrarPorNome(resumos, "zzz").length, 0, "busca sem resultado devolve vazio", 0);
}

console.log("\n=== Hub não quebra com caso corrompido ===");
{
  const quebrado = { id: "x", nome: "Quebrado", aprovacao: null, entrada: null, acompanhamento: null };
  const r = resumirParaHub(quebrado);
  eq(r.nome, "Quebrado", "caso sem blocos ainda aparece na lista");
  eq(r.valorFinanciamento, 0, "valor financiado cai para zero");
  truthy(!r.configurado, "aparece como não configurado");
}

console.log(falhas ? `\n❌ ${falhas} verificação(ões) falharam` : "\n✅ Patrimônio, extrato e carteira consistentes");
process.exitCode = falhas ? 1 : 0;
