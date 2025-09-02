// module/settings.mjs
import { openHudRingsDialog } from "./apps/hud-rings.mjs";

const MOD = "daggerheart-hud";

export const S = {
  bottomOffset: "bottomOffset",
  disableForMe: "disableForMe",
  hideHotbar: "hideHotbar",
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

  // Launcher that opens the V2 dialog (we accept the V1 FormApplication warning in v13)
  game.settings.registerMenu("daggerheart-hud", "hudImagesConfig", {
    name: "HUD Images Config",
    label: "HUD Images Config",
    icon: "fas fa-ring",
    type: class DHUDImagesLauncher extends FormApplication {
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          id: "dhud-images-launcher",
          template: "modules/daggerheart-hud/templates/ui/blank.hbs",
          title: "HUD Images Config (Launcher)",
          popOut: false
        });
      }
      async getData() { return {}; }
      async _render(...args) {
        await super._render(...args);
        setTimeout(() => {
          try { openHudRingsDialog(); } finally { this.close({ force: true }); }
        }, 0);
      }
    },
    restricted: true
  });

  // HUD anchor placement (client)
  game.settings.register(MOD, S.bottomOffset, {
    name: "HUD Anchor: Bottom Offset (px)",
    hint: "Vertical distance from screen bottom for the HUD anchor.",
    scope: scopeClient,
    config: true,
    type: Number,
    default: 110,
    range: { min: 0, max: 400, step: 5 },
    onChange: () => {
      // Recompute immediately via our resize handler
      window.dispatchEvent(new Event("resize"));
    }
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
