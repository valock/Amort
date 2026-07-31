import { listarClientes, salvarCliente, excluirCliente } from "../storage.js";
import {
  clienteVazio,
  migrarCliente,
  idClienteDaURL,
  linkComCliente,
  carregarClienteAtualOuVoltar,
  salvarESeguir,
} from "../state.js";
import { fmtMoeda, fmtMoedaCurta, fmtPct } from "../format.js";
import { renderStepper } from "../nav.js";
import { resumirParaHub, ordenarParaHub, totaisDaCarteira, filtrarPorNome } from "../calc/carteira.js";
import { gerarLinkCompartilhavel, compartilharCaso } from "../compartilhar.js";
import { ligarCampo, ligarToggleSistema, setTexto, renderAvisos } from "../ui.js";
import {
  conferirAprovacao,
  entradaNecessaria,
  cotaFinanciamento,
  taxaEfetivaAnual,
  comprometimentoRenda,
} from "../calc/caixa.js";

async function iniciar() {
  if (!idClienteDaURL()) await telaLista();
  else await telaAprovacao();
}

let resumosHub = [];

async function telaLista() {
  const clientes = (await listarClientes()).map(migrarCliente);
  resumosHub = ordenarParaHub(clientes.map((c) => resumirParaHub(c)));

  renderTotais(totaisDaCarteira(resumosHub));

  // A busca só aparece quando a lista já é grande o bastante para justificar
  if (resumosHub.length >= 6) {
    document.getElementById("campo-busca").style.display = "block";
    document.getElementById("busca-cliente").addEventListener("input", (ev) => {
      renderLista(filtrarPorNome(resumosHub, ev.target.value));
    });
  }

  renderLista(resumosHub);

  document.getElementById("btn-novo-cliente").addEventListener("click", async () => {
    const nome = document.getElementById("input-novo-nome").value.trim() || "Novo cliente";
    const cliente = clienteVazio(nome);
    await salvarCliente(cliente);
    window.location.href = linkComCliente("index.html", cliente.id);
  });
}

function renderTotais(t) {
  const row = document.getElementById("totaisCarteira");
  row.innerHTML = "";
  if (t.clientes === 0) return;

  const tiles = [
    { label: t.clientes === 1 ? "Cliente acompanhado" : "Clientes acompanhados", valor: String(t.clientes) },
    { label: "Financiamentos somados", valor: fmtMoedaCurta(t.financiado) },
  ];
  if (t.precisamAcao > 0) {
    tiles.push({
      label: t.precisamAcao === 1 ? "Pede atenção" : "Pedem atenção",
      valor: String(t.precisamAcao),
      alerta: true,
    });
  }
  if (t.semDatas > 0) tiles.push({ label: "Sem datas definidas", valor: String(t.semDatas) });

  for (const tile of tiles) {
    const div = document.createElement("div");
    div.className = "kpi";
    const l = document.createElement("div");
    l.className = "kpi-label";
    l.textContent = tile.label;
    const v = document.createElement("div");
    v.className = "kpi-valor";
    if (tile.alerta) v.style.color = "var(--status-atencao)";
    v.textContent = tile.valor;
    div.appendChild(l);
    div.appendChild(v);
    row.appendChild(div);
  }
}

const ICONE_STATUS = { bom: "✓", atencao: "!", critico: "✕", neutro: "–" };

function renderLista(resumos) {
  const lista = document.getElementById("lista-clientes");
  lista.innerHTML = "";

  if (resumos.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = resumosHub.length
      ? "Nenhum cliente com esse nome."
      : "Nenhum cliente ainda. Crie o primeiro caso abaixo.";
    lista.appendChild(p);
    return;
  }

  for (const r of resumos) lista.appendChild(cartaoDeCliente(r));
}

function cartaoDeCliente(r) {
  const card = document.createElement("div");
  card.className = `hub-card ${r.status}`;

  const topo = document.createElement("a");
  topo.className = "hub-topo";
  topo.href = linkComCliente("index.html", r.id);

  const esq = document.createElement("div");
  esq.style.minWidth = "0";
  const nome = document.createElement("div");
  nome.className = "hub-nome";
  nome.textContent = r.nome;
  const sub = document.createElement("div");
  sub.className = "hub-sub";
  // Status sempre com ícone e texto, nunca só pela cor da borda
  sub.textContent =
    `${ICONE_STATUS[r.status]} ${r.statusTexto}` + (r.proximoTexto ? ` · ${r.proximoTexto}` : "");
  esq.appendChild(nome);
  esq.appendChild(sub);

  const dir = document.createElement("div");
  dir.className = "hub-valor";
  dir.textContent = r.valorFinanciamento ? fmtMoedaCurta(r.valorFinanciamento) : "—";

  topo.appendChild(esq);
  topo.appendChild(dir);
  card.appendChild(topo);

  if (r.patrimonioLiquido !== null) {
    const patr = document.createElement("div");
    patr.className = "hub-extra";
    patr.textContent = `Patrimônio do cliente hoje: ${fmtMoedaCurta(r.patrimonioLiquido)}`;
    card.appendChild(patr);
  }

  const acoes = document.createElement("div");
  acoes.className = "hub-acoes";

  const btnEnviar = document.createElement("button");
  btnEnviar.type = "button";
  btnEnviar.className = "hub-acao";
  btnEnviar.textContent = "Enviar controle";
  btnEnviar.disabled = !r.configurado;
  btnEnviar.title = r.configurado ? "" : "Defina as datas no Passo 2 antes de enviar";
  btnEnviar.addEventListener("click", async () => {
    const cliente = migrarCliente(await carregarClientePorId(r.id));
    const via = await compartilharCaso(cliente, gerarLinkCompartilhavel(cliente));
    if (via === "copiado") {
      btnEnviar.textContent = "✓ Link copiado";
      setTimeout(() => (btnEnviar.textContent = "Enviar controle"), 2500);
    }
  });

  const btnExcluir = document.createElement("button");
  btnExcluir.type = "button";
  btnExcluir.className = "hub-acao perigo";
  btnExcluir.textContent = "Excluir";
  btnExcluir.addEventListener("click", async () => {
    if (!confirm(`Excluir o caso de ${r.nome}? Isso não pode ser desfeito.`)) return;
    await excluirCliente(r.id);
    window.location.reload();
  });

  acoes.appendChild(btnEnviar);
  acoes.appendChild(btnExcluir);
  card.appendChild(acoes);

  return card;
}

async function carregarClientePorId(id) {
  return (await listarClientes()).find((c) => c.id === id);
}

async function telaAprovacao() {
  const cliente = await carregarClienteAtualOuVoltar();
  if (!cliente) return;

  document.getElementById("tela-lista").style.display = "none";
  document.getElementById("tela-aprovacao").style.display = "block";
  document.getElementById("nome-cliente").textContent = cliente.nome;
  renderStepper("index.html", cliente.id);

  const a = cliente.aprovacao;

  ligarCampo("valorImovel", a, "valorImovel", { aoMudar: recalcular });
  ligarCampo("valorAvaliacao", a, "valorAvaliacao", { aoMudar: recalcular });
  ligarCampo("valorFinanciamento", a, "valorFinanciamento", { aoMudar: recalcular });
  ligarCampo("valorSubsidio", a, "valorSubsidio", { aoMudar: recalcular });
  ligarCampo("prazoMeses", a, "prazoMeses", { aoMudar: recalcular });
  ligarCampo("primeiraPrestacaoDoc", a, "primeiraPrestacaoDoc", { aoMudar: recalcular });
  ligarCampo("jurosNominalAnual", a, "jurosNominalAnual", { escala: 100, aoMudar: recalcular });
  ligarCampo("trAnual", a, "trAnual", { escala: 100, aoMudar: recalcular });
  ligarCampo("rendaBruta", a, "rendaBruta", { aoMudar: recalcular });
  ligarCampo("comprometimentoMax", a, "comprometimentoMax", { escala: 100, aoMudar: recalcular });

  ligarToggleSistema({ obj: a, chave: "sistema", onSet: recalcular });

  function recalcular() {
    const { avisos, taxaMensal, primeiraParcelaBase, segurosETarifas } = conferirAprovacao(a);

    setTexto("saidaEfetiva", taxaMensal ? `${fmtPct(taxaEfetivaAnual(taxaMensal), 4)} a.a.` : "—");
    setTexto("saidaParcelaBase", primeiraParcelaBase ? fmtMoeda(primeiraParcelaBase) : "—");
    setTexto("saidaSeguros", a.primeiraPrestacaoDoc ? fmtMoeda(segurosETarifas) : "—");
    setTexto(
      "saidaCota",
      a.valorImovel ? fmtPct(cotaFinanciamento({ valorFinanciamento: a.valorFinanciamento, valorImovel: a.valorImovel })) : "—"
    );
    setTexto(
      "saidaComprometimento",
      a.rendaBruta && a.primeiraPrestacaoDoc
        ? fmtPct(comprometimentoRenda({ encargoMensal: a.primeiraPrestacaoDoc, rendaBruta: a.rendaBruta }))
        : "—"
    );

    document.getElementById("hintEfetiva").textContent = taxaMensal
      ? `Taxa mensal usada: ${fmtPct(taxaMensal, 4)} (padrão Caixa: juros nominais ÷ 12). Confira se os juros efetivos acima batem com o documento.`
      : "";

    renderAvisos("avisos-aprovacao", avisos);

    const entrada = entradaNecessaria(a);
    setTexto("cardEntrada", fmtMoeda(entrada));
    const hint = document.getElementById("hintEntrada");
    if (a.valorImovel) {
      const pct = entrada / a.valorImovel;
      hint.textContent = `Compra e venda − financiamento − subsídio. Equivale a ${fmtPct(pct, 1)} do imóvel.`;
    } else {
      hint.textContent = "";
    }
  }

  recalcular();

  document.getElementById("btn-continuar").addEventListener("click", async () => {
    await salvarESeguir(cliente, "entrada.html");
  });
}

iniciar();
