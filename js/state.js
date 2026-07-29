import { novoId, carregarCliente, salvarCliente } from "./storage.js";

export function clienteVazio(nome) {
  return {
    id: novoId(),
    nome: nome || "Novo cliente",
    criadoEm: new Date().toISOString(),
    fechamento: {
      valorImovel: 0,
      prazoObraMeses: 24,
      sinal: 0,
      parcelasEntrada: [],
      inccMensal: 0.005,
      valorFinanciadoObra: 0,
      taxaMensalObra: 0.01,
    },
    estrategia: {
      prazoMeses: 420,
      taxaAnual: 0.1,
      sistema: "SAC",
      salarioBruto: 0,
      usarFGTS: true,
      intervaloSaqueFGTSMeses: 24,
      valor13: 0,
      usar13: true,
      aportesAvulsos: [],
    },
  };
}

export function idClienteDaURL() {
  return new URLSearchParams(window.location.search).get("cliente");
}

export function linkComCliente(url, clienteId) {
  return `${url}?cliente=${encodeURIComponent(clienteId)}`;
}

// Carrega o cliente da URL; se não existir (link direto sem contexto),
// volta para a tela inicial ao invés de operar sobre um estado vazio.
export async function carregarClienteAtualOuVoltar() {
  const id = idClienteDaURL();
  if (!id) {
    window.location.href = "index.html";
    return null;
  }
  const cliente = await carregarCliente(id);
  if (!cliente) {
    window.location.href = "index.html";
    return null;
  }
  return cliente;
}

export async function salvarESeguir(cliente, proximaUrl) {
  await salvarCliente(cliente);
  window.location.href = linkComCliente(proximaUrl, cliente.id);
}
