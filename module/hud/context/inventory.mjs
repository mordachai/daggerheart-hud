// module/hud/context/inventory.mjs
// Consumables + loot. Extracted verbatim from _prepareContext in refactor step 4.

import { itemHasActions, firstActionId } from "../../system/items.mjs";
import { getItemDescriptionHTML } from "../../system/descriptions.mjs";

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
      descriptionHTML: await getItemDescriptionHTML(it),
      hasActions: hasActions,
      system: it.system,
      actionId: it.type === "consumable" ? firstActionId(it) : ""
    };

    if (it.type === "consumable") invConsumables.push(entry);
    if (it.type === "loot") invLoot.push(entry);
  }

  return { invConsumables, invLoot };
}
