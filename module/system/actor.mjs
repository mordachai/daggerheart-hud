// module/system/actor.mjs
// Actor-level Daggerheart calls. Trait / reaction rolls go through the real dice API
// (actor.rollTrait -> actor.diceRoll -> DualityRoll) instead of posting "/dr ..." as
// chat text, which only produced a button the user then had to click.
// See docs/daggerheart-system-api.md §3.

/** Roll a trait (duality) or a reaction roll for that trait. */
export async function rollTrait(actor, traitKey, { reaction = false } = {}) {
  if (!actor || !traitKey) return;
  try {
    return await actor.rollTrait(traitKey, reaction ? { actionType: "reaction" } : {});
  } catch (err) {
    console.error("[DHUD] Trait roll failed", err);
    ui.notifications?.error("Trait roll failed (see console)");
  }
}

/**
 * The party actors this actor belongs to. The system registers each member on
 * `actor.parties` (a Set) from the party's `prepareBaseData`.
 */
export function getParties(actor) {
  return actor ? Array.from(actor.parties ?? []) : [];
}

/** The companion Actor linked to this character (`system.companion` UUID field), or null. */
export function getCompanion(actor) {
  const c = actor?.system?.companion;
  return (c && typeof c === "object") ? c : null;
}

/** Open the sheet of the party this actor is in (prefers the active party when in several). */
export function openPartySheet(actor) {
  const parties = getParties(actor);
  if (!parties.length) {
    ui.notifications?.warn("This character is not part of a party.");
    return;
  }
  const active = game.actors?.party ?? null;
  const target = (active && parties.includes(active)) ? active : parties[0];
  target?.sheet?.render(true, { focus: true });
}

/** Open the linked companion's sheet. */
export function openCompanionSheet(actor) {
  const companion = getCompanion(actor);
  if (!companion) {
    ui.notifications?.warn("This character has no linked companion.");
    return;
  }
  companion.sheet?.render(true, { focus: true });
}

/**
 * Mark or clear one armor slot. Delegates to the system's own
 * `actor.system.updateArmorValue`, which distributes the mark across whichever
 * armor sources are active — an equipped item, or an Active-Effect-granted score
 * with no item (e.g. the Valor "Bare Bones" ability, issue #17). Reimplementing
 * that distribution here (as the HUD used to, by writing straight to the
 * equipped armor item) would duplicate system logic and break for sourceless grants.
 */
export async function applyArmorMark(actor, delta) {
  const { value = 0, max = 0 } = actor?.system?.armorScore ?? {};
  if (delta > 0 && value >= max) return;
  if (delta < 0 && value <= 0) return;
  try {
    await actor.system.updateArmorValue({ value: delta });
  } catch (err) {
    console.error("[DHUD] Failed to update armor", err);
    ui.notifications?.error("Failed to update armor");
  }
}
