// module/hud/refresh.mjs
// Which actor changes are worth a HUD re-render. Moved out of the entry file in
// refactor step 10 so daggerheart-hud.mjs is only hook wiring + lifecycle.

/** Actor paths that should rerender the HUD when changed. */
export const DHUD_ACTOR_PATHS = [
  // portrait / token
  "img",
  "prototypeToken.texture.src",
  // resources
  "system.resources.hitPoints",
  "system.resources.stress",
  "system.resources.hope",
  "system.resources.armor",
  // traits
  "system.traits",
  // defenses / thresholds / misc
  "system.proficiency",
  "system.evasion",
  "system.armorScore",
  "system.damageThresholds",
  "system.resistance"
];

/** Should the HUD rerender given an `updateActor` change payload? */
export function dhudActorChangeRelevant(changes) {
  if (Object.prototype.hasOwnProperty.call(changes, "system")) return true;
  return DHUD_ACTOR_PATHS.some((p) => foundry.utils.hasProperty(changes, p));
}
