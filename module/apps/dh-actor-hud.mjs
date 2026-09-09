// module/apps/dh-actor-hud.mjs

import { getSetting, S } from "../settings.mjs";
import { placeAtBottom, enableDragByRing, getSavedGlobalPosition } from "../hud/position.mjs";
import { setPanelOpenDirection, attachDHUDToggles } from "../hud/wings.mjs";
import { applyAppearance } from "../hud/appearance.mjs";
import { registerCustomButton as registerCustomButtonImpl } from "../hud/custom-buttons.mjs";
import { attachHudEvents } from "../hud/events.mjs";
import { bindResourceAdjusters } from "../hud/resources-bar.mjs";
import { attachStatusMenu } from "../hud/status-menu.mjs";
import { buildContext } from "../hud/context/index.mjs";

// ✅ APIs V2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DaggerheartActorHUD extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "daggerheart-hud",
    window: { title: "Daggerheart HUD", positioned: true, resizable: false },
    position: { width: "auto", height: "auto" },
    classes: ["daggerheart-hud", "app"]
  };

  static PARTS = {
    body: { template: "modules/daggerheart-hud/templates/actor/hud-character.hbs" }
  };

  constructor({ actor, token } = {}, options = {}) {
    super(options);    
    this.actor = actor ?? null;
    this.token = token ?? actor?.getActiveTokens()?.[0]?.document ?? null;
    this.customButtons = new Map(); 
  }  

  reattachDragHandlers() {
    const root = this.element;
    if (root) {
      this._dragHooked = false;
      requestAnimationFrame(() => {
        enableDragByRing(root, this);
        this._dragHooked = true;
      });
    }
  }

  // Custom buttons — public API; registry lives in hud/custom-buttons.mjs
  static registerCustomButton(config) {
    registerCustomButtonImpl(config);
  }

  async _prepareContext(_options) {
    // Data shaping lives in hud/context/* collectors; buildContext assembles the
    // exact object shape the template consumes.
    return await buildContext(this);
  }

  async _onRender() {
    // Respect per-user disable toggle
    if (getSetting(S.disableForMe)) { this.close(); return; }

    const root = this.element;
    if (!root) return;

    // Apply dying state (btn, desaturate) 
    const hpValue = this.actor?.system?.resources?.hitPoints?.value ?? 0;
    const hpMax = this.actor?.system?.resources?.hitPoints?.max ?? 0;
    if (hpValue >= hpMax) {
      root.classList.add("dhud--dying");
    } else {
      root.classList.remove("dhud--dying");
    }

    // Hide initially if we're going to restore a layout
    if (this._initiallyHidden) {
      root.style.visibility = 'hidden';
      this._initiallyHidden = false;
    }

    // --- Theme + ring frame (per-player "hudTheme" setting; see hud/appearance.mjs)
    applyAppearance(root);

    // Cosmetic pointer cursor for roll targets
    root.querySelectorAll(".dhud-roll").forEach(el => {
      el.style.cursor = "pointer";
      el.setAttribute("aria-pressed", "false");
    });

    // Feature toggles on the HUD
    attachDHUDToggles(root);

    // One-time wiring for resource adjusters (guard lives in the module)
    bindResourceAdjusters(this);

    // First boot: placement and resize behavior
    if (!this._booted) {
      const applyPlacement = () => {
        // Check if user has a saved global position
        const userGlobalPos = getSavedGlobalPosition();

        if (userGlobalPos) {
          // Use the user's saved position
          root.style.position = "absolute";
          root.style.left = `${userGlobalPos.left}px`;
          root.style.top = `${userGlobalPos.top}px`;
          root.style.bottom = "auto";
        } else {
          // Use default bottom positioning for first time
          const rawOffset = getSetting(S.bottomOffset);
          const fresh = (rawOffset !== null && rawOffset !== undefined) ? Number(rawOffset) : 110;
          placeAtBottom(root, fresh);
        }
      };

      root.classList.add("is-booting");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          applyPlacement();
          root.classList.remove("is-booting");
          this._booted = true;
        });
      });

      // Replace your current resize handler with this:
      this._onResize = () => {
        if (this._isDragging) return;

        // 1) keep your existing bottom/center placement logic
        applyPlacement?.();

        // 2) if a tab panel is open, recompute whether it should open up/down
        const root  = this.element;
        const shell = root?.querySelector(".dhud");
        const openName = shell?.getAttribute("data-open");   // e.g., "traits", "inventory", etc.
        if (!openName) return;

        const panel = root.querySelector(`.dhud-panel[data-panel='${openName}']`);
        if (panel && typeof setPanelOpenDirection === "function") {
          setPanelOpenDirection(panel);
        }
      };

      // (re)attach listener
      window.addEventListener("resize", this._onResize);
    }

    // Drag support (by the ring) - always re-setup and add delay for DOM readiness
    if (!this._dragHooked) {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        enableDragByRing(root, this);
      });
      this._dragHooked = true;
    }    

    // Delegated HUD interactions (ring, traits, weapons, exec, chat, move) +
    // portrait context menu / condition grid. Guards live in the modules.
    attachHudEvents(this);
    attachStatusMenu(this);

    // If a tab is open, compute its up/down direction AFTER layout paints
    requestAnimationFrame(() => {
      const shell = root.querySelector(".dhud");
      const openName = shell?.getAttribute("data-open");
      if (!openName) return;
      const panel = root.querySelector(`.dhud-panel[data-panel='${openName}']`);
      if (!panel || typeof setPanelOpenDirection !== "function") return;
      requestAnimationFrame(() => setPanelOpenDirection(panel));
    });

  }

  async close(opts) {
    try {
      // Remove window resize listener if set
      if (this._onResize) {
        window.removeEventListener("resize", this._onResize);
        this._onResize = null;
      }
    } finally {
      return super.close(opts);
    }
  }

}
