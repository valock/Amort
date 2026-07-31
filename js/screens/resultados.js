import { carregarClienteAtualOuVoltar, linkComCliente } from "../state.js";
import { fmtMoeda, fmtPct, fmtPrazo } from "../format.js";
import { renderStepper } from "../nav.js";
import { setTexto } from "../ui.js";
import { entradaNecessaria, taxaEfetivaAnual } from "../calc/caixa.js";
import { resumoEntrada, expandirParcelas } from "../calc/entrada.js";
import { calcularJurosObra, totalJurosObra } from "../calc/evolucaoObra.js";
import { calcularCenarios } from "../calc/cenarios.js";
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
  renderStepper("resultados.html", cliente.id);
  document.getElementById("btn-editar").addEventListener("click", () => {
    window.location.href = linkComCliente("estrategia.html", cliente.id);
  });

  const a = cliente.aprovacao;
  const e = cliente.entrada;

  // 1. O que a Caixa aprovou
  const c = calcularCenarios(cliente);
  setTexto("linhaImovel", fmtMoeda(a.valorImovel));
  setTexto("linhaFinanciado", fmtMoeda(a.valorFinanciamento));
  setTexto("linhaSubsidio", fmtMoeda(a.valorSubsidio));
  setTexto("linhaPrazoSistema", a.prazoMeses ? `${a.prazoMeses} meses · ${a.sistema}` : "—");
  setTexto("linhaTaxa", c.taxaMensal ? `${fmtPct(taxaEfetivaAnual(c.taxaMensal), 4)} a.a.` : "—");
  setTexto("linhaPrestacao", a.primeiraPrestacaoDoc ? fmtMoeda(a.primeiraPrestacaoDoc) : "—");

  // 2. Até as chaves
  const precisa = entradaNecessaria(a);
  const resumo = resumoEntrada({
    entradaNecessaria: precisa,
    sinal: e.sinal,
    fgtsNaEntrada: e.fgtsNaEntrada,
    parcelas: expandirParcelas(e),
    inccMensal: e.inccMensal,
  });

  let jurosObra = 0;
  if (e.prazoObraMeses > 0 && a.valorFinanciamento > 0) {
    jurosObra = totalJurosObra(calcularJurosObra(a.valorFinanciamento, e.prazoObraMeses, e.taxaMensalObra || 0));
  }

  setTexto("linhaImediatos", fmtMoeda(resumo.recursosImediatos));
  setTexto("linhaParcelasNominal", fmtMoeda(resumo.nominalParcelas));
  setTexto("linhaINCC", fmtMoeda(resumo.custoINCC));
  setTexto("linhaJurosObra", fmtMoeda(jurosObra));
  setTexto("linhaTotalObra", fmtMoeda(resumo.desembolsoTotalCorrigido + jurosObra));

  const hintEntrada = document.getElementById("hintEntrada");
  if (Math.abs(resumo.faltaFechar) > 1) {
    hintEntrada.textContent =
      resumo.faltaFechar > 0
        ? `Atenção: ainda faltam ${fmtMoeda(resumo.faltaFechar)} para fechar a entrada de ${fmtMoeda(precisa)}.`
        : `O parcelamento montado passou ${fmtMoeda(-resumo.faltaFechar)} da entrada de ${fmtMoeda(precisa)}.`;
  } else {
    hintEntrada.textContent = `Entrada de ${fmtMoeda(precisa)} fechada.`;
  }

  // 3. A mágica da quitação
  setTexto("cardEconomia", fmtMoeda(c.economiaJuros));
  setTexto("cardTempo", fmtPrazo(c.mesesEvitados));
  setTexto("linhaJurosCru", fmtMoeda(c.jurosCru));
  setTexto("linhaJurosEstrategico", fmtMoeda(c.jurosEstrategico));
  setTexto("linhaSegurosEvitados", fmtMoeda(c.segurosEvitados));
  setTexto("linhaTotalAportes", fmtMoeda(c.totalAportes));
  setTexto("linhaEconomiaTotal", fmtMoeda(c.economiaTotal));

  document.getElementById("hintEconomia").textContent = c.jurosCru
    ? `Corta ${fmtPct(c.economiaJuros / c.jurosCru, 0)} dos juros que seriam pagos.`
    : "";
  document.getElementById("hintTempo").textContent =
    c.prazoCru && c.prazoEstrategico
      ? `Quita em ${fmtPrazo(c.prazoEstrategico)} no lugar de ${fmtPrazo(c.prazoCru)}.`
      : "";

  // Gráficos
  const tamanho = Math.max(c.cru.length, c.estrategico.length);
  if (tamanho > 0) {
    const labels = Array.from({ length: tamanho }, (_, i) => i + 1);

    criarGraficoComparativo("graficoSaldo", {
      labels,
      cru: padSerie(c.cru.map((m) => m.saldoDevedor), tamanho),
      estrategico: padSerie(c.estrategico.map((m) => m.saldoDevedor), tamanho),
      formatadorEixoY: (v) => fmtMoeda(v),
    });

    criarGraficoComparativo("graficoJuros", {
      labels,
      cru: padSerie(jurosAcumuladoSerie(c.cru), tamanho),
      estrategico: padSerie(jurosAcumuladoSerie(c.estrategico), tamanho),
      formatadorEixoY: (v) => fmtMoeda(v),
    });
  }
}

iniciar();
