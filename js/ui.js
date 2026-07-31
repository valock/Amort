import { parseNum, paraInput } from "./format.js";

// Inputs de dinheiro/percentual: text + inputmode decimal, para o teclado
// numérico do celular abrir com vírgula (padrão brasileiro) e aceitar valores
// colados direto do documento da Caixa.
export function ligarCampo(id, obj, chave, { escala = 1, aoMudar } = {}) {
  const el = document.getElementById(id);
  if (!el) return null;
  const valorAtual = obj[chave];
  el.value = valorAtual ? paraInput(Number((valorAtual * escala).toFixed(6))) : "";
  // Campos com escala 100 são taxas/percentuais: ali "4.500" é 4,5 e não 4500.
  const preferirDecimal = escala !== 1;
  el.addEventListener("input", () => {
    obj[chave] = parseNum(el.value, { preferirDecimal }) / escala;
    if (aoMudar) aoMudar();
  });
  return el;
}

export function ligarTexto(id, obj, chave, { aoMudar } = {}) {
  const el = document.getElementById(id);
  if (!el) return null;
  el.value = obj[chave] || "";
  el.addEventListener("input", () => {
    obj[chave] = el.value;
    if (aoMudar) aoMudar();
  });
  return el;
}

export function setTexto(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

/**
 * Lista editável de itens {mes, valor}. Usada para parcelas com a construtora
 * e para aportes avulsos.
 */
export function renderListaValores({ containerId, itens, aoMudar, rotuloMes = "Mês", comTipo = false }) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  itens.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "list-row";

    const inputMes = document.createElement("input");
    inputMes.type = "text";
    inputMes.inputMode = "numeric";
    inputMes.placeholder = rotuloMes;
    inputMes.style.maxWidth = "84px";
    inputMes.value = item.mes || "";
    inputMes.addEventListener("input", () => {
      item.mes = Math.round(parseNum(inputMes.value));
      aoMudar();
    });
    row.appendChild(inputMes);

    const inputValor = document.createElement("input");
    inputValor.type = "text";
    inputValor.inputMode = "decimal";
    inputValor.placeholder = "Valor R$";
    inputValor.value = item.valor ? paraInput(item.valor) : "";
    inputValor.addEventListener("input", () => {
      item.valor = parseNum(inputValor.value);
      aoMudar();
    });
    row.appendChild(inputValor);

    if (comTipo) {
      const sel = document.createElement("select");
      sel.style.maxWidth = "104px";
      for (const [v, r] of [["mensal", "Mensal"], ["balao", "Balão"]]) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = r;
        if ((item.tipo || "mensal") === v) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => {
        item.tipo = sel.value;
        aoMudar();
      });
      row.appendChild(sel);
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "remove-btn";
    btn.setAttribute("aria-label", "Remover");
    btn.textContent = "×";
    btn.addEventListener("click", () => {
      itens.splice(idx, 1);
      renderListaValores({ containerId, itens, aoMudar, rotuloMes, comTipo });
      aoMudar();
    });
    row.appendChild(btn);

    container.appendChild(row);
  });

  if (itens.length === 0) {
    const vazio = document.createElement("p");
    vazio.className = "hint";
    vazio.textContent = "Nenhum item ainda.";
    container.appendChild(vazio);
  }
}

export function proximoMes(itens, passo = 1) {
  if (!itens.length) return 1;
  return Math.max(...itens.map((i) => i.mes || 0)) + passo;
}

export function ligarToggleSistema({ obj, chave, onSet }) {
  const botoes = document.querySelectorAll("[data-sistema]");
  function aplicar(sistema) {
    obj[chave] = sistema;
    botoes.forEach((b) => b.classList.toggle("active", b.dataset.sistema === sistema));
    if (onSet) onSet();
  }
  botoes.forEach((b) => b.addEventListener("click", () => aplicar(b.dataset.sistema)));
  aplicar(obj[chave] || "PRICE");
}

export function ligarToggleBool(id, obj, chave, aoMudar) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("active", !!obj[chave]);
  el.addEventListener("click", () => {
    obj[chave] = !obj[chave];
    el.classList.toggle("active", !!obj[chave]);
    aoMudar();
  });
}

export function renderAvisos(containerId, avisos) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  for (const aviso of avisos) {
    const div = document.createElement("div");
    div.className = aviso.tipo === "erro" ? "warning-badge erro" : "warning-badge";
    div.innerHTML = `<span class="icon">${aviso.tipo === "erro" ? "⛔" : "⚠️"}</span><span></span>`;
    div.querySelector("span:last-child").textContent = aviso.texto;
    container.appendChild(div);
  }
}
