import { linkComCliente } from "./state.js";

const PASSOS = [
  { url: "index.html", rotulo: "Caixa" },
  { url: "entrada.html", rotulo: "Entrada" },
  { url: "estrategia.html", rotulo: "Plano" },
  { url: "resultados.html", rotulo: "Resultado" },
  { url: "cronograma.html", rotulo: "Controle" },
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
