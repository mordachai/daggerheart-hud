// module/settings.mjs
import { THEMES } from "./hud/appearance.mjs";

const MOD = "daggerheart-hud";

export const S = {
  bottomOffset: "bottomOffset",
  disableForMe: "disableForMe",
  hideHotbar: "hideHotbar",
  alwaysVisible: "alwaysVisible",
  showTargetNotifications: "showTargetNotifications",
  hudTheme: "hudTheme",
  autoShowLinkedHud: "autoShowLinkedHud"
};

export function getSetting(key) {
  return game.settings.get(MOD, key);
}
export async function setSetting(key, value) {
  return game.settings.set(MOD, key, value);
}

function applyHotbarVisibility() {
  const hide = getSetting(S.hideHotbar);
  const el = ui?.hotbar?.element?.[0] ?? ui?.hotbar?.element ?? null;
  if (el) el.style.display = hide ? "none" : "";
  document.body.classList.toggle("dhud-hide-hotbar", !!hide);
}

export function registerSettings() {
  const scopeClient = "client"; // per-user

  // Per-user: HUD color theme (+ ring frame derived from it in hud/appearance.mjs)
  game.settings.register(MOD, S.hudTheme, {
    name: "HUD Theme",
    hint: "Color scheme and ring frame for your HUD.",
    scope: scopeClient,
    config: true,
    type: String,
    choices: THEMES,
    default: "default",
    onChange: (value) => {
      Hooks.callAll("daggerheart-hud:setting-changed", { key: S.hudTheme, value });
    }
  });

  // HUD anchor placement (client)
  game.settings.register(MOD, S.bottomOffset, {
    name: "HUD Anchor: Bottom Offset (px)",
    hint: "Vertical distance from screen bottom for the HUD anchor.",
    scope: scopeClient,
    config: true,
    type: Number,
    default: 75,
    range: { min: 0, max: 500, step: 5 },
    onChange: () => {
      // Recompute immediately via our resize handler
      window.dispatchEvent(new Event("resize"));
    }
  });

  // Show target notifications
  game.settings.register(MOD, "showTargetNotifications", {
    name: "Show Target Notifications",
    hint: "Display notifications when no target is selected for attacks.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  // Per-user: hide the Foundry hotbar
  game.settings.register(MOD, S.hideHotbar, {
    name: "Hide Foundry Hotbar",
    hint: "Completely hide the bottom hotbar (per-user).",
    scope: scopeClient,
    config: true,
    type: Boolean,
    default: false,
    onChange: applyHotbarVisibility,
  });

  // Per-user: always show character HUD (players only)
  game.settings.register(MOD, S.alwaysVisible, {
    name: "Always Show My Character HUD",
    hint: "Keep your character's HUD visible even when no token is selected (players only).",
    scope: scopeClient,
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      Hooks.callAll("daggerheart-hud:setting-changed", { key: S.alwaysVisible, value });
    }
  });

  // Per-user: show a character's linked companion HUD alongside it (and vice versa)
  game.settings.register(MOD, S.autoShowLinkedHud, {
    name: "Show Linked Companion/Character Together",
    hint: "When you select a character or its linked companion, also show the other one's HUD.",
    scope: scopeClient,
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => {
      Hooks.callAll("daggerheart-hud:setting-changed", { key: S.autoShowLinkedHud, value });
    }
  });

  // Per-user: disable this HUD for me
  game.settings.register(MOD, S.disableForMe, {
    name: "Disable this HUD for me",
    hint: "Hides the Daggerheart HUD only for your user.",
    scope: scopeClient,
    config: true,
    type: Boolean,
    default: false,
    onChange: (value) => {
      Hooks.callAll("daggerheart-hud:setting-changed", { key: S.disableForMe, value });
    }
  });

  // Apply client-affecting settings on ready
  Hooks.once("ready", () => {
    applyHotbarVisibility();
  });
}