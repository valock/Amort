// Extrato ano a ano do financiamento, no mesmo formato do "Extrato do Imposto
// de Renda" que a Caixa emite: por ano, quanto foi amortização e quanto foi
// juros.
//
// É a conta que mais move o cliente. Num contrato real em andamento, o extrato
// de IR mostrou R$ 3.001,88 de amortização contra R$ 3.741,86 de juros no ano —
// depois de dez anos pagando, ainda saía mais juros do que abatimento de
// dívida. Ver esse número por escrito é o que faz o aporte extra deixar de ser
// abstrato.
//
// ATENÇÃO: aqui é projeção. O extrato oficial da Caixa traz o que foi
// efetivamente pago, com correção monetária, mora e eventuais diferenças de
// prestação. Este cálculo assume a prestação do contrato constante, então
// serve para entender a proporção e planejar — não substitui o extrato do banco.

import { planilhaCaixa } from "./cronograma.js";
import { mesCalendario } from "./calendario.js";

/**
 * Agrupa a planilha de parcelas por ano do calendário.
 * Devolve uma linha por ano, com o saldo devedor ao fim do último mês do ano.
 */
export function extratoAnual(cliente) {
  const ac = cliente.acompanhamento || {};
  const dataBase = ac.dataBaseISO;
  const { linhas, segurosMensais } = planilhaCaixa(cliente);

  if (!dataBase || !linhas.length) return { anos: [], totais: null, segurosMensais };

  const porAno = new Map();

  for (const l of linhas) {
    const cal = mesCalendario(dataBase, l.mesContrato);
    if (!cal) continue;
    const ano = cal.ano;

    if (!porAno.has(ano)) {
      porAno.set(ano, {
        ano,
        parcelas: 0,
        amortizacao: 0,
        juros: 0,
        seguros: 0,
        aportes: 0,
        prestacoes: 0,
        saldoFinal: l.saldo,
        temMesAtual: false,
      });
    }
    const linhaAno = porAno.get(ano);
    linhaAno.parcelas++;
    linhaAno.amortizacao += l.amortizacao;
    linhaAno.juros += l.juros;
    linhaAno.seguros += l.seguros;
    linhaAno.aportes += l.aporte;
    linhaAno.prestacoes += l.prestacao;
    // Percorremos em ordem, então o último visto é o fim do ano
    linhaAno.saldoFinal = l.saldo;
    if (l.ehHoje) linhaAno.temMesAtual = true;
  }

  const anos = [...porAno.values()].map((a) => ({
    ...a,
    desembolso: a.prestacoes + a.aportes,
    // Quantos reais de juros para cada real que abateu a dívida
    razaoJurosAmortizacao: a.amortizacao > 0 ? a.juros / a.amortizacao : Infinity,
    // Fatia do que ele pagou no ano que virou abatimento de dívida
    proporcaoAmortizada: a.prestacoes + a.aportes > 0 ? (a.amortizacao + a.aportes) / (a.prestacoes + a.aportes) : 0,
  }));

  const totais = anos.reduce(
    (acc, a) => ({
      parcelas: acc.parcelas + a.parcelas,
      amortizacao: acc.amortizacao + a.amortizacao,
      juros: acc.juros + a.juros,
      seguros: acc.seguros + a.seguros,
      aportes: acc.aportes + a.aportes,
      prestacoes: acc.prestacoes + a.prestacoes,
      desembolso: acc.desembolso + a.desembolso,
    }),
    { parcelas: 0, amortizacao: 0, juros: 0, seguros: 0, aportes: 0, prestacoes: 0, desembolso: 0 }
  );

  return { anos, totais, segurosMensais };
}

/**
 * O ano em que a amortização passa a ser maior que os juros. É o ponto de
 * virada do financiamento, e quase sempre está mais longe do que o cliente
 * imagina — cada aporte extra o traz para mais perto.
 */
export function anoDaVirada(anos) {
  const virada = anos.find((a) => a.amortizacao > a.juros);
  return virada ? virada.ano : null;
}
