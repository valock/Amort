// Varre o repositório procurando dado pessoal que não pode ir para um
// repositório público: CPF, CNPJ, CEP, telefone, e-mail, data de nascimento.
//
// LIMITE IMPORTANTE: isto pega padrões, não nomes. "Maria Souza" e
// "João da Silva" passam batido, porque não há como distinguir um exemplo
// fictício de um cliente real. Continue revisando o diff antes de commitar.
//
// Uso: node testes/verificar-anonimizacao.mjs

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;

const IGNORAR_DIRS = new Set([".git", "node_modules", ".netlify", "assets"]);
const EXTENSOES = new Set([".js", ".mjs", ".html", ".css", ".md", ".json", ".toml", ".webmanifest", ""]);

const PADROES = [
  { nome: "CPF", re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  { nome: "CPF (só dígitos, 11)", re: /(?<![\d.,])\d{11}(?![\d.,])/g },
  { nome: "CNPJ", re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g },
  { nome: "CEP", re: /\b\d{5}-\d{3}\b/g },
  { nome: "telefone", re: /\(\d{2}\)\s?9?\d{4}-\d{4}/g },
  { nome: "e-mail", re: /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g },
  { nome: "data completa (possível nascimento)", re: /\b\d{2}\/\d{2}\/(19|20)\d{2}\b/g },
];

// Casos legítimos que não são dado pessoal.
const PERMITIDOS = [
  /example\.(com|org)/i,
  /seu-?email/i,
  /nome@/i,
];

function listarArquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_DIRS.has(nome)) continue;
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) saida.push(...listarArquivos(caminho));
    else if (EXTENSOES.has(extname(nome))) saida.push(caminho);
  }
  return saida;
}

const achados = [];

for (const caminho of listarArquivos(RAIZ)) {
  const linhas = readFileSync(caminho, "utf8").split("\n");
  linhas.forEach((linha, idx) => {
    for (const { nome, re } of PADROES) {
      const encontrados = linha.match(re);
      if (!encontrados) continue;
      for (const trecho of encontrados) {
        if (PERMITIDOS.some((p) => p.test(trecho))) continue;
        achados.push({
          arquivo: caminho.replace(RAIZ, ""),
          linha: idx + 1,
          tipo: nome,
          trecho: trecho.slice(0, 60),
        });
      }
    }
  });
}

if (achados.length === 0) {
  console.log("✅ Nenhum padrão de dado pessoal encontrado.");
  console.log("   (Lembre: nomes próprios não são detectáveis — revise o diff.)");
  process.exit(0);
}

console.error(`❌ ${achados.length} possível(is) dado(s) pessoal(is) encontrado(s):\n`);
for (const a of achados) {
  console.error(`  ${a.arquivo}:${a.linha}  [${a.tipo}]  ${a.trecho}`);
}
console.error("\nRemova ou substitua por valores fictícios antes de commitar.");
process.exit(1);
