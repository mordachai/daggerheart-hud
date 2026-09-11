// module/system/effects.mjs
// ActiveEffect toggle support for the Features tab's "Effects" section (GH #15).
// Effects come from actor.allApplicableEffects({ noTransferArmor: true }) — the
// same source the system's own character sheet Effects tab uses: the actor's own
// ActiveEffects plus every item-transferred effect (feature/domain-card grants),
// excluding armor's own transfer effect. Toggling flips the standard
// ActiveEffect#disabled field, mirroring the system's DHSheetV2 #toggleEffect.

/** Plain, template-ready entries for every applicable ActiveEffect. Beastform
 *  effects are listed but not toggleable — the system manages those automatically. */
export function listActiveEffects(actor) {
  if (!actor?.allApplicableEffects) return [];
  const effects = [...actor.allApplicableEffects({ noTransferArmor: true })];
  return effects
    .map(e => ({
      uuid: e.uuid,
      name: e.name,
      img: e.img || "icons/svg/aura.svg",
      disabled: !!e.disabled,
      toggleable: e.type !== "beastform"
    }))
    .sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.name.localeCompare(b.name));
}

/** Flip an ActiveEffect's disabled state, mirroring the system's #toggleEffect. */
export async function toggleActiveEffect(uuid) {
  const effect = await fromUuid(uuid);
  if (!effect) return;
  try {
    return await effect.update({ disabled: !effect.disabled });
  } catch (err) {
    console.error("[DHUD] Effect toggle failed", err);
    ui.notifications?.error("Effect toggle failed (see console)");
  }
}
