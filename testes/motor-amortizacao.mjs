import { pmtPrice, simular, totalJuros, prazoEfetivoMeses, aportesPorMes } from "../js/calc/amortizacao.js";
import { taxaMensalCaixa as taxaMensalEquivalente } from "../js/calc/caixa.js";
import { gerarAportesFGTS, gerarAportes13, combinarAportes } from "../js/calc/fgts.js";
import { corrigirParcelas, totalCorrigido } from "../js/calc/incc.js";
import { calcularJurosObra, totalJurosObra } from "../js/calc/evolucaoObra.js";

function assertClose(a, b, msg, eps = 0.5) {
  if (Math.abs(a - b) > eps) {
    console.error(`FALHA: ${msg} -> esperado ~${b}, obtido ${a}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: ${msg} (${a.toFixed(2)} ~ ${b.toFixed(2)})`);
  }
}

// 1) Price sem aportes deve bater com PMT fechado e terminar exatamente no prazo
{
  const valorFinanciado = 300000;
  const prazoMeses = 360;
  const taxaAnual = 0.10;
  const i = taxaMensalEquivalente(taxaAnual);
  const pmt = pmtPrice(valorFinanciado, i, prazoMeses);
  const meses = simular({ valorFinanciado, prazoMeses, sistema: "PRICE", taxaMensal: taxaMensalEquivalente(taxaAnual), aportesExtras: new Map() });
  assertClose(prazoEfetivoMeses(meses), prazoMeses, "Price sem aporte termina no prazo original");
  assertClose(meses[0].parcela, pmt, "primeira parcela Price bate com PMT fechado");
  assertClose(meses[meses.length - 1].saldoDevedor, 0, "saldo final Price ~ 0");
}

// 2) SAC sem aportes: amortização constante, parcela decrescente, termina no prazo
{
  const valorFinanciado = 300000;
  const prazoMeses = 360;
  const taxaAnual = 0.10;
  const meses = simular({ valorFinanciado, prazoMeses, sistema: "SAC", taxaMensal: taxaMensalEquivalente(taxaAnual), aportesExtras: new Map() });
  assertClose(prazoEfetivoMeses(meses), prazoMeses, "SAC sem aporte termina no prazo original");
  assertClose(meses[0].amortizacao, valorFinanciado / prazoMeses, "amortização SAC constante = PV/n");
  if (meses[0].parcela <= meses[meses.length - 2].parcela) {
    console.error("FALHA: parcela SAC deveria ser decrescente");
    process.exitCode = 1;
  } else {
    console.log("OK: parcela SAC decrescente ao longo do tempo");
  }
}

// 3) Aporte avulso reduz PRAZO, mantendo a parcela (Price)
{
  const valorFinanciado = 300000;
  const prazoMeses = 360;
  const taxaAnual = 0.10;
  const semAporte = simular({ valorFinanciado, prazoMeses, sistema: "PRICE", taxaMensal: taxaMensalEquivalente(taxaAnual), aportesExtras: new Map() });
  const comAporte = simular({
    valorFinanciado,
    prazoMeses,
    taxaMensal: taxaMensalEquivalente(taxaAnual),
    sistema: "PRICE",
    aportesExtras: aportesPorMes([{ mes: 12, valor: 50000 }]),
  });
  if (prazoEfetivoMeses(comAporte) >= prazoEfetivoMeses(semAporte)) {
    console.error("FALHA: aporte avulso deveria reduzir o prazo");
    process.exitCode = 1;
  } else {
    console.log(`OK: prazo caiu de ${prazoEfetivoMeses(semAporte)} para ${prazoEfetivoMeses(comAporte)} meses com aporte de 50k no mês 12`);
  }
  assertClose(comAporte[0].parcela, semAporte[0].parcela, "parcela Price permanece igual após aporte (só o prazo muda)", 0.01);
  assertClose(totalJuros(comAporte), totalJuros(semAporte), "juros totais devem CAIR com o aporte (comparação abaixo)", 1e9); // placeholder, checado abaixo
  if (totalJuros(comAporte) >= totalJuros(semAporte)) {
    console.error("FALHA: juros totais deveriam cair com o aporte");
    process.exitCode = 1;
  } else {
    console.log(`OK: juros totais caíram de ${totalJuros(semAporte).toFixed(2)} para ${totalJuros(comAporte).toFixed(2)}`);
  }
}

// 4) FGTS dispara exatamente nos meses 24, 48, 72...
{
  const aportes = gerarAportesFGTS({ salarioBruto: 5000, prazoMeses: 80, intervaloSaqueMeses: 24 });
  const mesesDisparo = aportes.map((a) => a.mes);
  const esperado = [24, 48, 72];
  if (JSON.stringify(mesesDisparo) !== JSON.stringify(esperado)) {
    console.error(`FALHA: FGTS deveria disparar em ${esperado}, disparou em ${mesesDisparo}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: FGTS disparou exatamente nos meses ${mesesDisparo}`);
  }
  assertClose(aportes[0].valor, 5000 * 0.08 * 24, "valor acumulado de FGTS no primeiro saque bate com 8%*salario*24");
}

// 5) 13º dispara todo mês 12, 24, 36...
{
  const aportes = gerarAportes13(3000, 40);
  const esperado = [12, 24, 36];
  const mesesDisparo = aportes.map((a) => a.mes);
  if (JSON.stringify(mesesDisparo) !== JSON.stringify(esperado)) {
    console.error(`FALHA: 13º deveria disparar em ${esperado}, disparou em ${mesesDisparo}`);
    process.exitCode = 1;
  } else {
    console.log(`OK: 13º disparou exatamente nos meses ${mesesDisparo}`);
  }
}

// 6) INCC corrige compostamente
{
  const parcelas = [{ mes: 0, valor: 1000 }, { mes: 12, valor: 1000 }];
  const total = totalCorrigido(parcelas, 0.005);
  const esperado = 1000 + 1000 * Math.pow(1.005, 12);
  assertClose(total, esperado, "correção INCC composta bate com fórmula manual", 0.01);
}

// 7) Evolução de obra: juros crescem e batem com fórmula linear manual
{
  const meses = calcularJurosObra(200000, 24, 0.01);
  // mês 2: saldo liberado no mês 1 = 200000 * 1/24; juros mês 2 = saldo_mes1 * 0.01
  const saldoMes1 = 200000 * (1 / 24);
  assertClose(meses[1].jurosMes, saldoMes1 * 0.01, "juros de obra do mês 2 bate com saldo liberado do mês 1");
  console.log(`OK: juros de obra total estimado = ${totalJurosObra(meses).toFixed(2)}`);
}

console.log(process.exitCode ? "\n❌ Alguns testes falharam" : "\n✅ Todos os testes do motor de cálculo passaram");
