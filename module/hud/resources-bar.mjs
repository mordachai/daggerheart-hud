// module/hud/resources-bar.mjs
// HP / Stress / Hope / Armor pip clicks. Left-click and right-click do opposite
// things (HP/Stress ∓1, Hope fill/reduce-to-pip, Armor mark/repair).
// Extracted from dh-actor-hud.mjs in refactor step 3 — pure move, no behaviour change.
// Resource math helpers moved here too; step 5 relocates them to system/actor.mjs.
// Step 12: same left/right pattern extended to homebrew / feature "extra" resources.

import { setActorResource, bumpActorResource } from "../system/resources.mjs";

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

async function bumpResource(actor, path, delta, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const curr = Number(foundry.utils.getProperty(actor, path) ?? 0);
  const next = clamp(curr + delta, min, max);
  if (next === curr) return;
  const update = {}; foundry.utils.setProperty(update, path, next);
  await actor.update(update);
}

async function setResource(actor, path, value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const next = clamp(Number(value ?? 0), min, max);
  const curr = Number(foundry.utils.getProperty(actor, path) ?? 0);
  if (next === curr) return;
  const update = {}; foundry.utils.setProperty(update, path, next);
  await actor.update(update);
}

/** Wire the resource +/- click / contextmenu pair. Guarded once per app. */
export function bindResourceAdjusters(app) {
  const rootEl = app.element;
  if (!rootEl || app._resAdjBound) return;

  // LEFT CLICK = minus for HP/Stress; fill bar for Hope; damage armor
  rootEl.addEventListener("click", async (ev) => {
    const actor = app.actor; if (!actor) return;

    // HP / Stress on .value
    const valueEl = ev.target.closest(".dhud-count .value");
    if (valueEl) {
      ev.preventDefault();
      ev.stopPropagation();

      const bind = valueEl.dataset.bind;
      if (bind === "hp") {
        const max = Number(app.actor.system?.resources?.hitPoints?.max ?? 0);
        await bumpResource(actor, "system.resources.hitPoints.value", +1, { min: 0, max });
        return;
      }
      if (bind === "stress") {
        const max = Number(app.actor.system?.resources?.stress?.max ?? 0);
        await bumpResource(actor, "system.resources.stress.value", +1, { min: 0, max });
        return;
      }
    }

    // HOPE: click a pip to fill up to that point (index+1)
    const pip = ev.target.closest(".dhud-pips .pip");
    if (pip) {
      ev.preventDefault();
      ev.stopPropagation();

      const idx = Number(pip.dataset.index || 0);
      const max = Number(app.actor.system?.resources?.hope?.max ?? (pip.parentElement?.children?.length || 0));
      await setResource(actor, "system.resources.hope.value", idx + 1, { min: 0, max });
      return;
    }

    // EXTRA RESOURCES (homebrew / feature-granted): left = +1, or fill-to-pip
    const extraEl = ev.target.closest('[data-bind="extra"]');
    if (extraEl) {
      ev.preventDefault();
      ev.stopPropagation();

      const key = extraEl.dataset.resKey;
      const extraPip = ev.target.closest(".dhud-extra-res__pips .pip");
      if (extraPip) {
        await setActorResource(actor, key, Number(extraPip.dataset.index || 0) + 1);
      } else {
        await bumpActorResource(actor, key, +1);
      }
      return;
    }

    // ARMOR: left click = add a mark (damage), clamp to max
    const armorEl = ev.target.closest(".dhud-badge--right");
    if (armorEl) {
      ev.preventDefault();
      ev.stopPropagation();

      const equippedArmor = (app.actor?.items ?? []).find(
        (item) => item.type === "armor" && item.system?.equipped === true
      );

      if (!equippedArmor) {
        ui.notifications?.warn("No equipped armor found");
        return;
      }

      const armorData = equippedArmor.system?.armor ?? {};
      const current = Math.max(0, Number(armorData.current ?? equippedArmor.system?.marks?.value ?? 0));
      const actorScore = app.actor?.system?.armorScore;
      const maxMarks = Math.max(0, Number(
        (actorScore && typeof actorScore === 'object' ? actorScore.max : actorScore) ??
          armorData.max ?? equippedArmor.system?.baseScore ?? 0
      ));

      const next = Math.min(maxMarks, current + 1);
      if (next !== current) {
        try {
          await equippedArmor.update({ "system.armor.current": next });
        } catch (err) {
          console.error("[DHUD] Failed to update armor", err);
          ui.notifications?.error("Failed to update armor");
        }
      }
      return;
    }

  }, true);

  // RIGHT CLICK = plus for HP/Stress; reduce hope; repair armor
  rootEl.addEventListener("contextmenu", async (ev) => {
    const actor = app.actor; if (!actor) return;

    // SKIP portrait clicks - let the status menu handle them
    const portrait = ev.target.closest('.dhud-portrait, .dhud-portrait-img');
    if (portrait) return;

    // HP / Stress on .value
    const valueEl = ev.target.closest(".dhud-count .value");
    if (valueEl) {
      ev.preventDefault();
      ev.stopPropagation();

      const bind = valueEl.dataset.bind;
      if (bind === "hp") {
        const max = Number(app.actor.system?.resources?.hitPoints?.max ?? 0);
        await bumpResource(actor, "system.resources.hitPoints.value", -1, { min: 0, max });
        return;
      }
      if (bind === "stress") {
        const max = Number(app.actor.system?.resources?.stress?.max ?? 0);
        await bumpResource(actor, "system.resources.stress.value", -1, { min: 0, max });
        return;
      }
    }

    // HOPE: right-click a pip to set to that index (reduce hope)
    const pip = ev.target.closest(".dhud-pips .pip");
    if (pip) {
      ev.preventDefault();
      ev.stopPropagation();

      const idx = Number(pip.dataset.index || 0);
      const max = Number(app.actor.system?.resources?.hope?.max ?? (pip.parentElement?.children?.length || 0));
      await setResource(actor, "system.resources.hope.value", idx, { min: 0, max });
      return;
    }

    // EXTRA RESOURCES (homebrew / feature-granted): right = -1, or reduce-to-pip
    const extraEl = ev.target.closest('[data-bind="extra"]');
    if (extraEl) {
      ev.preventDefault();
      ev.stopPropagation();

      const key = extraEl.dataset.resKey;
      const extraPip = ev.target.closest(".dhud-extra-res__pips .pip");
      if (extraPip) {
        await setActorResource(actor, key, Number(extraPip.dataset.index || 0));
      } else {
        await bumpActorResource(actor, key, -1);
      }
      return;
    }

    // ARMOR: right click = remove a mark (repair), clamp to 0
    const armorEl = ev.target.closest(".dhud-badge--right");
    if (armorEl) {
      ev.preventDefault();
      ev.stopPropagation();

      const equippedArmor = (app.actor?.items ?? []).find(
        (item) => item.type === "armor" && item.system?.equipped === true
      );

      if (!equippedArmor) {
        ui.notifications?.warn("No equipped armor found");
        return;
      }

      const current = Math.max(0, Number(equippedArmor.system?.armor?.current ?? equippedArmor.system?.marks?.value ?? 0));
      const next = Math.max(0, current - 1);

      if (next !== current) {
        try {
          await equippedArmor.update({ "system.armor.current": next });
        } catch (err) {
          console.error("[DHUD] Failed to update armor", err);
          ui.notifications?.error("Failed to update armor");
        }
      }
      return;
    }

    }, true);

  app._resAdjBound = true;
}
