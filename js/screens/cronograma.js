import { salvarCliente } from "../storage.js";
import {
  carregarClienteAtualOuVoltar,
  linkComCliente,
  idClienteDaURL,
  normalizarCliente,
} from "../state.js";
import { fmtMoeda, fmtMoedaCurta, fmtPrazo, fmtPct, parseNum, paraInput } from "../format.js";
import { renderStepper } from "../nav.js";
import { setTexto } from "../ui.js";
import {
  construirCronograma,
  resumoControle,
  planilhaCaixa,
  seriesControle,
} from "../calc/cronograma.js";
import { rotuloMes, mesCalendario, mesContratoHoje, mesContratoDe } from "../calc/calendario.js";
import { lerCasoDoHash, limparHash } from "../compartilhar.js";
import { criarGraficoSaldoControle, criarGraficoComposicao, padSerie } from "../charts.js";
import { planilhaParaCSV, baixarCSV, nomeArquivoPlanilha } from "../csv.js";

let cliente = null;
let anoVisivel = null;
let graficos = [];
let planilhaRenderizada = false;

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

  configurarAbas();

  document.getElementById("btn-ano-anterior").addEventListener("click", () => {
    anoVisivel--;
    renderMeses();
  });
  document.getElementById("btn-ano-proximo").addEventListener("click", () => {
    anoVisivel++;
    renderMeses();
  });
  document.getElementById("btn-ir-hoje").addEventListener("click", () => {
    const c = mesCalendario(ac.dataBaseISO, Math.max(1, mesContratoHoje(ac.dataBaseISO)));
    if (c) {
      anoVisivel = c.ano;
      renderMeses();
    }
  });

  document.getElementById("btn-csv").addEventListener("click", () => {
    const planilha = planilhaCaixa(cliente);
    baixarCSV(nomeArquivoPlanilha(cliente), planilhaParaCSV(cliente, planilha));
  });

  renderTudo();
}

function configurarAbas() {
  const botoes = document.querySelectorAll(".tab");
  botoes.forEach((btn) => {
    btn.addEventListener("click", () => {
      botoes.forEach((b) => b.classList.toggle("ativa", b === btn));
      document.querySelectorAll(".painel-aba").forEach((p) => {
        p.hidden = p.dataset.painel !== btn.dataset.aba;
      });
      // A planilha tem centenas de linhas: só monta quando o cliente abre
      // a aba, para a tela não demorar a aparecer.
      if (btn.dataset.aba === "planilha" && !planilhaRenderizada) renderPlanilha();
    });
  });
}

async function persistir() {
  await salvarCliente(cliente);
}

function renderTudo() {
  renderResumo();
  renderMeses();
  renderGraficos();
  // Se a planilha já estava montada, refaz para refletir o novo registro
  if (planilhaRenderizada) renderPlanilha();
}

// ---------------------------------------------------------------- Resumo

function renderResumo() {
  const ac = cliente.acompanhamento;
  const resumo = resumoControle(cliente);

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

  renderBarraQuitado(resumo);

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
}

function renderBarraQuitado(resumo) {
  const financiado = cliente.aprovacao.valorFinanciamento || 0;
  const saldo = resumo.saldoDevedorAtual;
  const barra = document.getElementById("barraQuitado");

  if (saldo === null || !financiado) {
    barra.style.width = "0%";
    setTexto("barraTextoEsq", "A amortização começa quando você pega as chaves.");
    setTexto("barraTextoDir", "");
    return;
  }

  const quitado = financiado - saldo;
  const pct = Math.max(0, Math.min(1, quitado / financiado));
  barra.style.width = `${(pct * 100).toFixed(1)}%`;
  setTexto("barraTextoEsq", `${fmtPct(pct, 1)} quitado (${fmtMoedaCurta(quitado)})`);
  setTexto("barraTextoDir", `falta ${fmtMoedaCurta(saldo)}`);
}

// ---------------------------------------------------------------- Gráficos

function renderGraficos() {
  graficos.forEach((g) => g.destroy());
  graficos = [];

  const ac = cliente.acompanhamento;
  const s = seriesControle(cliente);
  if (!s.tamanho) return;

  const chaves = ac.mesEntregaChaves;
  // Eixo em datas reais: o cliente pensa em "mar/2032", não em "mês 68"
  const labels = Array.from({ length: s.tamanho }, (_, i) =>
    rotuloMes(ac.dataBaseISO, chaves + i)
  );
  const tooltipData = (i) => rotuloMes(ac.dataBaseISO, chaves + i, { comAnoCompleto: true });

  graficos.push(
    criarGraficoSaldoControle("graficoSaldo", {
      labels,
      minimo: padSerie(s.saldoMinimo, s.tamanho),
      atual: padSerie(s.saldoAtual, s.tamanho),
      indiceHoje: s.indiceHoje,
      formatadorEixoY: (v) => fmtMoedaCurta(v),
      formatadorTooltip: tooltipData,
    })
  );

  document.getElementById("hintGraficoSaldo").textContent =
    s.prazoAtual < s.prazoMinimo
      ? `A linha verde chega ao zero ${fmtPrazo(s.prazoMinimo - s.prazoAtual)} antes da vermelha.`
      : "Registre aportes para ver a linha verde se descolar da vermelha.";

  // A composição só faz sentido no trecho em que há parcela para decompor
  graficos.push(
    criarGraficoComposicao("graficoComposicao", {
      labels: labels.slice(0, s.prazoAtual),
      juros: s.juros,
      amortizacao: s.amortizacao,
      indiceHoje: s.indiceHoje !== null && s.indiceHoje < s.prazoAtual ? s.indiceHoje : null,
      formatadorEixoY: (v) => fmtMoedaCurta(v),
      formatadorTooltip: tooltipData,
    })
  );

  const primeiroJuros = s.juros[0] || 0;
  const primeiraAmort = s.amortizacao[0] || 0;
  const somaPrimeira = primeiroJuros + primeiraAmort;
  document.getElementById("hintGraficoComposicao").textContent = somaPrimeira
    ? `Na 1ª prestação, ${fmtPct(primeiroJuros / somaPrimeira, 0)} vai para juros. ` +
      `Cada aporte extra abate direto a dívida, sem passar por juros.`
    : "";
}

// ---------------------------------------------------------------- Planilha

function renderPlanilha() {
  const ac = cliente.acompanhamento;
  const planilha = planilhaCaixa(cliente);
  const t = planilha.totais;

  setTexto("planilhaSistema", cliente.aprovacao.sistema === "SAC" ? "SAC" : "Price");
  setTexto(
    "planilhaQtd",
    `${planilha.linhas.length} de ${cliente.aprovacao.prazoMeses} contratadas`
  );
  setTexto("planilhaJuros", fmtMoeda(t.juros));
  setTexto("planilhaSeguros", fmtMoeda(t.seguros));
  setTexto("planilhaDesembolso", fmtMoeda(t.desembolso));

  const tabela = document.getElementById("tabelaPlanilha");
  const corpo = tabela.querySelector("tbody");
  corpo.innerHTML = "";

  const frag = document.createDocumentFragment();
  for (const l of planilha.linhas) {
    const tr = document.createElement("tr");
    if (l.ehHoje) tr.className = "mes-atual";
    else if (l.aporte > 0) tr.className = "tem-aporte";
    if (l.pago) tr.classList.add("pago");

    const celulas = [
      { texto: String(l.n) },
      { texto: rotuloMes(ac.dataBaseISO, l.mesContrato) },
      { texto: fmtMoeda(l.prestacao) },
      { texto: fmtMoeda(l.juros) },
      { texto: fmtMoeda(l.amortizacao) },
      { texto: fmtMoeda(l.seguros) },
      { texto: l.aporte > 0 ? fmtMoeda(l.aporte) : "—", classe: l.aporte > 0 ? "aporte-feito" : "" },
      { texto: fmtMoeda(l.saldo), classe: "saldo" },
    ];
    for (const c of celulas) {
      const td = document.createElement("td");
      td.textContent = c.texto;
      if (c.classe) td.className = c.classe;
      tr.appendChild(td);
    }
    frag.appendChild(tr);
  }
  corpo.appendChild(frag);

  // Rodapé com os totais, fixo na base da área rolável
  tabela.querySelector("tfoot")?.remove();
  const tfoot = document.createElement("tfoot");
  const trTotal = document.createElement("tr");
  for (const texto of [
    "",
    "Total",
    fmtMoeda(t.prestacoes),
    fmtMoeda(t.juros),
    fmtMoeda(t.amortizacao),
    fmtMoeda(t.seguros),
    fmtMoeda(t.aportes),
    fmtMoeda(0),
  ]) {
    const td = document.createElement("td");
    td.textContent = texto;
    trTotal.appendChild(td);
  }
  tfoot.appendChild(trTotal);
  tabela.appendChild(tfoot);

  document.getElementById("notaPlanilha").textContent =
    `A amortização somada (${fmtMoeda(t.amortizacao)}) mais os aportes (${fmtMoeda(t.aportes)}) ` +
    `zeram o financiamento de ${fmtMoeda(cliente.aprovacao.valorFinanciamento)}. ` +
    `Seguros e tarifas são estimados a partir da 1ª prestação da simulação da Caixa.`;

  planilhaRenderizada = true;

  // Deixa o mês atual visível de saída, em vez de abrir na primeira parcela
  const atual = corpo.querySelector("tr.mes-atual");
  if (atual) atual.scrollIntoView({ block: "center" });
}

// ---------------------------------------------------------------- Meses

function renderMeses() {
  const ac = cliente.acompanhamento;
  const { linhas } = construirCronograma(cliente);

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
  for (const linha of doAno) container.appendChild(cartaoDoMes(linha, hojeMes));
}

function cartaoDoMes(linha, hojeMes) {
  const ac = cliente.acompanhamento;
  const card = document.createElement("div");
  card.className = "mes-card";
  if (linha.pago) card.classList.add("pago");
  else if (hojeMes > 0 && linha.mesContrato <= hojeMes) card.classList.add("atrasado");
  if (linha.mesContrato === hojeMes) card.classList.add("atual");

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
    renderTudo();
  });
  acoes.appendChild(btnPago);
  card.appendChild(acoes);

  // Valor realmente pago (o INCC é estimativa, o boleto real difere)
  if (linha.pago) {
    card.appendChild(
      campoNumerico({
        rotulo: "Valor que você pagou (opcional)",
        placeholder: fmtMoeda(linha.totalPrevisto),
        valor: linha.valorPago,
        aoConfirmar: async (v) => {
          const chave = String(linha.mesContrato);
          ac.meses[chave] = { ...(ac.meses[chave] || {}), pago: true, valorPago: v || null };
          await persistir();
          renderTudo();
        },
      })
    );
  }

  // Aporte extra só faz sentido depois das chaves, quando há saldo a amortizar
  if (linha.fase === "pos-chaves") {
    card.appendChild(
      campoNumerico({
        rotulo: linha.aportePlanejado
          ? `Aporte extra — o plano previa ${fmtMoeda(linha.aportePlanejado)}`
          : "Aporte extra neste mês",
        placeholder: "0,00",
        valor: linha.aporteRegistrado,
        aoConfirmar: async (v) => {
          const chave = String(linha.mesContrato);
          const atual = ac.meses[chave] || {};
          if (v > 0) ac.meses[chave] = { ...atual, aporte: v };
          else {
            delete atual.aporte;
            if (!atual.pago) delete ac.meses[chave];
            else ac.meses[chave] = atual;
          }
          await persistir();
          renderTudo();
        },
      })
    );
  }

  if (linha.saldoDevedor !== null) {
    const saldo = document.createElement("div");
    saldo.className = "mes-saldo";
    saldo.textContent = `Saldo devedor depois deste mês: ${fmtMoeda(linha.saldoDevedor)}`;
    card.appendChild(saldo);
  }

  return card;
}

function campoNumerico({ rotulo, placeholder, valor, aoConfirmar }) {
  const wrap = document.createElement("div");
  wrap.className = "mes-campo";
  const rot = document.createElement("label");
  rot.textContent = rotulo;
  const inp = document.createElement("input");
  inp.type = "text";
  inp.inputMode = "decimal";
  inp.placeholder = placeholder;
  inp.value = valor ? paraInput(valor) : "";
  inp.addEventListener("change", () => aoConfirmar(parseNum(inp.value)));
  wrap.appendChild(rot);
  wrap.appendChild(inp);
  return wrap;
}

iniciar();
