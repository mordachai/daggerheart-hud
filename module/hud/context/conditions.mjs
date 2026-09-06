// module/hud/context/conditions.mjs
// Active status effects (portrait row) + the available-conditions grid.
// Step 7: the available-conditions list now comes from system/conditions.mjs
// (real CONFIG.statusEffects enumeration, split on `systemEffect`). This file
// only shapes the actor's currently-active ActiveEffects for display.

import { listConditions } from "../../system/conditions.mjs";

export function collectConditions(app) {
  const actor = app.actor;

  // === ACTIVE STATUS EFFECTS ===
  const statusEffects = [];
  for (const effect of (actor?.effects ?? [])) {
    if (effect.disabled) continue;

    statusEffects.push({
      id: effect.id,
      name: effect.name,
      img: effect.img || "icons/svg/aura.svg",
      statuses: effect.statuses || [],
      isTemporary: effect.duration?.rounds !== null || effect.duration?.turns !== null
    });
  }

  // === AVAILABLE CONDITIONS ===
  const { availableConditions, showGenericStatusSection } = listConditions(actor);

  return { statusEffects, availableConditions, showGenericStatusSection };
}
