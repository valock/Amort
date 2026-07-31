// Compartilhamento do caso com o cliente SEM servidor.
//
// O caso inteiro vai codificado no fragmento (#) da URL. O fragmento nunca é
// enviado ao servidor em uma requisição HTTP, então os dados do cliente
// continuam sem trafegar por lugar nenhum além da conversa entre corretor e
// cliente — o que mantém a promessa central do app.
//
// Ao abrir o link, o caso é importado para o IndexedDB do aparelho do cliente
// e passa a ser o controle DELE, independente do aparelho do corretor.

import { novoId } from "./storage.js";

function paraBase64Url(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(b64) {
  const normalizado = b64.replace(/-/g, "+").replace(/_/g, "/");
  const preenchido = normalizado + "=".repeat((4 - (normalizado.length % 4)) % 4);
  const binario = atob(preenchido);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Remove o que não precisa viajar: o id é gerado de novo no aparelho do
// cliente, para o caso dele não colidir com o do corretor.
function prepararParaEnvio(cliente) {
  const { id, ...resto } = cliente;
  return resto;
}

export function gerarLinkCompartilhavel(cliente, baseUrl = window.location.origin + window.location.pathname) {
  const json = JSON.stringify(prepararParaEnvio(cliente));
  const raiz = baseUrl.replace(/[^/]*$/, "");
  return `${raiz}cronograma.html#caso=${paraBase64Url(json)}`;
}

export function lerCasoDoHash(hash = window.location.hash) {
  const match = /[#&]caso=([^&]+)/.exec(hash || "");
  if (!match) return null;
  try {
    const cliente = JSON.parse(deBase64Url(match[1]));
    if (!cliente || typeof cliente !== "object" || !cliente.aprovacao) return null;
    cliente.id = novoId();
    cliente.recebidoEm = new Date().toISOString();
    return cliente;
  } catch {
    return null;
  }
}

export function limparHash() {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

export function textoWhatsApp(cliente, link) {
  return (
    `Olá! Aqui está o seu controle de pagamentos do imóvel.\n\n` +
    `Abra o link para acompanhar mês a mês o que vence, marcar o que já pagou ` +
    `e ver quanto tempo você economiza quando adianta parcelas:\n\n${link}\n\n` +
    `Os dados ficam salvos só no seu aparelho.`
  );
}
