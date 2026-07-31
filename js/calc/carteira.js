// Visão de carteira do corretor: o resumo de todos os casos cadastrados.
//
// O corretor acompanha várias famílias ao mesmo tempo. O hub existe para ele
// abrir o app e ver, sem clicar em nada, quem está em dia, quem precisa de
// atenção e quanto de negócio ele está acompanhando.

import { saudeDoContrato } from "./saude.js";
import { resumoControle } from "./cronograma.js";
import { entradaNecessaria } from "./caixa.js";
import { patrimonio } from "./patrimonio.js";
import { rotuloMes } from "./calendario.js";

const ORDEM_STATUS = { critico: 0, atencao: 1, neutro: 2, bom: 3 };

/**
 * Resume um caso para caber numa linha do hub, sem obrigar o corretor a abrir.
 * Um caso incompleto (sem datas, sem valores) não pode quebrar a lista, então
 * tudo aqui tolera campo faltando.
 */
export function resumirParaHub(cliente, hoje = new Date()) {
  const a = cliente.aprovacao || {};
  const ac = cliente.acompanhamento || {};
  const configurado = !!(ac.dataBaseISO && ac.mesEntregaChaves);

  const base = {
    id: cliente.id,
    nome: cliente.nome,
    criadoEm: cliente.criadoEm,
    valorFinanciamento: a.valorFinanciamento || 0,
    valorImovel: a.valorImovel || 0,
    entrada: entradaNecessaria(a),
    configurado,
    status: "neutro",
    statusTexto: configurado ? "Sem histórico" : "Faltam as datas",
    proximoTexto: "",
    saldoDevedor: null,
    patrimonioLiquido: null,
  };

  if (!configurado || !a.valorFinanciamento) return base;

  try {
    const saude = saudeDoContrato(cliente, hoje);
    const resumo = resumoControle(cliente, hoje);

    base.status = saude.geral;
    base.statusTexto =
      saude.geral === "bom"
        ? "Em dia"
        : saude.geral === "atencao"
        ? "Requer atenção"
        : saude.geral === "critico"
        ? "Precisa de ação"
        : "Sem histórico";

    base.saldoDevedor = resumo.saldoDevedorAtual;

    if (resumo.mesesEmAtraso > 0) {
      base.proximoTexto = `${resumo.mesesEmAtraso} ${
        resumo.mesesEmAtraso === 1 ? "mês" : "meses"
      } em aberto`;
    } else if (resumo.proximoVencimento) {
      base.proximoTexto = `vence ${rotuloMes(ac.dataBaseISO, resumo.proximoVencimento.mesContrato)}`;
    } else {
      base.proximoTexto = "sem pendência";
    }

    const merc = cliente.mercado || {};
    if (merc.valorAtual > 0 && resumo.saldoDevedorAtual !== null) {
      base.patrimonioLiquido = patrimonio({
        valorMercado: merc.valorAtual,
        saldoDevedor: resumo.saldoDevedorAtual,
        valorCompra: a.valorImovel,
      }).liquido;
    }
  } catch {
    // Um caso com dado inconsistente aparece como incompleto em vez de
    // derrubar o hub inteiro.
    base.status = "neutro";
    base.statusTexto = "Dados incompletos";
  }

  return base;
}

/** Ordena pelos que pedem ação primeiro, depois pelos mais recentes. */
export function ordenarParaHub(resumos) {
  return [...resumos].sort((x, y) => {
    const dif = (ORDEM_STATUS[x.status] ?? 9) - (ORDEM_STATUS[y.status] ?? 9);
    if (dif !== 0) return dif;
    return (y.criadoEm || "").localeCompare(x.criadoEm || "");
  });
}

export function totaisDaCarteira(resumos) {
  return resumos.reduce(
    (acc, r) => ({
      clientes: acc.clientes + 1,
      financiado: acc.financiado + r.valorFinanciamento,
      imoveis: acc.imoveis + r.valorImovel,
      precisamAcao: acc.precisamAcao + (r.status === "critico" || r.status === "atencao" ? 1 : 0),
      semDatas: acc.semDatas + (r.configurado ? 0 : 1),
    }),
    { clientes: 0, financiado: 0, imoveis: 0, precisamAcao: 0, semDatas: 0 }
  );
}

/** Busca simples por nome, sem acento e sem diferenciar maiúsculas. */
export function filtrarPorNome(resumos, termo) {
  const t = normalizar(termo);
  if (!t) return resumos;
  return resumos.filter((r) => normalizar(r.nome).includes(t));
}

function normalizar(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
