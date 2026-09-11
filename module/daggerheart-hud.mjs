// module/daggerheart-hud.mjs
import { registerSettings, getSetting, S } from "./settings.mjs";
import { DaggerheartActorHUD } from "./apps/dh-actor-hud.mjs";
import { DaggerheartCompanionHUD } from "./apps/dh-companion-hud.mjs";
import { registerDHUDHelpers } from "./helpers/handlebars-helpers.mjs";
import { DHUD } from "./constants.mjs";
import { captureLayout, restoreLayout, requestRender } from "./hud/layout.mjs";
import { announceButtonRegistration } from "./hud/custom-buttons.mjs";
import { dhudActorChangeRelevant } from "./hud/refresh.mjs";
import { applyAppearance, previewAppearance } from "./hud/appearance.mjs";
import { getCompanion } from "./system/actor.mjs";
import { getPartner } from "./system/companion.mjs";
import "./hud/portrait-menu-extras.mjs"; // self-contained: portrait context-menu items for 3rd-party sheet buttons

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

// Two independent slots so a character HUD and its companion HUD can be shown
// at the same time — see docs plan "Simultaneous Character + Companion HUDs".
let _characterHudApp = null;
let _companionHudApp = null;

const isDaggerheartActor = (token) => {
  const a = token?.actor;
  return a && ["character", "companion"].includes(a.type) && game.system?.id === "daggerheart";
};

const slotFor = (type) => (type === "companion" ? "companion" : "character");

function getHudApp(kind) {
  return kind === "companion" ? _companionHudApp : _characterHudApp;
}
function setHudApp(kind, app) {
  if (kind === "companion") _companionHudApp = app;
  else _characterHudApp = app;
}
function forEachHudApp(fn) {
  if (_characterHudApp) fn(_characterHudApp, "character");
  if (_companionHudApp) fn(_companionHudApp, "companion");
}

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

/** The linked actor for the auto-pair setting: a character's companion, or a companion's partner. */
function getLinkedActor(actor) {
  if (!actor) return null;
  if (actor.type === "character") return getCompanion(actor);
  if (actor.type === "companion") return getPartner(actor);
  return null;
}

/** Show/replace a single slot's HUD (or close it if actor is null). */
function createOrUpdateHUDSlot(kind, actor = null, token = null) {
  const existing = getHudApp(kind);
  let lastLayout = null;
  if (existing) {
    lastLayout = captureLayout(existing);
    existing.close({ force: true });
    setHudApp(kind, null);
  }

  if (getSetting(S.disableForMe)) return;
  if (!actor) return;

  const HudClass = kind === "companion" ? DaggerheartCompanionHUD : DaggerheartActorHUD;
  const app = new HudClass({ actor, token });
  setHudApp(kind, app);

  if (lastLayout) app._initiallyHidden = true;
  app.render(true);

  if (lastLayout) {
    setTimeout(() => {
      restoreLayout(app, lastLayout);
      if (app?.element) app.element.style.visibility = "visible";
    }, 50);
  }
}

function closeSlot(kind) {
  const app = getHudApp(kind);
  if (app) {
    app.close({ force: true });
    setHudApp(kind, null);
  }
}

/** Show an actor in its own slot, then (if the setting is on) its linked partner in the other slot. */
function showActorInSlot(actor, token) {
  if (!actor) return;
  createOrUpdateHUDSlot(slotFor(actor.type), actor, token);
  if (getSetting(S.autoShowLinkedHud)) {
    const linked = getLinkedActor(actor);
    if (linked) {
      const linkedToken = linked.getActiveTokens?.()?.[0]?.document ?? null;
      createOrUpdateHUDSlot(slotFor(linked.type), linked, linkedToken);
    }
  }
}

// Backwards-compatible single-actor entry point (used by canvasReady/userConnected/
// deleteToken/setting-changed below): resolves the player's own character and shows
// it (plus its linked companion, if the setting is on).
function createOrUpdateHUD(actor = null, token = null) {
  if (!actor && !game.user.isGM && getSetting(S.alwaysVisible)) {
    actor = getPlayerCharacter();
  }
  if (actor) showActorInSlot(actor, token);
  else closeSlot("character");
}

/** Resolve what a slot's HUD should show from the *currently controlled* tokens of that kind. */
function resolveDirectActor(kind, tokensOfKind) {
  if (tokensOfKind.length === 1) {
    return { actor: tokensOfKind[0].actor, token: tokensOfKind[0].document };
  }
  if (tokensOfKind.length === 0 && kind === "character" && !game.user.isGM && getSetting(S.alwaysVisible)) {
    const fallback = getPlayerCharacter();
    if (fallback) return { actor: fallback, token: null };
  }
  return null;
}

/** Recompute both slots from `canvas.tokens.controlled` — single source of truth for selection state. */
function syncHudsFromSelection() {
  const controlledTokens = canvas.tokens?.controlled || [];
  const characterTokens = controlledTokens.filter(t => isDaggerheartActor(t) && t.actor.type === "character");
  const companionTokens = controlledTokens.filter(t => isDaggerheartActor(t) && t.actor.type === "companion");

  const ambiguousCharacter = characterTokens.length > 1;
  const ambiguousCompanion = companionTokens.length > 1;

  let wantCharacter = ambiguousCharacter ? null : resolveDirectActor("character", characterTokens);
  let wantCompanion = ambiguousCompanion ? null : resolveDirectActor("companion", companionTokens);

  if (getSetting(S.autoShowLinkedHud)) {
    if (!wantCompanion && !ambiguousCompanion && wantCharacter) {
      const linked = getCompanion(wantCharacter.actor);
      if (linked) wantCompanion = { actor: linked, token: linked.getActiveTokens?.()?.[0]?.document ?? null };
    }
    if (!wantCharacter && !ambiguousCharacter && wantCompanion) {
      const linked = getPartner(wantCompanion.actor);
      if (linked) wantCharacter = { actor: linked, token: linked.getActiveTokens?.()?.[0]?.document ?? null };
    }
  }

  if (ambiguousCharacter) closeSlot("character");
  else if (wantCharacter) createOrUpdateHUDSlot("character", wantCharacter.actor, wantCharacter.token);
  else closeSlot("character");

  if (ambiguousCompanion) closeSlot("companion");
  else if (wantCompanion) createOrUpdateHUDSlot("companion", wantCompanion.actor, wantCompanion.token);
  else closeSlot("companion");
}

Hooks.on("controlToken", () => syncHudsFromSelection());

// When the canvas is ready, show player's default character (+ linked companion)
Hooks.on("canvasReady", () => {
  if (!game.user.isGM && getSetting(S.alwaysVisible)) {
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
        const hasSelectedCharacter = canvas.tokens?.controlled?.some(t => isDaggerheartActor(t) && t.actor.type === "character");
        if (!hasSelectedCharacter) createOrUpdateHUD();
      } else {
        // Setting disabled - close the character slot if showing player's default character
        const isShowingOwnedCharacter = _characterHudApp?.actor && !_characterHudApp?.token &&
          _characterHudApp.actor.testUserPermission(game.user, "OWNER");
        if (isShowingOwnedCharacter) closeSlot("character");
      }
    }
  } else if (key === S.autoShowLinkedHud) {
    syncHudsFromSelection();
  } else if (key === S.hudTheme) {
    dhudRequestRender();
  } else if (key === S.disableForMe) {
    if (value) {
      // HUD disabled - close both slots
      closeSlot("character");
      closeSlot("companion");
    } else {
      // HUD re-enabled - resync from current selection (covers alwaysVisible too)
      syncHudsFromSelection();
    }
  }
});

// Live theme preview: react to the settings dropdown before "Save Changes".
Hooks.on("renderSettingsConfig", (_app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const sel = root?.querySelector('[name="daggerheart-hud.hudTheme"]');
  if (!sel) return;
  sel.addEventListener("change", () => {
    forEachHudApp((app) => { if (app.element) previewAppearance(app.element, sel.value); });
  });
});
// On close, snap back to the actually-saved theme (no-op if it was saved).
Hooks.on("closeSettingsConfig", () => {
  forEachHudApp((app) => { if (app.element) applyAppearance(app.element); });
});

Hooks.on("deleteToken", (tokenDoc) => {
  const t = canvas.tokens?.controlled[0];
  if (!t || t.id === tokenDoc.id) {
    if (game.user.isGM) {
      // GM: close both HUDs when the token is deleted
      closeSlot("character");
      closeSlot("companion");
    } else if (getSetting(S.alwaysVisible)) {
      // Player: switch back to their character
      createOrUpdateHUD();
    } else {
      // Player without always visible: close both HUDs
      closeSlot("character");
      closeSlot("companion");
    }
  }
});

// ====== HUD REFRESH WATCHERS (actor + embedded docs) ======
/** Queue a re-render for whichever open slot(s) match an actor id (or all open slots if omitted). */
function dhudRequestRender(actorId = null) {
  forEachHudApp((app) => {
    if (!actorId || app.actor?.id === actorId) requestRender(app);
  });
}

Hooks.on("updateActor", (actor, changes) => {
  forEachHudApp((app) => {
    if (!app.actor || app.actor.id !== actor.id) return;
    // Skip re-render while the HUD is writing an inline value (money strip, qty inputs)
    if (app._updatingQuantity) return;
    if (dhudActorChangeRelevant(changes)) requestRender(app);
  });
});

// Daggerheart homebrew settings feed the HUD (custom domains, extra resources,
// maxHope/maxLoadout, currency, rest moves). Re-render when the GM edits them.
Hooks.on("updateSetting", (setting) => {
  if (setting?.key === "daggerheart.Homebrew" || setting?.key === "daggerheart.VariantRules") dhudRequestRender();
});

// Embedded item lifecycle – any change can affect derived values (evasion/thresholds, etc.)
Hooks.on("createItem", (item) => {
  const parent = item?.parent;
  if (parent) dhudRequestRender(parent.id);
});

Hooks.on("updateItem", (item, changes) => {
  const parent = item?.parent;
  if (!parent) return;
  forEachHudApp((app) => {
    if (!app.actor || parent.id !== app.actor.id) return;
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

    if (app._updatingQuantity || isSimpleResourceUpdate) return;

    requestRender(app);
  });
});

Hooks.on("deleteItem", (item) => {
  const parent = item?.parent;
  if (parent) dhudRequestRender(parent.id);
});

// Effects can modify derived values (e.g., evasion/resistances) indirectly.
// Cheap approach: refresh if an effect on our actor is added/removed/updated.
// effect.parent is the Item for a transfer effect (feature/domain-card grants),
// not the Actor — fall back to the Item's owning actor so those re-render too.
function dhudEffectActorId(effect) {
  return effect?.parent?.actor?.id ?? effect?.parent?.id;
}
Hooks.on("createActiveEffect", (effect) => {
  const id = dhudEffectActorId(effect);
  if (id) dhudRequestRender(id);
});
Hooks.on("deleteActiveEffect", (effect) => {
  const id = dhudEffectActorId(effect);
  if (id) dhudRequestRender(id);
});
Hooks.on("updateActiveEffect", (effect, _changes) => {
  const id = dhudEffectActorId(effect);
  if (id) dhudRequestRender(id);
});
