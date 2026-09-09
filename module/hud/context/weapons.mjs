// module/hud/context/weapons.mjs
// Primary / secondary weapon resolution (equipped non-secondary first, two-handed
// fills both slots, else Unarmed). Extracted verbatim from _prepareContext, step 4.
// A feature effect (`system.rules.burden.ignore`, e.g. Combat Training) lets a
// two-handed weapon count as one-handed — the off-hand slot then stays free for a
// second equipped weapon instead of mirroring the two-hander.

import { ignoresBurden } from "../../system/items.mjs";

export function collectWeapons(app) {
  const sys = app.actor?.system ?? {};
  const ignoreBurden = ignoresBurden(app.actor);

  // === PRIMARY WEAPON (only equipped & NOT secondary); else Unarmed ===
  let primaryWeapon = null;
  {
    const items = app.actor?.items ?? [];
    const weapons = items.filter(i => i.type === "weapon");

    // Only consider EQUIPPED weapons that are NOT marked as secondary
    const equippedNonSecondary = weapons.filter(w => w.system?.equipped === true && w.system?.secondary !== true);

    const pick = equippedNonSecondary[0] ?? null;

    if (pick) {
      primaryWeapon = {
        id: pick.id,
        name: pick.name,
        img: pick.img || "icons/svg/sword.svg",
        isUnarmed: false
      };
    }
  }

  // If none, show Unarmed from actor.system.attack
  if (!primaryWeapon) {
    const un = sys.attack;
    if (un) {
      const locName = game.i18n?.has?.(un.name) ? game.i18n.localize(un.name) : (un.name || "Unarmed Attack");
      primaryWeapon = {
        id: null,
        name: locName,
        img: un.img || "icons/skills/melee/unarmed-punch-fist-yellow-red.webp",
        isUnarmed: true
      };
    }
  }

  // === SECONDARY WEAPON ===
  let secondaryWeapon = null;
  {
    const items = app.actor?.items ?? [];
    const weaponsAll = items.filter(i => i.type === "weapon");
    const equipped   = weaponsAll.filter(w => w.system?.equipped === true);

    const primaryId = primaryWeapon?.isUnarmed ? null : primaryWeapon?.id ?? null;

    // Check if primary weapon is two-handed (unless a feature makes us ignore burden)
    const primaryWeaponItem = primaryId ? items.find(w => w.id === primaryId) : null;
    const isTwoHanded = primaryWeaponItem?.system?.burden === "twoHanded" && !ignoreBurden;

    let pick = null;

    if (isTwoHanded && primaryWeaponItem) {
      // For two-handed weapons, use the same weapon for both slots
      pick = primaryWeaponItem;
    } else {
      // Original logic for one-handed weapons
      pick = equipped.find(w => w.system?.secondary === true) ??
            equipped.find(w => w.id !== primaryId) ??
            null;
    }

    if (pick) {
      secondaryWeapon = {
        id: pick.id,
        name: pick.name,
        img: pick.img || "icons/svg/shield.svg",
        isUnarmed: false
      };
    }
  }

  // If none, fall back to Unarmed
  if (!secondaryWeapon) {
    const un = sys.attack;
    if (un) {
      const locName = game.i18n?.has?.(un.name) ? game.i18n.localize(un.name) : (un.name || "Unarmed Attack");
      secondaryWeapon = {
        id: null,
        name: locName,
        img: un.img || "icons/skills/melee/unarmed-punch-fist-yellow-red.webp",
        isUnarmed: true
      };
    }
  }

  return { primaryWeapon, secondaryWeapon };
}
