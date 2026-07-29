import { carregarClienteAtualOuVoltar, linkComCliente, salvarESeguir } from "../state.js";
import { simular, aportesPorMes, prazoEfetivoMeses } from "../calc/amortizacao.js";
import { gerarAportesFGTS, gerarAportes13, combinarAportes } from "../calc/fgts.js";
import { fmtMoeda, fmtPrazo } from "../format.js";

async function iniciar() {
  const cliente = await carregarClienteAtualOuVoltar();
  if (!cliente) return;

  document.getElementById("nome-cliente").textContent = cliente.nome;
  document.getElementById("link-fechamento").href = linkComCliente("index.html", cliente.id);
  document.getElementById("link-resultados").href = linkComCliente("resultados.html", cliente.id);

  const e = cliente.estrategia;
  const valorFinanciado = cliente.fechamento.valorFinanciadoObra || 0;
  document.getElementById("valorFinanciadoLabel").textContent = fmtMoeda(valorFinanciado);

  document.getElementById("prazoMeses").value = e.prazoMeses || "";
  document.getElementById("taxaAnual").value = e.taxaAnual != null ? e.taxaAnual * 100 : "";
  document.getElementById("salarioBruto").value = e.salarioBruto || "";
  document.getElementById("valor13").value = e.valor13 || "";

  const btnSAC = document.querySelector('[data-sistema="SAC"]');
  const btnPRICE = document.querySelector('[data-sistema="PRICE"]');
  function setSistema(sistema) {
    e.sistema = sistema;
    btnSAC.classList.toggle("active", sistema === "SAC");
    btnPRICE.classList.toggle("active", sistema === "PRICE");
    recalcular();
  }
  btnSAC.addEventListener("click", () => setSistema("SAC"));
  btnPRICE.addEventListener("click", () => setSistema("PRICE"));
  setSistema(e.sistema || "SAC");

  const btnFgts = document.getElementById("toggle-fgts");
  btnFgts.classList.toggle("active", !!e.usarFGTS);
  btnFgts.addEventListener("click", () => {
    e.usarFGTS = !e.usarFGTS;
    btnFgts.classList.toggle("active", e.usarFGTS);
    recalcular();
  });

  const btn13 = document.getElementById("toggle-13");
  btn13.classList.toggle("active", !!e.usar13);
  btn13.addEventListener("click", () => {
    e.usar13 = !e.usar13;
    btn13.classList.toggle("active", e.usar13);
    recalcular();
  });

  const listaAportes = document.getElementById("lista-aportes");
  function renderAportes() {
    listaAportes.innerHTML = "";
    e.aportesAvulsos.forEach((a, idx) => {
      const row = document.createElement("div");
      row.className = "list-row";
      row.innerHTML = `
        <input type="number" inputmode="numeric" placeholder="Mês" value="${a.mes}" style="max-width:90px" />
        <input type="number" inputmode="decimal" placeholder="Valor R$" value="${a.valor}" />
        <button type="button" class="remove-btn" aria-label="Remover">×</button>
      `;
      const [inputMes, inputValor] = row.querySelectorAll("input");
      inputMes.addEventListener("input", () => {
        e.aportesAvulsos[idx].mes = Number(inputMes.value) || 0;
        recalcular();
      });
      inputValor.addEventListener("input", () => {
        e.aportesAvulsos[idx].valor = Number(inputValor.value) || 0;
        recalcular();
      });
      row.querySelector(".remove-btn").addEventListener("click", () => {
        e.aportesAvulsos.splice(idx, 1);
        renderAportes();
        recalcular();
      });
      listaAportes.appendChild(row);
    });
  }

  document.getElementById("btn-add-aporte").addEventListener("click", () => {
    const proximoMes = e.aportesAvulsos.length ? e.aportesAvulsos[e.aportesAvulsos.length - 1].mes + 1 : 1;
    e.aportesAvulsos.push({ mes: proximoMes, valor: 0 });
    renderAportes();
    recalcular();
  });

  function lerCamposParaEstado() {
    e.prazoMeses = Number(document.getElementById("prazoMeses").value) || 0;
    e.taxaAnual = (Number(document.getElementById("taxaAnual").value) || 0) / 100;
    e.salarioBruto = Number(document.getElementById("salarioBruto").value) || 0;
    e.valor13 = Number(document.getElementById("valor13").value) || 0;
  }

  function recalcular() {
    lerCamposParaEstado();
    document.getElementById("previaPrazoOriginal").textContent = e.prazoMeses ? fmtPrazo(e.prazoMeses) : "—";

    if (!valorFinanciado || !e.prazoMeses || !e.taxaAnual) {
      document.getElementById("previaPrazoEstrategico").textContent = "—";
      return;
    }

    const aportes = combinarAportes(
      e.usarFGTS ? gerarAportesFGTS({ salarioBruto: e.salarioBruto, prazoMeses: e.prazoMeses, intervaloSaqueMeses: e.intervaloSaqueFGTSMeses || 24 }) : [],
      e.usar13 ? gerarAportes13(e.valor13, e.prazoMeses) : [],
      e.aportesAvulsos
    );

    const meses = simular({
      valorFinanciado,
      prazoMeses: e.prazoMeses,
      taxaAnual: e.taxaAnual,
      sistema: e.sistema,
      aportesExtras: aportesPorMes(aportes),
    });

    document.getElementById("previaPrazoEstrategico").textContent = fmtPrazo(prazoEfetivoMeses(meses));
  }

  renderAportes();
  recalcular();

  ["prazoMeses", "taxaAnual", "salarioBruto", "valor13"].forEach((id) =>
    document.getElementById(id).addEventListener("input", recalcular)
  );

  document.getElementById("btn-continuar").addEventListener("click", async () => {
    lerCamposParaEstado();
    await salvarESeguir(cliente, "resultados.html");
  });
}

iniciar();
