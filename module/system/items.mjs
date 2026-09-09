// module/system/items.mjs
// The only place that knows how to fire Daggerheart item actions. Everything routes
// through the 2.9.2 action API:
//   - a specific action  -> item.system.actions.get(id).use(event)
//   - "use this item"     -> item.use(event)          (prompts when >1 action)
//   - a weapon attack     -> weapon.system.attack.use(event)
//   - the unarmed attack  -> actor.system.attack.use(event)
// The DOM event is passed straight through: shift/alt/ctrl on it skip the system's
// configuration dialog (baseAction.applyKeybindings). See docs/daggerheart-system-api.md §2.

import { getSetting, S } from "../settings.mjs";

/** True if the item exposes any usable action (Collection or plain object). */
export function itemHasActions(item) {
  const actions = item?.system?.actions;
  if (!actions) return false;
  if (typeof actions.size === "number") return actions.size > 0;
  return Object.keys(actions).length > 0;
}

/** Id of the item's first action, or "" — what the template puts in data-action-id. */
export function firstActionId(item) {
  const actions = item?.system?.actions;
  if (!actions) return "";
  const first = typeof actions[Symbol.iterator] === "function"
    ? Array.from(actions)[0]
    : Object.values(actions)[0];
  return first?.id ?? first?._id ?? "";
}

/** Fire one action of an item; fall back to item.use (which prompts on >1 action). */
export async function useItemAction(item, actionId, event) {
  if (!item) return;
  try {
    const action = actionId
      ? (item.system?.actions?.get?.(actionId) ?? item.system?.actions?.[actionId] ?? null)
      : null;
    if (action?.use) return await action.use(event ?? {});
    if (item.use)    return await item.use(event ?? {});
    item.sheet?.render(true, { focus: true });
  } catch (err) {
    console.error("[DHUD] Item action failed", err);
    ui.notifications?.error("Action failed (see console)");
  }
}

/**
 * Move a domain card between loadout and vault. Delegates to the system's
 * `system.toggleVault(event, toVault, isRecall)` which handles the loadout-cap
 * warning and the Stress recall-cost dialog. Leaving the vault (toVault=false)
 * is a recall. Raw `item.update({'system.inVault'})` skips both — do not use it.
 */
export async function moveDomainCard(card, toVault, event) {
  if (!card?.system?.toggleVault) return;
  try {
    return await card.system.toggleVault(event ?? {}, toVault, !toVault);
  } catch (err) {
    console.error("[DHUD] Domain card vault move failed", err);
    ui.notifications?.error("Vault move failed (see console)");
  }
}

/** Post the system's ability-use chat card for an item. toChat REQUIRES the uuid. */
export async function sendToChat(item) {
  if (!item) return;
  try {
    return await item.toChat(item.uuid);
  } catch (err) {
    console.error("[DHUD] Send to chat failed", err);
    ui.notifications?.error("Send to chat failed (see console)");
  }
}

/**
 * Compact display bits for a weapon slot, mirroring the system's
 * DHAttackAction._getLabels: an uppercased range abbreviation ("F", "C", "M"…),
 * the resolved damage formula ("2d6+3"), and the FA icon class(es) for the
 * damage type(s) (physical = fa-hand-fist, magical = fa-wand-sparkles).
 */
export function weaponMeta(weapon) {
  const atk = weapon?.system?.attack;
  const loc = (k) => (k && game.i18n?.has?.(k) ? game.i18n.localize(k) : (k ? game.i18n?.localize?.(k) ?? "" : ""));
  if (!atk) return { range: "", rangeLabel: "", damage: "", damageLabel: "", damageIcons: [] };

  const rid = atk.range;
  const rangeCfg = CONFIG?.DH?.GENERAL?.range?.[rid];
  const range = String(rangeCfg?.short ?? "").toUpperCase();
  const rangeLabel = loc(rangeCfg?.label);

  let damage = "";
  try {
    damage = atk.getDamageFormula?.() ?? atk.damage?.main?.value?.getFormula?.() ?? "";
  } catch (_) { damage = ""; }
  damage = String(damage).replace(/\s+/g, "");
  const damageLabel = loc("DAGGERHEART.GENERAL.damage");

  const types = atk.damage?.main?.type ?? [];
  const damageIcons = Array.from(types)
    .map((t) => {
      const dc = CONFIG?.DH?.GENERAL?.damageTypes?.[t];
      return dc?.icon ? { icon: dc.icon, label: loc(dc.label) } : null;
    })
    .filter(Boolean);

  return { range, rangeLabel, damage, damageLabel, damageIcons };
}

/**
 * True when a feature effect makes this actor ignore weapon burden
 * (`system.rules.burden.ignore`, e.g. Combat Training). A two-handed weapon then
 * counts as one-handed: the off-hand slot stays free for a second weapon / shield.
 */
export function ignoresBurden(actor) {
  return !!actor?.system?.rules?.burden?.ignore;
}

/**
 * Equip / unequip a weapon or armor Item from the HUD. Mirrors the system's
 * CharacterSheet #toggleEquipItem: only one armor at a time, and weapon slots are
 * kept consistent by burden — a two-handed weapon fills both hands, so equipping
 * one clears the off-hand and equipping an off-hand weapon clears a two-handed
 * main-hand. When `system.rules.burden.ignore` is set those two burden rules are
 * skipped, so a two-handed weapon can share the hands with a second weapon.
 */
export async function toggleEquip(actor, item) {
  if (!actor || !item) return;
  try {
    if (item.system?.equipped) {
      return await item.update({ "system.equipped": false });
    }

    if (item.type === "armor") {
      const current = actor.items.find(i => i.type === "armor" && i.system?.equipped === true && i.id !== item.id);
      if (current) await current.update({ "system.equipped": false });
      return await item.update({ "system.equipped": true });
    }

    if (item.type === "weapon") {
      const ignore = ignoresBurden(actor);
      const twoHanded = (b) => b === "twoHanded";
      const weapons = actor.items.filter(i => i.type === "weapon" && i.system?.equipped === true && i.id !== item.id);
      const primary = weapons.find(w => w.system?.secondary !== true) ?? null;
      const secondary = weapons.find(w => w.system?.secondary === true) ?? null;

      if (item.system?.secondary === true) {
        // Equipping an off-hand weapon: always free the existing off-hand; free a
        // two-handed main-hand too unless burden is ignored.
        if (secondary) await secondary.update({ "system.equipped": false });
        if (primary && !ignore && twoHanded(primary.system?.burden)) {
          await primary.update({ "system.equipped": false });
        }
      } else {
        // Equipping a main-hand weapon: always free the existing main-hand; free
        // the off-hand too when the new weapon is two-handed and burden matters.
        if (primary) await primary.update({ "system.equipped": false });
        if (secondary && !ignore && twoHanded(item.system?.burden)) {
          await secondary.update({ "system.equipped": false });
        }
      }
      return await item.update({ "system.equipped": true });
    }
  } catch (err) {
    console.error("[DHUD] Equip toggle failed", err);
    ui.notifications?.error("Equip toggle failed (see console)");
  }
}

/** Fire the actor's unarmed attack. */
export async function useUnarmed(actor, event) {
  const attack = actor?.system?.attack;
  try {
    if (attack?.use) return await attack.use(event ?? {});
  } catch (err) {
    console.error("[DHUD] Unarmed attack failed", err);
  }
  actor?.sheet?.render(true, { focus: true });
  ui.notifications?.info("Open the Unarmed Attack and click Attack");
}

/**
 * Fire a weapon attack for a HUD slot button. Resolves the same weapon the slot shows:
 * data-item-id if present, else the equipped primary/secondary the way _prepareContext picks it.
 */
export async function useWeapon(app, btn, { secondary = false } = {}, event) {
  const actor = app?.actor;
  if (!actor) return;
  if (app._justDraggedTs && (Date.now() - app._justDraggedTs) < 160) return;

  try {
    if ([...game.user.targets].length === 0 && getSetting(S.showTargetNotifications)) {
      ui.notifications?.info("No target selected — the attack will not auto-apply damage.");
    }

    if (btn?.dataset?.unarmed === "true") return await useUnarmed(actor, event);

    let item = btn?.dataset?.itemId ? actor.items.get(btn.dataset.itemId) : null;
    if (!item) {
      const equipped = actor.items.filter(i => i.type === "weapon" && i.system?.equipped === true);
      if (secondary) {
        const primaryId = app.element?.querySelector("[data-action='roll-primary']")?.dataset?.itemId ?? null;
        item = equipped.find(w => w.system?.secondary === true)
            ?? equipped.find(w => w.id && w.id !== primaryId)
            ?? null;
      } else {
        item = equipped.find(w => w.system?.secondary !== true) ?? null;
      }
    }
    if (!item) return void ui.notifications?.warn(secondary ? "No secondary weapon found" : "No primary weapon found");

    const attack = item.system?.attack;
    if (attack?.use) return await attack.use(event ?? {});
    if (item.use)    return await item.use(event ?? {});
    item.sheet?.render(true, { focus: true });
    ui.notifications?.info("Open the weapon and click Attack");
  } catch (err) {
    console.error("[DHUD] Weapon roll failed", err);
    ui.notifications?.error("Weapon roll failed (see console)");
  }
}
