// Wrapper fino sobre o Chart.js embarcado (assets/vendor/chart.min.js, sem CDN).

const CINZA = "#a8b5cc";
const GRADE = "#233255";
const VERMELHO = "#ff8a8a";
const VERDE = "#2fd680";
const AZUL = "#3ba0ff";

// Superfície sobre a qual os gráficos são desenhados. Usada como cor do vão
// entre as fatias da rosca, para as fatias não se tocarem.
const SUPERFICIE = "#1c2b4a";

// Paleta categórica em ordem fixa, nunca ciclada. Validada contra a superfície
// acima: pior par adjacente ΔE 8,4 sob daltonismo e 19,8 em visão normal.
// Trocar a ordem exige revalidar — vermelho ao lado de amarelo, por exemplo,
// cai para ΔE 13 e fica indistinguível até com visão plena.
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500"];

// Preenche uma série curta até o tamanho do gráfico repetindo o último valor.
// Usado quando o cenário estratégico quita antes e a linha precisa continuar
// no zero até o fim do eixo.
export function padSerie(arr, tamanho) {
  if (arr.length >= tamanho) return arr.slice(0, tamanho);
  const ultimo = arr.length ? arr[arr.length - 1] : 0;
  return arr.concat(Array(tamanho - arr.length).fill(ultimo));
}

// Marca visualmente onde o cliente está hoje. Feito como plugin do próprio
// Chart.js para não precisar do pacote de anotações (o app não usa CDN).
function pluginMarcadorHoje(indice, rotulo = "hoje") {
  return {
    id: "marcadorHoje",
    afterDatasetsDraw(chart) {
      if (indice === null || indice === undefined) return;
      const x = chart.scales.x?.getPixelForValue(indice);
      const area = chart.chartArea;
      if (x === undefined || Number.isNaN(x) || !area) return;

      const ctx = chart.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = AZUL;
      ctx.moveTo(x, area.top);
      ctx.lineTo(x, area.bottom);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = AZUL;
      ctx.font = "600 11px -apple-system, system-ui, sans-serif";
      ctx.textAlign = x > area.right - 40 ? "right" : "left";
      ctx.fillText(rotulo, x > area.right - 40 ? x - 4 : x + 4, area.top + 12);
      ctx.restore();
    },
  };
}

function eixos({ formatadorEixoY, tituloX = "Mês" }) {
  return {
    x: {
      ticks: { color: CINZA, maxTicksLimit: 8, autoSkip: true },
      grid: { color: GRADE },
      title: { display: true, text: tituloX, color: CINZA },
    },
    y: {
      ticks: { color: CINZA, callback: formatadorEixoY },
      grid: { color: GRADE },
      beginAtZero: true,
    },
  };
}

export function criarGraficoComparativo(canvasId, { labels, cru, estrategico, formatadorEixoY }) {
  return new Chart(document.getElementById(canvasId), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Cenário cru",
          data: cru,
          borderColor: VERMELHO,
          backgroundColor: "transparent",
          pointRadius: 0,
          borderWidth: 3,
          tension: 0.15,
        },
        {
          label: "Cenário estratégico",
          data: estrategico,
          borderColor: VERDE,
          backgroundColor: "transparent",
          pointRadius: 0,
          borderWidth: 3,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false } },
      scales: eixos({ formatadorEixoY }),
    },
  });
}

/**
 * Saldo devedor no controle do cliente: o que aconteceria pagando só a
 * prestação mínima, contra o ritmo real dele, com o mês corrente marcado.
 */
export function criarGraficoSaldoControle(canvasId, { labels, minimo, atual, indiceHoje, formatadorEixoY, formatadorTooltip }) {
  return new Chart(document.getElementById(canvasId), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Só a prestação mínima",
          data: minimo,
          borderColor: VERMELHO,
          backgroundColor: "transparent",
          pointRadius: 0,
          borderWidth: 2,
          borderDash: [6, 4],
          tension: 0.15,
        },
        {
          label: "No seu ritmo",
          data: atual,
          borderColor: VERDE,
          backgroundColor: "rgba(47, 214, 128, 0.12)",
          fill: true,
          pointRadius: 0,
          borderWidth: 3,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (itens) => (formatadorTooltip ? formatadorTooltip(itens[0].dataIndex) : itens[0].label),
            label: (item) => `${item.dataset.label}: ${formatadorEixoY(item.parsed.y)}`,
          },
        },
      },
      scales: eixos({ formatadorEixoY }),
    },
    plugins: [pluginMarcadorHoje(indiceHoje)],
  });
}

/**
 * Composição da prestação ao longo do tempo: quanto de cada parcela é juros e
 * quanto abate a dívida. É o gráfico que faz o cliente entender por que
 * antecipar parcela compensa — no começo quase tudo é juros.
 */
export function criarGraficoComposicao(canvasId, { labels, juros, amortizacao, indiceHoje, formatadorEixoY, formatadorTooltip }) {
  return new Chart(document.getElementById(canvasId), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Juros",
          data: juros,
          borderColor: VERMELHO,
          backgroundColor: "rgba(255, 138, 138, 0.55)",
          // A camada de baixo preenche até o eixo...
          fill: "origin",
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.15,
        },
        {
          label: "Amortização (abate a dívida)",
          data: amortizacao,
          borderColor: VERDE,
          backgroundColor: "rgba(47, 214, 128, 0.55)",
          // ...e a de cima até a camada anterior, senão as duas pintam sobre
          // o eixo e a sobreposição das transparências vira cinza.
          fill: "-1",
          pointRadius: 0,
          borderWidth: 2,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (itens) => (formatadorTooltip ? formatadorTooltip(itens[0].dataIndex) : itens[0].label),
            label: (item) => `${item.dataset.label}: ${formatadorEixoY(item.parsed.y)}`,
          },
        },
      },
      scales: {
        ...eixos({ formatadorEixoY }),
        y: { ...eixos({ formatadorEixoY }).y, stacked: true },
      },
    },
    plugins: [pluginMarcadorHoje(indiceHoje)],
  });
}

// Escreve o total no miolo da rosca. É o número que o leigo lê primeiro, então
// vive no centro em vez de virar mais uma linha de legenda.
function pluginCentroRosca({ titulo, valor }) {
  return {
    id: "centroRosca",
    afterDraw(chart) {
      const area = chart.chartArea;
      if (!area) return;
      const cx = (area.left + area.right) / 2;
      const cy = (area.top + area.bottom) / 2;
      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = "center";

      ctx.fillStyle = "#f1f5f9";
      // Figuras proporcionais: em tamanho grande, tabular-nums deixa o número solto
      ctx.font = "800 20px -apple-system, system-ui, sans-serif";
      ctx.fillText(valor, cx, cy + 2);

      ctx.fillStyle = CINZA;
      ctx.font = "500 11px -apple-system, system-ui, sans-serif";
      ctx.fillText(titulo, cx, cy + 20);
      ctx.restore();
    },
  };
}

/**
 * Rosca de parte-do-todo. Serve para uma composição vista de relance com até
 * 6 fatias — não para comparar valores parecidos, onde barra ou número ganham.
 *
 * A identidade das fatias nunca depende só da cor: quem chama renderiza a
 * legenda em HTML com o rótulo e o percentual ao lado de cada cor.
 */
export function criarGraficoRosca(canvasId, { fatias, formatador, tituloCentro, valorCentro }) {
  const total = fatias.reduce((acc, f) => acc + f.valor, 0) || 1;

  return new Chart(document.getElementById(canvasId), {
    type: "doughnut",
    data: {
      labels: fatias.map((f) => f.rotulo),
      datasets: [
        {
          data: fatias.map((f) => f.valor),
          backgroundColor: fatias.map((_, i) => SERIES[i % SERIES.length]),
          // Vão de 2px na cor da superfície, para as fatias não encostarem
          borderColor: SUPERFICIE,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => {
              const v = item.parsed;
              return `${item.label}: ${formatador(v)} (${((v / total) * 100).toFixed(1).replace(".", ",")}%)`;
            },
          },
        },
      },
    },
    plugins: [pluginCentroRosca({ titulo: tituloCentro, valor: valorCentro })],
  });
}

/**
 * Barras horizontais comparando poucas opções. Para "qual caminho economiza
 * mais" a barra ganha da rosca: o leitor compara comprimento, que é o que o
 * olho faz melhor, em vez de estimar ângulo.
 */
export function criarGraficoBarras(canvasId, { rotulos, valores, cores, formatador }) {
  return new Chart(document.getElementById(canvasId), {
    type: "bar",
    data: {
      labels: rotulos,
      datasets: [
        {
          data: valores,
          backgroundColor: cores || valores.map((_, i) => SERIES[i % SERIES.length]),
          borderColor: SUPERFICIE,
          borderWidth: 2,
          borderRadius: 4,
          barPercentage: 0.62,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => formatador(item.parsed.x) } },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: CINZA, callback: formatador, maxTicksLimit: 4 },
          grid: { color: GRADE },
        },
        y: { ticks: { color: "#f1f5f9", font: { weight: "700" } }, grid: { display: false } },
      },
    },
  });
}

/**
 * Barras empilhadas por ano: juros embaixo, abatimento de dívida em cima.
 * Mostra a virada do financiamento sem o cliente precisar ler tabela.
 */
export function criarGraficoAnosEmpilhado(canvasId, { rotulos, juros, amortizacao, formatador }) {
  return new Chart(document.getElementById(canvasId), {
    type: "bar",
    data: {
      labels: rotulos,
      datasets: [
        { label: "Juros", data: juros, backgroundColor: VERMELHO, borderColor: SUPERFICIE, borderWidth: 1 },
        {
          label: "Abateu a dívida",
          data: amortizacao,
          backgroundColor: VERDE,
          borderColor: SUPERFICIE,
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (item) => `${item.dataset.label}: ${formatador(item.parsed.y)}` },
        },
      },
      scales: {
        x: { stacked: true, ticks: { color: CINZA, maxTicksLimit: 8 }, grid: { display: false } },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: CINZA, callback: formatador, maxTicksLimit: 5 },
          grid: { color: GRADE },
        },
      },
    },
  });
}
