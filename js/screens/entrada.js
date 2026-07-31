import { carregarClienteAtualOuVoltar, salvarESeguir } from "../state.js";
import { fmtMoeda, fmtPct, paraInput, parseNum } from "../format.js";
import { renderStepper } from "../nav.js";
import { ligarCampo, renderListaValores, proximoMes, setTexto, renderAvisos } from "../ui.js";
import { entradaNecessaria } from "../calc/caixa.js";
import {
  resumoEntrada,
  esforcoMensalMaximo,
  maiorBalao,
  avisosEntrada,
  expandirParcelas,
  valorParcelaParaFechar,
} from "../calc/entrada.js";
import { calcularJurosObra, totalJurosObra } from "../calc/evolucaoObra.js";
import { rotuloMes, mesAtualISO } from "../calc/calendario.js";

async function iniciar() {
  const cliente = await carregarClienteAtualOuVoltar();
  if (!cliente) return;

  document.getElementById("nome-cliente").textContent = cliente.nome;
  renderStepper("entrada.html", cliente.id);

  const a = cliente.aprovacao;
  const e = cliente.entrada;
  const precisa = entradaNecessaria(a);

  setTexto("cardEntradaNecessaria", fmtMoeda(precisa));
  setTexto("saidaRenda", a.rendaBruta ? fmtMoeda(a.rendaBruta) : "—");
  setTexto("saidaPrestacao", a.primeiraPrestacaoDoc ? fmtMoeda(a.primeiraPrestacaoDoc) : "—");

  // Datas do contrato: alimentam o controle mês a mês do cliente
  const ac = cliente.acompanhamento;
  const inputData = document.getElementById("dataBase");
  inputData.value = ac.dataBaseISO || mesAtualISO();
  ac.dataBaseISO = inputData.value;
  inputData.addEventListener("change", () => {
    ac.dataBaseISO = inputData.value;
    recalcular();
  });

  const inputChaves = document.getElementById("mesEntregaChaves");
  inputChaves.value = ac.mesEntregaChaves || "";
  inputChaves.addEventListener("input", () => {
    ac.mesEntregaChaves = Math.round(parseNum(inputChaves.value));
    recalcular();
  });

  ligarCampo("sinal", e, "sinal", { aoMudar: recalcular });
  ligarCampo("fgtsNaEntrada", e, "fgtsNaEntrada", { aoMudar: recalcular });
  ligarCampo("inccMensal", e, "inccMensal", { escala: 100, aoMudar: recalcular });
  ligarCampo("prazoObraMeses", e, "prazoObraMeses", { aoMudar: recalcular });
  ligarCampo("taxaMensalObra", e, "taxaMensalObra", { escala: 100, aoMudar: recalcular });

  ligarCampo("serieQtd", e.serieMensal, "quantidade", { aoMudar: recalcular });
  ligarCampo("serieInicio", e.serieMensal, "mesInicial", { aoMudar: recalcular });
  const inputValorParcela = ligarCampo("serieValor", e.serieMensal, "valor", { aoMudar: recalcular });

  document.getElementById("btn-calcular-parcela").addEventListener("click", () => {
    const valor = valorParcelaParaFechar({
      entradaNecessaria: precisa,
      sinal: e.sinal,
      fgtsNaEntrada: e.fgtsNaEntrada,
      baloes: e.baloes,
      quantidade: e.serieMensal.quantidade,
    });
    e.serieMensal.valor = valor;
    if (inputValorParcela) inputValorParcela.value = valor ? paraInput(valor) : "";
    recalcular();
  });

  function redesenharBaloes() {
    renderListaValores({
      containerId: "lista-baloes",
      itens: e.baloes,
      aoMudar: recalcular,
    });
  }

  document.getElementById("btn-add-balao").addEventListener("click", () => {
    e.baloes.push({ mes: proximoMes(e.baloes, 6), valor: 0 });
    redesenharBaloes();
    recalcular();
  });

  function recalcular() {
    const parcelas = expandirParcelas(e);

    const hint = document.getElementById("hintChaves");
    if (ac.dataBaseISO && ac.mesEntregaChaves > 0) {
      hint.textContent = `1ª parcela em ${rotuloMes(ac.dataBaseISO, 1, {
        comAnoCompleto: true,
      })}; 1ª prestação da Caixa em ${rotuloMes(ac.dataBaseISO, ac.mesEntregaChaves, {
        comAnoCompleto: true,
      })}.`;
    } else {
      hint.textContent = "Necessário para gerar o controle mês a mês do cliente.";
    }

    const resumo = resumoEntrada({
      entradaNecessaria: precisa,
      sinal: e.sinal,
      fgtsNaEntrada: e.fgtsNaEntrada,
      parcelas,
      inccMensal: e.inccMensal,
    });

    let jurosObra = 0;
    if (e.prazoObraMeses > 0 && a.valorFinanciamento > 0) {
      jurosObra = totalJurosObra(
        calcularJurosObra(a.valorFinanciamento, e.prazoObraMeses, e.taxaMensalObra || 0)
      );
    }
    setTexto("saidaJurosObra", fmtMoeda(jurosObra));

    setTexto("saidaImediatos", fmtMoeda(resumo.recursosImediatos));
    setTexto("saidaParcelasNominal", fmtMoeda(resumo.nominalParcelas));

    // Uma série de parcelas iguais nunca cai exata num alvo qualquer — sobram
    // centavos. Abaixo de R$ 1,00 a entrada está fechada para todo efeito
    // prático; mostrar "passou R$ 0,03" só levanta dúvida na frente do cliente.
    const falta = resumo.faltaFechar;
    if (Math.abs(falta) <= 1) {
      setTexto("rotuloFalta", "Situação da entrada");
      setTexto("saidaFalta", "Fechada ✓");
    } else {
      setTexto("rotuloFalta", falta > 0 ? "Falta fechar" : "Passou da entrada em");
      setTexto("saidaFalta", fmtMoeda(Math.abs(falta)));
    }

    setTexto("saidaCustoINCC", fmtMoeda(resumo.custoINCC));
    setTexto("saidaDesembolso", fmtMoeda(resumo.desembolsoTotalCorrigido + jurosObra));

    const esforco = esforcoMensalMaximo(parcelas, e.inccMensal);
    setTexto(
      "saidaEsforco",
      a.rendaBruta && esforco
        ? `${fmtMoeda(esforco)} (${fmtPct(esforco / a.rendaBruta, 0)} da renda)`
        : fmtMoeda(esforco)
    );
    setTexto("saidaBalao", fmtMoeda(maiorBalao(parcelas, e.inccMensal)));

    renderAvisos(
      "avisos-entrada",
      avisosEntrada({
        resumo,
        esforcoMensal: esforco,
        rendaBruta: a.rendaBruta,
        prestacaoPosChaves: a.primeiraPrestacaoDoc,
      })
    );
  }

  redesenharBaloes();
  recalcular();

  document.getElementById("btn-continuar").addEventListener("click", async () => {
    await salvarESeguir(cliente, "estrategia.html");
  });
}

iniciar();
