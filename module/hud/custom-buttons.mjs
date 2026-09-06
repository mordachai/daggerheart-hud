// module/hud/custom-buttons.mjs
// Registry for third-party HUD buttons. Extracted from dh-actor-hud.mjs in refactor
// step 2. The public entry point stays `DaggerheartActorHUD.registerCustomButton`,
// which delegates here.

import { HOOKS } from "../constants.mjs";

/** id -> { section, icon, title, handler, condition } */
const registry = new Map();

/** Register a custom button. Invalid configs are ignored (warned). */
export function registerCustomButton(config) {
  const { id, section, icon, title, handler, condition } = config ?? {};

  if (!id || !section || !handler) {
    console.warn("[DHUD] Invalid button config:", config);
    return;
  }

  registry.set(id, { section, icon, title, handler, condition });
}

/** Look up a registered button by id. */
export function getCustomButton(id) {
  return registry.get(id);
}

/** All buttons for a section whose condition (if any) passes for `actor`. */
export function collectCustomButtons(section, actor) {
  const out = [];
  for (const [id, config] of registry) {
    if (config.section !== section) continue;
    if (!config.condition || config.condition(actor)) out.push({ id, ...config });
  }
  return out;
}

/** Fire the one-time hook other modules listen to in order to register buttons. */
export function announceButtonRegistration() {
  Hooks.callAll(HOOKS.registerButtons);
}
