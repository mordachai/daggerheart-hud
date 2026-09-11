// module/constants.mjs
// Single source of truth for the module id, flag keys, template paths and hook names.
// Introduced in refactor step 1. Existing exports (e.g. DHUD) are kept working by
// re-exporting from module/daggerheart-hud.mjs.

export const MODULE_ID = "daggerheart-hud";

/** Handlebars templates preloaded on ready. */
export const TEMPLATE_PATHS = [
  `modules/${MODULE_ID}/templates/actor/hud-character.hbs`
];

/** Flag keys, grouped by the document they live on. */
export const FLAGS = {
  // game.user flags
  user: {
    globalPosition: "globalPosition",
    positionLocked: "positionLocked"
  },
  // ActiveEffect flags
  effect: {
    conditionId: "conditionId"
  }
};

/** Hook names this module emits / listens to. */
export const HOOKS = {
  settingChanged: `${MODULE_ID}:setting-changed`,
  registerButtons: `${MODULE_ID}:registerButtons`
};

/** Legacy shape kept for backwards compatibility. */
export const DHUD = { ID: MODULE_ID, templates: TEMPLATE_PATHS };
