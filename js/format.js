export const fmtMoeda = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function fmtPrazo(meses) {
  const m = Math.max(0, Math.round(meses));
  const anos = Math.floor(m / 12);
  const restoMeses = m % 12;
  if (anos === 0) return `${restoMeses}m`;
  if (restoMeses === 0) return `${anos}a`;
  return `${anos}a ${restoMeses}m`;
}
