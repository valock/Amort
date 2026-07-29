import { carregarClienteAtualOuVoltar, linkComCliente } from "../state.js";
import { fmtMoeda, fmtPrazo } from "../format.js";
import { totalCorrigido } from "../calc/incc.js";
import { calcularJurosObra, totalJurosObra } from "../calc/evolucaoObra.js";
import { simular, aportesPorMes, totalJuros, prazoEfetivoMeses } from "../calc/amortizacao.js";
import { gerarAportesFGTS, gerarAportes13, combinarAportes } from "../calc/fgts.js";
import { criarGraficoComparativo } from "../charts.js";

function jurosAcumuladoSerie(meses) {
  let acc = 0;
  return meses.map((m) => {
    acc += m.juros;
    return acc;
  });
}

function padSerie(arr, tamanho) {
  if (arr.length >= tamanho) return arr.slice(0, tamanho);
  const ultimo = arr.length ? arr[arr.length - 1] : 0;
  return arr.concat(Array(tamanho - arr.length).fill(ultimo));
}

async function iniciar() {
  const cliente = await carregarClienteAtualOuVoltar();
  if (!cliente) return;

  document.getElementById("nome-cliente").textContent = cliente.nome;
  document.getElementById("link-fechamento").href = linkComCliente("index.html", cliente.id);
  document.getElementById("link-estrategia").href = linkComCliente("estrategia.html", cliente.id);
  document.getElementById("btn-editar").addEventListener("click", () => {
    window.location.href = linkComCliente("estrategia.html", cliente.id);
  });

  const f = cliente.fechamento;
  const e = cliente.estrategia;

  // Resumo da obra
  const totalParcelasCorrigidas = totalCorrigido(f.parcelasEntrada, f.inccMensal || 0);
  let totalJurosDeObra = 0;
  if (f.valorFinanciadoObra > 0 && f.prazoObraMeses > 0) {
    totalJurosDeObra = totalJurosObra(calcularJurosObra(f.valorFinanciadoObra, f.prazoObraMeses, f.taxaMensalObra || 0));
  }
  const totalObra = (f.sinal || 0) + totalParcelasCorrigidas + totalJurosDeObra;

  document.getElementById("linhaSinal").textContent = fmtMoeda(f.sinal);
  document.getElementById("linhaParcelas").textContent = fmtMoeda(totalParcelasCorrigidas);
  document.getElementById("linhaJurosObra").textContent = fmtMoeda(totalJurosDeObra);
  document.getElementById("linhaTotalObra").textContent = fmtMoeda(totalObra);

  // Cenários de financiamento pós-chaves
  const valorFinanciado = f.valorFinanciadoObra || 0;

  const aportesEstrategicos = combinarAportes(
    e.usarFGTS
      ? gerarAportesFGTS({ salarioBruto: e.salarioBruto, prazoMeses: e.prazoMeses, intervaloSaqueMeses: e.intervaloSaqueFGTSMeses || 24 })
      : [],
    e.usar13 ? gerarAportes13(e.valor13, e.prazoMeses) : [],
    e.aportesAvulsos
  );

  const parametrosBase = { valorFinanciado, prazoMeses: e.prazoMeses, taxaAnual: e.taxaAnual, sistema: e.sistema };
  const mesesCru = simular({ ...parametrosBase, aportesExtras: new Map() });
  const mesesEstrategico = simular({ ...parametrosBase, aportesExtras: aportesPorMes(aportesEstrategicos) });

  const jurosCru = totalJuros(mesesCru);
  const jurosEstrategico = totalJuros(mesesEstrategico);
  const economia = jurosCru - jurosEstrategico;
  const tempoPoupadoMeses = prazoEfetivoMeses(mesesCru) - prazoEfetivoMeses(mesesEstrategico);

  document.getElementById("cardEconomia").textContent = fmtMoeda(economia);
  document.getElementById("cardTempo").textContent = fmtPrazo(tempoPoupadoMeses);

  const tamanho = Math.max(mesesCru.length, mesesEstrategico.length);
  const labels = Array.from({ length: tamanho }, (_, i) => i + 1);

  criarGraficoComparativo("graficoSaldo", {
    labels,
    cru: padSerie(mesesCru.map((m) => m.saldoDevedor), tamanho),
    estrategico: padSerie(mesesEstrategico.map((m) => m.saldoDevedor), tamanho),
    formatadorEixoY: (v) => fmtMoeda(v),
  });

  criarGraficoComparativo("graficoJuros", {
    labels,
    cru: padSerie(jurosAcumuladoSerie(mesesCru), tamanho),
    estrategico: padSerie(jurosAcumuladoSerie(mesesEstrategico), tamanho),
    formatadorEixoY: (v) => fmtMoeda(v),
  });
}

iniciar();
