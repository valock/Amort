// FGTS: acúmulo de 8% do salário bruto ao mês, com saque disparado a cada
// biênio (regra do saque para amortização habitacional) para abater o saldo.
// Sem simular rendimento do FGTS — estimativa conservadora, documentada na UI.

export function gerarAportesFGTS({ salarioBruto, prazoMeses, intervaloSaqueMeses = 24 }) {
  const aportes = [];
  let acumulado = 0;

  for (let m = 1; m <= prazoMeses; m++) {
    acumulado += salarioBruto * 0.08;
    if (m % intervaloSaqueMeses === 0) {
      aportes.push({ mes: m, valor: acumulado, origem: "FGTS" });
      acumulado = 0;
    }
  }

  return aportes;
}

/**
 * 13º salário como aporte anual.
 *
 * O cliente recebe o 13º em DEZEMBRO, não a cada 12 meses de contrato. Quando
 * se sabe em que mês do calendário a amortização começa (`mesCalendarioInicial`,
 * 1 = janeiro), os aportes caem em dezembro de verdade — é o que o cliente vê
 * no controle mês a mês. Sem essa informação, cai no comportamento antigo de
 * disparar a cada 12 meses.
 */
export function gerarAportes13(valor13, prazoMeses, { mesCalendarioInicial } = {}) {
  const aportes = [];
  if (!valor13 || !prazoMeses) return aportes;

  if (!mesCalendarioInicial) {
    for (let m = 12; m <= prazoMeses; m += 12) {
      aportes.push({ mes: m, valor: valor13, origem: "13º salário" });
    }
    return aportes;
  }

  for (let m = 1; m <= prazoMeses; m++) {
    // mês do calendário correspondente à parcela m da amortização
    const mesCalendario = ((mesCalendarioInicial - 1 + (m - 1)) % 12) + 1;
    if (mesCalendario === 12) {
      aportes.push({ mes: m, valor: valor13, origem: "13º salário" });
    }
  }
  return aportes;
}

export function combinarAportes(...listas) {
  return listas.flat();
}
