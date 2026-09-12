// module/system/resources.mjs
// The only place that knows how Daggerheart "extra" actor resources work.
//
// Beyond the fixed hitPoints / stress / hope, an actor can carry extra resource
// tracks from two sources, both landing at `actor.system.resources.<key>`:
//   - GM homebrew resources   (Settings → Homebrew → Resources; per actor type)
//   - feature-granted optional resources (favor, focus, module extras — the item's
//     `system.actorResources`)
// The system exposes the union of their KEYS as `actor.system.availableExtraResources`
// and flags the prepared entries with `isExtra` / `isOptional`. Values / max / images
// come from the prepared `actor.system.resources[key]`.
//
// Writes are a plain clamped `actor.update({'system.resources.<key>.value': n})` —
// same as HP/stress. `isReversed` only inverts the DISPLAY, never the stored value.

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function loc(key, fallback) {
  try {
    const k = String(key ?? "");
    return game.i18n?.has?.(k) ? game.i18n.localize(k) : (fallback ?? k);
  } catch {
    return fallback ?? String(key ?? "");
  }
}

/** Keys of every extra/optional resource on this actor (excludes the built-in trio). */
export function extraResourceKeys(actor) {
  const builtin = new Set(["hitPoints", "stress", "hope"]);
  const keys = new Set();

  const available = actor?.system?.availableExtraResources;
  if (available && typeof available === "object") {
    for (const k of Object.keys(available)) keys.add(k);
  }

  // Belt-and-braces: also pick up anything already prepared with the flags set.
  const res = actor?.system?.resources ?? {};
  for (const [k, v] of Object.entries(res)) {
    if (v && (v.isExtra || v.isOptional)) keys.add(k);
  }

  for (const b of builtin) keys.delete(b);
  return [...keys];
}

/** One image slot -> `{ isIcon, value, opacity, noColorFilter }` with sane fallbacks. */
function imageSlot(slot, fallbackIcon) {
  const s = slot ?? {};
  const value = (s.value ?? "").toString().trim();
  return {
    isIcon: s.isIcon !== false && (!value || !value.includes("/")),
    value: value || fallbackIcon,
    opacity: typeof s.opacity === "number" ? s.opacity : 1,
    noColorFilter: !!s.noColorFilter
  };
}

/**
 * Ordered list of the actor's extra resources, shaped for the template:
 *   { key, label, value, max (number|null), isReversed, hasPips, pips[], images:{full,empty}, editable }
 * `pips` is only populated when a small numeric max makes a pip row sensible.
 *
 * `actor.system.resources[key]` (the ResourcesField) only ever stores
 * `{ value, max }` — label / images / the definition's default max all live on
 * `actor.system.availableExtraResources[key]` (homebrew config, merged with
 * feature-granted definitions). Reading label/images off `resources[key]`
 * (as this used to) always misses and falls back to the generic circle icon.
 */
export function listActorResources(actor) {
  const res = actor?.system?.resources ?? {};
  const defs = actor?.system?.availableExtraResources ?? {};
  const out = [];

  for (const key of extraResourceKeys(actor)) {
    const r = res[key];
    if (!r || typeof r !== "object") continue;
    const def = defs[key] ?? {};

    const rawMax = (typeof r.max === "number" && r.max > 0)
      ? r.max
      : ((typeof def.max === "number" && def.max > 0) ? def.max : null);
    const value = Math.max(0, Number(r.value ?? 0));
    const images = {
      full: imageSlot(def.images?.full, "fa-solid fa-circle"),
      empty: imageSlot(def.images?.empty, "fa-regular fa-circle")
    };

    const hasPips = rawMax !== null && rawMax <= 12;
    const pips = hasPips
      ? Array.from({ length: rawMax }, (_, i) => ({
          index: i,
          filled: i < value,
          icon: i < value ? images.full : images.empty
        }))
      : [];

    out.push({
      key,
      label: loc(def.label, key.charAt(0).toUpperCase() + key.slice(1)),
      value,
      max: rawMax,
      isReversed: !!def.reverse,
      hasPips,
      pips,
      images,
      editable: true
    });
  }

  return out;
}

/** Resolved max for one extra resource: per-actor override, else the definition's default. */
function resourceMax(actor, key) {
  const r = actor?.system?.resources?.[key];
  if (typeof r?.max === "number" && r.max > 0) return r.max;
  const def = actor?.system?.availableExtraResources?.[key];
  if (typeof def?.max === "number" && def.max > 0) return def.max;
  return Number.MAX_SAFE_INTEGER;
}

/** Clamp + write one extra resource value. */
export async function setActorResource(actor, key, value) {
  if (!actor || !key) return;
  const r = actor.system?.resources?.[key];
  const max = resourceMax(actor, key);
  const next = clamp(Math.round(Number(value ?? 0)), 0, max);
  const curr = Math.max(0, Number(r?.value ?? 0));
  if (next === curr) return;
  try {
    await actor.update({ [`system.resources.${key}.value`]: next });
  } catch (err) {
    console.error("[DHUD] Extra resource update failed", err);
    ui.notifications?.error("Resource update failed (see console)");
  }
}

/** Relative bump helper (delta may be negative). */
export function bumpActorResource(actor, key, delta) {
  const curr = Math.max(0, Number(actor?.system?.resources?.[key]?.value ?? 0));
  return setActorResource(actor, key, curr + Number(delta || 0));
}

// --- Currency (gold) -------------------------------------------------------
// Daggerheart stores four denominations at `actor.system.gold.{coins,handfuls,
// bags,chests}` (plain integers). Which are shown, their display names and their
// FA icons come from the world Homebrew setting's `currency` block (same source
// the system character sheet uses); a disabled denomination is hidden.

const CURRENCY_KEYS = ["coins", "handfuls", "bags", "chests"];
const CURRENCY_FALLBACK = {
  coins:    { label: "DAGGERHEART.CONFIG.Gold.coins",    icon: "fa-solid fa-coins" },
  handfuls: { label: "DAGGERHEART.CONFIG.Gold.handfuls", icon: "fa-solid fa-coins" },
  bags:     { label: "DAGGERHEART.CONFIG.Gold.bags",     icon: "fa-solid fa-sack" },
  chests:   { label: "DAGGERHEART.CONFIG.Gold.chests",   icon: "fa-solid fa-box" }
};

/**
 * Enabled currency denominations for the Inventory money strip:
 *   { key, label, icon, value }
 * Falls back to the four defaults if the Homebrew setting can't be read.
 */
export function listActorCurrency(actor) {
  const gold = actor?.system?.gold ?? {};

  let cfg = null;
  try {
    cfg = game.settings.get(CONFIG.DH.id, CONFIG.DH.SETTINGS.gameSettings.Homebrew)?.currency ?? null;
  } catch { cfg = null; }

  const out = [];
  for (const key of CURRENCY_KEYS) {
    const c = cfg?.[key];
    if (c && c.enabled === false) continue;
    const fb = CURRENCY_FALLBACK[key];
    out.push({
      key,
      label: (c?.label && String(c.label).trim()) || loc(fb.label, key),
      icon: (c?.icon && String(c.icon).trim()) || fb.icon,
      value: Math.max(0, Number(gold[key] ?? 0))
    });
  }
  return out;
}

/** Clamp + write one currency denomination. */
export async function setActorCurrency(actor, key, value) {
  if (!actor || !CURRENCY_KEYS.includes(key)) return;
  const next = Math.max(0, Math.round(Number(value ?? 0)));
  const curr = Math.max(0, Number(actor.system?.gold?.[key] ?? 0));
  if (next === curr) return;
  try {
    await actor.update({ [`system.gold.${key}`]: next });
  } catch (err) {
    console.error("[DHUD] Currency update failed", err);
    ui.notifications?.error("Currency update failed (see console)");
  }
}
