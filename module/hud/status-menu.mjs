// module/hud/status-menu.mjs
// Portrait right-click context menu, the condition grid, and the hover tooltip.
// Extracted from dh-actor-hud.mjs in refactor step 3 — pure move.
// Step 7: condition state goes through system/conditions.mjs (actor.toggleStatusEffect).

import { isActive, toggle } from "../system/conditions.mjs";
import { openPartySheet, openCompanionSheet } from "../system/actor.mjs";
import { openPartnerSheet } from "../system/companion.mjs";
import { isPositionLocked, setPositionLocked } from "./position.mjs";

const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

/** Reflect the current lock state on the context menu's toggle-lock item. */
function syncLockMenuItem(app) {
  const item = app.element?.querySelector("#dhud-context-lock");
  if (!item) return;
  const locked = isPositionLocked();
  item.querySelector("i")?.setAttribute("class", locked ? "fas fa-lock" : "fas fa-lock-open");
  const label = item.querySelector("span");
  if (label) label.textContent = locked ? "Unlock Position" : "Lock Position";
}

/** Position + show the portrait context menu. */
export function showStatusContextMenu(app, x, y) {
  hideStatusGrid(app);
  syncLockMenuItem(app);
  const menu = app.element.querySelector('#dhud-context-menu');
  const portrait = app.element.querySelector('.dhud-portrait');
  const core = app.element.querySelector('.dhud-core');

  if (!menu || !portrait || !core) return;

  // First, show the menu off-screen to measure it
  menu.style.left = '-9999px';
  menu.style.top = '-9999px';
  menu.classList.add('show');

  // Force a reflow to ensure styles are applied
  menu.offsetHeight;

  // Get menu dimensions
  const menuRect = menu.getBoundingClientRect();
  const menuWidth = menuRect.width;
  const menuHeight = menuRect.height;

  // Get core position (stable anchor for the portrait menu)
  const coreRect = core.getBoundingClientRect();
  const portraitRect = portrait.getBoundingClientRect();

  // Calculate portrait center relative to the core element (stable)
  const portraitCenterX = portraitRect.left - coreRect.left + (portraitRect.width / 2);
  const portraitCenterY = portraitRect.top - coreRect.top + (portraitRect.height / 2);

  // Position menu relative to portrait center within the core container
  let menuX = portraitCenterX - (menuWidth / 2) + 90;
  let menuY = portraitCenterY + (portraitRect.height / 2) - 200;

  // Get viewport dimensions for boundary checking
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Convert to viewport coordinates for boundary checking
  const menuViewportX = coreRect.left + menuX;
  const menuViewportY = coreRect.top + menuY;

  // Adjust horizontal position if it goes off viewport
  if (menuViewportX + menuWidth > viewportWidth) {
    menuX = viewportWidth - coreRect.left - menuWidth - 10;
  }
  if (menuViewportX < 10) {
    menuX = 10 - coreRect.left;
  }

  // The menu must not spill past the nav-bar strip below the core; treat the
  // nav bar's top (or the viewport edge, whichever is higher) as the hard floor.
  const navBar = app.element?.querySelector('.dhud-navbar');
  const navTop = navBar ? navBar.getBoundingClientRect().top : viewportHeight;
  const floorViewportY = Math.min(viewportHeight - 10, navTop - 6);

  // Adjust vertical position if it goes off viewport / past the nav bar
  if (menuViewportY + menuHeight > floorViewportY) {
    // Try positioning above the portrait
    menuY = portraitCenterY - (portraitRect.height / 2) - menuHeight - 10;

    // If still off-screen above, clamp to the top …
    if (coreRect.top + menuY < 10) {
      menuY = 10 - coreRect.top;
    }
    // … then pull the bottom back up to the floor if it still overlaps.
    if (coreRect.top + menuY + menuHeight > floorViewportY) {
      menuY = floorViewportY - menuHeight - coreRect.top;
    }
  }

  // Append menu to core element and use absolute positioning relative to core
  if (menu.parentElement !== core) {
    core.appendChild(menu);
  }

  menu.style.position = 'absolute';
  menu.style.left = `${menuX}px`;
  menu.style.top = `${menuY}px`;

  // Store the portrait center for the status grid positioning
  app._portraitCenter = {
    x: portraitCenterX,
    y: portraitCenterY,
    coreElement: core
  };
}

/** Position + show the condition grid. */
export function showStatusGrid(app, x, y) {
  const grid = app.element.querySelector('#dhud-status-grid');
  const core = app.element.querySelector('.dhud-core');
  if (!grid || !core) return;

  // Show off-screen first to measure
  grid.style.position = 'absolute';
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
      icon.classList.toggle('active', isActive(app.actor, conditionId));
    }
  });

  // Get dimensions
  const gridRect = grid.getBoundingClientRect();
  const coreRect = core.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Use stored portrait center if available, otherwise fall back to click position
  const anchorX = app._portraitCenter?.x || x;
  const anchorY = app._portraitCenter?.y || y;

  // Position relative to the portrait center within core container
  let adjustedX = anchorX - (gridRect.width / 2); // Center horizontally on portrait
  let adjustedY = anchorY + 80; // Position below portrait with offset

  // Convert to viewport coordinates for boundary checking
  const gridViewportX = coreRect.left + adjustedX;
  const gridViewportY = coreRect.top + adjustedY;

  // Adjust if grid would go off-screen horizontally
  if (gridViewportX + gridRect.width > viewportWidth) {
    adjustedX = viewportWidth - coreRect.left - gridRect.width - 10;
  }
  if (gridViewportX < 10) {
    adjustedX = 10 - coreRect.left;
  }

  // Adjust if grid would go off-screen vertically
  if (gridViewportY + gridRect.height > viewportHeight) {
    // Try positioning above the portrait
    adjustedY = anchorY - gridRect.height - 80;

    // If still off-screen above, clamp to top
    if (coreRect.top + adjustedY < 10) {
      adjustedY = 10 - coreRect.top;
    }
  }

  // Append grid to core element and use absolute positioning relative to core
  if (grid.parentElement !== core) {
    core.appendChild(grid);
  }

  grid.style.left = `${adjustedX}px`;
  grid.style.top = `${adjustedY}px`;
}

export function hideStatusContextMenu(app) {
  const menu = app.element?.querySelector('#dhud-context-menu');
  if (menu) menu.classList.remove('show');
}

export function hideStatusGrid(app) {
  const grid = app.element?.querySelector('#dhud-status-grid');
  if (grid) grid.classList.remove('show');
}

export function hideTooltip(app) {
  const tooltip = app.element?.querySelector('#dhud-tooltip');
  if (tooltip) tooltip.classList.remove('show');
}

export function showTooltip(app, x, y, text) {
  const tooltip = app.element.querySelector('#dhud-tooltip');
  if (!tooltip) return;

  tooltip.textContent = text;
  tooltip.style.left = `${x + 10}px`;
  tooltip.style.top = `${y - 30}px`;
  tooltip.classList.add('show');
}

/** Wire portrait context menu + condition grid + tooltip listeners. Guarded once per app. */
export function attachStatusMenu(app) {
  const rootEl = app.element;
  if (!rootEl || app._statusMenuBound) return;

  // Right-click on portrait to show context menu
  rootEl.addEventListener('contextmenu', async (ev) => {
    const portrait = ev.target.closest('.dhud-portrait, .dhud-portrait-img');
    if (portrait) {
      ev.preventDefault();
      ev.stopPropagation();
      const hudRect = rootEl.getBoundingClientRect();
      const relativeX = ev.clientX - hudRect.left;
      const relativeY = ev.clientY - hudRect.top;
      showStatusContextMenu(app, relativeX, relativeY);
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
        const menu = rootEl.querySelector('#dhud-context-menu');
        if (menu) {
          const menuStyle = menu.style;
          const x = parseInt(menuStyle.left) || 0;
          const y = parseInt(menuStyle.top) || 0;
          showStatusGrid(app, x, y);
        }
      }

      if (action === 'open-party') openPartySheet(app.actor);

      if (action === 'open-companion') openCompanionSheet(app.actor);

      if (action === 'open-partner') openPartnerSheet(app.actor);

      if (action === 'toggle-lock') {
        await setPositionLocked(rootEl, !isPositionLocked());
      }

      if (action === 'short-rest' || action === 'long-rest') {
        try {
          const DowntimeDialog = game.system.api.applications.dialogs.Downtime;
          let dialog;
          dialog = (action === 'short-rest')
            ? new DowntimeDialog(app.actor, 'anything') // Short Rest
            : new DowntimeDialog(app.actor);            // Long Rest
          dialog.render(true);
        } catch (error) {
          console.error("Error opening downtime dialog:", error);
          ui.notifications.error("Failed to open rest dialog");
        }
      }

      hideStatusContextMenu(app);
      return;
    }
  }, true);

  // Status icon interactions
  rootEl.addEventListener('click', async (ev) => {
    const statusIcon = ev.target.closest('.dhud-status-icon');
    if (statusIcon) {
      stop(ev);
      const conditionId = statusIcon.dataset.conditionId;
      const next = !isActive(app.actor, conditionId);
      await toggle(app.actor, conditionId, next);
      statusIcon.classList.toggle('active', next);
      return;
    }
  }, true);

  // Status icon tooltips
  rootEl.addEventListener('mouseover', (ev) => {
    const statusIcon = ev.target.closest('.dhud-status-icon');
    if (statusIcon) {
      const name = statusIcon.dataset.conditionName;
      showTooltip(app, ev.clientX, ev.clientY, name);
    }
  });

  rootEl.addEventListener('mouseout', (ev) => {
    const statusIcon = ev.target.closest('.dhud-status-icon');
    if (statusIcon) {
      hideTooltip(app);
    }
  });

  // Close menus on outside clicks
  document.addEventListener('click', (ev) => {
    const clickedElement = ev.target;
    const statusIcon = clickedElement.closest('.dhud-status-icon');
    const contextMenu = clickedElement.closest('#dhud-context-menu, .dhud-context-menu');
    const statusGrid = clickedElement.closest('#dhud-status-grid, .dhud-status-grid');
    const withinHUD = rootEl && rootEl.contains(clickedElement);
    if (!statusIcon && !contextMenu && !statusGrid && !withinHUD) {
      hideStatusContextMenu(app);
      hideStatusGrid(app);
    }
  }, { capture: true });

  // Close menus on Escape
  rootEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      hideStatusContextMenu(app);
      hideStatusGrid(app);
    }
  });

  app._statusMenuBound = true;
}
