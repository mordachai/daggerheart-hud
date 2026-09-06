// module/hud/context/traits.mjs
// The six traits (ordered, localized, spellcasting flag) + experiences.
// Step 10: trait names/verbs come from system/config.mjs traits() (CONFIG.DH.ACTOR
// .abilities) instead of the deleted i18n Ltrait/Lpath guesswork.

import { traits as configTraits } from "../../system/config.mjs";

export function collectTraits(app) {
  const sys = app.actor?.system ?? {};

  // Determine the spellcasting trait key (prefer subclass, then class)
  let spellcastingTraitKey = null;
  if (app.actor?.items) {
    const subclass = app.actor.items.find(i => i.type === "subclass" && i.system?.spellcastingTrait);
    const klass    = app.actor.items.find(i => i.type === "class"    && i.system?.spellcastingTrait);
    spellcastingTraitKey = subclass?.system?.spellcastingTrait || klass?.system?.spellcastingTrait || null;
  }

  // === TRAITS (ordered + localized via system/config.mjs) ===
  const traits = configTraits().map(({ key, name, description }) => ({
    key,
    name,                         // e.g., "Agility"
    value: Number(sys.traits?.[key]?.value ?? 0),
    description,                  // e.g., "Sprint, Leap, Maneuver"
    isSpellcasting: key === spellcastingTraitKey
  }));

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
