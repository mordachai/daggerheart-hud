// module/hud/layout.mjs
// Snapshot / restore the HUD layout (position) across a close/reopen, and
// coalesce re-renders. Functions take the app instance explicitly.

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

  (async () => {
    try {
      await app.render(false);
    } finally {
      app._renderQueued = false;
      restoreLayout(app, snap);

      // Re-attach drag handlers
      if (app.reattachDragHandlers) {
        app.reattachDragHandlers();
      }
    }
  })();
}
