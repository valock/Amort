import { linkComCliente } from "./state.js";

const PASSOS = [
  { url: "index.html", rotulo: "1. Caixa" },
  { url: "entrada.html", rotulo: "2. Entrada" },
  { url: "estrategia.html", rotulo: "3. Estratégia" },
  { url: "resultados.html", rotulo: "4. Resultado" },
];

export function renderStepper(passoAtualUrl, clienteId) {
  const nav = document.querySelector("nav.stepper");
  if (!nav) return;
  nav.innerHTML = "";
  for (const passo of PASSOS) {
    const a = document.createElement("a");
    a.textContent = passo.rotulo;
    if (passo.url === passoAtualUrl) {
      a.className = "current";
      a.href = "#";
    } else {
      a.href = linkComCliente(passo.url, clienteId);
    }
    nav.appendChild(a);
  }
  nav.style.display = "flex";
}
