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
import {
  criarGraficoSaldoControle,
  criarGraficoComposicao,
  criarGraficoRosca,
  criarGraficoBarras,
  padSerie,
  SERIES,
} from "../charts.js";
import { simularAporte, sugestoesDeAporte, prazoParaQuitar } from "../calc/simulador.js";
import { segurosETarifasMensais, taxaMensalCaixa, primeiraParcelaBase } from "../calc/caixa.js";
import { saudeDoContrato } from "../calc/saude.js";
import { composicaoDoImovel, composicaoDoDesembolso } from "../calc/composicao.js";
import { planilhaParaCSV, baixarCSV, nomeArquivoPlanilha } from "../csv.js";

let cliente = null;
let anoVisivel = null;
let graficosLinha = [];
let graficosRosca = [];
let graficoCompara = null;
let simInicializado = false;
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
      // Chart.js mede o canvas ao criar; num painel oculto a medida sai zero,
      // então os gráficos de cada aba são criados quando ela aparece.
      if (btn.dataset.aba === "evolucao") renderGraficosEvolucao();
      if (btn.dataset.aba === "painel") renderRoscas();
      if (btn.dataset.aba === "simular") abrirSimulador();
    });
  });
}

async function persistir() {
  await salvarCliente(cliente);
}

function renderTudo() {
  renderResumo();
  renderSaude();
  renderMeses();
  // Só redesenha os gráficos da aba que está à vista; nas ocultas o canvas
  // mede zero e o Chart.js desenharia torto.
  if (abaVisivel() === "painel") renderRoscas();
  if (abaVisivel() === "evolucao") renderGraficosEvolucao();
  if (planilhaRenderizada) renderPlanilha();
}

function abaVisivel() {
  return document.querySelector(".tab.ativa")?.dataset.aba || "painel";
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
  renderHero(resumo);
  renderKpis(resumo);

  setTexto("linhaEconomiaJuros", fmtMoeda(resumo.economiaJurosAtual));
}

// O número-herói é único na tela: a data em que o cliente fica livre da dívida.
function renderHero(resumo) {
  const ac = cliente.acompanhamento;
  if (resumo.quitacaoMesContrato) {
    setTexto(
      "heroQuitacao",
      rotuloMes(ac.dataBaseISO, resumo.quitacaoMesContrato, { comAnoCompleto: true })
    );
    setTexto(
      "heroDetalhe",
      `Em ${fmtPrazo(resumo.prazoAtual)} de financiamento, no lugar dos ${fmtPrazo(
        resumo.prazoSemAportes
      )} contratados.`
    );
  } else {
    setTexto("heroQuitacao", "—");
    setTexto("heroDetalhe", "Defina a entrega das chaves para projetar a quitação.");
  }
}

function renderKpis(resumo) {
  const ac = cliente.acompanhamento;
  const prox = resumo.proximoVencimento;

  const tiles = [
    {
      label: resumo.mesesEmAtraso > 0 ? "Em aberto agora" : "Próximo vencimento",
      valor:
        resumo.mesesEmAtraso > 0
          ? fmtMoeda(resumo.valorEmAtraso)
          : prox
          ? fmtMoeda(prox.totalPrevisto)
          : "—",
    },
    {
      label: prox && resumo.mesesEmAtraso === 0 ? "Vence em" : "Compromissos vencidos",
      valor:
        resumo.mesesEmAtraso > 0
          ? `${resumo.mesesEmAtraso} ${resumo.mesesEmAtraso === 1 ? "mês" : "meses"}`
          : prox
          ? rotuloMes(ac.dataBaseISO, prox.mesContrato, { comAnoCompleto: true })
          : "—",
    },
    { label: "Tempo que você já economizou", valor: fmtPrazo(resumo.mesesEconomizados) },
    { label: "Juros que deixa de pagar", valor: fmtMoedaCurta(resumo.economiaJurosAtual) },
  ];

  const row = document.getElementById("kpiRow");
  row.innerHTML = "";
  for (const t of tiles) {
    const div = document.createElement("div");
    div.className = "kpi";
    const l = document.createElement("div");
    l.className = "kpi-label";
    l.textContent = t.label;
    const v = document.createElement("div");
    v.className = "kpi-valor";
    v.textContent = t.valor;
    div.appendChild(l);
    div.appendChild(v);
    row.appendChild(div);
  }
}

// ---------------------------------------------------------------- Saúde

const ICONE_STATUS = { bom: "✓", atencao: "!", critico: "✕", neutro: "–" };

function renderSaude() {
  const saude = saudeDoContrato(cliente);

  const card = document.getElementById("saudeCard");
  card.classList.remove("bom", "atencao", "critico", "neutro");
  card.classList.add(saude.geral);

  setTexto("saudeIcone", ICONE_STATUS[saude.geral]);
  setTexto(
    "saudeTitulo",
    saude.geral === "bom"
      ? "Contrato saudável"
      : saude.geral === "atencao"
      ? "Atenção"
      : saude.geral === "critico"
      ? "Precisa de atenção"
      : "Saúde do contrato"
  );
  setTexto("saudeMsg", saude.mensagem);

  const lista = document.getElementById("indicadores");
  lista.innerHTML = "";
  for (const ind of saude.indicadores) {
    const linha = document.createElement("div");
    linha.className = `indicador ${ind.status}`;
    linha.title = ind.detalhe;

    const icone = document.createElement("span");
    icone.className = "indicador-icone";
    icone.textContent = ICONE_STATUS[ind.status];

    const titulo = document.createElement("span");
    titulo.className = "indicador-titulo";
    titulo.textContent = ind.titulo;

    const rotulo = document.createElement("span");
    rotulo.className = "indicador-rotulo";
    rotulo.textContent = ind.rotulo;

    linha.appendChild(icone);
    linha.appendChild(titulo);
    linha.appendChild(rotulo);
    lista.appendChild(linha);
  }
}

// ---------------------------------------------------------------- Roscas

function renderRoscas() {
  graficosRosca.forEach((g) => g.destroy());
  graficosRosca = [];

  const imovel = composicaoDoImovel(cliente);
  if (imovel.total > 0) {
    graficosRosca.push(
      criarGraficoRosca("roscaImovel", {
        fatias: imovel.fatias,
        formatador: fmtMoeda,
        tituloCentro: imovel.rotuloCentro,
        valorCentro: fmtMoedaCurta(imovel.total),
      })
    );
    renderLegendaRosca("legendaImovel", imovel.fatias, imovel.total);
  }

  const desembolso = composicaoDoDesembolso(cliente);
  if (desembolso.total > 0) {
    graficosRosca.push(
      criarGraficoRosca("roscaDesembolso", {
        fatias: desembolso.fatias,
        formatador: fmtMoeda,
        tituloCentro: desembolso.rotuloCentro,
        valorCentro: fmtMoedaCurta(desembolso.total),
      })
    );
    renderLegendaRosca("legendaDesembolso", desembolso.fatias, desembolso.total);

    const reaisDeCustoPorCem = Math.round(desembolso.proporcaoCusto * 100);
    document.getElementById("hintDesembolso").textContent =
      `De cada R$ 100 que você desembolsa, R$ ${reaisDeCustoPorCem} são custo ` +
      `(juros, seguros e correção) e não viram patrimônio. ` +
      `Adiantar parcelas é o que reduz essa fatia.`;
  }
}

// A legenda em HTML garante que a identidade das fatias não dependa só da cor.
function renderLegendaRosca(containerId, fatias, total) {
  const ul = document.getElementById(containerId);
  ul.innerHTML = "";
  fatias.forEach((f, i) => {
    const li = document.createElement("li");

    const marca = document.createElement("span");
    marca.className = "marca";
    marca.style.background = SERIES[i % SERIES.length];

    const rot = document.createElement("span");
    rot.className = "rot";
    rot.textContent = f.rotulo;

    const val = document.createElement("span");
    val.className = "val";
    val.textContent = fmtMoedaCurta(f.valor);

    const pct = document.createElement("span");
    pct.className = "pct";
    pct.textContent = fmtPct(total ? f.valor / total : 0, 0);

    li.appendChild(marca);
    li.appendChild(rot);
    li.appendChild(val);
    li.appendChild(pct);
    ul.appendChild(li);
  });
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

function renderGraficosEvolucao() {
  graficosLinha.forEach((g) => g.destroy());
  graficosLinha = [];

  const ac = cliente.acompanhamento;
  const s = seriesControle(cliente);
  if (!s.tamanho) return;

  const chaves = ac.mesEntregaChaves;
  // Eixo em datas reais: o cliente pensa em "mar/2032", não em "mês 68"
  const labels = Array.from({ length: s.tamanho }, (_, i) =>
    rotuloMes(ac.dataBaseISO, chaves + i)
  );
  const tooltipData = (i) => rotuloMes(ac.dataBaseISO, chaves + i, { comAnoCompleto: true });

  graficosLinha.push(
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
  graficosLinha.push(
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

// ---------------------------------------------------------------- Simular

// Situação do financiamento no mês corrente, que é a base de toda simulação.
function situacaoAtual() {
  const a = cliente.aprovacao;
  const ac = cliente.acompanhamento;
  const chaves = ac.mesEntregaChaves || 0;
  const taxaMensal = taxaMensalCaixa(a.jurosNominalAnual, a.trAnual);
  const segurosMensais = segurosETarifasMensais({
    primeiraPrestacaoDoc: a.primeiraPrestacaoDoc,
    valorFinanciamento: a.valorFinanciamento,
    prazoMeses: a.prazoMeses,
    taxaMensal,
    sistema: a.sistema,
  });
  const parcelaBase = primeiraParcelaBase({
    valorFinanciamento: a.valorFinanciamento,
    prazoMeses: a.prazoMeses,
    taxaMensal,
    sistema: a.sistema,
  });

  const { linhas } = planilhaCaixa(cliente);
  const mesHoje = mesContratoHoje(ac.dataBaseISO);

  // Antes das chaves ainda não há saldo a amortizar: usa o financiamento cheio,
  // para o cliente poder simular desde já.
  let saldoAtual = a.valorFinanciamento;
  if (chaves && mesHoje >= chaves) {
    const linha = linhas[mesHoje - chaves];
    if (linha) saldoAtual = linha.saldo;
  }

  // O prazo de partida é DERIVADO do saldo com a parcela contratual, e não
  // contado na planilha. A planilha já embute os aportes projetados (FGTS, 13º),
  // então o prazo dela é o do plano, não o do contrato — misturar os dois fazia
  // a simulação comparar cenários diferentes e chegar a "economia negativa".
  const prazoDerivado = prazoParaQuitar({ saldo: saldoAtual, taxaMensal, parcela: parcelaBase });
  const prazoRestante = Number.isFinite(prazoDerivado)
    ? Math.max(1, Math.ceil(prazoDerivado))
    : a.prazoMeses;

  return { taxaMensal, segurosMensais, parcelaBase, saldoAtual, prazoRestante, mesHoje, chaves };
}

function abrirSimulador() {
  const sit = situacaoAtual();
  setTexto("simSaldoHoje", fmtMoeda(sit.saldoAtual));
  setTexto("simPrazoHoje", `${sit.prazoRestante} (${fmtPrazo(sit.prazoRestante)})`);

  if (simInicializado) {
    recalcularSimulacao();
    return;
  }
  simInicializado = true;

  const inputValor = document.getElementById("simValor");
  const inputDias = document.getElementById("simDias");
  inputValor.addEventListener("input", recalcularSimulacao);
  inputDias.addEventListener("input", recalcularSimulacao);

  // Atalhos para o cliente explorar sem digitar
  const atalhos = document.getElementById("atalhosAporte");
  atalhos.innerHTML = "";
  const prestacao = sit.parcelaBase + sit.segurosMensais;
  for (const s of sugestoesDeAporte({ prestacao, saldoAtual: sit.saldoAtual })) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = s.rotulo;
    b.title = fmtMoeda(s.valor);
    b.addEventListener("click", () => {
      inputValor.value = paraInput(s.valor);
      recalcularSimulacao();
    });
    atalhos.appendChild(b);
  }

  document.getElementById("btn-registrar-aporte").addEventListener("click", registrarAporteSimulado);
  recalcularSimulacao();
}

function recalcularSimulacao() {
  const sit = situacaoAtual();
  const aporte = parseNum(document.getElementById("simValor").value);
  const dias = Math.round(parseNum(document.getElementById("simDias").value));
  const painel = document.getElementById("simResultado");

  if (!aporte || aporte <= 0 || !sit.saldoAtual) {
    painel.style.display = "none";
    return;
  }
  painel.style.display = "block";

  const s = simularAporte({
    saldoAtual: sit.saldoAtual,
    prazoRestanteMeses: sit.prazoRestante,
    taxaMensal: sit.taxaMensal,
    parcelaBase: sit.parcelaBase,
    segurosMensais: sit.segurosMensais,
    aporte,
    dias,
  });

  setTexto("simBruto", fmtMoeda(s.reparticao.bruto));
  setTexto("simJurosDiarios", fmtMoeda(s.reparticao.jurosDiarios));
  setTexto("simAmortEfetiva", fmtMoeda(s.reparticao.amortizacaoEfetiva));

  setTexto(
    "prazoNovoPrazo",
    Number.isFinite(s.prazo.prazoMeses)
      ? `${s.prazo.prazoMeses} (${fmtPrazo(s.prazo.prazoMeses)})`
      : "—"
  );
  setTexto("prazoPrestacao", `${fmtMoeda(s.prazo.prestacao)} (não muda)`);
  setTexto("prazoEconomia", fmtMoeda(s.prazo.jurosEconomizados));

  setTexto("prestacaoNovoPrazo", `${s.prestacao.prazoMeses} (não muda)`);
  setTexto(
    "prestacaoNova",
    s.prestacao.alivioMensal > 0
      ? `${fmtMoeda(s.prestacao.prestacao)} (−${fmtMoeda(s.prestacao.alivioMensal)}/mês)`
      : fmtMoeda(s.prestacao.prestacao)
  );
  setTexto("prestacaoEconomia", fmtMoeda(s.prestacao.jurosEconomizados));

  // Barra horizontal: comparar comprimento é mais fácil que comparar ângulo
  if (graficoCompara) graficoCompara.destroy();
  graficoCompara = criarGraficoBarras("graficoComparaModos", {
    rotulos: ["Reduzir prazo", "Reduzir prestação"],
    valores: [s.prazo.jurosEconomizados, s.prestacao.jurosEconomizados],
    cores: [SERIES[2], SERIES[0]],
    formatador: (v) => fmtMoedaCurta(v),
  });

  const vezes =
    s.prestacao.jurosEconomizados > 0
      ? s.prazo.jurosEconomizados / s.prestacao.jurosEconomizados
      : 0;
  document.getElementById("hintCompara").textContent = vezes > 1
    ? `Reduzindo o prazo você economiza ${vezes.toFixed(1).replace(".", ",")}x mais juros, ` +
      `e ainda fica livre da dívida ${fmtPrazo(s.prazo.mesesEconomizados)} antes.`
    : "";

  const mesAlvo = sit.chaves && sit.mesHoje >= sit.chaves ? sit.mesHoje : sit.chaves;
  document.getElementById("hintRegistrar").textContent = mesAlvo
    ? `Vai lançar ${fmtMoeda(aporte)} em ${rotuloMes(cliente.acompanhamento.dataBaseISO, mesAlvo, {
        comAnoCompleto: true,
      })}. Você pode ajustar depois na aba Meses.`
    : "";
}

async function registrarAporteSimulado() {
  const sit = situacaoAtual();
  const aporte = parseNum(document.getElementById("simValor").value);
  if (!aporte || aporte <= 0) return;

  // Lança no mês corrente; antes das chaves, no primeiro mês de amortização
  const mesAlvo = sit.chaves && sit.mesHoje >= sit.chaves ? sit.mesHoje : sit.chaves;
  if (!mesAlvo) return;

  const chave = String(mesAlvo);
  const atual = cliente.acompanhamento.meses[chave] || {};
  cliente.acompanhamento.meses[chave] = { ...atual, aporte: (atual.aporte || 0) + aporte };
  await persistir();

  const btn = document.getElementById("btn-registrar-aporte");
  btn.textContent = "✓ Aporte registrado";
  setTimeout(() => (btn.textContent = "Registrar este aporte no meu controle"), 2500);

  renderTudo();
  abrirSimulador();
}
