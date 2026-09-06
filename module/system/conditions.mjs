// module/system/conditions.mjs
// The only place that knows how Daggerheart conditions / status effects work.
//
// Enumeration: CONFIG.statusEffects, split on the `systemEffect` flag. On `setup`
// daggerheart.mjs rebuilds CONFIG.statusEffects = core effects + every
// CONFIG.DH.GENERAL.conditions() entry, each tagged `systemEffect: true`. So:
//   - systemEffect === true  -> Daggerheart condition
//   - systemEffect falsy     -> generic Foundry effect (only shown when the
//                               system's Appearance.showGenericStatusEffects is on)
//
// Toggle: actor.toggleStatusEffect(id, { active }) — never hand-roll
// createEmbeddedDocuments('ActiveEffect', ...) with a custom flag.
// See docs/daggerheart-system-api.md §7.

/** Set of status ids currently active on the actor. */
function activeStatusIds(actor) {
  if (actor?.statuses instanceof Set) return actor.statuses;
  const ids = new Set();
  for (const e of (actor?.effects ?? [])) {
    if (e.disabled) continue;
    for (const s of (e.statuses ?? [])) ids.add(s);
  }
  return ids;
}

/** True if the status id is active on the actor. */
export function isActive(actor, id) {
  return !!id && activeStatusIds(actor).has(id);
}

/** Is this status entry allowed on the HUD for this actor type? (tokenHUD parity) */
function shownOnHud(status, actor) {
  const hud = status.hud;
  if (hud === false) return false;
  if (hud && Array.isArray(hud.actorTypes) && actor?.type) {
    return hud.actorTypes.includes(actor.type);
  }
  return true;
}

/**
 * Available conditions for the grid. Daggerheart conditions always; generic Foundry
 * effects only when the system setting allows. Flat list with `source`
 * ('daggerheart' | 'foundry') to match the template.
 */
export function listConditions(actor) {
  const active = activeStatusIds(actor);

  let showGeneric = false;
  try {
    showGeneric = !!game.settings.get("daggerheart", "Appearance")?.showGenericStatusEffects;
  } catch (_) { /* setting not registered yet */ }

  const immunities = actor?.system?.rules?.conditionImmunities ?? {};
  const availableConditions = [];

  for (const status of (CONFIG.statusEffects ?? [])) {
    const isDH = status.systemEffect === true;
    if (!isDH && !showGeneric) continue;
    if (!shownOnHud(status, actor)) continue;

    availableConditions.push({
      id: status.id,
      name: status.name,                              // i18n key
      img: status.img || status.icon || "icons/svg/aura.svg",
      description: status.description || "",          // i18n key or ""
      isActive: active.has(status.id),
      immune: !!immunities[status.id],
      source: isDH ? "daggerheart" : "foundry"
    });
  }

  return { availableConditions, showGenericStatusSection: showGeneric };
}

/** Add / remove a status on the actor. `active` omitted -> plain toggle. */
export async function toggle(actor, id, active) {
  if (!actor || !id) return;
  try {
    return await actor.toggleStatusEffect(id, active === undefined ? {} : { active });
  } catch (err) {
    console.error("[DHUD] Toggle condition failed", err);
    ui.notifications?.error("Toggle condition failed (see console)");
  }
}
