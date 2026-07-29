// Wrapper fino sobre o Chart.js embarcado (assets/vendor/chart.min.js, sem CDN)
// para os dois gráficos comparativos Cru vs Estratégico.

export function criarGraficoComparativo(canvasId, { labels, cru, estrategico, formatadorEixoY }) {
  return new Chart(document.getElementById(canvasId), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Cenário cru",
          data: cru,
          borderColor: "#ff8a8a",
          backgroundColor: "transparent",
          pointRadius: 0,
          borderWidth: 3,
          tension: 0.15,
        },
        {
          label: "Cenário estratégico",
          data: estrategico,
          borderColor: "#2fd680",
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
      scales: {
        x: {
          ticks: { color: "#a8b5cc", maxTicksLimit: 8 },
          grid: { color: "#233255" },
          title: { display: true, text: "Mês", color: "#a8b5cc" },
        },
        y: {
          ticks: { color: "#a8b5cc", callback: formatadorEixoY },
          grid: { color: "#233255" },
        },
      },
    },
  });
}
