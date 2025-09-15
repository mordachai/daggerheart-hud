// module/helpers/inline-rolls.mjs
export async function enrichItemDescription(item) {
  const raw = item.system?.description ?? "";
  const rollData = item.getRollData?.() ?? item.actor?.getRollData?.() ?? {};

  // Foundry will parse [[/r ...]] and resolve @UUID, etc.
  const html = await TextEditor.enrichHTML(raw, {
    async: true,
    rollData,
    relativeTo: item,
    secrets: false,
    documents: true,
    links: true,
    rolls: true
  });

  return html;
}

function pickDieIcon(formula = "") {
  const m = /d(4|6|8|10|12|20)\b/i.exec(formula);
  const faces = m?.[1];
  const map = {
    "4":"fa-solid fa-dice-d4","6":"fa-solid fa-dice-d6","8":"fa-solid fa-dice-d8",
    "10":"fa-solid fa-dice-d10","12":"fa-solid fa-dice-d12","20":"fa-solid fa-dice-d20"
  };
  return faces ? map[faces] : "fa-solid fa-dice-d6";
}

export function toHudInlineButtons(enrichedHTML, { enableDuality = true } = {}) {
  const root = document.createElement("div");
  root.innerHTML = enrichedHTML;

  // [[/r ...]] buttons
  for (const a of root.querySelectorAll("a.inline-roll")) {
    const formula = a.dataset.formula?.trim() || a.textContent.trim();
    const btn = document.createElement("span");
    btn.className = "dhud-inline-roll";
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.dataset.action = "inline-roll";
    btn.dataset.formula = formula;
    btn.innerHTML = `<i class="${pickDieIcon(formula)}"></i> ${foundry.utils.escapeHTML(formula)}`;
    a.replaceWith(btn);
  }

  // [[/dr ...]] buttons (system chat command)
  if (enableDuality) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const s = n.nodeValue;
      const m = s?.match(/\[\[\/dr\s+([^\]]+)\]\]/i);
      if (!m) continue;

      const before = s.slice(0, m.index);
      const params = m[1].trim();
      const after = s.slice(m.index + m[0].length);

      const wrap = document.createElement("span");
      if (before) wrap.append(document.createTextNode(before));

      const btn = document.createElement("span");
      btn.className = "dhud-inline-dr";
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
      btn.dataset.action = "inline-duality";
      btn.dataset.params = params;
      btn.innerHTML = `<i class="fa-solid fa-dice-d12"></i> /dr ${foundry.utils.escapeHTML(params)}`;

      wrap.append(btn);
      if (after) wrap.append(document.createTextNode(after));
      n.replaceWith(wrap);
    }
  }

  return root.innerHTML;
}
