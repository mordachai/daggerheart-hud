// module/helpers/i18n.mjs

/** Localize a key with optional data; fallback to provided string or key */
export function L(key, fallback = key, data = undefined) {
  try {
    if (data && typeof data === "object") {
      return game.i18n?.format?.(key, data) ?? fallback;
    }
    return game.i18n?.has?.(key) ? game.i18n.localize(key) : fallback;
  } catch {
    return fallback;
  }
}

/** Try multiple keys; return the first that exists (or fallback/key[0]) */
export function Ltry(keys = [], fallback = undefined, data = undefined) {
  for (const k of keys) {
    if (game.i18n?.has?.(k)) {
      return data ? game.i18n.format(k, data) : game.i18n.localize(k);
    }
  }
  return fallback ?? (keys[0] ?? "");
}

// Lpath / Ltrait removed in step 10 — trait names + verbs now come from
// system/config.mjs traits() over CONFIG.DH.ACTOR.abilities.
