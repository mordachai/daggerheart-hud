// module/hud/appearance.mjs
// Theme + ring-image resolution and application (per-actor flags vs GM world override).
// Extracted from dh-actor-hud.mjs in refactor step 2. No behaviour change.

import { MODULE_ID, FLAGS, SETTING_KEYS } from "../constants.mjs";

const THEME_PREFIX = "dhud-theme-";

/** Resolve the theme name for an actor: GM override wins, else actor flag, else "default". */
export function getActorThemeOrDefault(actor) {
  // Check GM theme override first - this applies to ALL characters
  const gmThemeOverride = game.settings.get(MODULE_ID, SETTING_KEYS.gmThemeOverride);
  if (gmThemeOverride) {
    const gmTheme = game.settings.get(MODULE_ID, SETTING_KEYS.gmGlobalTheme);
    if (gmTheme) return gmTheme;
  }

  // Fall back to actor-specific flags only if GM override is disabled
  return actor?.getFlag(MODULE_ID, FLAGS.actor.colorScheme) || "default";
}

/** Resolve a ring image path for an actor. `type` is "main" | "weapon". */
export function getActorRingImageOrDefault(actor, type) {
  // Check GM override first - this applies to ALL characters
  const gmOverride = game.settings.get(MODULE_ID, SETTING_KEYS.gmRingOverride);
  if (gmOverride) {
    const gmRing = type === "main"
      ? game.settings.get(MODULE_ID, SETTING_KEYS.gmPortraitRing)
      : game.settings.get(MODULE_ID, SETTING_KEYS.gmWeaponsRing);
    if (gmRing) return gmRing;
  }

  // Fall back to actor-specific flags only if GM override is disabled
  const flagKey = type === "main" ? FLAGS.actor.ringPortrait : FLAGS.actor.ringWeapons;
  return actor?.getFlag(MODULE_ID, flagKey) || "";
}

/** Normalize an image path to a routed `url("…")` value (or "none"). */
export function toRouteURL(p) {
  if (!p) return "none";
  let cleanPath = p.trim();

  // Full URLs pass through
  if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
    return `url("${cleanPath}")`;
  }

  // Absolute module/asset paths
  if (cleanPath.startsWith("/")) {
    const abs = foundry.utils.getRoute(cleanPath);
    return `url("${abs}")`;
  }

  // Ensure leading slash for relative asset paths
  if (!cleanPath.startsWith("/")) {
    cleanPath = `/${cleanPath}`;
  }

  const abs = foundry.utils.getRoute(cleanPath);
  return `url("${abs}")`;
}

function setRingVars(root, actor) {
  const mainRing = getActorRingImageOrDefault(actor, "main");
  const weapRing = getActorRingImageOrDefault(actor, "weapon");
  root.style.setProperty("--dhud-ring-main",  toRouteURL(mainRing));
  root.style.setProperty("--dhud-ring-weapon", toRouteURL(weapRing));
}

/** Full apply: theme class (+ fallback-to-default check) and ring CSS vars. */
export function applyAppearance(root, actor) {
  if (!root) return;

  const scheme = getActorThemeOrDefault(actor);

  // remove any previous theme classes
  for (const c of Array.from(root.classList)) {
    if (c.startsWith(THEME_PREFIX)) root.classList.remove(c);
  }

  // apply the requested scheme
  root.classList.add(THEME_PREFIX + scheme);

  // verify the theme actually defines vars; if not, fallback to default
  const cs = getComputedStyle(root);
  if (!cs.getPropertyValue("--dh-accent").trim()) {
    console.warn(`[DHUD] Unknown or missing theme "${scheme}" for ${actor?.name}; falling back to "default".`);
    root.classList.remove(THEME_PREFIX + scheme);
    root.classList.add(THEME_PREFIX + "default");
  }

  setRingVars(root, actor);
}

/** Lighter re-apply used when the Configurator saves — no fallback check, no position work. */
export function reapplyAppearance(root, actor) {
  if (!root) return;

  setRingVars(root, actor);

  const scheme = getActorThemeOrDefault(actor);
  Array.from(root.classList).forEach(c => { if (c.startsWith(THEME_PREFIX)) root.classList.remove(c); });
  root.classList.add(`${THEME_PREFIX}${scheme}`);
}
