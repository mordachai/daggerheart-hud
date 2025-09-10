// module/daggerheart-hud.mjs
import { registerSettings, getSetting, S } from "./settings.mjs";
import { DaggerheartActorHUD } from "./apps/dh-actor-hud.mjs";
import { registerDHUDHelpers } from "./helpers/handlebars-helpers.mjs";

const TEMPLATE_PATHS = [
  "modules/daggerheart-hud/templates/actor/hud-character.hbs"
];

export const DHUD = { ID: "daggerheart-hud", templates: TEMPLATE_PATHS };

Hooks.once("init", registerSettings);

Hooks.once("init", () => {
  registerDHUDHelpers();
});

Hooks.once("ready", async () => {
  // Use namespace oficial para loadTemplates
  await foundry.applications.handlebars.loadTemplates(DHUD.templates);
});

let _hudApp;

const isDaggerheartPC = (token) => {
  const a = token?.actor;
  return a && a.type === "character" && game.system?.id === "daggerheart";
};

// Function to get the player's primary character
function getPlayerCharacter() {
  if (game.user.isGM) return null; // GMs don't get persistent HUD
  
  // Find the character the player owns
  const ownedCharacters = game.actors.filter(actor => 
    actor.type === "character" && 
    actor.testUserPermission(game.user, "OWNER")
  );
  
  // Return the first owned character, or null if none
  return ownedCharacters[0] || null;
}

// Global variable to store the last layout state
let _lastHudLayout = null;

function createOrUpdateHUD(actor = null, token = null) {
  // Capture current layout before closing
  if (_hudApp) {
    _lastHudLayout = dhudCaptureLayout();
    _hudApp.close({ force: true });
    _hudApp = null;
  }
  
  // Check if HUD is disabled for this user
  if (getSetting(S.disableForMe)) return;
  
  // For non-GMs, always try to show their character's HUD if setting enabled
  if (!game.user.isGM && !actor && getSetting(S.alwaysVisible)) {
    actor = getPlayerCharacter();
  }
  
  // Only create HUD if we have an actor
  if (actor) {
    _hudApp = new DaggerheartActorHUD({ actor, token });
    
    // Hide during initial render if we have a layout to restore
    if (_lastHudLayout) {
      _hudApp._initiallyHidden = true;
    }
    
    _hudApp.render(true);
    
    // Restore layout and show after DOM is ready
    if (_lastHudLayout) {
      setTimeout(() => {
        dhudRestoreLayout(_lastHudLayout);
        if (_hudApp?.element) {
          _hudApp.element.style.visibility = 'visible';
        }
        _lastHudLayout = null;
      }, 50);
    }
  }
}

Hooks.on("controlToken", async (token, controlled) => {
  // Handle multiple token selection - only show HUD for single Daggerheart tokens
  const controlledTokens = canvas.tokens?.controlled || [];
  const daggerheartTokens = controlledTokens.filter(t => isDaggerheartPC(t));
  
  if (controlled && isDaggerheartPC(token)) {
    // Only show HUD if this is the only controlled Daggerheart token
    if (daggerheartTokens.length === 1) {
      createOrUpdateHUD(token.actor, token.document);
    } else {
      // Multiple Daggerheart tokens selected - close HUD to avoid conflicts
      if (_hudApp) {
        _hudApp.close({ force: true });
        _hudApp = null;
      }
    }
  } else if (!controlled) {
    // Token deselected - check remaining controlled tokens
    if (daggerheartTokens.length === 1) {
      // Show HUD for the remaining single Daggerheart token
      const remainingToken = daggerheartTokens[0];
      createOrUpdateHUD(remainingToken.actor, remainingToken.document);
    } else if (daggerheartTokens.length === 0) {
      // No Daggerheart tokens selected
      if (game.user.isGM) {
        // GMs: close the HUD when no token selected
        if (_hudApp) {
          _hudApp.close({ force: true });
          _hudApp = null;
        }
      } else if (getSetting(S.alwaysVisible)) {
        // Players: switch to their default character (if setting enabled)
        createOrUpdateHUD();
      } else {
        // Players with setting disabled: close HUD
        if (_hudApp) {
          _hudApp.close({ force: true });
          _hudApp = null;
        }
      }
    } else {
      // Multiple Daggerheart tokens still selected - keep HUD closed
      if (_hudApp) {
        _hudApp.close({ force: true });
        _hudApp = null;
      }
    }
  } else {
    // Non-Daggerheart token or other cases - close HUD
    if (_hudApp) {
      _hudApp.close({ force: true });
      _hudApp = null;
    }
  }
});

// When the canvas is ready, show player's default character
Hooks.on("canvasReady", () => {
  if (!game.user.isGM && getSetting(S.alwaysVisible)) {
    // For players, show their character HUD immediately
    setTimeout(() => createOrUpdateHUD(), 500); // Small delay to ensure everything is loaded
  }
});

// When user changes (login/logout scenarios)
Hooks.on("userConnected", (user) => {
  if (user.id === game.user.id && !game.user.isGM && getSetting(S.alwaysVisible)) {
    setTimeout(() => createOrUpdateHUD(), 1000);
  }
});

// React to setting changes
Hooks.on("daggerheart-hud:setting-changed", ({ key, value }) => {
  if (key === S.alwaysVisible) {
    if (!game.user.isGM) {
      if (value) {
        // Setting enabled - show player's character if no token selected
        const hasSelectedToken = canvas.tokens?.controlled?.some(t => isDaggerheartPC(t));
        if (!hasSelectedToken) {
          createOrUpdateHUD();
        }
      } else {
        // Setting disabled - close HUD if showing player's default character
        const isShowingOwnedCharacter = _hudApp?.actor && !_hudApp?.token && 
          _hudApp.actor.testUserPermission(game.user, "OWNER");
        if (isShowingOwnedCharacter) {
          _hudApp.close({ force: true });
          _hudApp = null;
        }
      }
    }
  } else if (key === S.disableForMe) {
    if (value && _hudApp) {
      // HUD disabled - close it
      _hudApp.close({ force: true });
      _hudApp = null;
    } else if (!value && !game.user.isGM && getSetting(S.alwaysVisible)) {
      // HUD re-enabled - show player's character
      const hasSelectedToken = canvas.tokens?.controlled?.some(t => isDaggerheartPC(t));
      if (!hasSelectedToken) {
        createOrUpdateHUD();
      }
    }
  }
});

//Hooks.on("canvasPan", () => _hudApp?.close({ force: true }));

Hooks.on("deleteToken", (scene, tokenDoc) => {
  const t = canvas.tokens?.controlled[0];
  if (!t || t.id === tokenDoc.id) {
    if (game.user.isGM) {
      // GM: close HUD when token deleted
      _hudApp?.close({ force: true });
    } else if (getSetting(S.alwaysVisible)) {
      // Player: switch back to their character
      createOrUpdateHUD();
    } else {
      // Player without always visible: close HUD
      _hudApp?.close({ force: true });
    }
  }
});

/** Snapshot current HUD layout (position + wings). */
function dhudCaptureLayout() {
  const app = _hudApp;
  const el = app?.element;
  if (!el) return null;

  const shell = el.querySelector(".dhud");
  const style = el.style;

  // Determine if we're anchored at bottom or free-dragged
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

  const snap = dhudCaptureLayout();

  (async () => {
    try {
      await _hudApp.render(false);
    } finally {
      _hudApp._renderQueued = false;
      dhudRestoreLayout(snap);
      
      // Re-attach drag handlers
      if (_hudApp.reattachDragHandlers) {
        _hudApp.reattachDragHandlers();
      }
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
  "system.resources.armor",  // Add this line

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

// Embedded item lifecycle – any change can affect derived values (evasion/thresholds, etc.)
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