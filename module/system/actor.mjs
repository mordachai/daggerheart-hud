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
