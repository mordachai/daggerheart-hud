// module/hud/context/conditions.mjs
// Active status effects + the available-conditions list (Daggerheart conditions, plus
// generic Foundry ones when the system setting allows). Extracted verbatim from
// _prepareContext in refactor step 4 — step 7 routes this through the system API.

export function collectConditions(app) {
  // === ACTIVE STATUS EFFECTS ===
  const activeStatuses = new Set();
  const statusEffects = [];

  for (const effect of (app.actor?.effects ?? [])) {
    if (effect.disabled) continue;

    // Track which statuses are currently active
    if (effect.statuses?.length) {
      effect.statuses.forEach(status => activeStatuses.add(status));
    }

    statusEffects.push({
      id: effect.id,
      name: effect.name,
      img: effect.img || "icons/svg/aura.svg",
      statuses: effect.statuses || [],
      isTemporary: effect.duration?.rounds !== null || effect.duration?.turns !== null
    });
  }

  // === AVAILABLE CONDITIONS ===
  const daggerheartConditions = [];
  const genericConditions = [];

  // Get Daggerheart-specific conditions first
  const dhConditions = CONFIG.DH?.GENERAL?.conditions || {};
  Object.values(dhConditions).forEach(condition => {
    daggerheartConditions.push({
      id: condition.id,
      name: condition.name, // This is an i18n key
      img: condition.img,
      description: condition.description, // Also an i18n key
      isActive: activeStatuses.has(condition.id),
      source: 'daggerheart'
    });
  });

  // Only add generic Foundry conditions if the system setting allows it
  const showGenericStatuses = game.settings.get('daggerheart', 'Appearance').showGenericStatusEffects;
  if (showGenericStatuses) {
    CONFIG.statusEffects
      .filter(effect => !effect.systemEffect)
      .forEach(effect => {
        genericConditions.push({
          id: effect.id,
          name: effect.name, // i18n key
          img: effect.img,
          description: effect.description || "",
          isActive: activeStatuses.has(effect.id),
          source: 'foundry'
        });
      });
  }

  const availableConditions = [...daggerheartConditions, ...genericConditions];

  return {
    statusEffects,
    availableConditions,
    showGenericStatusSection: showGenericStatuses
  };
}
