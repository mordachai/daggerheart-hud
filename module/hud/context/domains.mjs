// module/hud/context/domains.mjs
// Domain card loadout / vault split + localized domain header label & tooltip.
// Extracted verbatim from _prepareContext in refactor step 4 — no behaviour change.

import { itemHasActions, firstActionId } from "../../system/items.mjs";
import { enrichItemDescription, toHudInlineButtons } from "../../helpers/inline-rolls.mjs";

export async function collectDomains(app) {
  const sys = app.actor?.system ?? {};

  // === Actor Domains (header label, localized) ===
  const rawDomains = Array.isArray(sys.domains) ? sys.domains : [];
  const domainsHeader = rawDomains
    .map(d => String(d).trim())
    .filter(Boolean)
    .map(key => {
      // Try i18n label: DAGGERHEART.GENERAL.Domain.<key>.label
      const i18nKey = `DAGGERHEART.GENERAL.Domain.${key}.label`;
      const loc = game.i18n?.localize?.(i18nKey);
      if (loc && loc !== i18nKey) return loc; // localized OK
      // Fallback: TitleCase the raw key
      return key.charAt(0).toUpperCase() + key.slice(1);
    })
    .join(" & ") || null;

  // (optional) if you want a tooltip with the concatenated descriptions:
  const domainsHeaderTitle = rawDomains
    .map(key => {
      const dKey = String(key).trim();
      const name = game.i18n?.localize?.(`DAGGERHEART.GENERAL.Domain.${dKey}.label`);
      const desc = game.i18n?.localize?.(`DAGGERHEART.GENERAL.Domain.${dKey}.description`);
      return (name && desc) ? `${name}: ${desc}` : null;
    })
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

    const entry = {
      id: it.id,
      name: it.name,
      img: it.img || "icons/svg/aura.svg",
      description: it.system?.description ?? "", // optional raw
      descriptionHTML: toHudInlineButtons(await enrichItemDescription(it)),
      hasActions: hasActions,
      recallCost: Number(it.system?.recallCost ?? 0),
      domain: (it.system?.domain ?? "").toString(),
      inVault: isInVault,
      system: it.system,
      actionId: firstActionId(it)
    };

    (entry.inVault ? domainVault : domainLoadout).push(entry);
  }

  return { domainLoadout, domainVault, domainsHeader, domainsHeaderTitle };
}
