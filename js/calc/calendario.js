// Conversão entre "mês do contrato" (1, 2, 3…) e mês do calendário.
//
// Todo o motor de cálculo trabalha com meses relativos, porque é assim que
// financiamento se calcula. Mas o cliente controla a vida dele por data: ele
// quer saber o que vence em "mar/2027", não no "mês 8". Este módulo faz a
// ponte, e é a única parte do app que sabe de datas.

const ABREVIACOES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// dataBaseISO no formato "AAAA-MM" (o mês em que vence o 1º compromisso).
export function partesDataBase(dataBaseISO) {
  if (!dataBaseISO || !/^\d{4}-\d{2}$/.test(dataBaseISO)) return null;
  const [ano, mes] = dataBaseISO.split("-").map(Number);
  if (mes < 1 || mes > 12) return null;
  return { ano, mes };
}

// Mês do contrato (1-indexado) -> { ano, mes } do calendário.
export function mesCalendario(dataBaseISO, mesContrato) {
  const base = partesDataBase(dataBaseISO);
  if (!base) return null;
  const total = base.ano * 12 + (base.mes - 1) + (mesContrato - 1);
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

export function rotuloMes(dataBaseISO, mesContrato, { comAnoCompleto = false } = {}) {
  const c = mesCalendario(dataBaseISO, mesContrato);
  if (!c) return `mês ${mesContrato}`;
  const ano = comAnoCompleto ? c.ano : String(c.ano).slice(2);
  return `${ABREVIACOES[c.mes - 1]}/${ano}`;
}

// Caminho inverso: em que mês do contrato cai um determinado ano/mês.
// Devolve número < 1 se a data é anterior à data-base.
export function mesContratoDe(dataBaseISO, ano, mes) {
  const base = partesDataBase(dataBaseISO);
  if (!base) return null;
  return (ano * 12 + (mes - 1)) - (base.ano * 12 + (base.mes - 1)) + 1;
}

// Mês do contrato correspondente a hoje. Usado para separar o que já venceu
// do que está por vir.
export function mesContratoHoje(dataBaseISO, hoje = new Date()) {
  return mesContratoDe(dataBaseISO, hoje.getFullYear(), hoje.getMonth() + 1);
}

export function anosDoCronograma(dataBaseISO, totalMeses) {
  const primeiro = mesCalendario(dataBaseISO, 1);
  const ultimo = mesCalendario(dataBaseISO, Math.max(1, totalMeses));
  if (!primeiro || !ultimo) return [];
  const anos = [];
  for (let a = primeiro.ano; a <= ultimo.ano; a++) anos.push(a);
  return anos;
}

export function mesAtualISO(hoje = new Date()) {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}
