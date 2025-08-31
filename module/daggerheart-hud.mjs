// module/daggerheart-hud.mjs
import { DaggerheartActorHUD } from "./apps/dh-actor-hud.mjs";
import { registerDHUDHelpers } from "./helpers/handlebars-helpers.mjs";


const TEMPLATE_PATHS = [
  "modules/daggerheart-hud/templates/actor/hud-character.hbs"
];

export const DHUD = { ID: "daggerheart-hud", templates: TEMPLATE_PATHS };

Hooks.once("init", () => {
  registerDHUDHelpers();
});

Hooks.once("ready", async () => {
  // ✅ V13+: usar namespace oficial para loadTemplates
  await foundry.applications.handlebars.loadTemplates(DHUD.templates);
  console.log(`${DHUD.ID} | templates preloaded`);
});

let _hudApp;

const isDaggerheartPC = (token) => {
  const a = token?.actor;
  return a && a.type === "character" && game.system?.id === "daggerheart";
};

Hooks.on("controlToken", async (token, controlled) => {
  if (!controlled || !isDaggerheartPC(token)) {
    if (_hudApp) { _hudApp.close({ force: true }); _hudApp = null; }
    return;
  }
  if (_hudApp) await _hudApp.close({ force: true });

  // ✅ Application V2
  _hudApp = new DaggerheartActorHUD({ actor: token.actor, token: token.document });
  _hudApp.render(true);
});

//Hooks.on("canvasPan", () => _hudApp?.close({ force: true }));

Hooks.on("deleteToken", (scene, tokenDoc) => {
  const t = canvas.tokens?.controlled[0];
  if (!t || t.id === tokenDoc.id) _hudApp?.close({ force: true });
});

/** Snapshot current HUD layout (position + wings). */
function dhudCaptureLayout() {
  const app = _hudApp;
  const el = app?.element;
  if (!el) return null;

  const shell = el.querySelector(".dhud");
  const style = el.style;

  // Determine if we’re anchored at bottom or free-dragged
  const mode = (style.bottom && style.bottom !== "auto") ? "bottom" : "free";

  return {
    mode,                           // "bottom" | "free"
    left: style.left || "",
    top:  style.top  || "",
    bottom: style.bottom || "",
    wings: shell?.getAttribute("data-wings") || "closed"
  };
}

/** Re-apply a previously captured layout snapshot. */
function dhudRestoreLayout(snapshot) {
  if (!snapshot) return;
  const app = _hudApp;
  const el = app?.element;
  if (!el) return;

  const shell = el.querySelector(".dhud");
  if (shell && snapshot.wings) shell.setAttribute("data-wings", snapshot.wings);

  const style = el.style;
  if (snapshot.mode === "bottom") {
    // Re-anchor at bottom: set bottom + left, clear top
    style.bottom = snapshot.bottom || "110px"; // default safety
    style.top = "auto";
    style.left = snapshot.left || "";
  } else {
    // Free-dragged: set top + left, clear bottom
    style.bottom = "auto";
    style.top = snapshot.top || "";
    style.left = snapshot.left || "";
  }
}

// ====== HUD REFRESH WATCHERS (actor + embedded docs) ======
/** Queue a single re-render (collapse bursts of updates) and preserve layout. */
function dhudRequestRender() {
  if (!_hudApp) return;
  if (_hudApp._renderQueued) return;
  _hudApp._renderQueued = true;

  // Capture current layout before HTML is replaced
  const snap = dhudCaptureLayout();

  (async () => {
    try {
      await _hudApp.render(false);    // re-render the app
    } finally {
      _hudApp._renderQueued = false;
      // Restore layout immediately after new HTML is in place
      dhudRestoreLayout(snap);
    }
  })();
}

/** Actor paths that should rerender the HUD when changed. */
const DHUD_ACTOR_PATHS = [
  // portrait / token
  "img",
  "prototypeToken.texture.src",
  // resources
  "system.resources.hitPoints",
  "system.resources.stress",
  "system.resources.hope",
  // traits
  "system.traits",
  // defenses / thresholds / misc
  "system.proficiency",
  "system.evasion",
  "system.armorScore",
  "system.damageThresholds",
  "system.resistance"
];

/** Should the HUD rerender given an actor change payload? */
function dhudActorChangeRelevant(changes) {
  return DHUD_ACTOR_PATHS.some((p) => foundry.utils.hasProperty(changes, p));
}

Hooks.on("updateActor", (actor, changes) => {
  if (!_hudApp?.actor || _hudApp.actor.id !== actor.id) return;

  // render if explicit paths matched OR if the payload contains "system"
  const touchedSystem = Object.prototype.hasOwnProperty.call(changes, "system");
  if (dhudActorChangeRelevant(changes) || touchedSystem) dhudRequestRender();
});

// Embedded item lifecycle — any change can affect derived values (evasion/thresholds, etc.)
Hooks.on("createItem", (item) => {
  const parent = item?.parent;
  if (_hudApp?.actor && parent && parent.id === _hudApp.actor.id) dhudRequestRender();
});

Hooks.on("updateItem", (item, _changes) => {
  const parent = item?.parent;
  if (_hudApp?.actor && parent && parent.id === _hudApp.actor.id) dhudRequestRender();
});

Hooks.on("deleteItem", (item) => {
  const parent = item?.parent;
  if (_hudApp?.actor && parent && parent.id === _hudApp.actor.id) dhudRequestRender();
});

// Effects can modify derived values (e.g., evasion/resistances) indirectly.
// Cheap approach: refresh if an effect on our actor is added/removed/updated.
Hooks.on("createActiveEffect", (effect) => {
  if (effect?.parent?.id === _hudApp?.actor?.id) dhudRequestRender();
});
Hooks.on("deleteActiveEffect", (effect) => {
  if (effect?.parent?.id === _hudApp?.actor?.id) dhudRequestRender();
});
Hooks.on("updateActiveEffect", (effect, _changes) => {
  if (effect?.parent?.id === _hudApp?.actor?.id) dhudRequestRender();
});

// Character switch or token control already handled elsewhere, keep those hooks as-is.




