// Motor de amortização SAC/Price com aportes extraordinários que abatem PRAZO.
//
// A parcela (Price) ou a amortização periódica (SAC) é fixada uma única vez,
// a partir do financiamento original. Cada aporte extra apenas reduz o saldo
// devedor a mais naquele mês — o número de meses necessários para zerar o
// saldo cai naturalmente, sem precisar recalcular a parcela.

export function taxaMensalEquivalente(taxaAnual) {
  return Math.pow(1 + taxaAnual, 1 / 12) - 1;
}

export function pmtPrice(pv, i, n) {
  if (i === 0) return pv / n;
  return (pv * i) / (1 - Math.pow(1 + i, -n));
}

export function aportesPorMes(aportes) {
  const mapa = new Map();
  for (const a of aportes) {
    mapa.set(a.mes, (mapa.get(a.mes) || 0) + a.valor);
  }
  return mapa;
}

/**
 * @param {object} params
 * @param {number} params.valorFinanciado
 * @param {number} params.prazoMeses
 * @param {number} params.taxaAnual
 * @param {'SAC'|'PRICE'} params.sistema
 * @param {Map<number, number>} [params.aportesExtras] mês -> valor do aporte
 */
export function simular({ valorFinanciado, prazoMeses, taxaAnual, sistema, aportesExtras }) {
  const i = taxaMensalEquivalente(taxaAnual);
  const aportes = aportesExtras || new Map();

  const pmtFixa = sistema === "PRICE" ? pmtPrice(valorFinanciado, i, prazoMeses) : null;
  const amortFixaSAC = sistema === "SAC" ? valorFinanciado / prazoMeses : null;

  const meses = [];
  let saldo = valorFinanciado;
  let m = 0;
  // guarda de segurança contra taxas/parâmetros inconsistentes — nunca deve ser atingida
  // em um financiamento real, já que aportes só encurtam o prazo original.
  const limiteMeses = prazoMeses + 1200;

  while (saldo > 0.01 && m < limiteMeses) {
    m++;
    const jurosMes = saldo * i;
    let amortMes = sistema === "PRICE" ? pmtFixa - jurosMes : amortFixaSAC;
    if (amortMes > saldo) amortMes = saldo;
    saldo -= amortMes;

    const aporteDesejado = aportes.get(m) || 0;
    const aporteAplicado = Math.min(aporteDesejado, saldo);
    saldo -= aporteAplicado;
    if (saldo < 0.01) saldo = 0;

    meses.push({
      mes: m,
      juros: jurosMes,
      amortizacao: amortMes,
      aporteExtra: aporteAplicado,
      parcela: amortMes + jurosMes,
      saldoDevedor: saldo,
    });
  }

  return meses;
}

export function totalJuros(meses) {
  return meses.reduce((acc, mes) => acc + mes.juros, 0);
}

export function totalPago(meses) {
  return meses.reduce((acc, mes) => acc + mes.parcela + mes.aporteExtra, 0);
}

export function prazoEfetivoMeses(meses) {
  return meses.length;
}
