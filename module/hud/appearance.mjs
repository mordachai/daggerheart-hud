// module/hud/appearance.mjs
// Theme + ring-frame resolution. Theme is a per-player client setting ("hudTheme");
// the ring frame is derived from the theme via THEME_RINGS. No per-actor config.

import { MODULE_ID } from "../constants.mjs";

const THEME_PREFIX = "dhud-theme-";
const RING_BASE = `modules/${MODULE_ID}/assets/ui`;

/**
 * Dropdown choices for the "HUD Theme" setting.
 * Adding a theme = add a `.dhud-theme-<name>` var block in styles/dhud-themes.css,
 * update the "Available themes" comment there, and add a line here.
 */
export const THEMES = {
  default:    "Default",
  shadowveil: "Shadowveil",
  wildfire:   "Wildfire",
  frostbite:  "Frostbite",
  thornwood:  "Thornwood",
  bloodmoon:  "Bloodmoon",
  mysticvoid: "Mystic Void",
};

/**
 * Theme -> ring frame. Only 5 frames ship in assets/ui, so themes without an exact
 * match reuse the nearest one. Unknown themes fall back to the default frame.
 */
const THEME_RINGS = {
  default:    "dgm-default-frame.webp",
  shadowveil: "dgm-shadowveil-frame.webp",
  wildfire:   "dgm-wildfire-frame.webp",
  frostbite:  "dgm-frostbite-frame.webp",
  thornwood:  "dgm-thornwood-frame.webp",    
  bloodmoon:  "dgm-bloodmoon-frame.webp",  
  mysticvoid: "dgm-shadowveil-frame.webp", // purple / void
};

/** Resolve the current player's theme, validated against THEMES. */
export function getPlayerTheme() {
  const v = game.settings.get(MODULE_ID, "hudTheme");
  return (v && THEMES[v]) ? v : "default";
}

function ringURL(theme) {
  const file = THEME_RINGS[theme] || THEME_RINGS.default;
  return `url("${foundry.utils.getRoute(`/${RING_BASE}/${file}`)}")`;
}

/**
 * Apply a specific theme name (class + fallback-to-default check + ring CSS vars)
 * to `root`. Does NOT persist — use for live preview from the settings dropdown.
 */
export function previewAppearance(root, theme) {
  if (!root) return;

  theme = (theme && THEMES[theme]) ? theme : "default";

  for (const c of Array.from(root.classList)) {
    if (c.startsWith(THEME_PREFIX)) root.classList.remove(c);
  }
  root.classList.add(THEME_PREFIX + theme);

  // verify the theme actually defines vars; if not, fall back to default
  if (!getComputedStyle(root).getPropertyValue("--dh-accent").trim()) {
    console.warn(`[DHUD] Unknown or missing theme "${theme}"; falling back to "default".`);
    root.classList.remove(THEME_PREFIX + theme);
    root.classList.add(THEME_PREFIX + "default");
    theme = "default";
  }

  const url = ringURL(theme);
  root.style.setProperty("--dhud-ring-main", url);
  root.style.setProperty("--dhud-ring-weapon", url);
}

/** Apply the player's saved `hudTheme` setting to `root`. */
export function applyAppearance(root) {
  previewAppearance(root, getPlayerTheme());
}
