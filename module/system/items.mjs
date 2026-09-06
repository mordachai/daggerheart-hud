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
