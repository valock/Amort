import { listarClientes, salvarCliente } from "../storage.js";
import { clienteVazio, idClienteDaURL, linkComCliente, carregarClienteAtualOuVoltar, salvarESeguir } from "../state.js";
import { corrigirParcelas, totalNominal, totalCorrigido } from "../calc/incc.js";
import { calcularJurosObra, totalJurosObra } from "../calc/evolucaoObra.js";
import { fmtMoeda } from "../format.js";

async function iniciar() {
  const clienteId = idClienteDaURL();
  if (!clienteId) {
    await iniciarTelaLista();
  } else {
    await iniciarTelaFechamento();
  }
}

async function iniciarTelaLista() {
  const clientes = await listarClientes();
  const lista = document.getElementById("lista-clientes");

  if (clientes.length === 0) {
    lista.innerHTML = '<p class="hint">Nenhum cliente ainda. Crie o primeiro caso abaixo.</p>';
  } else {
    lista.innerHTML = "";
    clientes
      .sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""))
      .forEach((c) => {
        const item = document.createElement("a");
        item.className = "client-item";
        item.href = linkComCliente("index.html", c.id);
        item.innerHTML = `
          <span>
            <div class="name">${escapeHtml(c.nome)}</div>
            <div class="date">${new Date(c.criadoEm).toLocaleDateString("pt-BR")}</div>
          </span>
          <span>›</span>`;
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function iniciarTelaFechamento() {
  const cliente = await carregarClienteAtualOuVoltar();
  if (!cliente) return;

  document.getElementById("tela-lista").style.display = "none";
  document.getElementById("tela-fechamento").style.display = "block";
  document.getElementById("stepper").style.display = "flex";
  document.getElementById("link-estrategia").href = linkComCliente("estrategia.html", cliente.id);
  document.getElementById("link-resultados").href = linkComCliente("resultados.html", cliente.id);
  document.getElementById("nome-cliente").textContent = cliente.nome;

  const f = cliente.fechamento;

  document.getElementById("valorImovel").value = f.valorImovel || "";
  document.getElementById("prazoObraMeses").value = f.prazoObraMeses || "";
  document.getElementById("sinal").value = f.sinal || "";
  document.getElementById("inccMensal").value = f.inccMensal != null ? f.inccMensal * 100 : "";
  document.getElementById("valorFinanciadoObra").value = f.valorFinanciadoObra || "";
  document.getElementById("taxaMensalObra").value = f.taxaMensalObra != null ? f.taxaMensalObra * 100 : "";

  const listaParcelas = document.getElementById("lista-parcelas");

  function renderParcelas() {
    listaParcelas.innerHTML = "";
    f.parcelasEntrada.forEach((p, idx) => {
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `
        <input type="number" inputmode="numeric" placeholder="Mês" value="${p.mes}" style="max-width:90px" data-field="mes" />
        <input type="number" inputmode="decimal" placeholder="Valor R$" value="${p.valor}" data-field="valor" />
        <button type="button" class="remove-btn" aria-label="Remover">×</button>
      `;
      const [inputMes, inputValor] = row.querySelectorAll("input");
      inputMes.addEventListener("input", () => {
        f.parcelasEntrada[idx].mes = Number(inputMes.value) || 0;
        recalcular();
      });
      inputValor.addEventListener("input", () => {
        f.parcelasEntrada[idx].valor = Number(inputValor.value) || 0;
        recalcular();
      });
      row.querySelector(".remove-btn").addEventListener("click", () => {
        f.parcelasEntrada.splice(idx, 1);
        renderParcelas();
        recalcular();
      });
      listaParcelas.appendChild(row);
    });
  }

  document.getElementById("btn-add-parcela").addEventListener("click", () => {
    const proximoMes = f.parcelasEntrada.length
      ? f.parcelasEntrada[f.parcelasEntrada.length - 1].mes + 1
      : 1;
    f.parcelasEntrada.push({ mes: proximoMes, valor: 0 });
    renderParcelas();
    recalcular();
  });

  function recalcular() {
    const inccMensal = (Number(document.getElementById("inccMensal").value) || 0) / 100;
    document.getElementById("totalNominalParcelas").textContent = fmtMoeda(totalNominal(f.parcelasEntrada));
    document.getElementById("totalCorrigidoParcelas").textContent = fmtMoeda(
      totalCorrigido(f.parcelasEntrada, inccMensal)
    );

    const valorFinanciadoObra = Number(document.getElementById("valorFinanciadoObra").value) || 0;
    const prazoObraMeses = Number(document.getElementById("prazoObraMeses").value) || 0;
    const taxaMensalObra = (Number(document.getElementById("taxaMensalObra").value) || 0) / 100;

    if (valorFinanciadoObra > 0 && prazoObraMeses > 0) {
      const meses = calcularJurosObra(valorFinanciadoObra, prazoObraMeses, taxaMensalObra);
      document.getElementById("totalJurosObra").textContent = fmtMoeda(totalJurosObra(meses));
    } else {
      document.getElementById("totalJurosObra").textContent = fmtMoeda(0);
    }
  }

  renderParcelas();
  recalcular();

  [
    "valorImovel",
    "prazoObraMeses",
    "sinal",
    "inccMensal",
    "valorFinanciadoObra",
    "taxaMensalObra",
  ].forEach((id) => document.getElementById(id).addEventListener("input", recalcular));

  document.getElementById("btn-continuar").addEventListener("click", async () => {
    f.valorImovel = Number(document.getElementById("valorImovel").value) || 0;
    f.prazoObraMeses = Number(document.getElementById("prazoObraMeses").value) || 0;
    f.sinal = Number(document.getElementById("sinal").value) || 0;
    f.inccMensal = (Number(document.getElementById("inccMensal").value) || 0) / 100;
    f.valorFinanciadoObra = Number(document.getElementById("valorFinanciadoObra").value) || 0;
    f.taxaMensalObra = (Number(document.getElementById("taxaMensalObra").value) || 0) / 100;

    await salvarESeguir(cliente, "estrategia.html");
  });
}

iniciar();
