// module/hud/context/effects.mjs
// Effects section of the Features tab (GH #15): every applicable ActiveEffect
// (actor's own + item-transferred grants) with a minimal toggle affordance.

import { listActiveEffects } from "../../system/effects.mjs";

export function collectEffects(app) {
  return { effectsList: listActiveEffects(app.actor) };
}
