// Saúde do contrato: os indicadores que dizem ao cliente se ele está bem ou
// mal, em linguagem que ele entende sem saber nada de financiamento.
//
// Cada indicador devolve um status ("bom" | "atencao" | "critico") acompanhado
// de rótulo e texto. O status nunca viaja só como cor — quem desenha precisa
// mostrar ícone e texto também, senão quem não distingue cores fica sem a
// informação.

import { construirCronograma, resumoControle, simularComRealidade, aportesReais } from "./cronograma.js";
import { montarAportes } from "./cenarios.js";
import { comprometimentoRenda } from "./caixa.js";
import { simular, aportesPorMes, prazoEfetivoMeses } from "./amortizacao.js";
import { taxaMensalCaixa } from "./caixa.js";
import { mesContratoHoje } from "./calendario.js";

/**
 * Pontualidade: dos meses que já venceram, quantos o cliente marcou como pagos.
 */
export function indicadorPontualidade(cliente, hoje = new Date()) {
  const ac = cliente.acompanhamento || {};
  const mesHoje = ac.dataBaseISO ? mesContratoHoje(ac.dataBaseISO, hoje) : 0;
  const { linhas } = construirCronograma(cliente);

  const vencidos = linhas.filter((l) => mesHoje > 0 && l.mesContrato <= mesHoje);
  const pagos = vencidos.filter((l) => l.pago);

  if (vencidos.length === 0) {
    return {
      chave: "pontualidade",
      titulo: "Pagamentos",
      status: "neutro",
      valor: null,
      rotulo: "Nada venceu ainda",
      detalhe: "Seu primeiro compromisso ainda está por vir.",
    };
  }

  const proporcao = pagos.length / vencidos.length;
  const emAberto = vencidos.length - pagos.length;

  let status = "bom";
  if (emAberto >= 2) status = "critico";
  else if (emAberto === 1) status = "atencao";

  return {
    chave: "pontualidade",
    titulo: "Pagamentos",
    status,
    valor: proporcao,
    rotulo:
      emAberto === 0
        ? "Tudo pago em dia"
        : emAberto === 1
        ? "1 mês em aberto"
        : `${emAberto} meses em aberto`,
    detalhe: `${pagos.length} de ${vencidos.length} compromissos vencidos estão marcados como pagos.`,
  };
}

/**
 * Cumprimento do plano de aportes: dos aportes que o plano previa até hoje,
 * quanto o cliente efetivamente registrou.
 */
export function indicadorAportes(cliente, hoje = new Date()) {
  const ac = cliente.acompanhamento || {};
  const chaves = ac.mesEntregaChaves || 0;
  const mesHoje = ac.dataBaseISO ? mesContratoHoje(ac.dataBaseISO, hoje) : 0;
  const corteAmort = chaves && mesHoje > 0 ? Math.max(0, mesHoje - chaves + 1) : 0;

  const previstoAteHoje = montarAportes(cliente)
    .filter((a) => a.mes <= corteAmort)
    .reduce((acc, a) => acc + a.valor, 0);
  const feitoAteHoje = aportesReais(cliente)
    .filter((a) => a.mes <= corteAmort)
    .reduce((acc, a) => acc + a.valor, 0);

  if (corteAmort <= 0) {
    return {
      chave: "aportes",
      titulo: "Aportes extras",
      status: "neutro",
      valor: null,
      rotulo: "Começa após as chaves",
      detalhe: "Os aportes que aceleram a quitação entram depois da entrega.",
    };
  }

  if (previstoAteHoje <= 0) {
    const status = feitoAteHoje > 0 ? "bom" : "neutro";
    return {
      chave: "aportes",
      titulo: "Aportes extras",
      status,
      valor: null,
      rotulo: feitoAteHoje > 0 ? "Adiantado no plano" : "Nenhum previsto ainda",
      detalhe:
        feitoAteHoje > 0
          ? "Você já fez aportes antes do que o plano previa."
          : "O plano ainda não previa aportes até este mês.",
    };
  }

  const proporcao = feitoAteHoje / previstoAteHoje;
  let status = "bom";
  if (proporcao < 0.5) status = "critico";
  else if (proporcao < 0.9) status = "atencao";

  return {
    chave: "aportes",
    titulo: "Aportes extras",
    status,
    valor: proporcao,
    rotulo:
      proporcao >= 1
        ? "Plano cumprido"
        : `${Math.round(proporcao * 100)}% do planejado`,
    detalhe: `O plano previa aportes até aqui; você registrou parte deles.`,
    previstoAteHoje,
    feitoAteHoje,
  };
}

/**
 * Peso da prestação na renda. Usa a renda informada na aprovação, que é a
 * única que o app conhece — se a renda do cliente mudou, o número envelhece.
 */
export function indicadorComprometimento(cliente) {
  const a = cliente.aprovacao;
  if (!a.rendaBruta || !a.primeiraPrestacaoDoc) {
    return {
      chave: "comprometimento",
      titulo: "Peso na renda",
      status: "neutro",
      valor: null,
      rotulo: "Renda não informada",
      detalhe: "Sem a renda, não é possível calcular o peso da prestação.",
    };
  }

  const proporcao = comprometimentoRenda({
    encargoMensal: a.primeiraPrestacaoDoc,
    rendaBruta: a.rendaBruta,
  });
  const teto = a.comprometimentoMax || 0.3;

  // Estar EXATAMENTE no teto é o caso normal, não um alerta: a Caixa dimensiona
  // o financiamento de trás para frente até encostar no limite de renda. Sem a
  // tolerância, 817,26/2.724,20 dá 0,30000000000000004 em ponto flutuante e
  // toda aprovação real acenderia um alarme falso.
  const tolerancia = 0.001;
  let status = "bom";
  if (proporcao > teto + 0.05) status = "critico";
  else if (proporcao > teto + tolerancia) status = "atencao";

  return {
    chave: "comprometimento",
    titulo: "Peso na renda",
    status,
    valor: proporcao,
    rotulo: `${Math.round(proporcao * 100)}% da renda`,
    detalhe: `A prestação consome essa fatia da renda informada na contratação (teto considerado: ${Math.round(
      teto * 100
    )}%).`,
  };
}

/**
 * Onde o cliente está em relação ao plano: comparando o saldo devedor real com
 * o saldo que o plano previa para este mês.
 */
export function indicadorVsPlano(cliente, hoje = new Date()) {
  const a = cliente.aprovacao;
  const ac = cliente.acompanhamento || {};
  const chaves = ac.mesEntregaChaves || 0;
  const mesHoje = ac.dataBaseISO ? mesContratoHoje(ac.dataBaseISO, hoje) : 0;

  if (!chaves || mesHoje < chaves) {
    return {
      chave: "vsPlano",
      titulo: "Ritmo",
      status: "neutro",
      valor: null,
      rotulo: "Antes das chaves",
      detalhe: "A comparação com o plano começa quando a amortização inicia.",
    };
  }

  const taxaMensal = taxaMensalCaixa(a.jurosNominalAnual, a.trAnual);
  const doPlano = simular({
    valorFinanciado: a.valorFinanciamento,
    prazoMeses: a.prazoMeses,
    taxaMensal,
    sistema: a.sistema,
    aportesExtras: aportesPorMes(montarAportes(cliente)),
  });
  const real = simularComRealidade(cliente, { mesContratoCorte: mesHoje }).meses;

  const prazoPlano = prazoEfetivoMeses(doPlano);
  const prazoReal = prazoEfetivoMeses(real);
  const diferenca = prazoPlano - prazoReal; // positivo = adiantado

  let status = "bom";
  if (diferenca < -12) status = "critico";
  else if (diferenca < 0) status = "atencao";

  let rotulo;
  if (diferenca > 0) rotulo = `${diferenca} meses adiantado`;
  else if (diferenca === 0) rotulo = "Em linha com o plano";
  else rotulo = `${Math.abs(diferenca)} meses atrás do plano`;

  return {
    chave: "vsPlano",
    titulo: "Ritmo",
    status,
    valor: null,
    rotulo,
    detalhe:
      diferenca >= 0
        ? "Seu ritmo de aportes está mantendo ou superando o planejado."
        : "Aportes previstos que não foram feitos empurraram a quitação para frente.",
    prazoPlano,
    prazoReal,
  };
}

const PESO_STATUS = { critico: 0, atencao: 1, bom: 2, neutro: 3 };

/**
 * Junta os indicadores num diagnóstico único, em linguagem de cliente.
 * O status geral é o pior entre os indicadores que têm status de verdade.
 */
export function saudeDoContrato(cliente, hoje = new Date()) {
  const indicadores = [
    indicadorPontualidade(cliente, hoje),
    indicadorAportes(cliente, hoje),
    indicadorVsPlano(cliente, hoje),
    indicadorComprometimento(cliente),
  ];

  const comStatus = indicadores.filter((i) => i.status !== "neutro");
  let geral = "neutro";
  if (comStatus.length) {
    geral = comStatus.reduce(
      (pior, i) => (PESO_STATUS[i.status] < PESO_STATUS[pior] ? i.status : pior),
      "bom"
    );
  }

  const resumo = resumoControle(cliente, hoje);

  const mensagens = {
    bom: "Contrato saudável. Você está em dia e no ritmo do plano.",
    atencao: "Atenção em um ponto. Nada grave, mas vale ajustar.",
    critico: "Seu contrato precisa de atenção agora.",
    neutro: "Ainda não há histórico suficiente para avaliar.",
  };

  return {
    geral,
    mensagem: mensagens[geral],
    indicadores,
    resumo,
  };
}
