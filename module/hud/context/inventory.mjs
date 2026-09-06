// module/hud/context/inventory.mjs
// Consumables + loot. Extracted verbatim from _prepareContext in refactor step 4.

import { itemHasActions } from "./_helpers.mjs";
import { enrichItemDescription, toHudInlineButtons } from "../../helpers/inline-rolls.mjs";

export async function collectInventory(app) {
  const invConsumables = [];
  const invLoot = [];

  for (const it of (app.actor?.items ?? [])) {
    if (it.type !== "consumable" && it.type !== "loot") continue;

    const hasActions = itemHasActions(it);

    const entry = {
      id: it.id,
      type: it.type,
      name: it.name,
      img: it.img || "icons/svg/aura.svg",
      qty: Number(it.system?.quantity ?? 0),
      description: it.system?.description ?? "", // optional raw
      descriptionHTML: toHudInlineButtons(await enrichItemDescription(it)),
      hasActions: hasActions,
      system: it.system,
      actionPath: (() => {
        if (it.type !== "consumable") return "";
        const sys = it.system ?? {};
        if (sys.actionPath) return sys.actionPath;
        if (sys.actions && typeof sys.actions === "object") {
          const first = Object.values(sys.actions)[0];
          return first?.systemPath || "use";
        }
        return "use";
      })()
    };

    if (it.type === "consumable") invConsumables.push(entry);
    if (it.type === "loot") invLoot.push(entry);
  }

  return { invConsumables, invLoot };
}
