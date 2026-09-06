// module/hud/context/domains.mjs
// Domain card loadout / vault split + localized domain header label & tooltip.
// Step 12: header + per-card domain labels resolve through system/config.mjs
// domainMeta() (CONFIG.DH.DOMAIN.allDomains()), so GM homebrew domains get their
// configured label / colour / icon instead of a TitleCased raw key.

import { itemHasActions, firstActionId } from "../../system/items.mjs";
import { domainMeta } from "../../system/config.mjs";
import { getItemDescriptionHTML } from "../../system/descriptions.mjs";

export async function collectDomains(app) {
  const sys = app.actor?.system ?? {};

  // === Actor Domains (header label + tooltip, core or homebrew) ===
  const domainMetas = (Array.isArray(sys.domains) ? sys.domains : [])
    .map(d => String(d).trim())
    .filter(Boolean)
    .map(domainMeta);

  const domainsHeader = domainMetas.map(m => m.label).filter(Boolean).join(" & ") || null;

  const domainsHeaderTitle = domainMetas
    .map(m => (m.label && m.description) ? `${m.label}: ${m.description}` : null)
    .filter(Boolean)
    .join("\n") || "";

  // === DOMAIN CARDS ===
  const domainLoadout = [];
  const domainVault = [];

  for (const it of (app.actor?.items ?? [])) {
    if (it.type !== "domainCard") continue;

    const isInVault = !!it.system?.inVault;
    // Cards in vault should not be clickable for actions
    const hasActions = isInVault ? false : itemHasActions(it);

    const domainKey = (it.system?.domain ?? "").toString();
    const meta = domainMeta(domainKey);

    const entry = {
      id: it.id,
      name: it.name,
      img: it.img || "icons/svg/aura.svg",
      description: it.system?.description ?? "", // optional raw
      descriptionHTML: await getItemDescriptionHTML(it),
      hasActions: hasActions,
      recallCost: Number(it.system?.recallCost ?? 0),
      domain: domainKey,                 // raw key (logic)
      domainLabel: meta.label || domainKey,   // display
      domainColor: meta.color || "",
      domainIcon: meta.src || "",
      inVault: isInVault,
      system: it.system,
      actionId: firstActionId(it)
    };

    (entry.inVault ? domainVault : domainLoadout).push(entry);
  }

  return { domainLoadout, domainVault, domainsHeader, domainsHeaderTitle };
}
