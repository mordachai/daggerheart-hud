// module/hud/context/traits.mjs
// The six traits (ordered, localized, spellcasting flag) + experiences.
// Extracted verbatim from _prepareContext in refactor step 4 — no behaviour change.

import { Ltrait } from "../../helpers/i18n.mjs";

export function collectTraits(app) {
  const sys = app.actor?.system ?? {};

  // Determine the spellcasting trait key (prefer subclass, then class)
  let spellcastingTraitKey = null;
  if (app.actor?.items) {
    const subclass = app.actor.items.find(i => i.type === "subclass" && i.system?.spellcastingTrait);
    const klass    = app.actor.items.find(i => i.type === "class"    && i.system?.spellcastingTrait);
    spellcastingTraitKey = subclass?.system?.spellcastingTrait || klass?.system?.spellcastingTrait || null;
  }

  // === TRAITS (ordered + localized via i18n helper) ===
  const TRAIT_ORDER = ["agility","strength","finesse","instinct","presence","knowledge"];

  const traits = TRAIT_ORDER.map(key => {
    const value = Number(sys.traits?.[key]?.value ?? 0);
    const loc = Ltrait(key); // { name, verbs[], description }
    return {
      key,
      name: loc.name,           // e.g., "Agility"
      value,                    // e.g., 2
      description: loc.description, // e.g., "Sprint, Leap, Maneuver"
      isSpellcasting: key === spellcastingTraitKey
    };
  });

  // === EXPERIENCES ===
  const experiences = [];
  const rawExperiences = sys.experiences ?? {};
  for (const [id, exp] of Object.entries(rawExperiences)) {
    if (!exp || typeof exp !== 'object') continue;
    experiences.push({
      id: id,
      key: id,
      name: exp.name || "Unnamed",
      value: Number(exp.value ?? 0),
      core: !!exp.core,
      description: exp.description || ""
    });
  }

  return { traits, experiences };
}
