// module/hud/events.mjs
// The delegated data-action dispatch table for the HUD: ring/wings, trait & reaction
// rolls, weapon rolls, item exec, send-to-chat, domain vault moves, universal resource
// change, inline rolls, dice chips, quantity inputs, portrait double-click.
// Extracted from dh-actor-hud.mjs in refactor step 3 — pure move, no behaviour change.
// Status-menu handlers live in hud/status-menu.mjs; resource pips in hud/resources-bar.mjs.

import { setWingsState, setPanelOpenDirection } from "./wings.mjs";
import { getCustomButton } from "./custom-buttons.mjs";
import { useWeapon, useItemAction, sendToChat, moveDomainCard } from "../system/items.mjs";
import { rollTrait } from "../system/actor.mjs";

/** Wire the delegated HUD interactions. Guarded once per app (`app._delegatedBound`). */
export function attachHudEvents(app) {
  const rootEl = app.element;
  if (!rootEl || app._delegatedBound) return;

  const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

  // Double-click portrait to open character sheet
  rootEl.addEventListener("dblclick", async (ev) => {
    const portrait = ev.target.closest(".dhud-portrait, .dhud-portrait-img");
    if (portrait && app.actor) {
      if (app._justDraggedTs && (Date.now() - app._justDraggedTs) < 300) return;
      stop(ev);
      app.actor.sheet.render(true, { focus: true });
      return;
    }
  }, true);

  // ---------- Block <summary> toggle for dice/value/reaction (register ONCE) ----------
  rootEl.addEventListener("click", (ev) => {
    const blocker = ev.target.closest("summary .icon, summary .value, summary .dhud-reaction-btn, summary .dhud-inline-roll, summary .dhud-inline-dr, summary .dhud-dicechip");
    if (blocker) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  rootEl.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const blocker = ev.target.closest("summary .icon, summary .value, summary .dhud-reaction-btn");
    if (blocker) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  // Optional: keyboard activation for reaction chip
  rootEl.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const btn = ev.target.closest("[data-action='roll-trait-reaction']");
    if (!btn) return;
    ev.preventDefault(); ev.stopPropagation();
    if (app._justDraggedTs && (Date.now() - app._justDraggedTs) < 160) return;
    rollTrait(app.actor, btn.dataset.trait, { reaction: true });
  }, true);

  // When a tab is clicked, after the DOM toggles, compute its open direction
  rootEl.addEventListener("click", (ev) => {
    const tabBtn = ev.target.closest(".dhud-tab");
    if (!tabBtn) return;

    // Which panel is paired with this tab?
    const name = tabBtn.dataset.tab; // e.g., "traits"
    const panel = rootEl.querySelector(`.dhud-panel[data-panel='${name}']`);
    if (!panel) return;

    // After toggler changes visibility, compute direction
    requestAnimationFrame(() => {
      // Only bother if this panel is actually open/visible in your current logic
      const dhudShell = rootEl.querySelector(".dhud");
      const openName = dhudShell?.getAttribute("data-open") || "";
      if (openName !== name) return; // tab is closing or another opened

      try { setPanelOpenDirection(panel); } catch (_) { /* no-op */ }
    });
  }, true);

  // -----------------------------------------------------------------------

  // MAIN CLICK HANDLER - All non-resource interactions
  rootEl.addEventListener("click", async (ev) => {
    const actor = app.actor;
    if (!actor) return;

    // In your click handler
    const customBtn = ev.target.closest("[data-action^='custom-']");
    if (customBtn) {
      stop(ev);
      const buttonId = customBtn.dataset.action.replace('custom-', '');
      const config = getCustomButton(buttonId);
      if (config) {
        const traitKey = customBtn.dataset.trait;
        await config.handler(app.actor, traitKey);
      }
      return;
    }

    // Handle death move button
    const deathBtn = ev.target.closest("[data-action='death-move']");
    if (deathBtn) {
      stop(ev);
      const DeathMove = game.system.api.applications.dialogs.DeathMove;
      const dialog = new DeathMove(app.actor);
      dialog.render(true);
      return;
    }

    // Ring toggle (wings) - only if NOT clicking on interactive elements
    const ring = ev.target.closest(".dhud-ring");
    if (ring) {
      const isInteractiveElement = ev.target.closest(".dhud-pips, .dhud-count, .dhud-badge, [data-action]");
      if (isInteractiveElement) return;
      if (app._justDraggedTs && (Date.now() - app._justDraggedTs) < 160) return;
      stop(ev);
      const shell = rootEl.querySelector(".dhud");
      const willOpen = shell?.getAttribute("data-wings") !== "open";
      const next = willOpen ? "open" : "closed";
      setWingsState(rootEl, next);
      app._wingsState = next;
    }

    // Trait roll
    const traitBtn = ev.target.closest("[data-action='roll-trait']");
    if (traitBtn) {
      if (app._justDraggedTs && (Date.now() - app._justDraggedTs) < 160) return;
      stop(ev);
      await rollTrait(actor, traitBtn.dataset.trait);
      return;
    }

    // Reaction roll (immediate): /dr trait=<key> reaction=true
    const reactBtn = ev.target.closest("[data-action='roll-trait-reaction']");
    if (reactBtn) {
      if (app._justDraggedTs && (Date.now() - app._justDraggedTs) < 160) return;
      stop(ev);
      await rollTrait(actor, reactBtn.dataset.trait, { reaction: true });
      return;
    }

    // Primary / Secondary weapon rolls
    const prim = ev.target.closest("[data-action='roll-primary']");
    if (prim) { stop(ev); await useWeapon(app, prim, { secondary: false }, ev); return; }

    const sec = ev.target.closest("[data-action='roll-secondary']");
    if (sec) { stop(ev); await useWeapon(app, sec, { secondary: true }, ev); return; }

    // Execute item (features, consumables, domain cards)
    const execBtn = ev.target.closest("[data-action='item-exec']");
    if (execBtn) {
      stop(ev);
      const item = actor.items.get(execBtn.dataset.itemId);
      if (item) await useItemAction(item, execBtn.dataset.actionId || "", ev);
      return;
    }

    // Send to chat
    const chatBtn = ev.target.closest("[data-action='to-chat']");
    if (chatBtn) {
      stop(ev);
      const item = actor.items.get(chatBtn.dataset.itemId);
      if (item) await sendToChat(item);
      return;
    }

    // Move domain card (loadout <-> vault) — via system.toggleVault (recall cost + cap)
    const mvBtn = ev.target.closest("[data-action='to-vault'],[data-action='to-loadout']");
    if (mvBtn) {
      stop(ev);
      const item = actor.items.get(mvBtn.dataset.itemId);
      if (item) await moveDomainCard(item, mvBtn.dataset.action === "to-vault", ev);
      return;
    }

    // Universal resource change
    const universalBtn = ev.target.closest("[data-action='universal-change']");
    if (universalBtn) {
      stop(ev);
      const itemId = universalBtn.dataset.itemId;
      const field = universalBtn.dataset.field;
      const delta = parseInt(universalBtn.dataset.delta);
      const item = actor.items.get(itemId);

      if (item) {
        app._updatingQuantity = true;

        try {
          // Generic approach - handle any field path
          const current = foundry.utils.getProperty(item.system, field) || 0;
          let newVal = Math.max(0, current + delta);

          // Check for max constraint by examining the field path
          let maxVal = null;
          if (field === "uses.value" && item.system.uses?.max) {
            maxVal = parseInt(item.system.uses.max);
          } else if (field.includes("uses.value") && field.startsWith("actions.")) {
            // Extract action ID and check its max
            const actionId = field.split('.')[1];
            const action = item.system.actions?.get?.(actionId) || item.system.actions?.[actionId];
            if (action?.uses?.max) {
              maxVal = parseInt(action.uses.max);
            }
          } else if (field === "resource.value" && item.system.resource?.max) {
            maxVal = parseInt(item.system.resource.max);
          }

          // Apply max constraint if there's a max value
          if (maxVal && !isNaN(maxVal) && maxVal > 0) {
            newVal = Math.min(newVal, maxVal);
          }

          // Check if this is an action-level uses that should use the system API
          if (field.startsWith('actions.') && field.includes('.uses.value') && delta < 0) {
            // Try to use the item's .use() method for consuming action uses
            const hasActions = item.system.actions?.size > 0;
            if (hasActions) {
              try {
                await item.use();
              } catch (useError) {
                // Fallback to manual update
                await item.update({[`system.${field}`]: newVal});
              }
            } else {
              await item.update({[`system.${field}`]: newVal});
            }
          } else {
            // Standard property update for all other cases
            await item.update({[`system.${field}`]: newVal});
          }

        } catch (err) {
          console.error("[DHUD] Failed to update resource", err);
          ui.notifications?.error("Failed to update resource");
        } finally {
          // Update the input field to show the new value immediately
          const input = rootEl.querySelector(`.dhud-qty-input[data-item-id="${itemId}"][data-field="${field}"]`);
          if (input) {
            const updatedValue = foundry.utils.getProperty(item.system, field);
            input.value = updatedValue;
          }

          app._updatingQuantity = false;
        }
      }
      return;
    }

    // Inline standard roll button (from [[/r ...]])
    const inlineBtn = ev.target.closest("[data-action='inline-roll']");
    if (inlineBtn) {
      ev.preventDefault(); ev.stopPropagation();
      const formula = inlineBtn.dataset.formula;
      if (formula) {
        const speaker = ChatMessage.getSpeaker({ actor: app.actor });
        const roll = await (new Roll(formula)).roll({ async: true });
        await roll.toMessage({ speaker, flavor: `${app.actor.name}: ${formula}` });
      }
      return;
    }

    // Inline duality (from [[/dr ...]])
    const dualityBtn = ev.target.closest("[data-action='inline-duality']");
    if (dualityBtn) {
      ev.preventDefault(); ev.stopPropagation();
      const params = dualityBtn.dataset.params || "";
      const speaker = ChatMessage.getSpeaker({ actor: app.actor });
      await ChatMessage.create({ speaker, content: `/dr ${params}` });
      return;
    }

    // Toggle diceValue "used" state (click on the die chip)
    {
      const chip = ev.target.closest(".dhud-dicechip");
      if (chip) {
        stop(ev);
        const idxStr = String(chip.dataset.index ?? "");
        const itemId = chip.dataset.itemId;
        if (!idxStr || !itemId) return;

        const item = actor.items.get(itemId);
        if (!item) return;

        // Duplicate current resource and diceStates (object OR array)
        const res = foundry.utils.deepClone(item.system?.resource ?? {});
        let states = res.diceStates ?? {};

        // Normalize: allow array or object, but we will write back in the same shape
        const wasArray = Array.isArray(states);
        const getState = (k) => (wasArray ? states[Number(k)] : states[k]);

        // Ensure the target entry exists
        const current = getState(idxStr) ?? { value: Number(res.value ?? 0), used: false };
        const nextUsed = !Boolean(current.used);

        // Optimistic UI
        chip.classList.toggle("used", nextUsed);
        chip.setAttribute("aria-pressed", nextUsed ? "true" : "false");

        // Mutate the duplicate
        if (wasArray) {
          const i = Number(idxStr);
          if (!states[i]) states[i] = current;
          states[i].used = nextUsed;
        } else {
          if (!states[idxStr]) states[idxStr] = current;
          states[idxStr].used = nextUsed;
        }

        try {
          // Force-write the entire diceStates blob so the sheet definitely sees it
          await item.update({ "system.resource.diceStates": states }, { diff: false });
          // (Optional) If you want immediate sheet reflect even on other clients:
          // item.sheet?.render(false);
        } catch (err) {
          console.error("[DHUD] Failed toggling dice used", err);
          ui.notifications?.error("Failed to update die state");
          // Revert optimistic UI
          chip.classList.toggle("used", !nextUsed);
          chip.setAttribute("aria-pressed", (!nextUsed) ? "true" : "false");
        }
        return;
      }
    }

  }, true);

  // Quantity input changes (separate event listener for typing)
  rootEl.addEventListener('input', async (ev) => {
    const qtyInput = ev.target.closest(".dhud-qty-input");
    if (qtyInput) {
      const itemId = qtyInput.dataset.itemId;
      const field = qtyInput.dataset.field;
      const newVal = Math.max(0, parseInt(qtyInput.value) || 0);
      const item = app.actor.items.get(itemId);

      if (item && newVal !== foundry.utils.getProperty(item.system, field)) {
        app._updatingQuantity = true;

        // Apply max constraint for limited resources
        let constrainedVal = newVal;
        if (field === "uses.value") {
          const max = parseInt(item.system.uses.max) || 0;
          constrainedVal = Math.min(newVal, max);
        } else if (field === "resource.value") {
          const max = parseInt(item.system.resource.max) || 0;
          constrainedVal = Math.min(newVal, max);
        }

        await item.update({[`system.${field}`]: constrainedVal});

        // Update input if value was constrained
        if (constrainedVal !== newVal) {
          qtyInput.value = constrainedVal;
        }

        app._updatingQuantity = false;
      }
    }
  }, true);

  app._delegatedBound = true;
}
