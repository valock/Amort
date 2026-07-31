import { carregarClienteAtualOuVoltar, salvarESeguir } from "../state.js";
import { fmtMoeda, fmtPrazo } from "../format.js";
import { renderStepper } from "../nav.js";
import { ligarCampo, ligarToggleBool, renderListaValores, proximoMes, setTexto } from "../ui.js";
import { calcularCenarios } from "../calc/cenarios.js";

async function iniciar() {
  const cliente = await carregarClienteAtualOuVoltar();
  if (!cliente) return;

  document.getElementById("nome-cliente").textContent = cliente.nome;
  renderStepper("estrategia.html", cliente.id);

  const a = cliente.aprovacao;
  const e = cliente.estrategia;

  setTexto("saidaFinanciado", fmtMoeda(a.valorFinanciamento));
  setTexto("saidaPrazoSistema", a.prazoMeses ? `${a.prazoMeses} meses · ${a.sistema}` : "—");
  setTexto("saidaPrestacao", a.primeiraPrestacaoDoc ? fmtMoeda(a.primeiraPrestacaoDoc) : "—");

  // Sem salário informado, herda a renda bruta da aprovação — é o número que
  // o corretor já digitou no Passo 1.
  if (!e.salarioBruto && a.rendaBruta) e.salarioBruto = a.rendaBruta;

  ligarCampo("salarioBruto", e, "salarioBruto", { aoMudar: recalcular });
  ligarCampo("intervaloSaqueFGTSMeses", e, "intervaloSaqueFGTSMeses", { aoMudar: recalcular });
  ligarCampo("valor13", e, "valor13", { aoMudar: recalcular });

  ligarToggleBool("toggle-fgts", e, "usarFGTS", recalcular);
  ligarToggleBool("toggle-13", e, "usar13", recalcular);

  function redesenharAportes() {
    renderListaValores({
      containerId: "lista-aportes",
      itens: e.aportesAvulsos,
      aoMudar: recalcular,
    });
  }

  document.getElementById("btn-add-aporte").addEventListener("click", () => {
    e.aportesAvulsos.push({ mes: proximoMes(e.aportesAvulsos), valor: 0 });
    redesenharAportes();
    recalcular();
  });

  function recalcular() {
    setTexto("previaPrazoOriginal", a.prazoMeses ? fmtPrazo(a.prazoMeses) : "—");

    if (!a.valorFinanciamento || !a.prazoMeses) {
      setTexto("previaPrazoEstrategico", "—");
      setTexto("previaAportes", "—");
      return;
    }

    const c = calcularCenarios(cliente);
    setTexto("previaPrazoEstrategico", fmtPrazo(c.prazoEstrategico));
    setTexto("previaAportes", fmtMoeda(c.totalAportes));
  }

  redesenharAportes();
  recalcular();

  document.getElementById("btn-continuar").addEventListener("click", async () => {
    await salvarESeguir(cliente, "resultados.html");
  });
}

iniciar();
