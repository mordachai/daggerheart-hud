// module/apps/dh-companion-hud.mjs
// DaggerheartCompanionHUD — the lightweight ApplicationV2 shell for `companion`
// actors (GH #19). Mirrors dh-actor-hud.mjs's structure, wired to the companion-
// only context/events modules. The boot/placement/resize/drag orchestration is
// intentionally duplicated (not extracted into shared "chrome") — it's glue code
// calling already-generic functions (hud/position.mjs, hud/wings.mjs), and
// duplicating ~50 lines of glue is lower risk than refactoring the working
// character shell to share it.

import { getSetting, S } from "../settings.mjs";
import { placeAtBottom, enableDragByRing, getSavedGlobalPosition, isPositionLocked, clampToViewport } from "../hud/position.mjs";
import { setPanelOpenDirection, attachDHUDToggles } from "../hud/wings.mjs";
import { applyAppearance } from "../hud/appearance.mjs";
import { attachCompanionHudEvents } from "../hud/events-companion.mjs";
import { attachStatusMenu } from "../hud/status-menu.mjs";
import { buildCompanionContext } from "../hud/context/companion-context.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DaggerheartCompanionHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "daggerheart-hud-companion",
    window: { title: "Daggerheart Companion HUD", positioned: true, resizable: false },
    position: { width: "auto", height: "auto" },
    classes: ["daggerheart-hud", "dhud-companion", "app"]
  };

  static PARTS = {
    body: { template: "modules/daggerheart-hud/templates/actor/hud-companion.hbs" }
  };

  constructor({ actor, token } = {}, options = {}) {
    super(options);
    this.actor = actor ?? null;
    this.token = token ?? actor?.getActiveTokens()?.[0]?.document ?? null;
  }

  reattachDragHandlers() {
    const root = this.element;
    if (root) {
      this._dragHooked = false;
      requestAnimationFrame(() => {
        enableDragByRing(root, this, "companion");
        this._dragHooked = true;
      });
    }
  }

  async _prepareContext(_options) {
    return buildCompanionContext(this);
  }

  async _onRender() {
    if (getSetting(S.disableForMe)) { this.close(); return; }

    const root = this.element;
    if (!root) return;

    const pendingExternalReveal = !!this._initiallyHidden;
    if (this._initiallyHidden) {
      root.style.visibility = "hidden";
      this._initiallyHidden = false;
    }

    applyAppearance(root, "companion");
    root.classList.toggle("dhud-position-locked", isPositionLocked());

    root.querySelectorAll(".dhud-roll").forEach(el => {
      el.style.cursor = "pointer";
      el.setAttribute("aria-pressed", "false");
    });

    attachDHUDToggles(root);

    if (!this._booted) {
      // No outer reveal pending (true first-ever render for this slot) — hide
      // until placement is computed so we never flash the default center spot.
      if (!pendingExternalReveal) root.style.visibility = "hidden";

      const applyPlacement = () => {
        const userGlobalPos = getSavedGlobalPosition("companion");
        if (userGlobalPos) {
          root.style.position = "absolute";
          root.style.bottom = "auto";
          const rect = root.getBoundingClientRect();
          const { left, top } = clampToViewport(userGlobalPos.left, userGlobalPos.top, rect.width, rect.height);
          root.style.left = `${left}px`;
          root.style.top = `${top}px`;
        } else {
          const rawOffset = getSetting(S.bottomOffset);
          const fresh = (rawOffset !== null && rawOffset !== undefined) ? Number(rawOffset) : 110;
          // Distinct default X-offset so first-run users with both HUDs open
          // don't land dead-centered on top of the character HUD.
          placeAtBottom(root, fresh, 220);
        }
      };

      root.classList.add("is-booting");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyPlacement();
          root.classList.remove("is-booting");
          this._booted = true;
          if (!pendingExternalReveal) root.style.visibility = "visible";
        });
      });

      this._onResize = () => {
        if (this._isDragging) return;
        applyPlacement?.();

        const shell = this.element?.querySelector(".dhud");
        const openName = shell?.getAttribute("data-open");
        if (!openName) return;

        const panel = this.element?.querySelector(`.dhud-panel[data-panel='${openName}']`);
        if (panel) setPanelOpenDirection(panel);
      };

      window.addEventListener("resize", this._onResize);
    }

    if (!this._dragHooked) {
      requestAnimationFrame(() => enableDragByRing(root, this, "companion"));
      this._dragHooked = true;
    }

    attachCompanionHudEvents(this);
    attachStatusMenu(this);

    requestAnimationFrame(() => {
      const shell = root.querySelector(".dhud");
      const openName = shell?.getAttribute("data-open");
      if (!openName) return;
      const panel = root.querySelector(`.dhud-panel[data-panel='${openName}']`);
      if (!panel) return;
      requestAnimationFrame(() => setPanelOpenDirection(panel));
    });
  }

  async close(opts) {
    try {
      if (this._onResize) {
        window.removeEventListener("resize", this._onResize);
        this._onResize = null;
      }
    } finally {
      return super.close(opts);
    }
  }
}
