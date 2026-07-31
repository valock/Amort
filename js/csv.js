// Exportação da planilha para CSV.
//
// Formato pensado para o Excel em português: separador ponto-e-vírgula e
// vírgula decimal. Com separador de vírgula e ponto decimal, o Excel
// brasileiro joga tudo numa coluna só e o cliente acha que o arquivo veio
// quebrado.

import { rotuloMes } from "./calc/calendario.js";

function num(v) {
  return (v || 0).toFixed(2).replace(".", ",");
}

export function planilhaParaCSV(cliente, planilha) {
  const dataBase = cliente.acompanhamento?.dataBaseISO;
  const cabecalho = [
    "Parcela",
    "Mes",
    "Prestacao",
    "Juros",
    "Amortizacao",
    "Seguros e tarifa",
    "Aporte extra",
    "Saldo devedor",
  ];

  const linhas = planilha.linhas.map((l) => {
    const mes = dataBase && l.mesContrato ? rotuloMes(dataBase, l.mesContrato, { comAnoCompleto: true }) : "";
    return [
      l.n,
      mes,
      num(l.prestacao),
      num(l.juros),
      num(l.amortizacao),
      num(l.seguros),
      num(l.aporte),
      num(l.saldo),
    ].join(";");
  });

  const t = planilha.totais;
  const total = [
    "TOTAL",
    "",
    num(t.prestacoes),
    num(t.juros),
    num(t.amortizacao),
    num(t.seguros),
    num(t.aportes),
    "0,00",
  ].join(";");

  return [cabecalho.join(";"), ...linhas, total].join("\r\n");
}

export function baixarCSV(nomeArquivo, conteudo) {
  // BOM para o Excel reconhecer UTF-8 e não estragar os acentos
  const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function nomeArquivoPlanilha(cliente) {
  const nome = (cliente.nome || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove os acentos separados pelo NFD
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `planilha-${nome || "cliente"}.csv`;
}
