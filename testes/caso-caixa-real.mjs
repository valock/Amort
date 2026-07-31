// Regressão travando os números de uma SIMULAÇÃO real da Caixa (NPMCMV,
// imóvel novo individual, Price/TR, 420 meses), anonimizada: só os valores
// financeiros, sem nome, CPF, data de nascimento ou cidade.
//
// Se algum destes quebrar, o app está mentindo na mesa de negociação.

import {
  taxaMensalCaixa,
  taxaEfetivaAnual,
  entradaNecessaria,
  cotaFinanciamento,
  primeiraParcelaBase,
  segurosETarifasMensais,
  comprometimentoRenda,
  conferirAprovacao,
} from "../js/calc/caixa.js";
import { simular, prazoEfetivoMeses, totalJuros } from "../js/calc/amortizacao.js";
import { parseNum } from "../js/format.js";
import { resumoEntrada, esforcoMensalMaximo, expandirParcelas, valorParcelaParaFechar } from "../js/calc/entrada.js";

let falhas = 0;
function eq(obtido, esperado, msg, eps = 0.01) {
  const ok = Math.abs(obtido - esperado) <= eps;
  if (!ok) { console.error(`FALHA: ${msg}\n   esperado ${esperado}, obtido ${obtido}`); falhas++; }
  else console.log(`OK: ${msg} = ${typeof obtido === "number" ? obtido.toFixed(2) : obtido}`);
}
function truthy(cond, msg) {
  if (!cond) { console.error(`FALHA: ${msg}`); falhas++; } else console.log(`OK: ${msg}`);
}

// ---- Dados literais do documento ----
const APROVACAO = {
  valorImovel: 260000.00,
  valorAvaliacao: 260000.00,
  valorFinanciamento: 165810.07,
  valorSubsidio: 4211.00,
  prazoMeses: 420,
  sistema: "PRICE",
  jurosNominalAnual: 0.045,
  trAnual: 0,
  primeiraPrestacaoDoc: 817.26,
  rendaBruta: 2724.20,
  comprometimentoMax: 0.30,
};

console.log("=== Documento oficial da Caixa (caso real anonimizado) ===");

const i = taxaMensalCaixa(APROVACAO.jurosNominalAnual, APROVACAO.trAnual);
eq(i, 0.00375, "taxa mensal = nominal/12", 1e-9);
// O documento imprime "Juros Efetivos: TR + 4.5940% a.a."
eq(taxaEfetivaAnual(i) * 100, 4.5940, "juros efetivos batem com o documento (4,5940% a.a.)", 0.0001);

eq(entradaNecessaria(APROVACAO), 89978.93, "Valor da Entrada = imóvel - financiamento - subsídio");
// Documento: "Cota Máxima de Financiamento: 63,77%"
eq(cotaFinanciamento(APROVACAO) * 100, 63.77, "cota de financiamento bate com o documento", 0.005);

const base = primeiraParcelaBase({ ...APROVACAO, taxaMensal: i });
eq(base, 784.71, "1ª parcela de amortização + juros (Price)", 0.01);

const seguros = segurosETarifasMensais({ ...APROVACAO, taxaMensal: i });
eq(seguros, 32.55, "seguros + tarifa derivados da 1ª prestação do documento", 0.01);

// Documento: "Comprometimento da Renda: 30%" — e a prestação é exatamente o teto
eq(comprometimentoRenda({ encargoMensal: 817.26, rendaBruta: 2724.20 }) * 100, 30.00,
   "prestação consome exatamente os 30% de renda do documento", 0.01);

// Nada deve ser sinalizado como erro num documento oficial coerente
const { avisos } = conferirAprovacao(APROVACAO);
truthy(avisos.filter((x) => x.tipo === "erro").length === 0,
  "documento oficial não gera nenhum aviso de erro");

// O financiamento cru precisa fechar em exatamente 420 meses
const cru = simular({
  valorFinanciado: APROVACAO.valorFinanciamento,
  prazoMeses: APROVACAO.prazoMeses,
  taxaMensal: i,
  sistema: "PRICE",
  aportesExtras: new Map(),
});
eq(prazoEfetivoMeses(cru), 420, "Price sem aporte quita exatamente no prazo aprovado", 0);
eq(cru[0].parcela, 784.71, "primeira parcela da simulação = parcela base", 0.01);
console.log(`   (juros totais no cenário cru: R$ ${totalJuros(cru).toFixed(2)})`);

console.log("\n=== Parser de números como o corretor digita/cola ===");
eq(parseNum("R$ 165.810,07"), 165810.07, 'parseNum("R$ 165.810,07")');
eq(parseNum("165810,07"), 165810.07, 'parseNum("165810,07")');
eq(parseNum("165810.07"), 165810.07, 'parseNum("165810.07")');
eq(parseNum("2.724,20"), 2724.20, 'parseNum("2.724,20")');
eq(parseNum("817,26"), 817.26, 'parseNum("817,26")');
eq(parseNum("4,5000"), 4.5, 'parseNum("4,5000")');
eq(parseNum("260.000"), 260000, 'parseNum("260.000") em campo de dinheiro -> milhar');
eq(parseNum("4.500", { preferirDecimal: true }), 4.5, 'parseNum("4.500") em campo de taxa -> decimal');
eq(parseNum("0.375", { preferirDecimal: true }), 0.375, 'parseNum("0.375") em campo de taxa -> decimal');
eq(parseNum("1.234.567,89"), 1234567.89, 'parseNum("1.234.567,89")');
eq(parseNum(""), 0, 'parseNum("") = 0');

console.log("\n=== A dor real do caso: a entrada de R$ 89.978,93 ===");
const precisa = entradaNecessaria(APROVACAO);

function cenario({ sinal, fgts, quantidade }) {
  const valor = valorParcelaParaFechar({
    entradaNecessaria: precisa, sinal, fgtsNaEntrada: fgts, baloes: [], quantidade,
  });
  const entrada = { serieMensal: { quantidade, valor, mesInicial: 1 }, baloes: [] };
  const parcelas = expandirParcelas(entrada);
  const resumo = resumoEntrada({
    entradaNecessaria: precisa, sinal, fgtsNaEntrada: fgts, parcelas, inccMensal: 0.005,
  });
  return { valor, resumo, esforco: esforcoMensalMaximo(parcelas, 0.005), parcelas };
}

// Cenário 1: sem FGTS na entrada, diluindo em 24 meses
const c1 = cenario({ sinal: 0, fgts: 0, quantidade: 24 });
eq(c1.parcelas.length, 24, "série de 24 parcelas expandida corretamente", 0);
truthy(Math.abs(c1.resumo.faltaFechar) <= 1, "série de 24x fecha a entrada (tolerância de centavos)");
console.log(`   parcela sem FGTS: R$ ${c1.esforco.toFixed(2)} vs renda R$ ${APROVACAO.rendaBruta.toFixed(2)}`);
truthy(c1.esforco > APROVACAO.rendaBruta,
  "sem FGTS a parcela da construtora estoura a renda (o app precisa alertar)");
console.log(`   custo extra do INCC: R$ ${c1.resumo.custoINCC.toFixed(2)}`);

// Cenário 2: com sinal + FGTS, o esforço cai
const c2 = cenario({ sinal: 10000, fgts: 25000, quantidade: 24 });
truthy(Math.abs(c2.resumo.faltaFechar) <= 1, "com sinal + FGTS a série ainda fecha a entrada");
console.log(`   parcela com sinal 10k + FGTS 25k: R$ ${c2.esforco.toFixed(2)}`);
truthy(c2.esforco < c1.esforco, "usar FGTS na entrada reduz a parcela mensal da construtora");

// Balões reduzem a parcela mensal
const comBalao = valorParcelaParaFechar({
  entradaNecessaria: precisa, sinal: 10000, fgtsNaEntrada: 0, baloes: [{ mes: 12, valor: 15000 }], quantidade: 24,
});
const semBalao = valorParcelaParaFechar({
  entradaNecessaria: precisa, sinal: 10000, fgtsNaEntrada: 0, baloes: [], quantidade: 24,
});
truthy(comBalao < semBalao, "balão de 15k reduz a parcela mensal");
console.log(`   parcela sem balão R$ ${semBalao.toFixed(2)} -> com balão R$ ${comBalao.toFixed(2)}`);

console.log(falhas ? `\n❌ ${falhas} verificação(ões) falharam` : "\n✅ Todos os números batem com o documento oficial");
process.exitCode = falhas ? 1 : 0;
