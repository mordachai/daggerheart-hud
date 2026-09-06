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
