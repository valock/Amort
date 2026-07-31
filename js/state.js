import { novoId, carregarCliente, salvarCliente } from "./storage.js";

export const VERSAO_MODELO = 6;

// Modelo espelhando o fluxo real de venda:
//   aprovacao  -> a simulação que o correspondente manda (Caixa)
//   entrada    -> o que fica com a construtora (sinal, FGTS, parcelas, balões)
//   estrategia -> a aceleração da quitação depois das chaves
export function clienteVazio(nome) {
  return {
    id: novoId(),
    nome: nome || "Novo cliente",
    criadoEm: new Date().toISOString(),
    versaoModelo: VERSAO_MODELO,
    aprovacao: {
      valorImovel: 0,
      valorAvaliacao: 0,
      valorFinanciamento: 0,
      valorSubsidio: 0,
      prazoMeses: 420,
      sistema: "PRICE",
      jurosNominalAnual: 0.045,
      trAnual: 0,
      primeiraPrestacaoDoc: 0,
      rendaBruta: 0,
      comprometimentoMax: 0.3,
      cidade: "",
      dataSimulacao: "",
    },
    entrada: {
      sinal: 0,
      fgtsNaEntrada: 0,
      // Parcelamento no formato do contrato: uma série mensal uniforme + balões
      serieMensal: { quantidade: 0, valor: 0, mesInicial: 1 },
      baloes: [],
      // Correção das parcelas da construtora, em duas fases. Cada construtora
      // escreve a regra do seu jeito; o padrão aqui é o arranjo mais comum
      // (INCC na obra, 1% + inflação depois das chaves) e é editável.
      inccMensal: 0.005,
      jurosPosChavesMensal: 0.01,
      inflacaoPosChavesMensal: 0.004,
      prazoObraMeses: 0,
      taxaMensalObra: 0,
    },
    estrategia: {
      salarioBruto: 0,
      usarFGTS: true,
      intervaloSaqueFGTSMeses: 24,
      valor13: 0,
      usar13: true,
      aportesAvulsos: [],
    },
    // Quanto o imóvel vale HOJE. É o outro lado do patrimônio: a dívida cai
    // pela amortização, e o valor do bem se move por conta própria. Sempre
    // informado por quem usa o app — não há projeção de valorização aqui.
    mercado: {
      valorAtual: 0,
      dataISO: "",
      fonte: "",
    },
    // Controle mês a mês do cliente. `meses` é esparso: só guarda os meses em
    // que ele registrou algo, para o caso salvo não crescer com 420 entradas.
    acompanhamento: {
      dataBaseISO: "",
      mesEntregaChaves: 0,
      meses: {},
    },
  };
}

// Casos salvos em versões anteriores continuam abrindo. Cada passo sobe UMA
// versão e chama a migração de novo, então um caso antigo atravessa a cadeia
// inteira sem que cada passo precise conhecer os seguintes.
export function migrarCliente(cliente) {
  if (!cliente || cliente.versaoModelo === VERSAO_MODELO) return cliente;

  // v5 -> v6: ganha o bloco de valor de mercado
  if (cliente.versaoModelo === 5) {
    return migrarCliente({
      ...cliente,
      versaoModelo: 6,
      mercado: cliente.mercado || { valorAtual: 0, dataISO: "", fonte: "" },
    });
  }

  // v4 -> v5: a correção da entrada ganha a fase pós-chaves
  if (cliente.versaoModelo === 4) {
    return migrarCliente({
      ...cliente,
      versaoModelo: 5,
      entrada: {
        ...cliente.entrada,
        jurosPosChavesMensal: cliente.entrada?.jurosPosChavesMensal ?? 0.01,
        inflacaoPosChavesMensal: cliente.entrada?.inflacaoPosChavesMensal ?? 0.004,
      },
    });
  }

  // v3 -> v4: ganha o bloco de acompanhamento mês a mês
  if (cliente.versaoModelo === 3) {
    return migrarCliente({
      ...cliente,
      versaoModelo: 4,
      acompanhamento: cliente.acompanhamento || { dataBaseISO: "", mesEntregaChaves: 0, meses: {} },
    });
  }

  // v2 -> v3: parcelas soltas viram série mensal + balões
  if (cliente.versaoModelo === 2) {
    const parcelas = cliente.entrada?.parcelas || [];
    const mensais = parcelas.filter((p) => (p.tipo || "mensal") === "mensal");
    const baloes = parcelas.filter((p) => p.tipo === "balao");

    const entrada = {
      ...cliente.entrada,
      serieMensal: mensais.length
        ? {
            quantidade: mensais.length,
            valor: mensais[0].valor || 0,
            mesInicial: Math.min(...mensais.map((p) => p.mes || 1)),
          }
        : { quantidade: 0, valor: 0, mesInicial: 1 },
      baloes: baloes.map((b) => ({ mes: b.mes, valor: b.valor })),
    };
    delete entrada.parcelas;

    return migrarCliente({ ...cliente, versaoModelo: 3, entrada });
  }

  const base = clienteVazio(cliente.nome);
  base.id = cliente.id;
  base.criadoEm = cliente.criadoEm || base.criadoEm;

  const f = cliente.fechamento || {};
  const e = cliente.estrategia || {};

  base.aprovacao.valorImovel = f.valorImovel || 0;
  base.aprovacao.valorAvaliacao = f.valorImovel || 0;
  base.aprovacao.valorFinanciamento = f.valorFinanciadoObra || 0;
  base.aprovacao.prazoMeses = e.prazoMeses || 420;
  base.aprovacao.sistema = e.sistema || "PRICE";
  // taxaAnual antiga era efetiva; aqui vira nominal, que é como a Caixa informa
  base.aprovacao.jurosNominalAnual = e.taxaAnual || 0.045;

  base.entrada.sinal = f.sinal || 0;
  base.entrada.baloes = (f.parcelasEntrada || []).map((p) => ({ mes: p.mes, valor: p.valor }));
  base.entrada.inccMensal = f.inccMensal != null ? f.inccMensal : 0.005;
  base.entrada.prazoObraMeses = f.prazoObraMeses || 0;
  base.entrada.taxaMensalObra = f.taxaMensalObra || 0;

  base.estrategia.salarioBruto = e.salarioBruto || 0;
  base.estrategia.usarFGTS = e.usarFGTS !== false;
  base.estrategia.intervaloSaqueFGTSMeses = e.intervaloSaqueFGTSMeses || 24;
  base.estrategia.valor13 = e.valor13 || 0;
  base.estrategia.usar13 = e.usar13 !== false;
  base.estrategia.aportesAvulsos = e.aportesAvulsos || [];

  return base;
}

// Garante os blocos que versões novas passaram a exigir, para telas que leem
// o cliente não precisarem checar cada campo.
export function normalizarCliente(cliente) {
  if (!cliente) return cliente;
  if (!cliente.acompanhamento) {
    cliente.acompanhamento = { dataBaseISO: "", mesEntregaChaves: 0, meses: {} };
  }
  if (!cliente.acompanhamento.meses) cliente.acompanhamento.meses = {};
  if (!cliente.mercado) cliente.mercado = { valorAtual: 0, dataISO: "", fonte: "" };

  // Blindagem para campos que uma versão passou a exigir: se faltarem, um
  // `|| 0` mais adiante viraria "sem correção" em silêncio, e o cliente veria
  // parcela menor do que a real.
  if (!cliente.entrada) cliente.entrada = {};
  const e = cliente.entrada;
  if (e.jurosPosChavesMensal == null) e.jurosPosChavesMensal = 0.01;
  if (e.inflacaoPosChavesMensal == null) e.inflacaoPosChavesMensal = 0.004;
  if (!e.serieMensal) e.serieMensal = { quantidade: 0, valor: 0, mesInicial: 1 };
  if (!e.baloes) e.baloes = [];

  return cliente;
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
  const bruto = await carregarCliente(id);
  if (!bruto) {
    window.location.href = "index.html";
    return null;
  }
  const cliente = normalizarCliente(migrarCliente(bruto));
  if (cliente !== bruto) await salvarCliente(cliente);
  return cliente;
}

export async function salvarESeguir(cliente, proximaUrl) {
  await salvarCliente(cliente);
  window.location.href = linkComCliente(proximaUrl, cliente.id);
}
