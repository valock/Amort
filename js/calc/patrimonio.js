// Patrimônio: o outro lado da dívida.
//
// O cliente costuma olhar só a prestação. Mas a compra tem duas contas se
// movendo em direções opostas: a dívida cai a cada amortização, e o valor do
// imóvel se move por conta própria. A diferença entre os dois é o que ele
// realmente tem — e é o argumento mais forte para amortizar, porque cada real
// que abate o saldo vira um real de patrimônio na hora.
//
// O valor de mercado é SEMPRE informado por quem usa o app (avaliação do banco,
// anúncio de unidade igual, opinião de corretor). Não existe projeção de
// valorização aqui: inventar uma taxa de valorização seria vender expectativa,
// e a interface trata o número como o que ele é — uma estimativa datada.

export function patrimonio({ valorMercado, saldoDevedor, valorCompra }) {
  const mercado = valorMercado || 0;
  const saldo = Math.max(0, saldoDevedor || 0);
  const compra = valorCompra || 0;

  const liquido = mercado - saldo;
  const valorizacao = mercado && compra ? mercado - compra : 0;

  return {
    valorMercado: mercado,
    saldoDevedor: saldo,
    valorCompra: compra,
    // O que sobra para o cliente se vendesse hoje e quitasse a dívida
    liquido,
    // Fatia do imóvel que já não é do banco
    proporcaoQuitada: mercado > 0 ? Math.max(0, Math.min(1, liquido / mercado)) : 0,
    valorizacao,
    proporcaoValorizacao: compra > 0 ? valorizacao / compra : 0,
    temMercado: mercado > 0,
  };
}

/**
 * Composição do valor de mercado para a rosca: quanto do imóvel já é do
 * cliente e quanto ainda responde pela dívida.
 */
export function composicaoPatrimonio(p) {
  if (!p.temMercado) return { fatias: [], total: 0 };

  const fatias = [
    { chave: "seu", rotulo: "Já é seu", valor: Math.max(0, p.liquido) },
    { chave: "banco", rotulo: "Ainda responde pela dívida", valor: p.saldoDevedor },
  ].filter((f) => f.valor > 0);

  return { fatias, total: fatias.reduce((acc, f) => acc + f.valor, 0) };
}

/**
 * O que um aporte faz pelo patrimônio: abate a dívida e, no mesmo instante,
 * aumenta o que é do cliente na mesma medida. É a tradução do aporte para a
 * linguagem que motiva.
 */
export function efeitoDoAporteNoPatrimonio({ amortizacaoEfetiva, patrimonioAtual }) {
  const abatimento = Math.max(0, amortizacaoEfetiva || 0);
  const liquidoDepois = patrimonioAtual.liquido + abatimento;
  return {
    abatimento,
    liquidoAntes: patrimonioAtual.liquido,
    liquidoDepois,
    proporcaoDepois:
      patrimonioAtual.valorMercado > 0
        ? Math.max(0, Math.min(1, liquidoDepois / patrimonioAtual.valorMercado))
        : 0,
  };
}
