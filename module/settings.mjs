// module/settings.mjs
const MOD = "daggerheart-hud";

export const S = {
  bottomOffset: "bottomOffset",
  disableForMe: "disableForMe",  
  ringMainImg: "ringMainImg",
  ringWeaponImg: "ringWeaponImg",
  colorScheme: "colorScheme",
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

function applyColorScheme() {
  const scheme = getSetting(S.colorScheme); // "default" | "crimson" | "emerald" | "midnight"
  // Use body classes so CSS can theme via variables.
  const prefix = "dhud-theme-";
  document.body.classList.forEach(c => { if (c.startsWith(prefix)) document.body.classList.remove(c); });
  document.body.classList.add(`${prefix}${scheme}`);
}

export function registerSettings() {
  const scopeClient = "client";   // per-user
  const scopeWorld  = "world";    // shared

  game.settings.register(MOD, S.bottomOffset, {
    name: "HUD Anchor: Bottom Offset (px)",
    hint: "Vertical distance from screen bottom for the HUD anchor.",
    scope: scopeClient, config: true, type: Number, default: 110, range: { min: 0, max: 400, step: 5 },
     onChange: (v) => {
        // Recompute immediately via our resize handler
        window.dispatchEvent(new Event("resize"));
        }
  });

    game.settings.register(MOD, S.disableForMe, {
        name: "Disable this HUD for me",
        hint: "Hides the Daggerheart HUD only for your user.",
        scope: "client",                    // ← per user
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
        // Tell the module to react (close open HUDs if turning off)
        Hooks.callAll("daggerheart-hud:setting-changed", { key: S.disableForMe, value });
        }
    });

  game.settings.register(MOD, S.ringMainImg, {
    name: "Ring Image: Main Circle",
    hint: "Image used for the central ring.",
    scope: scopeClient, config: true, type: String, default: "",
    filePicker: true,
    onChange: () => Hooks.callAll("daggerheart-hud:images-changed"),
  });

  game.settings.register(MOD, S.ringWeaponImg, {
    name: "Ring Image: Weapon Circles",
    hint: "Image used for the weapon circles.",
    scope: scopeClient, config: true, type: String, default: "",
    filePicker: true,
    onChange: () => Hooks.callAll("daggerheart-hud:images-changed"),
  });

  game.settings.register(MOD, S.colorScheme, {
    name: "HUD Color Scheme",
    hint: "Pick a color scheme for the HUD.",
    scope: scopeClient, config: true, type: String, default: "default",
    choices: { default: "Default", crimson: "Crimson", emerald: "Emerald", midnight: "Midnight" },
    onChange: applyColorScheme,
  });

  game.settings.register(MOD, S.hideHotbar, {
    name: "Hide Foundry Hotbar",
    hint: "Completely hide the bottom hotbar (per-user).",
    scope: scopeClient, config: true, type: Boolean, default: false,
    onChange: applyHotbarVisibility,
  });

  // Apply client-affecting settings on init/ready
  Hooks.once("ready", () => { applyHotbarVisibility(); applyColorScheme(); });
}
