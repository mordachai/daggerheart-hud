// module/hud/context/resources.mjs
// HP, stress, hope (+pips), armor marks, damage thresholds, evasion, proficiency,
// resistance. Extracted verbatim from _prepareContext in refactor step 4.
// Step 12: also collects homebrew / feature-granted "extra" resources via
// system/resources.mjs (actor.system.availableExtraResources).

import { listActorResources } from "../../system/resources.mjs";
import { massiveDamageEnabled } from "../../system/config.mjs";

export function collectResources(app) {
  const sys = app.actor?.system ?? {};

  // === RESOURCES (exact system paths) ===
  const hitPoints = {
    // system.resources.hitPoints.{value,max,isReversed}
    value: sys.resources?.hitPoints?.value ?? 0,
    max:   sys.resources?.hitPoints?.max   ?? 0,
    isReversed: !!sys.resources?.hitPoints?.isReversed
  };

  const isDying = hitPoints.value >= hitPoints.max;

  const stress = {
    // system.resources.stress.{value,max,isReversed}
    value: sys.resources?.stress?.value ?? 0,
    max:   sys.resources?.stress?.max   ?? 0,
    isReversed: !!sys.resources?.stress?.isReversed
  };

  // === HOPE ===
  const rawValue = sys.resources?.hope?.value ?? 0;
  const rawMax   = sys.resources?.hope?.max   ?? 0;
  const hopeMax  = Math.max(0, Number(rawMax));
  const hopeValue= Math.min(hopeMax, Math.max(0, Number(rawValue)));

  const hopePips = Array.from({ length: hopeMax }, (_, i) => ({
    filled: i < hopeValue
  }));

  // === PROFICIENCY / DEFENSES ===
  const proficiency = sys.proficiency ?? 0;
  const evasion     = sys.evasion     ?? 0;

  // === ARMOR ===
  // actor.system.armorScore is the post-effects source of truth for both the
  // score (max) and current marks (value) — it accounts for Active Effects that
  // grant armor without an equipped item (e.g. the Valor "Bare Bones" ability),
  // not just the equipped armor item's own fields. See issue #17.
  const equippedArmor = (app.actor?.items ?? []).find(item =>
    item.type === "armor" && item.system?.equipped === true
  );
  const actorScore = app.actor?.system?.armorScore;
  const effectiveMax = Math.max(0, Number(actorScore?.max ?? 0));
  const marks = Math.max(0, Math.min(effectiveMax, Number(actorScore?.value ?? 0)));

  const armor = {
    max:   effectiveMax,      // Total armor slots (post-effects)
    value: marks,             // We keep the inverted UX: value === DAMAGE MARKS
    marks: marks,             // Damage marks taken
    isReversed: false,        // Armor doesn't use isReversed like HP/Stress
    name: equippedArmor?.name ?? "",
    itemId: equippedArmor?.id ?? null,
    hasArmor: !!equippedArmor
  };

  // === DAMAGE THRESHOLDS ===
  // Massive tier (severe * 2) only when the GM enabled the "Massive Damage"
  // variant rule; matches Actor#convertDamageToThreshold in the system.
  const severeThreshold = sys.damageThresholds?.severe ?? 0;
  const thresholds = {
    major:  sys.damageThresholds?.major  ?? 0,
    severe: severeThreshold,
    massive: massiveDamageEnabled() ? severeThreshold * 2 : 0
  };

  // === RESISTANCE ===
  const resistance = {
    physical: {
      resistance: !!sys.resistance?.physical?.resistance,
      immunity:   !!sys.resistance?.physical?.immunity,
      reduction:  sys.resistance?.physical?.reduction ?? 0
    },
    magical: {
      resistance: !!sys.resistance?.magical?.resistance,
      immunity:   !!sys.resistance?.magical?.immunity,
      reduction:  sys.resistance?.magical?.reduction ?? 0
    }
  };

  // === EXTRA RESOURCES (homebrew + feature-granted optional) ===
  const extraResources = listActorResources(app.actor);

  return {
    hitPoints,
    isDying,
    stress,
    hope: { value: hopeValue, max: hopeMax },
    hopePips,
    evasion,
    armor,
    thresholds,
    proficiency,
    resistance,
    extraResources
  };
}
