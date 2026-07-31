// Composições parte-do-todo para os gráficos de rosca do cliente.
//
// São as duas perguntas que o leigo faz na frente do contrato:
//   1. "de onde saiu o dinheiro do meu imóvel?"
//   2. "de tudo que eu vou pagar, quanto é a casa e quanto é custo?"
//
// A segunda é a que abre o olho: mostra que boa parte do desembolso não vira
// patrimônio nenhum, e é o gancho para a conversa de amortização.

import { entradaNecessaria } from "./caixa.js";
import { resumoEntrada, expandirParcelas } from "./entrada.js";
import { calcularJurosObra, totalJurosObra } from "./evolucaoObra.js";
import { planilhaCaixa } from "./cronograma.js";

/**
 * De onde vem o valor do imóvel. Sempre soma exatamente o valor de compra e
 * venda, porque é assim que o documento da Caixa fecha.
 */
export function composicaoDoImovel(cliente) {
  const a = cliente.aprovacao;
  const entrada = entradaNecessaria(a);

  const fatias = [
    { chave: "financiamento", rotulo: "Financiado pela Caixa", valor: a.valorFinanciamento || 0 },
    { chave: "subsidio", rotulo: "Subsídio (você não paga)", valor: a.valorSubsidio || 0 },
    { chave: "entrada", rotulo: "Entrada com a construtora", valor: Math.max(0, entrada) },
  ].filter((f) => f.valor > 0);

  const total = fatias.reduce((acc, f) => acc + f.valor, 0);
  return { fatias, total, rotuloCentro: "valor do imóvel" };
}

/**
 * Para onde vai cada real que o cliente desembolsa, do sinal até a última
 * prestação. Separa o que vira patrimônio do que é custo do dinheiro.
 */
export function composicaoDoDesembolso(cliente) {
  const a = cliente.aprovacao;
  const e = cliente.entrada;

  const entrada = entradaNecessaria(a);
  const resumo = resumoEntrada({
    entradaNecessaria: entrada,
    sinal: e.sinal,
    fgtsNaEntrada: e.fgtsNaEntrada,
    parcelas: expandirParcelas(e),
    inccMensal: e.inccMensal,
  });

  let jurosObra = 0;
  if (e.prazoObraMeses > 0 && a.valorFinanciamento > 0) {
    jurosObra = totalJurosObra(
      calcularJurosObra(a.valorFinanciamento, e.prazoObraMeses, e.taxaMensalObra || 0)
    );
  }

  const { totais } = planilhaCaixa(cliente);

  // O que efetivamente vira imóvel: a entrada acertada com a construtora mais
  // o principal do financiamento. O subsídio fica fora porque não sai do
  // bolso do cliente.
  const patrimonio = Math.max(0, entrada) + (a.valorFinanciamento || 0);

  const fatias = [
    { chave: "imovel", rotulo: "O imóvel (vira seu patrimônio)", valor: patrimonio },
    { chave: "juros", rotulo: "Juros do financiamento", valor: totais.juros },
    { chave: "seguros", rotulo: "Seguros e tarifas", valor: totais.seguros + jurosObra },
    { chave: "incc", rotulo: "Correção INCC na obra", valor: Math.max(0, resumo.custoINCC) },
  ].filter((f) => f.valor > 0);

  const total = fatias.reduce((acc, f) => acc + f.valor, 0);
  const custo = total - patrimonio;

  return {
    fatias,
    total,
    patrimonio,
    custo,
    proporcaoCusto: total ? custo / total : 0,
    rotuloCentro: "você vai desembolsar",
  };
}
