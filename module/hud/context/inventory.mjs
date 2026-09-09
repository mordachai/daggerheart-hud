// module/hud/context/inventory.mjs
// Consumables + loot + equippable weapons & armor. Consumable/loot shaping was
// extracted verbatim from _prepareContext in refactor step 4; weapons/armor were
// added so the HUD can equip/unequip them from the Inventory tab.

import { itemHasActions, firstActionId, weaponMeta } from "../../system/items.mjs";
import { getItemDescriptionHTML } from "../../system/descriptions.mjs";

/** Compact burden tag for a weapon: "2H" / "1H". */
function burdenLabel(it) {
  const key = it.system?.burden;
  if (key === "twoHanded") return "2H";
  if (key === "oneHanded") return "1H";
  return "";
}

export async function collectInventory(app) {
  const invConsumables = [];
  const invLoot = [];
  const invWeapons = [];
  const invArmor = [];

  for (const it of (app.actor?.items ?? [])) {
    if (!["consumable", "loot", "weapon", "armor"].includes(it.type)) continue;

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

    if (it.type === "consumable") { invConsumables.push(entry); continue; }
    if (it.type === "loot") { invLoot.push(entry); continue; }

    // weapon / armor — equippable
    entry.equipped = it.system?.equipped === true;

    if (it.type === "weapon") {
      entry.img = it.img || "icons/svg/sword.svg";
      entry.actionId = firstActionId(it);
      entry.burdenLabel = burdenLabel(it);
      const wm = weaponMeta(it);
      entry.range = wm.range;
      entry.rangeLabel = wm.rangeLabel;
      entry.damage = wm.damage;
      entry.damageLabel = wm.damageLabel;
      entry.damageIcons = wm.damageIcons;
      invWeapons.push(entry);
    } else {
      entry.img = it.img || "icons/svg/shield.svg";
      const score = Number(it.system?.armor?.max ?? 0);
      const marks = Number(it.system?.armor?.current ?? 0);
      entry.armorScore = score;
      entry.armorMarks = marks;
      entry.armorScoreLabel = game.i18n?.localize?.("DAGGERHEART.GENERAL.armorScore") ?? "Armor Score";
      invArmor.push(entry);
    }
  }

  return { invConsumables, invLoot, invWeapons, invArmor };
}
