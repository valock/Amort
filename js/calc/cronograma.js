// Cronograma mês a mês do cliente: o que vence em cada mês, o que ele já
// registrou como pago, e como o saldo devedor reage à realidade.
//
// Duas fases se encadeiam pela entrega das chaves:
//   1. antes das chaves  -> parcelas da construtora (corrigidas pelo INCC)
//                           e, se houver obra, os juros de obra do mês
//   2. depois das chaves -> a prestação da Caixa, mais os aportes do cliente
//
// `mesEntregaChaves` é o mês do contrato em que vence a PRIMEIRA prestação da
// Caixa. Sem esse elo, as duas frentes da compra ficam soltas e o cliente não
// consegue enxergar o compromisso real de cada mês.

import { corrigirParcelas } from "./incc.js";
import { expandirParcelas } from "./entrada.js";
import { calcularJurosObra } from "./evolucaoObra.js";
import { taxaMensalCaixa, segurosETarifasMensais, primeiraParcelaBase } from "./caixa.js";
import { simular, aportesPorMes, prazoEfetivoMeses, totalJuros } from "./amortizacao.js";
import { montarAportes } from "./cenarios.js";
import { mesContratoHoje } from "./calendario.js";

export function registroDoMes(cliente, mesContrato) {
  return cliente.acompanhamento?.meses?.[String(mesContrato)] || null;
}

// Aportes que o cliente REALMENTE registrou, na linha do tempo da amortização.
export function aportesReais(cliente) {
  const ac = cliente.acompanhamento || {};
  const chaves = ac.mesEntregaChaves || 0;
  const saida = [];
  if (!chaves) return saida;

  for (const [mesStr, reg] of Object.entries(ac.meses || {})) {
    const mesContrato = Number(mesStr);
    if (!reg?.aporte || mesContrato < chaves) continue;
    saida.push({
      mes: mesContrato - chaves + 1,
      valor: reg.aporte,
      origem: "aporte registrado",
    });
  }
  return saida;
}

// Aportes projetados vêm de calc/cenarios.js, que é a fonte única — assim o
// controle mês a mês e a tela de Resultado nunca divergem.
export { montarAportes as aportesProjetados } from "./cenarios.js";

/**
 * Trajetória que combina o que o cliente realmente fez com o que ainda é
 * projeção. É o que responde "com o que eu já fiz, quando eu quito?".
 *
 * Regras da combinação, nesta ordem:
 *  1. Todo aporte REGISTRADO pelo cliente conta, sempre. Ele registrou porque
 *     aconteceu — não importa onde está o mês de corte.
 *  2. Um aporte projetado é ignorado se o cliente já registrou algo naquele
 *     mês, senão o mesmo dinheiro entraria duas vezes.
 *  3. Aporte projetado em mês que já passou e que o cliente não registrou é
 *     descartado: ele não cumpriu o plano, e o controle tem de mostrar isso
 *     empurrando a quitação para frente em vez de fingir que foi feito.
 */
export function simularComRealidade(cliente, { mesContratoCorte } = {}) {
  const a = cliente.aprovacao;
  const chaves = cliente.acompanhamento?.mesEntregaChaves || 0;
  const taxaMensal = taxaMensalCaixa(a.jurosNominalAnual, a.trAnual);

  // Mês da amortização já vencido. Zero quando o contrato ainda não começou
  // ou as datas não foram definidas — aí nada foi cobrado ainda e o plano
  // inteiro segue valendo como projeção.
  const corteAmort =
    chaves && mesContratoCorte > 0 ? Math.max(0, mesContratoCorte - chaves + 1) : 0;

  const reais = aportesReais(cliente);
  const mesesComRegistro = new Set(reais.map((x) => x.mes));
  const projetados = montarAportes(cliente).filter(
    (x) => !mesesComRegistro.has(x.mes) && x.mes > corteAmort
  );
  const combinados = [...reais, ...projetados];

  return {
    taxaMensal,
    corteAmort,
    meses: simular({
      valorFinanciado: a.valorFinanciamento,
      prazoMeses: a.prazoMeses,
      taxaMensal,
      sistema: a.sistema,
      aportesExtras: aportesPorMes(combinados),
    }),
    aportesUsados: combinados,
  };
}

/**
 * Monta a lista de compromissos mês a mês do contrato.
 * Cada linha traz o que vence, quanto, e o registro do cliente para aquele mês.
 */
export function construirCronograma(cliente) {
  const a = cliente.aprovacao;
  const e = cliente.entrada;
  const ac = cliente.acompanhamento || {};
  const chaves = ac.mesEntregaChaves || 0;

  // Fase 1: parcelas da construtora já corrigidas pelo INCC
  const parcelasCorrigidas = corrigirParcelas(expandirParcelas(e), e.inccMensal || 0);

  // Fase 1: juros de obra, quando o imóvel está em construção
  const mesesObra =
    e.prazoObraMeses > 0 && a.valorFinanciamento > 0
      ? calcularJurosObra(a.valorFinanciamento, e.prazoObraMeses, e.taxaMensalObra || 0)
      : [];

  // Fase 2: a prestação da Caixa (encargo total, com seguros e tarifa)
  const taxaMensal = taxaMensalCaixa(a.jurosNominalAnual, a.trAnual);
  const seguros = segurosETarifasMensais({
    primeiraPrestacaoDoc: a.primeiraPrestacaoDoc,
    valorFinanciamento: a.valorFinanciamento,
    prazoMeses: a.prazoMeses,
    taxaMensal,
    sistema: a.sistema,
  });

  const { meses: trajetoria } = simularComRealidade(cliente, {
    mesContratoCorte: chaves ? mesContratoHoje(ac.dataBaseISO) : 0,
  });

  // O que o PLANO previa para cada mês, separado do que a simulação aplicou.
  // A trajetória já embute os aportes registrados pelo cliente; se usássemos
  // ela para rotular "planejado", o app devolveria ao cliente o próprio
  // número que ele digitou como se fosse previsão.
  const planoPorMesAmort = aportesPorMes(montarAportes(cliente));

  const ultimoMesConstrutora = parcelasCorrigidas.length
    ? Math.max(...parcelasCorrigidas.map((p) => p.mes))
    : 0;
  const ultimoMesObra = mesesObra.length ? mesesObra.length : 0;
  const ultimoMesCaixa = chaves ? chaves + trajetoria.length - 1 : 0;
  const totalMeses = Math.max(ultimoMesConstrutora, ultimoMesObra, ultimoMesCaixa, 1);

  const linhas = [];
  for (let m = 1; m <= totalMeses; m++) {
    const compromissos = [];

    for (const p of parcelasCorrigidas.filter((x) => x.mes === m)) {
      compromissos.push({
        tipo: "construtora",
        descricao: p.tipo === "balao" ? "Balão — construtora" : "Parcela — construtora",
        valor: p.valorCorrigido,
      });
    }

    const obra = mesesObra.find((x) => x.mes === m);
    if (obra && obra.jurosMes > 0) {
      compromissos.push({ tipo: "obra", descricao: "Juros de obra", valor: obra.jurosMes });
    }

    let linhaCaixa = null;
    if (chaves && m >= chaves) {
      const idx = m - chaves;
      linhaCaixa = trajetoria[idx] || null;
      if (linhaCaixa) {
        compromissos.push({
          tipo: "caixa",
          descricao: "Prestação — Caixa",
          valor: linhaCaixa.parcela + seguros,
        });
      }
    }

    if (compromissos.length === 0) continue;

    const registro = registroDoMes(cliente, m);
    const totalPrevisto = compromissos.reduce((acc, c) => acc + c.valor, 0);

    linhas.push({
      mesContrato: m,
      fase: chaves && m >= chaves ? "pos-chaves" : "pre-chaves",
      compromissos,
      totalPrevisto,
      saldoDevedor: linhaCaixa ? linhaCaixa.saldoDevedor : null,
      aportePlanejado: chaves && m >= chaves ? planoPorMesAmort.get(m - chaves + 1) || 0 : 0,
      aporteAplicado: linhaCaixa ? linhaCaixa.aporteExtra : 0,
      pago: !!registro?.pago,
      valorPago: registro?.valorPago ?? null,
      aporteRegistrado: registro?.aporte ?? 0,
    });
  }

  return { linhas, totalMeses, segurosMensais: seguros };
}

/**
 * Números do painel do cliente: onde ele está, o que já pagou, o que está
 * atrasado e quando a quitação está prevista com o comportamento atual.
 */
export function resumoControle(cliente, hoje = new Date()) {
  const ac = cliente.acompanhamento || {};
  const { linhas } = construirCronograma(cliente);
  const mesHoje = ac.dataBaseISO ? mesContratoHoje(ac.dataBaseISO, hoje) : 0;

  let totalPrevistoAteHoje = 0;
  let totalPagoRegistrado = 0;
  let mesesEmAtraso = 0;
  let valorEmAtraso = 0;
  let proximoVencimento = null;

  for (const linha of linhas) {
    const venceu = mesHoje > 0 && linha.mesContrato <= mesHoje;

    if (venceu) {
      totalPrevistoAteHoje += linha.totalPrevisto;
      if (linha.pago) {
        totalPagoRegistrado += linha.valorPago ?? linha.totalPrevisto;
      } else {
        mesesEmAtraso++;
        valorEmAtraso += linha.totalPrevisto;
      }
    } else if (!proximoVencimento) {
      proximoVencimento = linha;
    }

    if (linha.pago && !venceu) {
      totalPagoRegistrado += linha.valorPago ?? linha.totalPrevisto;
    }
  }

  const totalAportesRegistrados = Object.values(ac.meses || {}).reduce(
    (acc, r) => acc + (r?.aporte || 0),
    0
  );

  // Comparação honesta: só a prestação mínima vs o comportamento atual do cliente
  const chaves = ac.mesEntregaChaves || 0;
  const semAportes = simular({
    valorFinanciado: cliente.aprovacao.valorFinanciamento,
    prazoMeses: cliente.aprovacao.prazoMeses,
    taxaMensal: taxaMensalCaixa(cliente.aprovacao.jurosNominalAnual, cliente.aprovacao.trAnual),
    sistema: cliente.aprovacao.sistema,
    aportesExtras: new Map(),
  });
  const comRealidade = simularComRealidade(cliente, { mesContratoCorte: mesHoje }).meses;

  const prazoSemAportes = prazoEfetivoMeses(semAportes);
  const prazoAtual = prazoEfetivoMeses(comRealidade);

  // Saldo devedor no mês corrente, quando a amortização já começou
  let saldoDevedorAtual = null;
  if (chaves && mesHoje >= chaves) {
    const idx = mesHoje - chaves;
    saldoDevedorAtual = comRealidade[idx]?.saldoDevedor ?? 0;
  }

  return {
    mesContratoHoje: mesHoje,
    totalPrevistoAteHoje,
    totalPagoRegistrado,
    mesesEmAtraso,
    valorEmAtraso,
    proximoVencimento,
    totalAportesRegistrados,
    saldoDevedorAtual,
    prazoSemAportes,
    prazoAtual,
    mesesEconomizados: prazoSemAportes - prazoAtual,
    jurosSemAportes: totalJuros(semAportes),
    jurosAtual: totalJuros(comRealidade),
    economiaJurosAtual: totalJuros(semAportes) - totalJuros(comRealidade),
    quitacaoMesContrato: chaves ? chaves + prazoAtual - 1 : 0,
  };
}

/**
 * Planilha completa do financiamento da Caixa, mês a mês até a quitação.
 *
 * Cada linha fecha por construção: juros + amortização + seguros = prestação.
 * Expor os seguros como coluna própria é o que permite bater a prestação com
 * o boleto do cliente sem parecer que a conta não soma.
 *
 * Reflete a trajetória ATUAL (com os aportes que o cliente registrou), e não
 * o plano original — é a planilha da vida real dele.
 */
export function planilhaCaixa(cliente) {
  const a = cliente.aprovacao;
  const ac = cliente.acompanhamento || {};
  const chaves = ac.mesEntregaChaves || 0;

  const taxaMensal = taxaMensalCaixa(a.jurosNominalAnual, a.trAnual);
  const seguros = segurosETarifasMensais({
    primeiraPrestacaoDoc: a.primeiraPrestacaoDoc,
    valorFinanciamento: a.valorFinanciamento,
    prazoMeses: a.prazoMeses,
    taxaMensal,
    sistema: a.sistema,
  });

  const mesHoje = ac.dataBaseISO ? mesContratoHoje(ac.dataBaseISO) : 0;
  const { meses } = simularComRealidade(cliente, {
    mesContratoCorte: chaves ? mesHoje : 0,
  });

  const linhas = meses.map((m, idx) => {
    const mesContrato = chaves ? chaves + idx : 0;
    const registro = mesContrato ? registroDoMes(cliente, mesContrato) : null;
    return {
      n: m.mes,
      mesContrato,
      juros: m.juros,
      amortizacao: m.amortizacao,
      seguros,
      prestacao: m.parcela + seguros,
      aporte: m.aporteExtra,
      saldo: m.saldoDevedor,
      ehHoje: mesContrato > 0 && mesContrato === mesHoje,
      pago: !!registro?.pago,
    };
  });

  const totais = linhas.reduce(
    (acc, l) => ({
      juros: acc.juros + l.juros,
      amortizacao: acc.amortizacao + l.amortizacao,
      seguros: acc.seguros + l.seguros,
      aportes: acc.aportes + l.aporte,
      prestacoes: acc.prestacoes + l.prestacao,
    }),
    { juros: 0, amortizacao: 0, seguros: 0, aportes: 0, prestacoes: 0 }
  );
  totais.desembolso = totais.prestacoes + totais.aportes;

  return { linhas, totais, segurosMensais: seguros, taxaMensal };
}

/**
 * Séries para os gráficos do controle: o saldo se o cliente pagar só a
 * prestação mínima, contra o saldo no ritmo atual dele.
 */
export function seriesControle(cliente) {
  const a = cliente.aprovacao;
  const ac = cliente.acompanhamento || {};
  const chaves = ac.mesEntregaChaves || 0;
  const mesHoje = ac.dataBaseISO ? mesContratoHoje(ac.dataBaseISO) : 0;

  const taxaMensal = taxaMensalCaixa(a.jurosNominalAnual, a.trAnual);
  const minimo = simular({
    valorFinanciado: a.valorFinanciamento,
    prazoMeses: a.prazoMeses,
    taxaMensal,
    sistema: a.sistema,
    aportesExtras: new Map(),
  });
  const atual = simularComRealidade(cliente, { mesContratoCorte: chaves ? mesHoje : 0 }).meses;

  // O gráfico acompanha o cenário mais longo (o mínimo), com a curva do
  // ritmo atual terminando antes — é justamente isso que mostra a economia.
  const tamanho = Math.max(minimo.length, atual.length);

  return {
    tamanho,
    saldoMinimo: minimo.map((m) => m.saldoDevedor),
    saldoAtual: atual.map((m) => m.saldoDevedor),
    juros: atual.map((m) => m.juros),
    amortizacao: atual.map((m) => m.amortizacao),
    // Índice (0-based) do mês corrente dentro da amortização, ou null
    indiceHoje: chaves && mesHoje >= chaves ? Math.min(mesHoje - chaves, tamanho - 1) : null,
    prazoMinimo: minimo.length,
    prazoAtual: atual.length,
  };
}
