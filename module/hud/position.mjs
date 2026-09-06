// module/hud/position.mjs
// Bottom-anchoring and drag-by-ring behaviour, plus the per-user global position flag.
// Extracted in refactor step 2. Free functions take the app instance explicitly.

import { MODULE_ID, FLAGS } from "../constants.mjs";
import { setPanelOpenDirection } from "./wings.mjs";

/** Anchor the HUD element to the bottom-centre of the viewport. */
export function placeAtBottom(appEl, offsetPx = 110) {
  if (!appEl?.getBoundingClientRect) return;
  appEl.style.position = "absolute";
  appEl.style.bottom = `${offsetPx}px`;
  appEl.style.top = "auto";
  appEl.style.right = "auto";
  const rect = appEl.getBoundingClientRect();
  const left = Math.max(0, (window.innerWidth - rect.width) / 2);
  appEl.style.left = `${left}px`;
}

/** Read the user's saved global HUD position, or null. */
export function getSavedGlobalPosition() {
  return game.user.getFlag(MODULE_ID, FLAGS.user.globalPosition);
}

/** Make the HUD draggable by its `.dhud-ring` handle; persists the drop position. */
export function enableDragByRing(appEl, appInstance) {
  const handle = appEl.querySelector(".dhud-ring");
  if (!handle) return;

  let startX, startY, startLeft, startTop, didMove = false;

  const onMove = (ev) => {
    if (!didMove) {
      // primeira vez que realmente move: sair de bottom e travar top no valor atual
      const r0 = appEl.getBoundingClientRect();
      appEl.style.bottom = "auto";
      appEl.style.top = `${r0.top}px`;
      didMove = true;
    }
    appInstance._isDragging = true;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    appEl.style.left = `${startLeft + dx}px`;
    appEl.style.top  = `${startTop  + dy}px`;
  };

  const onUp = async () => {
    handle.style.cursor = "grab";
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);

    if (didMove) {
      appInstance._justDraggedTs = Date.now();

      // Save the user's preferred HUD position (not per-actor)
      try {
        const rect = appEl.getBoundingClientRect();
        // Clamp to viewport a bit so we don't persist negative coords
        const left = Math.max(0, Math.round(rect.left));
        const top  = Math.max(0, Math.round(rect.top));
        await game.user.setFlag(MODULE_ID, FLAGS.user.globalPosition, { left, top });
      } catch (err) {
        console.warn("[DHUD] Failed to persist HUD position", err);
      }
    }

    didMove = false;

    // Release dragging flag and then recompute panel direction (up/down)
    requestAnimationFrame(() => {
      appInstance._isDragging = false;

      // If a tab is currently open, recompute its open direction now that position changed
      try {
        const shell    = appEl.querySelector(".dhud");
        const openName = shell?.getAttribute("data-open");
        if (openName) {
          const panel = appEl.querySelector(`.dhud-panel[data-panel='${openName}']`);
          if (panel) setPanelOpenDirection(panel);
        }
      } catch (e) {
        console.debug("[DHUD] setPanelOpenDirection after drag skipped", e);
      }
    });
  };


  const onDown = (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    handle.style.cursor = "grabbing";

    const r = appEl.getBoundingClientRect();
    // NÃO mexe em bottom/top aqui; só quando começar a mover
    startX = ev.clientX; startY = ev.clientY;
    startLeft = r.left;  startTop = r.top;

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
  };

  handle.addEventListener("pointerdown", onDown);
}
