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

/** Get a nested object from the loaded translation dictionary by path */
export function Lpath(path) {
  // Works with dotted paths like "DAGGERHEART.CONFIG.Traits.agility.verb"
  const parts = String(path).split(".");
  let cur = game.i18n?.translations ?? {};
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
    else return undefined;
  }
  return cur;
}

/** Trait name + verbs (joined), from DAGGERHEART.CONFIG.Traits.<key> */
export function Ltrait(key) {
  const base = `DAGGERHEART.CONFIG.Traits.${key}`;
  const name = L(`${base}.name`, key);
  const verbsObj = Lpath(`${base}.verb`) ?? {};
  const verbs = Object.values(verbsObj).filter(Boolean);
  const description = verbs.join(", "); // "Sprint, Leap, Maneuver"
  return { name, verbs, description };
}
