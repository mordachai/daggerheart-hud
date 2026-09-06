// module/system/config.mjs
// Thin, typed getters over CONFIG.DH.* so the rest of the HUD never reaches into
// the system's config tables (or guesses i18n paths) directly.

const TRAIT_ORDER = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];

function loc(key, fallback) {
  try {
    return game.i18n?.has?.(key) ? game.i18n.localize(key) : (fallback ?? key);
  } catch {
    return fallback ?? key;
  }
}

/**
 * The six traits in canonical order:
 *   [{ key, name, verbs: string[], description }]
 * Reads CONFIG.DH.ACTOR.abilities (2.9.2: { <key>: { id, label, verbs: [i18nKey…] } }).
 * Falls back to a TitleCased key with no verbs if the table is missing.
 */
export function traits() {
  const abilities = CONFIG.DH?.ACTOR?.abilities ?? null;

  return TRAIT_ORDER.map(key => {
    const a = abilities?.[key] ?? null;
    const name = a?.label ? loc(a.label, key) : (key.charAt(0).toUpperCase() + key.slice(1));
    const verbs = Array.isArray(a?.verbs) ? a.verbs.map(v => loc(v, v)).filter(Boolean) : [];
    return { key, name, verbs, description: verbs.join(", ") };
  });
}
