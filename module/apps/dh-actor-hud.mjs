// module/apps/dh-actor-hud.mjs

import { getSetting, S } from "../settings.mjs";
import { placeAtBottom, enableDragByRing, getSavedGlobalPosition } from "../hud/position.mjs";
import { setWingsState, setPanelOpenDirection, attachDHUDToggles } from "../hud/wings.mjs";
import { applyAppearance, reapplyAppearance } from "../hud/appearance.mjs";
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

  async _applyCondition(conditionId) {
    if (!this.actor) return;
    
   
    // Find condition data
    const condition = this._currentContext?.availableConditions?.find(c => c.id === conditionId);
    if (!condition) {
      console.warn('[DEBUG] Condition not found:', conditionId);
      return;
    }
    
    const effectData = {
      name: game.i18n.localize(condition.name),
      img: condition.img,
      statuses: [conditionId],
      description: condition.description ? game.i18n.localize(condition.description) : "",
      // Store the condition ID for easy lookup
      flags: {
        'daggerheart-hud': {
          conditionId: conditionId
        }
      }
    };
    
    
    try {
      await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    } catch (err) {
      console.error("[DHUD] Failed to apply condition", err);
      ui.notifications?.error("Failed to apply condition");
    }
  }

  async _removeCondition(conditionId) {
    if (!this.actor) return;
        
    // Find the effect by the condition ID flag first, fallback to statuses
    let effect = this.actor.effects.find(e => 
      e.getFlag('daggerheart-hud', 'conditionId') === conditionId && !e.disabled
    );
    
    // Fallback to the old method if flag doesn't exist (for existing effects)
    if (!effect) {
      effect = this.actor.effects.find(e => 
        e.statuses?.includes(conditionId) && !e.disabled
      );
    }
    
    if (!effect) {
      console.warn('[DEBUG] No effect found for condition:', conditionId);
      return;
    }
        
    try {
      await this.actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
    } catch (err) {
      console.error("[DHUD] Failed to remove condition", err);
      ui.notifications?.error("Failed to remove condition");
    }
  }

  _isConditionActive(conditionId) {
    const actor = this.actor;
    if (!actor) return false;

    // Some Foundry versions expose effects as a Collection; both of these should work:
    const effects = Array.isArray(actor.effects) ? actor.effects : actor.effects?.contents ?? [];

    for (const e of effects) {
      if (!e || e.disabled) continue;

      // 1) Check the custom flag (safely)
      let hasFlag = false;
      try {
        hasFlag = e.getFlag?.('daggerheart-hud', 'conditionId') === conditionId;
      } catch {
        // swallow and continue
      }
      if (hasFlag) return true;

      // 2) Fallback: normalize statuses and check inclusion
      const s = e.statuses;
      const list =
        Array.isArray(s) ? s :
        s instanceof Set ? Array.from(s) :
        typeof s === 'string' ? [s] :
        (s && typeof s === 'object') ? Object.values(s) :
        [];

      if (list.includes(conditionId)) return true;
    }

    return false;
  }

  async _prepareContext(_options) {
    // Data shaping lives in hud/context/* collectors; buildContext assembles the
    // exact object shape the template consumes. Cache it for _applyCondition.
    const ctx = await buildContext(this);
    this._currentContext = ctx;
    return ctx;
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

    // Initialize wings state immediately to prevent blinking
    if (!this._wingsInit) {
      const saved = (await game.user.getFlag("daggerheart-hud", "wings")) || "closed";
      // Set wings state immediately on the root element before other rendering
      setWingsState(root, saved);
      this._wingsState = saved;
      this._wingsInit = true;
    }

    // _currentContext is populated by _prepareContext, which ApplicationV2 runs
    // before every render — no need to rebuild it here.

    // --- Theme + ring art (GM override logic lives in hud/appearance.mjs)
    applyAppearance(root, this.actor);

    // Cosmetic pointer cursor for roll targets
    root.querySelectorAll(".dhud-roll").forEach(el => {
      el.style.cursor = "pointer";
      el.setAttribute("aria-pressed", "false");
    });

    // Feature toggles on the HUD
    attachDHUDToggles(root);

    // One-time wiring for resource adjusters (guard lives in the module)
    bindResourceAdjusters(this);

    // Hooks to re-apply art/theme on changes coming from the Configurator
    if (!this._imgHooked) {
      // Re-apply both rings and theme when the Configurator saves
      this._reapplyAppearance ??= async ({ actorIds = [] } = {}) => {
        if (!this.actor) return;
        if (actorIds.length && !actorIds.includes(this.actor.id)) return;

        // rings + theme only - NO position changes
        reapplyAppearance(root, this.actor);
      };

      // Listen only to the Configurator's saves
      Hooks.on("daggerheart-hud:rings-updated",      this._reapplyAppearance);
      Hooks.on("daggerheart-hud:appearance-updated", this._reapplyAppearance);

      this._imgHooked = true;
    }

    // Apply once now
    await this._reapplyAppearance?.({ actorIds: [this.actor?.id].filter(Boolean) });

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
      if (this._imgHooked) {
        // Unhook configurator updates
        if (this._reapplyAppearance) {
          Hooks.off("daggerheart-hud:rings-updated",      this._reapplyAppearance);
          Hooks.off("daggerheart-hud:appearance-updated", this._reapplyAppearance);
        }

        // Clear refs
        this._reapplyAppearance = null;
        this._imgHooked = false;
      }

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
