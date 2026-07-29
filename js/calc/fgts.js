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

export function gerarAportes13(valor13, prazoMeses) {
  const aportes = [];
  for (let m = 12; m <= prazoMeses; m += 12) {
    aportes.push({ mes: m, valor: valor13, origem: "13º salário" });
  }
  return aportes;
}

export function combinarAportes(...listas) {
  return listas.flat();
}
