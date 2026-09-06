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

/**
 * Localized metadata for a domain key. Works for core AND homebrew domains:
 * `CONFIG.DH.DOMAIN.allDomains()` merges the GM's homebrew domains
 * (Settings → Homebrew) over the built-in table. Core entries carry i18n keys in
 * `label` / `description`; homebrew entries carry literal strings — `loc()` handles
 * both (localize when the key exists, otherwise return as-is).
 *
 *   { key, label, description, src, color }
 *
 * Unknown key -> TitleCased fallback so nothing renders blank.
 */
export function domainMeta(key) {
  const k = String(key ?? "").trim();
  if (!k) return { key: k, label: "", description: "", src: "", color: "" };

  let table = null;
  try { table = CONFIG.DH?.DOMAIN?.allDomains?.() ?? null; } catch { table = null; }
  const d = table?.[k] ?? null;

  return {
    key: k,
    label: d?.label ? loc(d.label, k) : (k.charAt(0).toUpperCase() + k.slice(1)),
    description: d?.description ? loc(d.description, "") : "",
    src: d?.src ?? "",
    color: d?.color ?? ""
  };
}
