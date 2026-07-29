// Progressão dos juros de obra cobrados pelo banco enquanto o valor financiado
// é liberado gradualmente à construtora ("evolução de obra").

export function curvaLinear(prazoObraMeses) {
  const curva = [];
  for (let m = 1; m <= prazoObraMeses; m++) {
    curva.push(m / prazoObraMeses);
  }
  return curva;
}

// curvaLiberacao (opcional): array de % acumulado liberado por mês, do corretor
// ajustando para a curva real do empreendimento. Sem isso, usa curva linear.
export function calcularJurosObra(valorFinanciado, prazoObraMeses, taxaMensalObra, curvaLiberacao) {
  const curva =
    curvaLiberacao && curvaLiberacao.length === prazoObraMeses
      ? curvaLiberacao
      : curvaLinear(prazoObraMeses);

  const meses = [];
  let saldoLiberadoAnterior = 0;
  let jurosAcumulados = 0;

  for (let m = 1; m <= prazoObraMeses; m++) {
    const saldoLiberadoAtual = valorFinanciado * curva[m - 1];
    const jurosMes = saldoLiberadoAnterior * taxaMensalObra;
    jurosAcumulados += jurosMes;

    meses.push({
      mes: m,
      percentualLiberado: curva[m - 1],
      saldoLiberado: saldoLiberadoAtual,
      jurosMes,
      jurosAcumulados,
    });

    saldoLiberadoAnterior = saldoLiberadoAtual;
  }

  return meses;
}

export function totalJurosObra(meses) {
  return meses.length ? meses[meses.length - 1].jurosAcumulados : 0;
}
