// Correção das parcelas pagas à construtora, em DUAS FASES.
//
// O contrato de financiamento da entrada troca de índice na entrega das chaves:
//   - durante a obra: INCC (custo da construção);
//   - depois das chaves: em geral um juro fixo mensal somado a um índice de
//     inflação, sendo "1% + IPCA" o arranjo mais comum.
//
// Cada construtora escreve isso do seu jeito, então os três parâmetros são
// configuráveis e tratados como estimativa na interface. Não há índice oficial
// projetado aqui: o usuário informa a taxa que quer usar no cenário.

/**
 * Fator acumulado de correção de uma parcela que vence no mês `mes` do contrato.
 *
 * A composição é encadeada: corrige pelo INCC até a entrega e, dali para
 * frente, pela taxa pós-chaves. Uma parcela que vence depois das chaves carrega
 * as duas fases.
 */
export function fatorCorrecao(mes, { mesEntregaChaves = 0, inccMensal = 0, taxaPosChavesMensal = 0 } = {}) {
  const m = Math.max(0, mes || 0);

  // Sem entrega definida, tudo é fase de obra — é o que acontece antes de o
  // corretor preencher as datas.
  if (!mesEntregaChaves || m <= mesEntregaChaves) {
    return Math.pow(1 + inccMensal, m);
  }

  const mesesDeObra = mesEntregaChaves;
  const mesesPosChaves = m - mesEntregaChaves;
  return Math.pow(1 + inccMensal, mesesDeObra) * Math.pow(1 + taxaPosChavesMensal, mesesPosChaves);
}

/**
 * Taxa mensal pós-chaves a partir dos dois componentes que os contratos
 * costumam citar separadamente: um juro fixo e um índice de inflação.
 * Compõe geometricamente, que é como as duas correções incidem de fato.
 */
export function taxaPosChaves({ jurosMensal = 0, inflacaoMensal = 0 } = {}) {
  return (1 + jurosMensal) * (1 + inflacaoMensal) - 1;
}

/** Parâmetros de correção extraídos do caso do cliente. */
export function parametrosCorrecao(cliente) {
  const e = cliente.entrada || {};
  const ac = cliente.acompanhamento || {};
  return {
    mesEntregaChaves: ac.mesEntregaChaves || 0,
    inccMensal: e.inccMensal || 0,
    taxaPosChavesMensal: taxaPosChaves({
      jurosMensal: e.jurosPosChavesMensal || 0,
      inflacaoMensal: e.inflacaoPosChavesMensal || 0,
    }),
  };
}

/** Aplica a correção de duas fases a uma lista de parcelas {mes, valor, tipo}. */
export function corrigirParcelasEmFases(parcelas, params) {
  return parcelas.map((p) => {
    const fator = fatorCorrecao(p.mes, params);
    return { ...p, fator, valorCorrigido: p.valor * fator };
  });
}

export function totalCorrigidoEmFases(parcelas, params) {
  return corrigirParcelasEmFases(parcelas, params).reduce((acc, p) => acc + p.valorCorrigido, 0);
}
