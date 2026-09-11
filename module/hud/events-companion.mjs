// module/hud/events-companion.mjs
// Delegated data-action dispatch for the companion HUD. Own file rather than
// reusing hud/events.mjs — that dispatch table is full of weapon/inventory/
// domain-vault actions that don't exist on a companion actor.

import { useUnarmed } from "../system/items.mjs";
import { toggleActiveEffect } from "../system/effects.mjs";
import { useCompanionActionRoll, sendExperienceToChat, openPartnerSheet } from "../system/companion.mjs";
import { setPanelOpenDirection } from "./wings.mjs";

/** Wire the delegated companion HUD interactions. Guarded once per app. */
export function attachCompanionHudEvents(app) {
  const rootEl = app.element;
  if (!rootEl || app._delegatedBound) return;

  const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

  // Double-click portrait to open the companion's own sheet
  rootEl.addEventListener("dblclick", async (ev) => {
    const portrait = ev.target.closest(".dhud-portrait, .dhud-portrait-img");
    if (portrait && app.actor) {
      if (app._justDraggedTs && (Date.now() - app._justDraggedTs) < 300) return;
      stop(ev);
      app.actor.sheet.render(true, { focus: true });
    }
  }, true);

  // When a tab is clicked, after the DOM toggles, compute its open direction
  // (up vs down, based on room in the viewport) — same as the character HUD.
  rootEl.addEventListener("click", (ev) => {
    const tabBtn = ev.target.closest(".dhud-tab");
    if (!tabBtn) return;

    const name = tabBtn.dataset.tab;
    const panel = rootEl.querySelector(`.dhud-panel[data-panel='${name}']`);
    if (!panel) return;

    requestAnimationFrame(() => {
      const dhudShell = rootEl.querySelector(".dhud");
      const openName = dhudShell?.getAttribute("data-open") || "";
      if (openName !== name) return;
      try { setPanelOpenDirection(panel); } catch (_) { /* no-op */ }
    });
  }, true);

  rootEl.addEventListener("click", async (ev) => {
    const actor = app.actor;
    if (!actor) return;

    const attackBtn = ev.target.closest("[data-action='companion-attack']");
    if (attackBtn) {
      if (app._justDraggedTs && (Date.now() - app._justDraggedTs) < 160) return;
      stop(ev);
      await useUnarmed(actor, ev);
      return;
    }

    const actionRollBtn = ev.target.closest("[data-action='companion-action-roll']");
    if (actionRollBtn) {
      if (app._justDraggedTs && (Date.now() - app._justDraggedTs) < 160) return;
      stop(ev);
      await useCompanionActionRoll(actor, ev);
      return;
    }

    const openPartnerBtn = ev.target.closest("[data-action='open-partner']");
    if (openPartnerBtn) {
      stop(ev);
      openPartnerSheet(actor);
      return;
    }

    const effectBtn = ev.target.closest("[data-action='toggle-effect']");
    if (effectBtn) {
      stop(ev);
      await toggleActiveEffect(effectBtn.dataset.effectUuid);
      return;
    }

    const expBtn = ev.target.closest("[data-action='send-exp']");
    if (expBtn) {
      stop(ev);
      await sendExperienceToChat(actor, expBtn.dataset.experienceId);
      return;
    }

    // Stress pips (bolt icons): checkbox-style — click a filled pip to clear it
    // (and everything after it), click an empty one to mark up through it.
    const stressPip = ev.target.closest(".dhud-stress-pip");
    if (stressPip) {
      stop(ev);
      const max = Number(actor.system?.resources?.stress?.max ?? 0);
      const curr = Math.max(0, Number(actor.system?.resources?.stress?.value ?? 0));
      const idx = Number(stressPip.dataset.index || 0);
      const isFilled = idx < curr;
      await setStress(actor, isFilled ? idx : idx + 1, max);
      return;
    }
  }, true);

  app._delegatedBound = true;
}

/** Clamp + write the companion's stress value. */
async function setStress(actor, value, max) {
  const next = Math.min(max, Math.max(0, value));
  const curr = Math.max(0, Number(actor.system?.resources?.stress?.value ?? 0));
  if (next === curr) return;
  await actor.update({ "system.resources.stress.value": next });
}
