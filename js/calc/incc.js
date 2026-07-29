// Correção das parcelas pagas à construtora pelo INCC estimado.
// É uma projeção com taxa fixa informada pelo corretor, não o índice oficial mês a mês.

export function corrigirParcelas(parcelas, inccMensal) {
  return parcelas.map((p) => ({
    ...p,
    valorCorrigido: p.valor * Math.pow(1 + inccMensal, p.mes),
  }));
}

export function totalNominal(parcelas) {
  return parcelas.reduce((acc, p) => acc + p.valor, 0);
}

export function totalCorrigido(parcelas, inccMensal) {
  return corrigirParcelas(parcelas, inccMensal).reduce((acc, p) => acc + p.valorCorrigido, 0);
}
