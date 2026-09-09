// module/daggerheart-hud.mjs
import { registerSettings, getSetting, S } from "./settings.mjs";
import { DaggerheartActorHUD } from "./apps/dh-actor-hud.mjs";
import { registerDHUDHelpers } from "./helpers/handlebars-helpers.mjs";
import { DHUD } from "./constants.mjs";
import { captureLayout, restoreLayout, requestRender } from "./hud/layout.mjs";
import { announceButtonRegistration } from "./hud/custom-buttons.mjs";
import { dhudActorChangeRelevant } from "./hud/refresh.mjs";
import { applyAppearance, previewAppearance } from "./hud/appearance.mjs";

// Re-exported so existing importers keep working (single source: constants.mjs).
export { DHUD };

Hooks.once("init", registerSettings);

Hooks.once("init", () => {
  registerDHUDHelpers();
});

Hooks.once("ready", async () => {
  await foundry.applications.handlebars.loadTemplates(DHUD.templates);
  announceButtonRegistration();
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
    _lastHudLayout = captureLayout(_hudApp);
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
        restoreLayout(_hudApp, _lastHudLayout);
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
  } else if (key === S.hudTheme) {
    dhudRequestRender();
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

// Live theme preview: react to the settings dropdown before "Save Changes".
Hooks.on("renderSettingsConfig", (_app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const sel = root?.querySelector('[name="daggerheart-hud.hudTheme"]');
  if (!sel) return;
  sel.addEventListener("change", () => {
    if (_hudApp?.element) previewAppearance(_hudApp.element, sel.value);
  });
});
// On close, snap back to the actually-saved theme (no-op if it was saved).
Hooks.on("closeSettingsConfig", () => {
  if (_hudApp?.element) applyAppearance(_hudApp.element);
});

//Hooks.on("canvasPan", () => _hudApp?.close({ force: true }));

Hooks.on("deleteToken", (tokenDoc) => {
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

// ====== HUD REFRESH WATCHERS (actor + embedded docs) ======
/** Queue a single re-render (collapse bursts of updates) and preserve layout. */
function dhudRequestRender() {
  requestRender(_hudApp);
}

Hooks.on("updateActor", (actor, changes) => {
  if (!_hudApp?.actor || _hudApp.actor.id !== actor.id) return;
  // Skip re-render while the HUD is writing an inline value (money strip, qty inputs)
  if (_hudApp._updatingQuantity) return;
  if (dhudActorChangeRelevant(changes)) dhudRequestRender();
});

// Daggerheart homebrew settings feed the HUD (custom domains, extra resources,
// maxHope/maxLoadout, currency, rest moves). Re-render when the GM edits them.
Hooks.on("updateSetting", (setting) => {
  if (setting?.key === "daggerheart.Homebrew") dhudRequestRender();
});

// Embedded item lifecycle – any change can affect derived values (evasion/thresholds, etc.)
Hooks.on("createItem", (item) => {
  const parent = item?.parent;
  if (_hudApp?.actor && parent && parent.id === _hudApp.actor.id) dhudRequestRender();
});

Hooks.on("updateItem", (item, changes) => {
  const parent = item?.parent;
  if (_hudApp?.actor && parent && parent.id === _hudApp.actor.id) {
    // Skip re-render during quantity updates OR if only system fields changed (ignore _stats and _id)
    const systemKeys = Object.keys(changes).filter(key => !key.startsWith('_'));
    const isOnlySystemChange = systemKeys.length === 1 && systemKeys[0] === 'system';
    
    const isSimpleResourceUpdate = isOnlySystemChange && (
      Object.keys(changes.system).length === 1 && (
        changes.system.quantity !== undefined ||
        (changes.system.uses && Object.keys(changes.system.uses).length === 1 && changes.system.uses.value !== undefined) ||
        (changes.system.resource && Object.keys(changes.system.resource).length === 1 && changes.system.resource.value !== undefined)
      )
    );
    
    if (_hudApp._updatingQuantity || isSimpleResourceUpdate) {
      return;
    }
    
    dhudRequestRender();
  }
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