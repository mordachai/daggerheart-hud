// module/hud/eligibility.mjs
// Which actors/tokens may get a HUD (and therefore HUD flags / position writes).
// Players can end up controlling GM-made character-type actors (puzzle pieces, Item Piles
// containers, …) — those must not pop the HUD. The GM is never filtered (except piles),
// so they can click through any character to test.

const HUD_ACTOR_TYPES = ["character", "companion"];

/** Actor flagged by Item Piles as a pile / merchant. */
function isItemPile(actor) {
  return !!actor?.flags?.["item-piles"]?.data?.enabled;
}

/**
 * True when a non-GM user is tied to the actor: it is their assigned character, or they
 * hold an *explicit* OWNER entry. The `default` ownership is ignored on purpose — a puzzle
 * token made movable by everyone gets OWNER through `default`, which does not make it a PC.
 */
function hasPlayerUser(actor) {
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  return game.users.some((u) => {
    if (u.isGM) return false;
    return u.character?.id === actor.id || (actor.ownership?.[u.id] ?? 0) >= OWNER;
  });
}

/** Actor is a Daggerheart character / companion that should get a HUD for the current user. */
export function isPlayerCharacterActor(actor) {
  if (game.system?.id !== "daggerheart") return false;
  if (!actor || !HUD_ACTOR_TYPES.includes(actor.type)) return false;
  if (isItemPile(actor)) return false;
  return game.user.isGM || hasPlayerUser(actor);
}

/** Token whose actor is HUD-eligible for the current user. */
export function isPlayerCharacterToken(token) {
  return isPlayerCharacterActor(token?.actor);
}
