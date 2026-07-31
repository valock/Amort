// Monta os dois cenários comparados na venda — cru vs estratégico — a partir
// do cliente salvo. Fica num módulo só para a prévia da tela de Estratégia e
// o resultado final nunca divergirem.

import { simular, aportesPorMes, totalJuros, prazoEfetivoMeses } from "./amortizacao.js";
import { gerarAportesFGTS, gerarAportes13, combinarAportes } from "./fgts.js";
import { taxaMensalCaixa, segurosETarifasMensais } from "./caixa.js";
import { mesCalendario } from "./calendario.js";

/**
 * Aportes que o PLANO prevê, na linha do tempo da amortização (mês 1 = 1ª
 * prestação da Caixa).
 *
 * Esta é a única função que monta a lista de aportes projetados. Tanto a tela
 * de Resultado quanto o controle mês a mês passam por aqui — se cada uma
 * montasse a sua, as duas mostrariam economias diferentes para o mesmo caso.
 */
export function montarAportes(cliente) {
  const e = cliente.estrategia;
  const prazoMeses = cliente.aprovacao.prazoMeses;

  // Com as datas do contrato definidas, o 13º cai em dezembro de verdade,
  // e não a cada 12 meses de contrato.
  const ac = cliente.acompanhamento || {};
  let mesCalendarioInicial;
  if (ac.dataBaseISO && ac.mesEntregaChaves) {
    const c = mesCalendario(ac.dataBaseISO, ac.mesEntregaChaves);
    if (c) mesCalendarioInicial = c.mes;
  }

  return combinarAportes(
    e.usarFGTS
      ? gerarAportesFGTS({
          salarioBruto: e.salarioBruto,
          prazoMeses,
          intervaloSaqueMeses: e.intervaloSaqueFGTSMeses || 24,
        })
      : [],
    e.usar13 ? gerarAportes13(e.valor13, prazoMeses, { mesCalendarioInicial }) : [],
    e.aportesAvulsos || []
  );
}

export function calcularCenarios(cliente) {
  const a = cliente.aprovacao;
  const taxaMensal = taxaMensalCaixa(a.jurosNominalAnual, a.trAnual);

  const base = {
    valorFinanciado: a.valorFinanciamento,
    prazoMeses: a.prazoMeses,
    taxaMensal,
    sistema: a.sistema,
  };

  const aportes = montarAportes(cliente);
  const cru = simular({ ...base, aportesExtras: new Map() });
  const estrategico = simular({ ...base, aportesExtras: aportesPorMes(aportes) });

  const seguros = segurosETarifasMensais({
    primeiraPrestacaoDoc: a.primeiraPrestacaoDoc,
    valorFinanciamento: a.valorFinanciamento,
    prazoMeses: a.prazoMeses,
    taxaMensal,
    sistema: a.sistema,
  });

  const jurosCru = totalJuros(cru);
  const jurosEstrategico = totalJuros(estrategico);
  const prazoCru = prazoEfetivoMeses(cru);
  const prazoEstrategico = prazoEfetivoMeses(estrategico);
  const mesesEvitados = prazoCru - prazoEstrategico;

  // Encurtar o prazo também corta os meses de seguro e tarifa — economia real
  // que costuma passar batido na conversa de venda.
  const segurosEvitados = seguros * mesesEvitados;

  // Só conta o que a simulação REALMENTE aplicou. A lista de aportes é gerada
  // para o prazo original, então inclui saques de FGTS de anos posteriores à
  // quitação; somar tudo infla o esforço do cliente e derruba o argumento.
  const totalAportesAplicados = estrategico.reduce((acc, m) => acc + m.aporteExtra, 0);

  return {
    taxaMensal,
    aportes,
    cru,
    estrategico,
    jurosCru,
    jurosEstrategico,
    economiaJuros: jurosCru - jurosEstrategico,
    prazoCru,
    prazoEstrategico,
    mesesEvitados,
    segurosMensais: seguros,
    segurosEvitados,
    economiaTotal: jurosCru - jurosEstrategico + segurosEvitados,
    totalAportes: totalAportesAplicados,
  };
}
