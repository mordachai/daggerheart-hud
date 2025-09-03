// module/apps/dh-actor-hud.mjs

import { L, Lpath, Ltrait } from "../helpers/i18n.mjs";
import { sendItemToChat } from "../helpers/chat-utils.mjs";
import { getSetting, S } from "../settings.mjs";

function placeAtBottom(appEl, offsetPx = 110) {
  if (!appEl?.getBoundingClientRect) return;
  appEl.style.position = "absolute";
  appEl.style.bottom = `${offsetPx}px`;
  appEl.style.top = "auto";
  appEl.style.right = "auto";
  const rect = appEl.getBoundingClientRect();
  const left = Math.max(0, (window.innerWidth - rect.width) / 2);
  appEl.style.left = `${left}px`;
}

function enableDragByRing(appEl, appInstance) {
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

  const onUp = () => {
    handle.style.cursor = "grab";
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    if (didMove) {
      appInstance._justDraggedTs = Date.now();
      
      // Save the user's preferred HUD position (not per-actor)
      const rect = appEl.getBoundingClientRect();
      game.user.setFlag("daggerheart-hud", "globalPosition", {
        left: rect.left,
        top: rect.top
      });
    }
    didMove = false;
    requestAnimationFrame(() => { appInstance._isDragging = false; });
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

function setWingsState(rootEl, state /* "open" | "closed" */) {
  console.log("[DEBUG] setWingsState called with state:", state);
  console.trace();
  if (!rootEl) return;
  const shell = rootEl.querySelector(".dhud");
  const leftWing  = rootEl.querySelector(".dhud-wing--left");
  const rightWing = rootEl.querySelector(".dhud-wing--right");
  const ring      = rootEl.querySelector(".dhud-ring");
  if (!shell || !leftWing || !rightWing || !ring) return;

  // 1) captura centro do ring antes
  const pre = ring.getBoundingClientRect();
  const cxPre = pre.left + pre.width / 2;

  // 2) aplica estado
  shell.setAttribute("data-wings", state);

  // acessibilidade
  const closed = state === "closed";
  leftWing.toggleAttribute("inert", closed);
  rightWing.toggleAttribute("inert", closed);
  if (closed) shell.setAttribute("data-open", "");

  // 3) compensa deslocamento p/ manter core ancorado
  requestAnimationFrame(() => {
    const post = ring.getBoundingClientRect();
    const cxPost = post.left + post.width / 2;
    const dx = cxPost - cxPre;
    console.log("[DEBUG] Wings compensation dx:", dx);
    if (Math.abs(dx) > 0.5) {
      const app = rootEl;
      const currentLeft = parseFloat(app.style.left || "0");
      app.style.left = `${currentLeft - dx}px`;
    }
  });
}

/** Toggler mínimo: abre/fecha um painel por vez; acordeões são nativos (<details>) */
function attachDHUDToggles(root) {
  if (!root) return;

  // helper para setar/alternar o atributo data-open no elemento .dhud
  const dhud = root.querySelector(".dhud");
  if (!dhud) return;

  const tabs = root.querySelectorAll(".dhud-tab");

  const setOpen = (name) => {
    const curr = dhud.getAttribute("data-open") || "";
    const next = curr === name ? "" : name;
    dhud.setAttribute("data-open", next);
    tabs.forEach(t => t.setAttribute("aria-expanded", String(t.dataset.tab === next)));
  };

  tabs.forEach(tab => {
    tab.addEventListener("click", () => setOpen(tab.dataset.tab));
    tab.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpen(tab.dataset.tab); }
    });
  });

  // fechar ao clicar fora do HUD
  const onDocPointer = (ev) => {
    if (!root.contains(ev.target)) setOpen("");
  };
  document.addEventListener("pointerdown", onDocPointer, { capture: true });

  // fechar com ESC quando o foco estiver dentro do HUD
  root.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") setOpen("");
  });
}

// ✅ APIs V2
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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

export function getActorRingImageOrDefault(actor, kind) {
  if (!actor) return "";
  const flagKey = kind === "main" ? "ringPortrait" : "ringWeapons";
  const v = actor.getFlag("daggerheart-hud", flagKey) || "";
  return String(v || "").trim(); // no fallback to any GM/global setting
}


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
    console.debug("[DHUD] ctor", {
      actorId: actor?.id, actorName: actor?.name, tokenId: token?.id
    });
    
    this.actor = actor ?? null;
    this.token = token ?? actor?.getActiveTokens()?.[0]?.document ?? null;
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

  async _executeItem(item, actionPath = "use") {
    const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;
    try {
      if (typeof item.rollAction === "function") return await item.rollAction(actionPath);
      if (typeof item.use === "function")       return await item.use({ action: actionPath });
      if (Action?.execute)                      return await Action.execute({ source: item, actionPath });
      item.sheet?.render(true, { focus: true });
    } catch (err) {
      console.error("[DHUD] Item exec failed", err);
      ui.notifications?.error("Action failed (see console)");
    }
  }

  // === STATUS CONTEXT MENU METHODS ===

  _showStatusContextMenu(x, y) {
    this._hideStatusGrid();
    const menu = this.element.querySelector('#dhud-context-menu');
    const portrait = this.element.querySelector('.dhud-portrait');
    
    if (!menu || !portrait) return;
    
    // First, show the menu off-screen to measure it
    menu.style.left = '-9999px';
    menu.style.top = '-9999px';
    menu.classList.add('show');
    
    // Force a reflow to ensure styles are applied
    menu.offsetHeight;
    
    // Get menu and portrait dimensions
    const menuRect = menu.getBoundingClientRect();
    const portraitRect = portrait.getBoundingClientRect();
    const menuWidth = menuRect.width;
    const menuHeight = menuRect.height;
    
    // Get viewport dimensions for boundary checking
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Position relative to portrait center
    const portraitCenterX = portraitRect.left + (portraitRect.width / 2);
    const portraitCenterY = portraitRect.top + (portraitRect.height / 2);
    
    // Get the HUD container's position to convert back to relative coordinates
    const hudRect = this.element.getBoundingClientRect();
    
    // Calculate initial position relative to portrait center
    let menuX = portraitCenterX - (menuWidth / 2); // Center horizontally
    let menuY = portraitRect.bottom - 200; // Position below portrait with 10px gap
    
    // Adjust horizontal position if it goes off viewport
    if (menuX + menuWidth > viewportWidth) {
      menuX = viewportWidth - menuWidth - 10; // 10px margin from edge
    }
    if (menuX < 10) {
      menuX = 10; // 10px margin from left edge
    }
    
    // Adjust vertical position if it goes off viewport
    if (menuY + menuHeight > viewportHeight) {
      // Try positioning above the portrait
      menuY = portraitRect.top - menuHeight - 10;
      
      // If still off-screen, clamp to viewport
      if (menuY < 10) {
        menuY = 10;
      }
    }
    
    // Convert back to coordinates relative to HUD container
    const relativeX = menuX - hudRect.left;
    const relativeY = menuY - hudRect.top;
    
    // Apply final position
    menu.style.left = `${relativeX}px`;
    menu.style.top = `${relativeY}px`;
    
    console.log('[DEBUG] Menu positioned relative to portrait:', { 
      portraitCenter: { x: portraitCenterX, y: portraitCenterY },
      portraitRect: { 
        left: portraitRect.left, 
        top: portraitRect.top, 
        bottom: portraitRect.bottom,
        width: portraitRect.width,
        height: portraitRect.height
      },
      menuPosition: { 
        viewport: { x: menuX, y: menuY },
        relative: { x: relativeX, y: relativeY }
      },
      menuSize: { width: menuWidth, height: menuHeight },
      viewport: { width: viewportWidth, height: viewportHeight }
    });
  }

  _hideStatusContextMenu() {
    const menu = this.element?.querySelector('#dhud-context-menu');
    if (menu) menu.classList.remove('show');
  }

  _hideStatusGrid() {
    console.log('[DEBUG] _hideStatusGrid called');
    console.trace(); // This will show the call stack
    const grid = this.element?.querySelector('#dhud-status-grid');
    if (grid) grid.classList.remove('show');
  }

  _hideTooltip() {
    const tooltip = this.element?.querySelector('#dhud-tooltip');
    if (tooltip) tooltip.classList.remove('show');
  }

  _showStatusGrid(x, y) {
    const grid = this.element.querySelector('#dhud-status-grid');
    if (!grid) return;
    
    // Show off-screen first to measure
    grid.style.left = '-9999px';
    grid.style.top = '-9999px';
    grid.classList.add('show');
    
    // Force reflow
    grid.offsetHeight;
    
    // SYNC: Update visual states to match actual condition states
    const statusIcons = grid.querySelectorAll('.dhud-status-icon');
    statusIcons.forEach(icon => {
      const conditionId = icon.dataset.conditionId;
      if (conditionId) {
        const isActive = this._isConditionActive(conditionId);
        if (isActive) {
          icon.classList.add('active');
        } else {
          icon.classList.remove('active');
        }
      }
    });
    
    // Get dimensions
    const gridRect = grid.getBoundingClientRect();
    const hudRect = this.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Position relative to where the context menu was (x, y are HUD-relative)
    // Convert to viewport coordinates for boundary checking
    const viewportX = hudRect.left + x;
    const viewportY = hudRect.top + y + 50; // Offset below the context menu
    
    let adjustedX = x;
    let adjustedY = y + 50; // Start 50px below the context menu position
    
    // Adjust if grid would go off-screen
    if (viewportX + gridRect.width > viewportWidth) {
      adjustedX = x - gridRect.width;
    }
    
    // FIX: Better vertical positioning logic
    if (viewportY + gridRect.height > viewportHeight) {
      // Try positioning above the context menu instead
      adjustedY = y - gridRect.height - 20;
      
      // If still off-screen above, position at top of viewport
      if (hudRect.top + adjustedY < 10) {
        adjustedY = 10 - hudRect.top;
      }
    }
    
    // Ensure minimum bounds
    if (hudRect.left + adjustedX < 10) {
      adjustedX = 10 - hudRect.left;
    }
    
    // Apply final position
    grid.style.left = `${adjustedX}px`;
    grid.style.top = `${adjustedY}px`;
    
    console.log('[DEBUG] Status grid positioned:', {
      contextMenuPos: { x, y },
      gridPos: { adjustedX, adjustedY },
      viewport: { viewportX, viewportY },
      gridSize: { width: gridRect.width, height: gridRect.height },
      finalViewportPos: { 
        x: hudRect.left + adjustedX, 
        y: hudRect.top + adjustedY 
      }
    });
  }

  _showTooltip(x, y, text) {
    const tooltip = this.element.querySelector('#dhud-tooltip');
    if (!tooltip) return;
    
    tooltip.textContent = text;
    tooltip.style.left = `${x + 10}px`;
    tooltip.style.top = `${y - 30}px`;
    tooltip.classList.add('show');
  }

  async _applyCondition(conditionId) {
    if (!this.actor) return;
    
    console.log('[DEBUG] Applying condition:', conditionId);
    
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
    
    console.log('[DEBUG] Creating effect:', effectData);
    
    try {
      await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
      ui.notifications?.info(`Applied ${effectData.name}`);
      console.log('[DEBUG] Effect created successfully');
    } catch (err) {
      console.error("[DHUD] Failed to apply condition", err);
      ui.notifications?.error("Failed to apply condition");
    }
  }

  async _removeCondition(conditionId) {
    if (!this.actor) return;
    
    console.log('[DEBUG] Removing condition:', conditionId);
    console.log('[DEBUG] Available effects:', this.actor.effects.map(e => ({
      id: e.id,
      name: e.name,
      statuses: e.statuses,
      disabled: e.disabled,
      conditionFlag: e.getFlag('daggerheart-hud', 'conditionId')
    })));
    
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
    
    console.log('[DEBUG] Found effect to remove:', { 
      id: effect.id, 
      name: effect.name, 
      statuses: effect.statuses,
      conditionFlag: effect.getFlag('daggerheart-hud', 'conditionId')
    });
    
    try {
      await this.actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
      ui.notifications?.info(`Removed ${effect.name}`);
      console.log('[DEBUG] Effect removed successfully');
    } catch (err) {
      console.error("[DHUD] Failed to remove condition", err);
      ui.notifications?.error("Failed to remove condition");
    }
  }

  _isConditionActive(conditionId) {
    if (!this.actor) return false;
    
    // Check by flag first
    let effect = this.actor.effects.find(e => {
      try {
        return e.getFlag('daggerheart-hud', 'conditionId') === conditionId && !e.disabled;
      } catch (err) {
        return false;
      }
    });
    
    // Fallback to statuses check with better type handling
    if (!effect) {
      effect = this.actor.effects.find(e => {
        try {
          if (e.disabled) return false;
          
          const statuses = e.statuses;
          
          // Handle different possible types for statuses
          if (Array.isArray(statuses)) {
            return statuses.includes(conditionId);
          } else if (statuses instanceof Set) {
            return statuses.has(conditionId);
          } else if (typeof statuses === 'string') {
            return statuses === conditionId;
          } else if (statuses && typeof statuses === 'object') {
            // Handle object-like structures
            return Object.values(statuses).includes(conditionId);
          }
          
          return false;
        } catch (err) {
          console.warn('[DEBUG] Error checking effect statuses:', err, e);
          return false;
        }
      });
    }
    
    return !!effect;
  }

  async _rollWeapon(btn, { secondary=false } = {}) {
    if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;

    const actor = this.actor;
    if (!actor) return;

    const isUnarmed = btn.dataset.unarmed === "true";
    const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;

    try {

      const currentTargets = [...game.user.targets];
      if (currentTargets.length === 0) {
        ui.notifications?.info("No target selected — the attack will not auto-apply damage.");
      }

      if (isUnarmed) {
        if (Action?.execute) return await Action.execute({ source: actor, actionPath: "attack" });
        actor.sheet?.render(true, { focus: true });
        ui.notifications?.info("Open the Unarmed Attack and click Attack");
        return;
      }

      let item = btn.dataset.itemId ? actor.items.get(btn.dataset.itemId) : null;
      if (!item) {
        const weaponsAll = actor.items.filter(i => i.type === "weapon");
        const equipped   = weaponsAll.filter(w => w.system?.equipped === true);
        if (secondary) {
          const primaryId = this.element.querySelector("[data-action='roll-primary']")?.dataset?.itemId ?? null;
          item = equipped.find(w => w.system?.secondary === true)
              ?? equipped.find(w => w.id && w.id !== primaryId)
              ?? null;
        } else {
          item = equipped.find(w => w.system?.secondary !== true) ?? null;
        }
      }
      if (!item) return void ui.notifications?.warn(secondary ? "No secondary weapon found" : "No primary weapon found");

      if (typeof item.rollAction === "function") return await item.rollAction("attack");
      if (typeof item.use       === "function")  return await item.use({ action: "attack" });
      if (Action?.execute)                      return await Action.execute({ source: item, actionPath: "attack" });

      item.sheet?.render(true, { focus: true });
      ui.notifications?.info("Open the weapon and click Attack");
    } catch (err) {
      console.error("[DHUD] Weapon roll failed", err);
      ui.notifications?.error("Weapon roll failed - this may be a system issue");
    }
  }

  _bindResourceAdjusters(rootEl) {
    // LEFT CLICK = minus for HP/Stress; fill bar for Hope
    rootEl.addEventListener("click", async (ev) => {
      const actor = this.actor; if (!actor) return;

      // HP / Stress on .value
      const valueEl = ev.target.closest(".dhud-count .value");
      if (valueEl) {
        ev.preventDefault();
        ev.stopPropagation(); // Prevent bubbling to other handlers
        
        const bind = valueEl.dataset.bind; // "hp" or "stress"
        if (bind === "hp") {
          const max = Number(this.actor.system?.resources?.hitPoints?.max ?? 0);
          await bumpResource(actor, "system.resources.hitPoints.value", -1, { min: 0, max });
          return;
        }
        if (bind === "stress") {
          const max = Number(this.actor.system?.resources?.stress?.max ?? 0);
          await bumpResource(actor, "system.resources.stress.value", -1, { min: 0, max });
          return;
        }
      }

      // HOPE: click a pip to fill up to that point (index+1)
      const pip = ev.target.closest(".dhud-pips .pip");
      if (pip) {
        ev.preventDefault();
        ev.stopPropagation(); // IMPORTANT: Prevent bubbling to wing toggle handler
        
        const idx = Number(pip.dataset.index || 0);
        const max = Number(this.actor.system?.resources?.hope?.max ?? (pip.parentElement?.children?.length || 0));
        await setResource(actor, "system.resources.hope.value", idx + 1, { min: 0, max });
        return;
      }

    }, true);

    // RIGHT CLICK = plus for HP/Stress; reduce by one for Hope
    rootEl.addEventListener("contextmenu", async (ev) => {
      const actor = this.actor; if (!actor) return;

      // SKIP portrait clicks - let the status menu handle them
      const portrait = ev.target.closest('.dhud-portrait, .dhud-portrait-img');
      if (portrait) return;

      // HP / Stress on .value
      const valueEl = ev.target.closest(".dhud-count .value");
      if (valueEl) {
        ev.preventDefault();
        ev.stopPropagation(); // Prevent bubbling
        
        const bind = valueEl.dataset.bind; // "hp" or "stress"
        if (bind === "hp") {
          const max = Number(this.actor.system?.resources?.hitPoints?.max ?? 0);
          await bumpResource(actor, "system.resources.hitPoints.value", +1, { min: 0, max });
          return;
        }
        if (bind === "stress") {
          const max = Number(this.actor.system?.resources?.stress?.max ?? 0);
          await bumpResource(actor, "system.resources.stress.value", +1, { min: 0, max });
          return;
        }
      }      

      // HOPE: right-click a pip to set to that index (i.e., one less than clicked pip)
      const pip = ev.target.closest(".dhud-pips .pip");
      if (pip) {
        ev.preventDefault();
        ev.stopPropagation(); // IMPORTANT: Prevent bubbling to other handlers
        
        const idx = Number(pip.dataset.index || 0);
        const max = Number(this.actor.system?.resources?.hope?.max ?? (pip.parentElement?.children?.length || 0));
        await setResource(actor, "system.resources.hope.value", idx, { min: 0, max });
        return;
      }
      
    }, true);
  }

  _bindDelegatedEvents() {
    const rootEl = this.element;
    if (!rootEl || this._delegatedBound) return;

    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

    // === STATUS CONTEXT MENU HANDLERS ===

    // Right-click on portrait to show context menu
    rootEl.addEventListener('contextmenu', async (ev) => {
      console.log('[DEBUG] Any contextmenu event:', ev.target);
      const portrait = ev.target.closest('.dhud-portrait, .dhud-portrait-img');
      if (portrait) {
        console.log('[DEBUG] SUCCESS - Portrait contextmenu triggered!');
        ev.preventDefault();
        ev.stopPropagation();
        
        // Convert viewport coordinates to HUD-relative coordinates
        const hudRect = this.element.getBoundingClientRect();
        const relativeX = ev.clientX - hudRect.left;
        const relativeY = ev.clientY - hudRect.top;
        
        this._showStatusContextMenu(relativeX, relativeY);
        return;
      }
    }, true);

    // Context menu item clicks
    rootEl.addEventListener('click', async (ev) => {
      const contextItem = ev.target.closest('.dhud-context-item');
      if (contextItem) {
        stop(ev);
        const action = contextItem.dataset.action;
        
        if (action === 'apply-status') {
          // FIXED: Use the context menu's current position instead of clientX/Y
          const menu = this.element.querySelector('#dhud-context-menu');
          if (menu) {
            const menuStyle = menu.style;
            const x = parseInt(menuStyle.left) || 0;
            const y = parseInt(menuStyle.top) || 0;
            this._showStatusGrid(x, y);
          }
        }
        this._hideStatusContextMenu();
        return;
      }
    }, true);

// Status icon interactions - simple toggle with proper state checking
rootEl.addEventListener('click', async (ev) => {
  const statusIcon = ev.target.closest('.dhud-status-icon');
  if (statusIcon) {
    console.log('[DEBUG] Status icon click - before stop()');
    stop(ev);
    console.log('[DEBUG] Status icon click - after stop()');
    
    const conditionId = statusIcon.dataset.conditionId;
    
    // Check actual condition state from actor, not just CSS class
    const isActive = this._isConditionActive(conditionId);
    
    console.log('[DEBUG] Status icon clicked:', { 
      conditionId, 
      cssActive: statusIcon.classList.contains('active'),
      actuallyActive: isActive 
    });
    
    if (isActive) {
      // Remove the condition
      await this._removeCondition(conditionId);
      statusIcon.classList.remove('active');
    } else {
      // Apply the condition
      await this._applyCondition(conditionId);
      statusIcon.classList.add('active');
    }
    
    console.log('[DEBUG] Status icon click - finished processing');
    
    // ADD THIS: Check grid state after processing
    const grid = this.element.querySelector('#dhud-status-grid');
    console.log('[DEBUG] Grid state after status toggle:', {
      exists: !!grid,
      hasShowClass: grid?.classList.contains('show'),
      visible: grid?.style.display !== 'none',
      position: grid ? { left: grid.style.left, top: grid.style.top } : null
    });
    
    return;
  }
}, true);

    // Status icon tooltips
    rootEl.addEventListener('mouseover', (ev) => {
      const statusIcon = ev.target.closest('.dhud-status-icon');
      if (statusIcon) {
        const name = statusIcon.dataset.conditionName;
        this._showTooltip(ev.clientX, ev.clientY, name);
      }
    });

    rootEl.addEventListener('mouseout', (ev) => {
      const statusIcon = ev.target.closest('.dhud-status-icon');
      if (statusIcon) {
        this._hideTooltip();
      }
    });

    // Close menus on outside clicks
    document.addEventListener('click', (ev) => {
      // More thorough checks
      const clickedElement = ev.target;
      const statusIcon = clickedElement.closest('.dhud-status-icon');
      const contextMenu = clickedElement.closest('#dhud-context-menu, .dhud-context-menu');
      const statusGrid = clickedElement.closest('#dhud-status-grid, .dhud-status-grid');
      const withinHUD = this.element && this.element.contains(clickedElement);
      
      console.log('[DEBUG] Outside click analysis:', {
        clickedTag: clickedElement.tagName,
        clickedClass: clickedElement.className,
        statusIcon: !!statusIcon,
        contextMenu: !!contextMenu,
        statusGrid: !!statusGrid,
        withinHUD: withinHUD
      });
      
      // Only close if we're truly clicking outside everything
      if (!statusIcon && !contextMenu && !statusGrid && !withinHUD) {
        console.log('[DEBUG] Hiding menus - truly outside click');
        this._hideStatusContextMenu();
        this._hideStatusGrid();
      } else {
        console.log('[DEBUG] Not hiding - click was inside relevant elements');
      }
    }, { capture: true });

    // Close menus on Escape
    rootEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        this._hideStatusContextMenu();
        this._hideStatusGrid();
      }
    });

    // Double-click handler for portrait to open character sheet
    rootEl.addEventListener("dblclick", async (ev) => {
      const portrait = ev.target.closest(".dhud-portrait, .dhud-portrait-img");
      if (portrait && this.actor) {
        // Only open sheet if we haven't been dragging recently
        if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 300) {
          return; // Too soon after drag, ignore double-click
        }
        
        stop(ev);
        this.actor.sheet.render(true, { focus: true });
        return;
      }
    }, true);

    rootEl.addEventListener("click", async (ev) => {
      const actor = this.actor;
      if (!actor) return;

      // FIRST: Check if this is a hope pip click and handle it early
      const pip = ev.target.closest(".dhud-pips .pip");
      if (pip) {
        stop(ev);
        const idx = Number(pip.dataset.index || 0);
        const max = Number(this.actor.system?.resources?.hope?.max ?? (pip.parentElement?.children?.length || 0));
        await setResource(actor, "system.resources.hope.value", idx + 1, { min: 0, max });
        return;
      }

      // SECOND: Check if this is an HP/Stress value click
      const valueEl = ev.target.closest(".dhud-count .value");
      if (valueEl) {
        stop(ev);
        const bind = valueEl.dataset.bind;
        if (bind === "hp") {
          const max = Number(this.actor.system?.resources?.hitPoints?.max ?? 0);
          await bumpResource(actor, "system.resources.hitPoints.value", -1, { min: 0, max });
          return;
        }
        if (bind === "stress") {
          const max = Number(this.actor.system?.resources?.stress?.max ?? 0);
          await bumpResource(actor, "system.resources.stress.value", -1, { min: 0, max });
          return;
        }
      }

      // THIRD: Check if this is an armor badge click
      const armorEl = ev.target.closest(".dhud-badge--right");
      if (armorEl) {
        stop(ev);
        const max = Number(this.actor.system?.resources?.armor?.max ?? 0);
        // Left click = take armor damage (decrease value)
        await bumpResource(actor, "system.resources.armor.value", -1, { min: 0, max });
        return;
      }

      // Ring toggle (wings) - only if NOT clicking on interactive elements
      const ring = ev.target.closest(".dhud-ring");
      if (ring) {
        // Additional safety checks to prevent accidental wing toggles
        // Note: .dhud-portrait is removed from this check so ring clicks still work
        const isInteractiveElement = ev.target.closest(".dhud-pips, .dhud-count, .dhud-badge, [data-action]");
        if (isInteractiveElement) {
          // This click was on an interactive element, don't toggle wings
          return;
        }

        if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;
        stop(ev);
        const shell = rootEl.querySelector(".dhud");
        const willOpen = shell?.getAttribute("data-wings") !== "open";
        const next = willOpen ? "open" : "closed";
        setWingsState(rootEl, next);
        this._wingsState = next;
      }

      // Trait roll
      const traitBtn = ev.target.closest("[data-action='roll-trait']");
      if (traitBtn) {
        if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;
        stop(ev);
        const traitKey = traitBtn.dataset.trait;
        ui.chat?.processMessage?.(`/dr trait=${traitKey}`);
        return;
      }

      // Primary / Secondary weapon rolls
      const prim = ev.target.closest("[data-action='roll-primary']");
      if (prim) { stop(ev); await this._rollWeapon(prim, { secondary: false }); return; }

      const sec  = ev.target.closest("[data-action='roll-secondary']");
      if (sec)  { stop(ev); await this._rollWeapon(sec,  { secondary: true  }); return; }

      // Execute item (features, consumables, domain cards)
      const execBtn = ev.target.closest("[data-action='item-exec']");
      if (execBtn) {
        stop(ev);
        const item = actor.items.get(execBtn.dataset.itemId);
        const actionPath = execBtn.dataset.actionpath || "use";
        if (item) await this._executeItem(item, actionPath);
        return;
      }

      // Send to chat (uses your helper with fallbacks)
      const chatBtn = ev.target.closest("[data-action='to-chat']");
      if (chatBtn) {
        stop(ev);
        const item = actor.items.get(chatBtn.dataset.itemId);
        if (item) await sendItemToChat(item, actor);
        return;
      }

      // Move domain card (loadout <-> vault)
      const mvBtn = ev.target.closest("[data-action='to-vault'],[data-action='to-loadout']");
      if (mvBtn) {
        stop(ev);
        const item = actor.items.get(mvBtn.dataset.itemId);
        if (item) await item.update({ "system.inVault": mvBtn.dataset.action === "to-vault" });
        return;
      }
    }, true); // capture=true beats <summary> default toggle

    // RIGHT CLICK handler for HP/Stress increment, Hope decrement, and Armor repair
    rootEl.addEventListener("contextmenu", async (ev) => {
      const actor = this.actor;
      if (!actor) return;

      // Hope pip right-click
      const pip = ev.target.closest(".dhud-pips .pip");
      if (pip) {
        stop(ev);
        const idx = Number(pip.dataset.index || 0);
        const max = Number(this.actor.system?.resources?.hope?.max ?? (pip.parentElement?.children?.length || 0));
        await setResource(actor, "system.resources.hope.value", idx, { min: 0, max });
        return;
      }

      // HP/Stress right-click increment
      const valueEl = ev.target.closest(".dhud-count .value");
      if (valueEl) {
        stop(ev);
        const bind = valueEl.dataset.bind;
        if (bind === "hp") {
          const max = Number(this.actor.system?.resources?.hitPoints?.max ?? 0);
          await bumpResource(actor, "system.resources.hitPoints.value", +1, { min: 0, max });
          return;
        }
        if (bind === "stress") {
          const max = Number(this.actor.system?.resources?.stress?.max ?? 0);
          await bumpResource(actor, "system.resources.stress.value", +1, { min: 0, max });
          return;
        }
      }

      // Armor right-click repair
      const armorEl = ev.target.closest(".dhud-badge--right");
      if (armorEl) {
        stop(ev);
        const max = Number(this.actor.system?.resources?.armor?.max ?? 0);
        // Right click = repair armor (increase value)
        await bumpResource(actor, "system.resources.armor.value", +1, { min: 0, max });
        return;
      }
    }, true);

    this._delegatedBound = true;

  }

  async _prepareContext(_options) {
    const actor = this.actor ?? null;

    // Fallbacks
    let actorName = "—";
    let portrait  = "icons/svg/mystery-man.svg";

    if (actor) {
      actorName = actor.name ?? "—";
      // Prefer the actor portrait; fall back to the prototype token’s texture if empty
      const protoSrc = actor?.prototypeToken?.texture?.src;
      portrait = (actor.img && actor.img.trim()) ? actor.img : (protoSrc || portrait);
    }

    // Canonical system root (guarded)
    const sys = actor?.system ?? {};

    // === PRIMARY WEAPON (only equipped & NOT secondary); else Unarmed ===
    let primaryWeapon = null;
    {
      const items = this.actor?.items ?? [];
      const weapons = items.filter(i => i.type === "weapon");

      // Only consider EQUIPPED weapons that are NOT marked as secondary
      const equippedNonSecondary = weapons.filter(w => w.system?.equipped === true && w.system?.secondary !== true);

      const pick = equippedNonSecondary[0] ?? null;

      if (pick) {
        primaryWeapon = {
          id: pick.id,
          name: pick.name,
          img: pick.img || "icons/svg/sword.svg",
          isUnarmed: false
        };
      }
    }

    // If none, show Unarmed from actor.system.attack
    if (!primaryWeapon) {
      const un = sys.attack;
      if (un) {
        const locName = game.i18n?.has?.(un.name) ? game.i18n.localize(un.name) : (un.name || "Unarmed Attack");
        primaryWeapon = {
          id: null,
          name: locName,
          img: un.img || "icons/skills/melee/unarmed-punch-fist-yellow-red.webp",
          isUnarmed: true
        };
      }
    }

    // === SECONDARY WEAPON (prefer equipped marked secondary; else other equipped != primary; else Unarmed) ===
    let secondaryWeapon = null;
    {
      const items = this.actor?.items ?? [];
      const weaponsAll = items.filter(i => i.type === "weapon");
      const equipped   = weaponsAll.filter(w => w.system?.equipped === true);

      const primaryId = primaryWeapon?.isUnarmed ? null : primaryWeapon?.id ?? null;

      // 1) prefer an equipped weapon explicitly flagged as secondary
      // 2) else any other equipped weapon that's not the primary
      const pick =
        equipped.find(w => w.system?.secondary === true) ??
        equipped.find(w => w.id !== primaryId) ??
        null;

      if (pick) {
        secondaryWeapon = {
          id: pick.id,
          name: pick.name,
          img: pick.img || "icons/svg/shield.svg",
          isUnarmed: false
        };
      }
    }

    // If none, fall back to Unarmed
    if (!secondaryWeapon) {
      const un = sys.attack;
      if (un) {
        const locName = game.i18n?.has?.(un.name) ? game.i18n.localize(un.name) : (un.name || "Unarmed Attack");
        secondaryWeapon = {
          id: null,
          name: locName,
          img: un.img || "icons/skills/melee/unarmed-punch-fist-yellow-red.webp",
          isUnarmed: true
        };
      }
    }

    // === ACTIVE STATUS EFFECTS ===
    const activeStatuses = new Set();
    const statusEffects = [];

    for (const effect of (this.actor?.effects ?? [])) {
      if (effect.disabled) continue;
      
      // Track which statuses are currently active
      if (effect.statuses?.length) {
        effect.statuses.forEach(status => activeStatuses.add(status));
      }
      
      statusEffects.push({
        id: effect.id,
        name: effect.name,
        img: effect.img || "icons/svg/aura.svg",
        statuses: effect.statuses || [],
        isTemporary: effect.duration?.rounds !== null || effect.duration?.turns !== null
      });
    }

    // === AVAILABLE CONDITIONS ===
    const daggerheartConditions = [];
    const genericConditions = [];

    // Get Daggerheart-specific conditions first
    const dhConditions = CONFIG.DH?.GENERAL?.conditions || {};
    Object.values(dhConditions).forEach(condition => {
      daggerheartConditions.push({
        id: condition.id,
        name: condition.name, // This is an i18n key
        img: condition.img,
        description: condition.description, // Also an i18n key
        isActive: activeStatuses.has(condition.id),
        source: 'daggerheart'
      });
    });

    // Only add generic Foundry conditions if the system setting allows it
    const showGenericStatuses = game.settings.get('daggerheart', 'Appearance').showGenericStatusEffects;
    if (showGenericStatuses) {
      CONFIG.statusEffects
        .filter(effect => !effect.systemEffect)
        .forEach(effect => {
          genericConditions.push({
            id: effect.id,
            name: effect.name, // i18n key
            img: effect.img,
            description: effect.description || "",
            isActive: activeStatuses.has(effect.id),
            source: 'foundry'
          });
        });
    }

    const availableConditions = [...daggerheartConditions, ...genericConditions];

    // === ANCESTRY / COMMUNITY FEATURES (correct filter: system.originItemType) ===
    const ancestryFeatures = [];
    const communityFeatures = [];

    for (const it of (this.actor?.items ?? [])) {
      if (it.type !== "feature") continue;

      const origin = it.system?.originItemType; // "ancestry" | "community" | "class" | "subclass" | etc.
      if (origin !== "ancestry" && origin !== "community") continue;

      const entry = {
        id: it.id,
        name: it.name,
        img: it.img || "icons/svg/aura.svg",
        description: it.system?.description ?? "",
        // An action hint if present; many features are passive, so this may be unused at click time
        actionPath: (()=>{
          const sys = it.system ?? {};
          // system.actions is an object keyed by id in this system; pick the first action if any
          if (sys.actions && typeof sys.actions === "object") {
            const first = Object.values(sys.actions)[0];
            if (first?.systemPath) return first.systemPath; // commonly "actions"
          }
          return "use"; // safe generic fallback
        })()
      };

      if (origin === "ancestry") ancestryFeatures.push(entry);
      else communityFeatures.push(entry);
    }

    // === CLASS / SUBCLASS FEATURES (originItemType) with TIER GATING FOR SUBCLASS ===
    const classFeatures = [];
    const subclassFeatures = [];

    // 1) Determine allowed subclass identifiers from the actor's subclass featureState
    //    featureState: 1 = foundation, 2 = specialization, 3 = mastery
    const subclasses = (this.actor?.items ?? []).filter(i => i.type === "subclass");
    let subclassTier = 0;
    for (const sc of subclasses) {
      const t = Number(sc.system?.featureState ?? 0);
      if (t > subclassTier) subclassTier = t; // in case of multiclass, allow the highest
    }

    const allowedSubclassIds = new Set();
    if (subclassTier >= 1) allowedSubclassIds.add("foundation");
    if (subclassTier >= 2) allowedSubclassIds.add("specialization");
    if (subclassTier >= 3) allowedSubclassIds.add("mastery");

    // 2) Collect features, gating subclass ones by identifier
    for (const it of (this.actor?.items ?? [])) {
      if (it.type !== "feature") continue;
      const origin = it.system?.originItemType; // "class" | "subclass" | ancestry | community | etc.

      if (origin === "class") {
        classFeatures.push({
          id: it.id,
          name: it.name,
          img: it.img || "icons/svg/aura.svg",
          description: it.system?.description ?? "",
          actionPath: (() => {
            const s = it.system ?? {};
            if (s.actions && typeof s.actions === "object") {
              const first = Object.values(s.actions)[0];
              if (first?.systemPath) return first.systemPath;
            }
            return "use";
          })()
        });
        continue;
      }

      if (origin === "subclass") {
        const ident = (it.system?.identifier || "").toString().toLowerCase();
        if (!allowedSubclassIds.has(ident)) continue; // GATE BY TIER

        subclassFeatures.push({
          id: it.id,
          name: it.name,
          img: it.img || "icons/svg/aura.svg",
          description: it.system?.description ?? "",
          actionPath: (() => {
            const s = it.system ?? {};
            if (s.actions && typeof s.actions === "object") {
              const first = Object.values(s.actions)[0];
              if (first?.systemPath) return first.systemPath;
            }
            return "use";
          })()
        });
      }
    }

    // === Actor Domains (header label, localized) ===
    const rawDomains = Array.isArray(sys.domains) ? sys.domains : [];
    const domainsHeader = rawDomains
      .map(d => String(d).trim())
      .filter(Boolean)
      .map(key => {
        // Try i18n label: DAGGERHEART.GENERAL.Domain.<key>.label
        const i18nKey = `DAGGERHEART.GENERAL.Domain.${key}.label`;
        const loc = game.i18n?.localize?.(i18nKey);
        if (loc && loc !== i18nKey) return loc; // localized OK
        // Fallback: TitleCase the raw key
        return key.charAt(0).toUpperCase() + key.slice(1);
      })
      .join(" & ") || null;

    // (optional) if you want a tooltip with the concatenated descriptions:
    const domainsHeaderTitle = rawDomains
      .map(key => {
        const dKey = String(key).trim();
        const name = game.i18n?.localize?.(`DAGGERHEART.GENERAL.Domain.${dKey}.label`);
        const desc = game.i18n?.localize?.(`DAGGERHEART.GENERAL.Domain.${dKey}.description`);
        return (name && desc) ? `${name}: ${desc}` : null;
      })
      .filter(Boolean)
      .join("\n") || "";

    // === RESOURCES (exact system paths) ===
    const hitPoints = {
      // system.resources.hitPoints.{value,max,isReversed}
      value: sys.resources?.hitPoints?.value ?? 0,
      max:   sys.resources?.hitPoints?.max   ?? 0,
      isReversed: !!sys.resources?.hitPoints?.isReversed
    };

    const stress = {
      // system.resources.stress.{value,max,isReversed}
      value: sys.resources?.stress?.value ?? 0,
      max:   sys.resources?.stress?.max   ?? 0,
      isReversed: !!sys.resources?.stress?.isReversed
    };

    // === HOPE ===
    const rawValue = sys.resources?.hope?.value ?? 0;
    const rawMax   = sys.resources?.hope?.max   ?? 0;
    const hopeMax  = Math.max(0, Number(rawMax));
    const hopeValue= Math.min(hopeMax, Math.max(0, Number(rawValue)));

    const hopePips = Array.from({ length: hopeMax }, (_, i) => ({
      filled: i < hopeValue
    }));

    // === TRAITS (ordered + localized via i18n helper) ===
    const TRAIT_ORDER = ["agility","strength","finesse","instinct","presence","knowledge"];

    const traits = TRAIT_ORDER.map(key => {
      const value = Number(sys.traits?.[key]?.value ?? 0);
      const loc = Ltrait(key); // { name, verbs[], description }
      return {
        key,
        name: loc.name,           // e.g., "Agility"
        value,                    // e.g., 2
        description: loc.description // e.g., "Sprint, Leap, Maneuver"
      };
    });

    // === PROFICIENCY / DEFENSES ===
    const proficiency = sys.proficiency ?? 0;   // system.proficiency
    const evasion     = sys.evasion     ?? 0;   // system.evasion
    const armorResource = sys.resources?.armor ?? {};
    const armor = {
      max: Number(armorResource.max ?? 0),
      value: Number(armorResource.value ?? 0),
      marks: Number(armorResource.max ?? 0) - Number(armorResource.value ?? 0), // Calculate marks taken
      isReversed: !!armorResource.isReversed
    };

    // === DAMAGE THRESHOLDS ===
    const thresholds = {
      major:  sys.damageThresholds?.major  ?? 0,
      severe: sys.damageThresholds?.severe ?? 0
    };

    // === RESISTANCE ===
    const resistance = {
      physical: {
        resistance: !!sys.resistance?.physical?.resistance,
        immunity:   !!sys.resistance?.physical?.immunity,
        reduction:  sys.resistance?.physical?.reduction ?? 0
      },
      magical: {
        resistance: !!sys.resistance?.magical?.resistance,
        immunity:   !!sys.resistance?.magical?.immunity,
        reduction:  sys.resistance?.magical?.reduction ?? 0
      }
    };

    // === INVENTORY (for now: Consumables, Loot) ===
    const invConsumables = [];
    const invLoot        = [];

    for (const it of (this.actor?.items ?? [])) {
      if (it.type !== "consumable" && it.type !== "loot") continue;

      const s = it.system ?? {};
      const entry = {
        id: it.id,
        type: it.type,                       // "consumable" | "loot"
        name: it.name,
        img: it.img || "icons/svg/aura.svg",
        qty: Number(s.quantity ?? 1),
        description: s.description ?? "",
        // action hint (some consumables can be "used")
        actionPath: (() => {
          if (it.type !== "consumable") return "";       // loot usually has no action
          const sys = it.system ?? {};
          if (sys.actionPath) return sys.actionPath;     // if system stores it plainly
          if (sys.actions && typeof sys.actions === "object") {
            const first = Object.values(sys.actions)[0];
            return first?.systemPath || "use";
          }
          return "use";
        })()
      };

      if (it.type === "consumable") invConsumables.push(entry);
      if (it.type === "loot")       invLoot.push(entry);
    }

    // === DOMAIN CARDS (Loadout vs Vault) ===
    // type: "domainCard"; system.inVault: boolean; system.domain: "blade" | "bone" | ...
    const domainLoadout = [];
    const domainVault   = [];

    for (const it of (this.actor?.items ?? [])) {
      if (it.type !== "domainCard") continue;

      const s = it.system ?? {};
      const entry = {
        id: it.id,
        name: it.name,
        img: it.img || "icons/svg/aura.svg",
        description: s.description ?? "",
        recallCost: Number(s.recallCost ?? 0),
        domain: (s.domain ?? "").toString(),   // e.g., "blade", "bone", "midnight"
        inVault: !!s.inVault,
        // If the system exposes actions, pick the first path; domain cards often have none
        actionPath: (() => {
          if (s.actionPath) return s.actionPath;
          if (s.actions && typeof s.actions === "object") {
            const first = Object.values(s.actions)[0];
            return first?.systemPath || "use";
          }
          return "use";
        })()
      };

      (entry.inVault ? domainVault : domainLoadout).push(entry);
    }  

    // === PARENT ITEMS: ancestry / community / class / subclass (for header captions) ===
    const byType = (t) => (this.actor?.items ?? []).find(i => i.type === t) ?? null;

    const ancestryItem  = byType("ancestry");
    const communityItem = byType("community");
    const classItem     = byType("class");
    const subclassItem  = byType("subclass");

    const ancestryInfo  = ancestryItem  ? { id: ancestryItem.id,  name: ancestryItem.name,  img: ancestryItem.img  } : null;
    const communityInfo = communityItem ? { id: communityItem.id, name: communityItem.name, img: communityItem.img } : null;
    const classInfo     = classItem     ? { id: classItem.id,     name: classItem.name,     img: classItem.img     } : null;
    const subclassInfo  = subclassItem  ? { id: subclassItem.id,  name: subclassItem.name,  img: subclassItem.img  } : null;


    // Return everything your HBS references today (+ a few future-safe keys)
    return {
      actorName,
      portrait,
      // hasRingArt,

      // resources
      hitPoints,
      stress,
      hope: { value: hopeValue, max: hopeMax },
      hopePips,

      // defenses & scores
      evasion,
      armor,
      thresholds,
      proficiency,

      // traits & resistances (even if HBS doesn’t show yet, ready to use)
      traits,
      resistance,

      // weapons
      primaryWeapon,
      secondaryWeapon,
      ancestryFeatures, communityFeatures, classFeatures, subclassFeatures,
      ancestryInfo, communityInfo, classInfo, subclassInfo,
      invConsumables, invLoot,
      domainLoadout, domainVault,domainsHeader, domainsHeaderTitle,
      
      //effects
      statusEffects,
      availableConditions,
      showGenericStatusSection: showGenericStatuses
    };
  }

  async _onRender() {
    // Respect per-user disable toggle
    if (getSetting(S.disableForMe)) { this.close(); return; }

    const root = this.element;
    if (!root) return;

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

    // Store context for later use
    this._currentContext = await this._prepareContext();

    // Debug: portrait image element presence
    const imgEl = root.querySelector(".dhud-portrait img");
    console.debug("[DHUD] _onRender: portrait img element", {
      found: !!imgEl,
      src: imgEl?.getAttribute("src"),
      alt: imgEl?.getAttribute("alt")
    });

    // Normalize image paths to routed URLs
    function toRouteURL(p) {
      if (!p) return "none";
      let cleanPath = p.trim();

      // Full URLs pass through
      if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
        return `url("${cleanPath}")`;
      }

      // Absolute module/asset paths
      if (cleanPath.startsWith("/")) {
        const abs = foundry.utils.getRoute(cleanPath);
        return `url("${abs}")`;
      }

      // Ensure leading slash for relative asset paths
      if (!cleanPath.startsWith("/")) {
        cleanPath = `/${cleanPath}`;
      }

      const abs = foundry.utils.getRoute(cleanPath);
      return `url("${abs}")`;
    }

    // --- Theme: Actor flag only. Fallback to "default" if the theme isn’t defined in CSS.
    const prefix = "dhud-theme-";
    const actorSchemeRaw = this.actor ? (await this.actor.getFlag("daggerheart-hud", "colorScheme")) : "";
    const scheme = (actorSchemeRaw || "default").trim() || "default";

    // remove any previous theme classes
    for (const c of Array.from(root.classList)) {
      if (c.startsWith(prefix)) root.classList.remove(c);
    }

    // apply the requested scheme
    root.classList.add(prefix + scheme);

    // verify the theme actually defines vars; if not, fallback to default
    const cs = getComputedStyle(root);
    if (!cs.getPropertyValue("--dh-accent").trim()) {
      console.warn(`[DHUD] Unknown or missing theme "${scheme}" for ${this.actor?.name}; falling back to "default".`);
      root.classList.remove(prefix + scheme);
      root.classList.add(prefix + "default");
    }

    // --- Ring art: Actor flags only (no GM/global fallback)
    const mainRing = getActorRingImageOrDefault(this.actor, "main");
    const weapRing = getActorRingImageOrDefault(this.actor, "weapon");
    root.style.setProperty("--dhud-ring-main",  toRouteURL(mainRing));
    root.style.setProperty("--dhud-ring-weapon", toRouteURL(weapRing));

    // Cosmetic pointer cursor for roll targets
    root.querySelectorAll(".dhud-roll").forEach(el => {
      el.style.cursor = "pointer";
      el.setAttribute("aria-pressed", "false");
    });

    // Feature toggles on the HUD
    attachDHUDToggles(root);

    // One-time wiring for resource adjusters
    if (!this._resAdjBound) {
      this._bindResourceAdjusters(root);
      this._resAdjBound = true;
    }

    // Hooks to re-apply art/theme on changes coming from the Configurator
    if (!this._imgHooked) {
      // Re-apply both rings and theme when the Configurator saves
      this._reapplyAppearance ??= async ({ actorIds = [] } = {}) => {
        if (!this.actor) return;
        if (actorIds.length && !actorIds.includes(this.actor.id)) return;

        // rings
        const mr = getActorRingImageOrDefault(this.actor, "main");
        const wr = getActorRingImageOrDefault(this.actor, "weapon");
        root.style.setProperty("--dhud-ring-main",  toRouteURL(mr));
        root.style.setProperty("--dhud-ring-weapon", toRouteURL(wr));

        // theme
        const scheme = (await this.actor.getFlag("daggerheart-hud", "colorScheme")) || "default";
        const prefix = "dhud-theme-";
        root.classList.forEach(c => { if (c.startsWith(prefix)) root.classList.remove(c); });
        root.classList.add(`${prefix}${scheme}`);
      };

      // Listen only to the Configurator’s saves
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
        const userGlobalPos = game.user.getFlag("daggerheart-hud", "globalPosition");
        
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

      this._onResize = () => { if (!this._isDragging) applyPlacement(); };
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

    // Delegated HUD interactions (ring, traits, weapons, exec, chat, move)
    this._bindDelegatedEvents();
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
