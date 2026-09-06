// module/system/descriptions.mjs
// Item descriptions for the HUD. Base HTML comes from the system's own enricher
// (item.system.getEnrichedDescription — includes weapon/armor feature prefixes and,
// for the GM, the gmNotes section). On top of that we rewrite [[/r ...]] and
// [[/dr ...]] into clickable HUD chips. Moved from helpers/inline-rolls.mjs in step 6.

/** System-enriched description HTML + HUD inline-roll chips. One call for collectors. */
export async function getItemDescriptionHTML(item, { duality = true } = {}) {
  return toHudInlineButtons(await enrichItemDescription(item), { enableDuality: duality });
}

/** Enriched description HTML for an item — system enricher first, manual enrich as fallback. */
export async function enrichItemDescription(item) {
  try {
    const sys = item?.system;
    if (typeof sys?.getEnrichedDescription === "function") {
      const html = await sys.getEnrichedDescription({ gmNotes: game.user?.isGM === true, type: "sheet" });
      if (html != null) return html;
    }
  } catch (err) {
    console.warn("[DHUD] getEnrichedDescription failed, falling back to manual enrich", err);
  }

  const raw = item?.system?.description ?? "";
  const rollData = item?.getRollData?.() ?? item?.actor?.getRollData?.() ?? {};
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(raw, {
    async: true,
    rollData,
    relativeTo: item,
    secrets: false,
    documents: true,
    links: true,
    rolls: true
  });
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

/** Rewrite enriched [[/r]] anchors and bare [[/dr ...]] text into HUD chip buttons. */
export function toHudInlineButtons(enrichedHTML, { enableDuality = true } = {}) {
  const root = document.createElement("div");
  root.innerHTML = enrichedHTML ?? "";

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

  // [[/dr ...]] buttons (system duality roll)
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
