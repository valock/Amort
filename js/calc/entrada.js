// Montagem da entrada que fica com a construtora.
//
// O contrato com a construtora fecha em valores NOMINAIS (é o que soma para
// quitar a entrada), mas as parcelas futuras são corrigidas — INCC durante a
// obra e outro índice depois das chaves. Esse custo extra quase nunca aparece
// na conversa de venda. Ver js/calc/correcao.js.

import { totalNominal } from "./incc.js";
import { corrigirParcelasEmFases, totalCorrigidoEmFases } from "./correcao.js";

// O contrato da construtora é escrito como "N parcelas de R$ X a partir do mês
// M, mais balões nos meses Y". A UI edita essa forma compacta; o motor precisa
// da lista mês a mês. Esta função é a ponte entre as duas.
export function expandirParcelas(entrada) {
  const serie = entrada.serieMensal || { quantidade: 0, valor: 0, mesInicial: 1 };
  const mensais = [];
  const qtd = Math.max(0, Math.round(serie.quantidade || 0));
  const mesInicial = Math.max(1, Math.round(serie.mesInicial || 1));

  for (let k = 0; k < qtd; k++) {
    mensais.push({ mes: mesInicial + k, valor: serie.valor || 0, tipo: "mensal" });
  }

  const baloes = (entrada.baloes || []).map((b) => ({
    mes: Math.max(0, Math.round(b.mes || 0)),
    valor: b.valor || 0,
    tipo: "balao",
  }));

  return [...mensais, ...baloes].sort((a, b) => a.mes - b.mes);
}

// Valor de cada parcela mensal para fechar exatamente o que falta, já
// descontando sinal, FGTS e balões.
export function valorParcelaParaFechar({ entradaNecessaria, sinal, fgtsNaEntrada, baloes, quantidade }) {
  const qtd = Math.max(0, Math.round(quantidade || 0));
  if (!qtd) return 0;
  const somaBaloes = (baloes || []).reduce((acc, b) => acc + (b.valor || 0), 0);
  const restante = (entradaNecessaria || 0) - (sinal || 0) - (fgtsNaEntrada || 0) - somaBaloes;
  if (restante <= 0) return 0;
  return Math.round((restante / qtd) * 100) / 100;
}

export function resumoEntrada({ entradaNecessaria, sinal, fgtsNaEntrada, parcelas, correcao }) {
  const nominalParcelas = totalNominal(parcelas);
  const corrigidoParcelas = totalCorrigidoEmFases(parcelas, correcao);
  const recursosImediatos = (sinal || 0) + (fgtsNaEntrada || 0);

  const montadoNominal = recursosImediatos + nominalParcelas;
  const faltaFechar = (entradaNecessaria || 0) - montadoNominal;
  const custoCorrecao = corrigidoParcelas - nominalParcelas;

  return {
    nominalParcelas,
    corrigidoParcelas,
    recursosImediatos,
    montadoNominal,
    faltaFechar,
    custoCorrecao,
    desembolsoTotalCorrigido: recursosImediatos + corrigidoParcelas,
  };
}

// Maior compromisso mensal que o cliente vai enfrentar, já corrigido. Balões
// entram separados porque não são esforço recorrente.
export function esforcoMensalMaximo(parcelas, correcao) {
  const corrigidas = corrigirParcelasEmFases(parcelas, correcao).filter(
    (p) => (p.tipo || "mensal") === "mensal"
  );
  if (!corrigidas.length) return 0;
  return Math.max(...corrigidas.map((p) => p.valorCorrigido));
}

export function maiorBalao(parcelas, correcao) {
  const baloes = corrigirParcelasEmFases(parcelas, correcao).filter((p) => p.tipo === "balao");
  if (!baloes.length) return 0;
  return Math.max(...baloes.map((p) => p.valorCorrigido));
}

export function avisosEntrada({ resumo, esforcoMensal, rendaBruta, prestacaoPosChaves }) {
  const avisos = [];

  if (Math.abs(resumo.faltaFechar) > 1) {
    if (resumo.faltaFechar > 0) {
      avisos.push({
        tipo: "erro",
        texto: `Ainda falta fechar a entrada: o que está montado cobre menos que o necessário.`,
      });
    } else {
      avisos.push({
        tipo: "atencao",
        texto: `O que está montado passou do valor da entrada — sobrou valor a mais do que o necessário.`,
      });
    }
  }

  if (rendaBruta && esforcoMensal) {
    const pct = esforcoMensal / rendaBruta;
    if (pct > 1) {
      avisos.push({
        tipo: "erro",
        texto: `A maior parcela da construtora sozinha passa da renda bruta do cliente. Esse parcelamento não é sustentável — considere sinal maior, FGTS na entrada ou mais prazo.`,
      });
    } else if (pct > 0.3) {
      avisos.push({
        tipo: "atencao",
        texto: `A maior parcela da construtora consome ${(pct * 100).toFixed(0)}% da renda bruta, durante a obra.`,
      });
    }
  }

  if (rendaBruta && prestacaoPosChaves && esforcoMensal) {
    const somaPior = esforcoMensal + prestacaoPosChaves;
    if (somaPior > rendaBruta) {
      avisos.push({
        tipo: "atencao",
        texto: `Se alguma parcela da construtora coincidir com o início da prestação da Caixa, o compromisso mensal passa da renda. Vale conferir as datas.`,
      });
    }
  }

  return avisos;
}
