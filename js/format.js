export const fmtMoeda = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtMoedaCurta = (v) =>
  (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const fmtPct = (v, casas = 2) => `${((v || 0) * 100).toFixed(casas).replace(".", ",")}%`;

export function fmtPrazo(meses) {
  const m = Math.max(0, Math.round(meses));
  const anos = Math.floor(m / 12);
  const restoMeses = m % 12;
  if (anos === 0) return `${restoMeses}m`;
  if (restoMeses === 0) return `${anos}a`;
  return `${anos}a ${restoMeses}m`;
}

// Aceita o que o corretor realmente digita ou cola do documento da Caixa:
// "R$ 165.810,07", "165810,07", "165810.07", "1.234,56", "260.000".
//
// O caso genuinamente ambíguo é um único ponto seguido de exatamente 3 dígitos:
// em campo de dinheiro "260.000" é duzentos e sessenta mil, mas em campo de
// taxa "4.500" é quatro e meio por cento. Quem chama informa o contexto via
// preferirDecimal — errar isso num valor de imóvel é um erro de 1000x.
export function parseNum(texto, { preferirDecimal = false } = {}) {
  if (typeof texto === "number") return texto;
  if (!texto) return 0;

  let s = String(texto).trim().replace(/[R$\s]/g, "");
  if (!s) return 0;

  const temVirgula = s.includes(",");
  const pontos = s.match(/\./g) || [];

  if (temVirgula) {
    // Vírgula é sempre o decimal no padrão brasileiro; pontos são milhar.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (pontos.length > 1) {
    s = s.replace(/\./g, "");
  } else if (pontos.length === 1) {
    const digitosDepois = s.split(".")[1].length;
    if (digitosDepois === 3 && !preferirDecimal) s = s.replace(".", "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Para preencher um input de texto com valor numérico sem assustar o usuário
// com notação científica ou ponto decimal americano.
export function paraInput(v) {
  if (v === null || v === undefined || v === "" || v === 0) return "";
  return String(v).replace(".", ",");
}
