// Simulador de amortização, espelhando a tela "Reduzir saldo ou quitar" do
// aplicativo Habitação da Caixa.
//
// Duas descobertas vieram da leitura de uma simulação real e estão modeladas
// aqui, porque sem elas o app mostraria número diferente do que o cliente vê
// no banco:
//
// 1. O aporte NÃO amortiza integralmente. Parte dele paga os juros corridos
//    desde o último vencimento, e só o resto abate o saldo — é a "amortização
//    efetiva". Na simulação real: aporte de R$ 869,41 em 25 dias de juros
//    virou R$ 865,81 de amortização efetiva e R$ 3,60 de juros diários.
//    A base é 1/30 da taxa mensal por dia.
//
// 2. O cliente escolhe entre reduzir PRAZO (paga menos tempo, parcela igual) e
//    reduzir PRESTAÇÃO (paga o mesmo tempo, parcela menor). São as duas opções
//    que o app oferece, e a diferença entre elas é o que o cliente precisa
//    entender antes de decidir.

import { pmtPrice } from "./amortizacao.js";

const DIAS_BASE = 30;

/**
 * Divide o aporte entre juros corridos e amortização efetiva.
 * `dias` é a distância entre o último vencimento e a data do pagamento.
 */
export function repartirAporte({ aporte, taxaMensal, dias = 0 }) {
  const bruto = Math.max(0, aporte || 0);
  const fator = 1 + (taxaMensal || 0) * (Math.max(0, dias) / DIAS_BASE);
  const amortizacaoEfetiva = bruto / fator;
  return {
    bruto,
    jurosDiarios: bruto - amortizacaoEfetiva,
    amortizacaoEfetiva,
    dias,
  };
}

/**
 * Número de prestações necessárias para liquidar um saldo pagando uma parcela
 * fixa. É a fórmula do prazo do sistema Price isolada em n.
 */
export function prazoParaQuitar({ saldo, taxaMensal, parcela }) {
  if (saldo <= 0) return 0;
  if (!parcela || parcela <= saldo * taxaMensal) return Infinity; // parcela não cobre os juros
  if (taxaMensal === 0) return saldo / parcela;
  return -Math.log(1 - (saldo * taxaMensal) / parcela) / Math.log(1 + taxaMensal);
}

/**
 * Simula um aporte sobre a situação atual do financiamento, nos dois modos.
 *
 * @param {object} p
 * @param {number} p.saldoAtual          saldo devedor antes do aporte
 * @param {number} p.prazoRestanteMeses  prestações que faltam
 * @param {number} p.taxaMensal          taxa efetiva mensal do contrato
 * @param {number} p.parcelaBase         amortização + juros (sem seguros)
 * @param {number} p.segurosMensais      seguros e tarifas embutidos na prestação
 * @param {number} p.aporte              valor bruto que o cliente vai pagar
 * @param {number} [p.dias]              dias corridos desde o último vencimento
 */
export function simularAporte({
  saldoAtual,
  prazoRestanteMeses,
  taxaMensal,
  parcelaBase,
  segurosMensais = 0,
  aporte,
  dias = 0,
}) {
  const reparticao = repartirAporte({ aporte, taxaMensal, dias });
  const abatimento = Math.min(reparticao.amortizacaoEfetiva, saldoAtual);
  const novoSaldo = Math.max(0, saldoAtual - abatimento);

  // --- Situação de partida, para comparar ---
  const jurosSemAporte = jurosTotais({ saldo: saldoAtual, taxaMensal, parcela: parcelaBase, meses: prazoRestanteMeses });

  // --- Modo PRAZO: mantém a parcela, encurta o prazo ---
  const prazoNovoBruto = prazoParaQuitar({ saldo: novoSaldo, taxaMensal, parcela: parcelaBase });
  const prazoNovo = Number.isFinite(prazoNovoBruto) ? Math.ceil(prazoNovoBruto) : Infinity;
  const jurosPrazo = jurosTotais({ saldo: novoSaldo, taxaMensal, parcela: parcelaBase, meses: prazoNovo });

  const modoPrazo = {
    modo: "prazo",
    novoSaldo,
    prazoMeses: prazoNovo,
    mesesEconomizados: Number.isFinite(prazoNovo) ? prazoRestanteMeses - prazoNovo : 0,
    parcelaBase,
    // O seguro cai junto porque acompanha o saldo devedor; aqui fica constante
    // por simplificação, e a economia de seguros vem do prazo menor.
    prestacao: parcelaBase + segurosMensais,
    jurosTotais: jurosPrazo,
    jurosEconomizados: jurosSemAporte - jurosPrazo,
  };

  // --- Modo PRESTAÇÃO: mantém o prazo, diminui a parcela ---
  const novaParcela = prazoRestanteMeses > 0 ? pmtPrice(novoSaldo, taxaMensal, prazoRestanteMeses) : 0;
  const jurosPrestacao = jurosTotais({
    saldo: novoSaldo,
    taxaMensal,
    parcela: novaParcela,
    meses: prazoRestanteMeses,
  });

  const modoPrestacao = {
    modo: "prestacao",
    novoSaldo,
    prazoMeses: prazoRestanteMeses,
    mesesEconomizados: 0,
    parcelaBase: novaParcela,
    prestacao: novaParcela + segurosMensais,
    alivioMensal: parcelaBase - novaParcela,
    jurosTotais: jurosPrestacao,
    jurosEconomizados: jurosSemAporte - jurosPrestacao,
  };

  return {
    reparticao,
    saldoAtual,
    jurosSemAporte,
    prazo: modoPrazo,
    prestacao: modoPrestacao,
  };
}

/**
 * Juros pagos até liquidar um saldo com uma parcela fixa, somando mês a mês.
 * Fazer a soma explícita (em vez de parcela × n − saldo) mantém o número certo
 * quando a última prestação é parcial.
 */
export function jurosTotais({ saldo, taxaMensal, parcela, meses }) {
  if (!Number.isFinite(meses) || meses <= 0 || saldo <= 0) return 0;
  let restante = saldo;
  let juros = 0;
  const limite = Math.min(Math.ceil(meses) + 1, 2000);

  for (let m = 0; m < limite && restante > 0.01; m++) {
    const j = restante * taxaMensal;
    juros += j;
    const amort = Math.min(parcela - j, restante);
    if (amort <= 0) break;
    restante -= amort;
  }
  return juros;
}

/**
 * Valor necessário para liquidar o contrato hoje: saldo devedor mais os juros
 * corridos desde o último vencimento. O app da Caixa também soma encargos e
 * mora quando existem, e pode aplicar ajustes que não ficam visíveis na tela —
 * por isso o resultado aqui é uma estimativa para conversa, não o valor oficial.
 */
export function estimarLiquidacao({ saldoAtual, taxaMensal, dias = 0, encargos = 0 }) {
  const jurosCorridos = saldoAtual * (taxaMensal || 0) * (Math.max(0, dias) / DIAS_BASE);
  return {
    saldoAtual,
    jurosCorridos,
    encargos,
    total: saldoAtual + jurosCorridos + encargos,
  };
}

/** Atalhos de valor que ajudam o cliente a explorar sem digitar. */
export function sugestoesDeAporte({ prestacao, saldoAtual }) {
  const base = [
    { rotulo: "1 prestação", valor: prestacao },
    { rotulo: "3 prestações", valor: prestacao * 3 },
    { rotulo: "6 prestações", valor: prestacao * 6 },
    { rotulo: "12 prestações", valor: prestacao * 12 },
  ];
  return base
    .map((s) => ({ ...s, valor: Math.round(s.valor * 100) / 100 }))
    .filter((s) => s.valor > 0 && s.valor < saldoAtual);
}
