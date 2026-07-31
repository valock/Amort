import { salvarCliente } from "../storage.js";
import {
  carregarClienteAtualOuVoltar,
  linkComCliente,
  idClienteDaURL,
  normalizarCliente,
} from "../state.js";
import { fmtMoeda, fmtPrazo, parseNum, paraInput } from "../format.js";
import { renderStepper } from "../nav.js";
import { setTexto } from "../ui.js";
import { construirCronograma, resumoControle } from "../calc/cronograma.js";
import { rotuloMes, mesCalendario, mesContratoHoje, mesContratoDe } from "../calc/calendario.js";
import { lerCasoDoHash, limparHash } from "../compartilhar.js";

let cliente = null;
let anoVisivel = null;

async function iniciar() {
  // Caso recebido por link do corretor: importa para este aparelho e assume
  // como o controle do próprio cliente.
  const recebido = lerCasoDoHash();
  if (recebido) {
    normalizarCliente(recebido);
    await salvarCliente(recebido);
    limparHash();
    window.location.replace(linkComCliente("cronograma.html", recebido.id));
    return;
  }

  if (!idClienteDaURL()) {
    window.location.href = "index.html";
    return;
  }

  cliente = await carregarClienteAtualOuVoltar();
  if (!cliente) return;

  document.getElementById("nome-cliente").textContent = cliente.nome;
  renderStepper("cronograma.html", cliente.id);

  const ac = cliente.acompanhamento;
  if (!ac.dataBaseISO || !ac.mesEntregaChaves) {
    document.getElementById("aviso-configurar").style.display = "block";
    document.getElementById("link-configurar").href = linkComCliente("entrada.html", cliente.id);
    return;
  }

  document.getElementById("conteudo").style.display = "block";

  const hojeMes = mesContratoHoje(ac.dataBaseISO);
  const calHoje = mesCalendario(ac.dataBaseISO, Math.max(1, hojeMes));
  anoVisivel = calHoje ? calHoje.ano : mesCalendario(ac.dataBaseISO, 1).ano;

  document.getElementById("btn-ano-anterior").addEventListener("click", () => {
    anoVisivel--;
    render();
  });
  document.getElementById("btn-ano-proximo").addEventListener("click", () => {
    anoVisivel++;
    render();
  });
  document.getElementById("btn-ir-hoje").addEventListener("click", () => {
    const c = mesCalendario(ac.dataBaseISO, Math.max(1, mesContratoHoje(ac.dataBaseISO)));
    if (c) {
      anoVisivel = c.ano;
      render();
    }
  });

  render();
}

async function persistir() {
  await salvarCliente(cliente);
}

function render() {
  const ac = cliente.acompanhamento;
  const { linhas } = construirCronograma(cliente);
  const resumo = resumoControle(cliente);

  // ---- Painel ----
  const prox = resumo.proximoVencimento;
  if (resumo.mesesEmAtraso > 0) {
    document.getElementById("labelProximo").textContent =
      resumo.mesesEmAtraso === 1 ? "1 mês em aberto" : `${resumo.mesesEmAtraso} meses em aberto`;
    setTexto("valorProximo", fmtMoeda(resumo.valorEmAtraso));
    document.getElementById("hintProximo").textContent =
      "Marque os meses que você já pagou para o controle ficar em dia.";
    document.getElementById("cardProximo").classList.add("highlight-atencao");
  } else if (prox) {
    document.getElementById("labelProximo").textContent = `Próximo vencimento · ${rotuloMes(
      ac.dataBaseISO,
      prox.mesContrato,
      { comAnoCompleto: true }
    )}`;
    setTexto("valorProximo", fmtMoeda(prox.totalPrevisto));
    document.getElementById("hintProximo").textContent = prox.compromissos
      .map((c) => c.descricao)
      .join(" + ");
    document.getElementById("cardProximo").classList.remove("highlight-atencao");
  } else {
    document.getElementById("labelProximo").textContent = "Tudo em dia";
    setTexto("valorProximo", "✓");
    document.getElementById("hintProximo").textContent = "Nenhum compromisso em aberto.";
  }

  setTexto("linhaPago", fmtMoeda(resumo.totalPagoRegistrado));
  setTexto("linhaPrevisto", fmtMoeda(resumo.totalPrevistoAteHoje));
  setTexto("linhaAtraso", fmtMoeda(resumo.valorEmAtraso));
  document.getElementById("linhaAtrasoWrap").style.display =
    resumo.valorEmAtraso > 0 ? "flex" : "none";
  setTexto("linhaAportes", fmtMoeda(resumo.totalAportesRegistrados));
  // O financiamento só passa a ter saldo depois das chaves; antes disso o
  // dinheiro está indo para a construtora, não amortizando dívida.
  let textoSaldo;
  if (resumo.saldoDevedorAtual !== null) textoSaldo = fmtMoeda(resumo.saldoDevedorAtual);
  else if (resumo.mesContratoHoje <= 0) textoSaldo = "contrato não começou";
  else textoSaldo = "só após as chaves";
  setTexto("linhaSaldo", textoSaldo);

  if (resumo.quitacaoMesContrato) {
    setTexto("valorQuitacao", rotuloMes(ac.dataBaseISO, resumo.quitacaoMesContrato, { comAnoCompleto: true }));
    document.getElementById("hintQuitacao").textContent = `Em ${fmtPrazo(
      resumo.prazoAtual
    )} de financiamento, no lugar de ${fmtPrazo(resumo.prazoSemAportes)}.`;
  } else {
    setTexto("valorQuitacao", "—");
  }

  setTexto("linhaTempoEconomizado", fmtPrazo(resumo.mesesEconomizados));
  setTexto("linhaEconomiaJuros", fmtMoeda(resumo.economiaJurosAtual));

  // ---- Lista de meses do ano visível ----
  const primeiroMesDoAno = mesContratoDe(ac.dataBaseISO, anoVisivel, 1);
  const ultimoMesDoAno = mesContratoDe(ac.dataBaseISO, anoVisivel, 12);
  const doAno = linhas.filter(
    (l) => l.mesContrato >= primeiroMesDoAno && l.mesContrato <= ultimoMesDoAno
  );

  setTexto("rotuloAno", String(anoVisivel));

  const container = document.getElementById("lista-meses");
  container.innerHTML = "";

  if (doAno.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "hint";
    vazio.textContent = "Nenhum compromisso neste ano.";
    container.appendChild(vazio);
    return;
  }

  const hojeMes = mesContratoHoje(ac.dataBaseISO);

  for (const linha of doAno) {
    container.appendChild(cartaoDoMes(linha, hojeMes));
  }
}

function cartaoDoMes(linha, hojeMes) {
  const ac = cliente.acompanhamento;
  const card = document.createElement("div");
  card.className = "mes-card";
  if (linha.pago) card.classList.add("pago");
  else if (hojeMes > 0 && linha.mesContrato <= hojeMes) card.classList.add("atrasado");
  if (linha.mesContrato === hojeMes) card.classList.add("atual");

  // Cabeçalho: data + total do mês
  const topo = document.createElement("div");
  topo.className = "mes-topo";

  const esquerda = document.createElement("div");
  const data = document.createElement("div");
  data.className = "mes-data";
  data.textContent = rotuloMes(ac.dataBaseISO, linha.mesContrato);
  if (linha.mesContrato === hojeMes) data.textContent += " · este mês";
  const desc = document.createElement("div");
  desc.className = "mes-desc";
  desc.textContent = linha.compromissos.map((c) => c.descricao).join(" + ");
  esquerda.appendChild(data);
  esquerda.appendChild(desc);

  const valor = document.createElement("div");
  valor.className = "mes-valor";
  valor.textContent = fmtMoeda(linha.totalPrevisto);

  topo.appendChild(esquerda);
  topo.appendChild(valor);
  card.appendChild(topo);

  // Detalhe dos compromissos quando há mais de um
  if (linha.compromissos.length > 1) {
    for (const c of linha.compromissos) {
      const det = document.createElement("div");
      det.className = "mes-detalhe";
      det.innerHTML = "<span></span><span></span>";
      det.children[0].textContent = c.descricao;
      det.children[1].textContent = fmtMoeda(c.valor);
      card.appendChild(det);
    }
  }

  // Botão de pago
  const acoes = document.createElement("div");
  acoes.className = "mes-acoes";

  const btnPago = document.createElement("button");
  btnPago.type = "button";
  btnPago.className = "btn-pago" + (linha.pago ? " ativo" : "");
  btnPago.textContent = linha.pago ? "✓ Pago" : "Marcar pago";
  btnPago.addEventListener("click", async () => {
    const chave = String(linha.mesContrato);
    const atual = ac.meses[chave] || {};
    if (linha.pago) {
      delete atual.pago;
      delete atual.valorPago;
      if (!atual.aporte) delete ac.meses[chave];
      else ac.meses[chave] = atual;
    } else {
      ac.meses[chave] = { ...atual, pago: true };
    }
    await persistir();
    render();
  });
  acoes.appendChild(btnPago);
  card.appendChild(acoes);

  // Valor realmente pago (o INCC é estimativa, o boleto real difere)
  if (linha.pago) {
    const campoValor = document.createElement("div");
    campoValor.className = "mes-campo";
    const rot = document.createElement("label");
    rot.textContent = "Valor que você pagou (opcional)";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.inputMode = "decimal";
    inp.placeholder = fmtMoeda(linha.totalPrevisto);
    inp.value = linha.valorPago ? paraInput(linha.valorPago) : "";
    inp.addEventListener("change", async () => {
      const chave = String(linha.mesContrato);
      const v = parseNum(inp.value);
      ac.meses[chave] = { ...(ac.meses[chave] || {}), pago: true, valorPago: v || null };
      await persistir();
      render();
    });
    campoValor.appendChild(rot);
    campoValor.appendChild(inp);
    card.appendChild(campoValor);
  }

  // Aporte extra só faz sentido depois das chaves, quando há saldo a amortizar
  if (linha.fase === "pos-chaves") {
    const campoAporte = document.createElement("div");
    campoAporte.className = "mes-campo";
    const rot = document.createElement("label");
    rot.textContent = linha.aportePlanejado
      ? `Aporte extra — o plano previa ${fmtMoeda(linha.aportePlanejado)}`
      : "Aporte extra neste mês";
    const inp = document.createElement("input");
    inp.type = "text";
    inp.inputMode = "decimal";
    inp.placeholder = "0,00";
    inp.value = linha.aporteRegistrado ? paraInput(linha.aporteRegistrado) : "";
    inp.addEventListener("change", async () => {
      const chave = String(linha.mesContrato);
      const v = parseNum(inp.value);
      const atual = ac.meses[chave] || {};
      if (v > 0) ac.meses[chave] = { ...atual, aporte: v };
      else {
        delete atual.aporte;
        if (!atual.pago) delete ac.meses[chave];
        else ac.meses[chave] = atual;
      }
      await persistir();
      render();
    });
    campoAporte.appendChild(rot);
    campoAporte.appendChild(inp);
    card.appendChild(campoAporte);
  }

  if (linha.saldoDevedor !== null) {
    const saldo = document.createElement("div");
    saldo.className = "mes-saldo";
    saldo.textContent = `Saldo devedor depois deste mês: ${fmtMoeda(linha.saldoDevedor)}`;
    card.appendChild(saldo);
  }

  return card;
}

iniciar();
