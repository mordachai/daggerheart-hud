// module/hud/layout.mjs
// Snapshot / restore the HUD layout (position) across a close/reopen, and
// coalesce re-renders. Functions take the app instance explicitly.

import { showStatusContextMenu, showStatusGrid } from "./status-menu.mjs";

/** Snapshot which nav-bar tab / context menu / status grid is open, so a
 *  data-triggered re-render (toggling a condition, editing an item, …) doesn't
 *  blow away UI the player has open — e.g. mid-way through toggling several
 *  conditions in the status grid. */
function captureOpenState(app) {
  const el = app?.element;
  if (!el) return null;
  const dhud = el.querySelector(".dhud");
  const menu = el.querySelector("#dhud-context-menu");
  const grid = el.querySelector("#dhud-status-grid");
  return {
    navOpen: dhud?.getAttribute("data-open") || "",
    menuOpen: !!menu?.classList.contains("show"),
    gridOpen: !!grid?.classList.contains("show")
  };
}

/** Re-apply a previously captured open-state snapshot after a re-render. */
function restoreOpenState(app, state) {
  if (!state) return;
  const el = app?.element;
  if (!el) return;

  const dhud = el.querySelector(".dhud");
  if (dhud && state.navOpen) {
    dhud.setAttribute("data-open", state.navOpen);
    el.querySelectorAll(".dhud-tab").forEach(t =>
      t.setAttribute("aria-expanded", String(t.dataset.tab === state.navOpen)));
  }

  // Mutually exclusive in practice (opening the grid closes the menu), but
  // guard the grid first since it's the one bound to condition toggling.
  if (state.gridOpen) showStatusGrid(app, 0, 0);
  else if (state.menuOpen) showStatusContextMenu(app, 0, 0);
}

/** Snapshot current HUD layout (position). */
export function captureLayout(app) {
  const el = app?.element;
  if (!el) return null;

  const style = el.style;

  // Determine if we're anchored at bottom or free-dragged
  const mode = (style.bottom && style.bottom !== "auto") ? "bottom" : "free";

  return {
    mode,                           // "bottom" | "free"
    left: style.left || "",
    top:  style.top  || "",
    bottom: style.bottom || ""
  };
}

/** Re-apply a previously captured layout snapshot. */
export function restoreLayout(app, snapshot) {
  if (!snapshot) return;
  const el = app?.element;
  if (!el) return;

  const style = el.style;
  if (snapshot.mode === "bottom") {
    // Re-anchor at bottom: set bottom + left, clear top
    style.bottom = snapshot.bottom || "110px"; // default safety
    style.top = "auto";
    style.left = snapshot.left || "";
  } else {
    // Free-dragged: set top + left, clear bottom
    style.bottom = "auto";
    style.top = snapshot.top || "";
    style.left = snapshot.left || "";
  }
}

/** Queue a single re-render (collapse bursts of updates) and preserve layout. */
export function requestRender(app) {
  if (!app) return;
  if (app._renderQueued) return;
  app._renderQueued = true;

  const snap = captureLayout(app);
  const openState = captureOpenState(app);

  (async () => {
    try {
      await app.render(false);
    } finally {
      app._renderQueued = false;
      restoreLayout(app, snap);
      restoreOpenState(app, openState);

      // Re-attach drag handlers
      if (app.reattachDragHandlers) {
        app.reattachDragHandlers();
      }
    }
  })();
}
