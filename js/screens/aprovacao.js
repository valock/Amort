import { listarClientes, salvarCliente } from "../storage.js";
import {
  clienteVazio,
  migrarCliente,
  idClienteDaURL,
  linkComCliente,
  carregarClienteAtualOuVoltar,
  salvarESeguir,
} from "../state.js";
import { fmtMoeda, fmtPct } from "../format.js";
import { renderStepper } from "../nav.js";
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

async function telaLista() {
  const clientes = (await listarClientes()).map(migrarCliente);
  const lista = document.getElementById("lista-clientes");

  if (clientes.length === 0) {
    lista.innerHTML = '<p class="hint">Nenhum cliente ainda. Crie o primeiro caso abaixo.</p>';
  } else {
    clientes
      .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""))
      .forEach((c) => {
        const item = document.createElement("a");
        item.className = "client-item";
        item.href = linkComCliente("index.html", c.id);
        const info = document.createElement("span");
        const nome = document.createElement("div");
        nome.className = "name";
        nome.textContent = c.nome;
        const data = document.createElement("div");
        data.className = "date";
        const financiado = c.aprovacao?.valorFinanciamento;
        data.textContent = financiado
          ? `${fmtMoeda(financiado)} financiados · ${new Date(c.criadoEm).toLocaleDateString("pt-BR")}`
          : new Date(c.criadoEm).toLocaleDateString("pt-BR");
        info.appendChild(nome);
        info.appendChild(data);
        const seta = document.createElement("span");
        seta.textContent = "›";
        item.appendChild(info);
        item.appendChild(seta);
        lista.appendChild(item);
      });
  }

  document.getElementById("btn-novo-cliente").addEventListener("click", async () => {
    const nome = document.getElementById("input-novo-nome").value.trim() || "Novo cliente";
    const cliente = clienteVazio(nome);
    await salvarCliente(cliente);
    window.location.href = linkComCliente("index.html", cliente.id);
  });
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
