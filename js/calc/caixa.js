// Derivações a partir da SIMULAÇÃO oficial da Caixa (o papel que o
// correspondente manda). Tudo aqui existe para que os números do app batam
// com os números impressos no documento — se divergir, o corretor perde a
// credibilidade na mesa.

import { pmtPrice } from "./amortizacao.js";

// A Caixa trabalha com taxa nominal anual dividida por 12 (capitalização
// mensal simples do nominal), NÃO com equivalência geométrica. Prova: na
// simulação real, "Juros Nominais TR + 4,5000% a.a." aparece junto de
// "Juros Efetivos TR + 4,5940% a.a." — e (1 + 0,045/12)^12 - 1 = 4,5940%.
// A equivalência geométrica devolveria 4,5000% e furaria o documento.
export function taxaMensalCaixa(jurosNominalAnual, trAnual = 0) {
  return (jurosNominalAnual + trAnual) / 12;
}

export function taxaEfetivaAnual(taxaMensal) {
  return Math.pow(1 + taxaMensal, 12) - 1;
}

// Entrada que sobra para o comprador acertar com a construtora.
// Confere com o documento real: 260.000 - 165.810,07 - 4.211,00 = 89.978,93.
export function entradaNecessaria({ valorImovel, valorFinanciamento, valorSubsidio }) {
  return (valorImovel || 0) - (valorFinanciamento || 0) - (valorSubsidio || 0);
}

export function cotaFinanciamento({ valorFinanciamento, valorImovel }) {
  if (!valorImovel) return 0;
  return valorFinanciamento / valorImovel;
}

// A "1ª Prestação" do documento é o encargo total: amortização + juros +
// seguro MIP + seguro DFI + tarifa de administração. O motor de amortização
// só produz amortização + juros, então a diferença é o pacote de
// seguros/tarifas. Extrair isso do próprio documento é mais fiel do que
// pedir para o corretor adivinhar cada componente.
export function segurosETarifasMensais({ primeiraPrestacaoDoc, valorFinanciamento, prazoMeses, taxaMensal, sistema }) {
  const base = primeiraParcelaBase({ valorFinanciamento, prazoMeses, taxaMensal, sistema });
  if (!primeiraPrestacaoDoc || !base) return 0;
  return Math.max(0, primeiraPrestacaoDoc - base);
}

export function primeiraParcelaBase({ valorFinanciamento, prazoMeses, taxaMensal, sistema }) {
  if (!valorFinanciamento || !prazoMeses) return 0;
  if (sistema === "PRICE") return pmtPrice(valorFinanciamento, taxaMensal, prazoMeses);
  return valorFinanciamento / prazoMeses + valorFinanciamento * taxaMensal;
}

export function comprometimentoRenda({ encargoMensal, rendaBruta }) {
  if (!rendaBruta) return 0;
  return encargoMensal / rendaBruta;
}

// Confere se os valores digitados fecham entre si, do jeito que o documento
// fecha. Serve para pegar erro de digitação antes da reunião com o cliente.
export function conferirAprovacao(aprovacao) {
  const avisos = [];
  const {
    valorImovel,
    valorFinanciamento,
    valorSubsidio,
    prazoMeses,
    primeiraPrestacaoDoc,
    rendaBruta,
    comprometimentoMax,
  } = aprovacao;

  const taxaMensal = taxaMensalCaixa(aprovacao.jurosNominalAnual, aprovacao.trAnual);
  const base = primeiraParcelaBase({
    valorFinanciamento,
    prazoMeses,
    taxaMensal,
    sistema: aprovacao.sistema,
  });
  const seguros = segurosETarifasMensais({
    primeiraPrestacaoDoc,
    valorFinanciamento,
    prazoMeses,
    taxaMensal,
    sistema: aprovacao.sistema,
  });

  if (valorFinanciamento > valorImovel) {
    avisos.push({
      tipo: "erro",
      texto: "O valor financiado ficou maior que o valor do imóvel — confira os campos.",
    });
  }

  if (primeiraPrestacaoDoc && base && primeiraPrestacaoDoc < base - 0.5) {
    avisos.push({
      tipo: "erro",
      texto: `A 1ª prestação do documento (${primeiraPrestacaoDoc.toFixed(2)}) ficou abaixo da parcela mínima de amortização + juros (${base.toFixed(2)}). Confira prazo, taxa ou valor financiado.`,
    });
  }

  if (rendaBruta && primeiraPrestacaoDoc) {
    const comp = comprometimentoRenda({ encargoMensal: primeiraPrestacaoDoc, rendaBruta });
    const teto = comprometimentoMax || 0.3;
    if (comp > teto + 0.001) {
      avisos.push({
        tipo: "atencao",
        texto: `A prestação consome ${(comp * 100).toFixed(1)}% da renda, acima do teto de ${(teto * 100).toFixed(0)}% considerado pela Caixa.`,
      });
    }
  }

  return { avisos, taxaMensal, primeiraParcelaBase: base, segurosETarifas: seguros };
}
