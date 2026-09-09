// module/hud/portrait-menu-extras.mjs
// Adds "buttons other modules put on the character sheet" to the HUD portrait
// context menu, WITHOUT touching any other part of the HUD.
//
// Wiring: a single `renderDaggerheartActorHUD` hook listener appends items to the
// existing `#dhud-context-menu`, and one document-level capture click listener
// dispatches them. Every entry point is wrapped so a failure just means the extra
// items are missing — the HUD itself is never affected.
//
// Sources of items:
//   1. AppV2 sheet header controls the system did not add (3rd-party modules that
//      push to `getHeaderControls<SheetClass>` / `_getHeaderControls`).
//   2. The curated PORTRAIT_MENU_REGISTRY (module-specific API calls).
//   3. Anything pushed by listeners of `daggerheart-hud:collectPortraitMenuItems`.

import { PORTRAIT_MENU_REGISTRY } from "../system/portrait-menu-registry.mjs";

/** Header-control `action` ids that are core/system built-ins — never shown. */
const HEADER_DENYLIST = new Set([
  "detach", "attach", "configureSheet", "configureOwnership",
  "configurePrototypeToken", "showPortraitArtwork", "showTokenArtwork",
  "configureLevelUpOptions", "viewLevelups", "resetCharacter",
]);

const EXTRA_ATTR = "data-dhud-extra-key";
const COLLECT_HOOK = "daggerheart-hud:collectPortraitMenuItems";

/** Newest HUD app seen by the render hook — used by the document click listener. */
let _lastApp = null;
/** key -> descriptor for the items currently in the DOM. */
let _items = new Map();
let _clickBound = false;

/* ------------------------------------------------------------------ collect - */

/** Strip a leading `<i ...>` / wrapping markup from a header-control icon value. */
function iconClass(icon) {
  if (typeof icon !== "string") return "fa-solid fa-circle";
  const m = icon.match(/class=["']([^"']+)["']/);
  return (m ? m[1] : icon).trim() || "fa-solid fa-circle";
}

/** Header controls added by other modules (system/core built-ins removed). */
function headerButtons(actor) {
  const out = [];
  let controls;
  try {
    controls = actor?.sheet?._getHeaderControls?.() ?? [];
  } catch (e) {
    console.warn("[DHUD] _getHeaderControls failed", e);
    return out;
  }
  for (const c of controls) {
    if (!c || HEADER_DENYLIST.has(c.action)) continue;
    try {
      if (typeof c.visible === "function" && !c.visible.call(actor.sheet)) continue;
    } catch { continue; }
    if (c.visible === false) continue;
    out.push({
      key: `hdr:${c.action ?? out.length}`,
      label: game.i18n?.localize?.(c.label) ?? c.label ?? "—",
      icon: iconClass(c.icon),
      kind: "header",
      control: c,
    });
  }
  return out;
}

/** Curated registry entries whose module is active + API present. */
function registryButtons(actor) {
  const out = [];
  for (const e of PORTRAIT_MENU_REGISTRY) {
    try {
      if (e.moduleId && !game.modules?.get(e.moduleId)?.active) continue;
      if (typeof e.available === "function" && !e.available()) continue;
      let disabled = false;
      if (typeof e.enabled === "function") {
        try { disabled = !e.enabled(actor); } catch { disabled = false; }
      }
      out.push({
        key: `reg:${e.id}`,
        label: e.label ?? e.id,
        icon: e.icon || "fa-solid fa-circle",
        kind: "registry",
        entry: e,
        disabled,
      });
    } catch (err) {
      console.warn(`[DHUD] portrait menu registry entry '${e?.id}' skipped`, err);
    }
  }
  return out;
}

/** Items contributed by other code via the collect hook. */
function hookButtons(actor) {
  const raw = [];
  try {
    Hooks.callAll(COLLECT_HOOK, actor, raw);
  } catch (e) {
    console.warn("[DHUD] collectPortraitMenuItems hook failed", e);
  }
  const out = [];
  raw.forEach((it, i) => {
    if (!it || (typeof it.invoke !== "function" && !it.selector)) return;
    out.push({
      key: `ext:${it.id ?? i}`,
      label: it.label ?? "—",
      icon: it.icon || "fa-solid fa-circle",
      kind: "hook",
      entry: it,
      disabled: it.disabled === true,
    });
  });
  return out;
}

function collectButtons(actor) {
  if (!actor || actor.type !== "character") return [];
  return [...headerButtons(actor), ...registryButtons(actor), ...hookButtons(actor)];
}

/* ------------------------------------------------------------------ invoke -- */

async function clickInSheet(actor, selector) {
  if (!selector) return false;
  await actor.sheet.render(true);
  const el = actor.sheet.element?.querySelector(selector);
  if (!el) return false;
  if (el.disabled || el.getAttribute("aria-disabled") === "true") {
    ui.notifications?.info("That sheet button is currently disabled.");
    return true;
  }
  el.click();
  return true;
}

async function invokeItem(actor, item) {
  if (!actor || !item) return;
  try {
    if (item.kind === "registry" || item.kind === "hook") {
      const e = item.entry;
      if (item.disabled && item.kind === "registry") {
        ui.notifications?.info(`${item.label} is not available right now.`);
        return;
      }
      if (typeof e.invoke === "function") { await e.invoke(actor); return; }
      if (await clickInSheet(actor, e.selector)) return;
      ui.notifications?.warn(`Could not run "${item.label}".`);
      return;
    }

    // header control
    const c = item.control;
    if (typeof c.onClick === "function") {
      try { await c.onClick.call(actor.sheet, new PointerEvent("click")); return; }
      catch { /* fall through to click the rendered control */ }
    }
    if (c.action && await clickInSheet(actor, `[data-action="${c.action}"]`)) return;
    ui.notifications?.warn(`Could not run "${item.label}".`);
  } catch (err) {
    console.error("[DHUD] portrait menu item failed", err);
    ui.notifications?.error(`"${item.label}" failed (see console).`);
  }
}

/* ------------------------------------------------------------------ render -- */

function inject(app, el) {
  const menu = el?.querySelector?.("#dhud-context-menu");
  if (!menu) return;

  // Idempotent: drop anything we added on a previous render.
  menu.querySelectorAll(`[${EXTRA_ATTR}]`).forEach((n) => n.remove());
  _items = new Map();

  const items = collectButtons(app.actor);
  if (!items.length) return;

  const sep = document.createElement("div");
  sep.className = "dhud-context-item dhud-context-extra-sep";
  sep.setAttribute(EXTRA_ATTR, "sep");
  sep.setAttribute("aria-hidden", "true");
  sep.style.pointerEvents = "none";
  sep.style.opacity = "0.4";
  sep.style.fontSize = "0.75em";
  sep.style.textTransform = "uppercase";
  sep.style.letterSpacing = "0.08em";
  sep.textContent = "Module actions";
  menu.appendChild(sep);

  for (const item of items) {
    _items.set(item.key, item);
    const node = document.createElement("div");
    node.className = "dhud-context-item";
    node.setAttribute(EXTRA_ATTR, item.key);
    if (item.disabled) {
      node.style.opacity = "0.5";
      node.title = `${item.label} (unavailable)`;
    }
    const i = document.createElement("i");
    i.className = item.icon;
    node.appendChild(i);
    node.appendChild(document.createTextNode(` ${item.label}`));
    menu.appendChild(node);
  }
}

/**
 * Capture-phase, document-level. The HUD's own context-menu handler lives on the
 * HUD root in capture phase and stops propagation for every `.dhud-context-item`,
 * so a listener on our nodes would never fire. Running on `document` in capture
 * gets us in first; we handle our items and stop there, leaving every native menu
 * item (rest, conditions, party, companion) completely untouched.
 */
function onDocumentClick(ev) {
  const node = ev.target?.closest?.(`.dhud-context-item[${EXTRA_ATTR}]`);
  if (!node) return;
  const key = node.getAttribute(EXTRA_ATTR);
  if (key === "sep") return;

  ev.preventDefault();
  ev.stopImmediatePropagation();

  node.closest(".dhud-context-menu")?.classList.remove("show");

  const actor = _lastApp?.actor ?? null;
  const item = _items.get(key);
  if (actor && item) invokeItem(actor, item);
}

/* ------------------------------------------------------------------ boot ---- */

Hooks.on("renderDaggerheartActorHUD", (app, el) => {
  _lastApp = app;
  try {
    inject(app, el);
  } catch (e) {
    console.warn("[DHUD] portrait menu extras skipped", e);
  }
  if (!_clickBound) {
    document.addEventListener("click", onDocumentClick, true);
    _clickBound = true;
  }
});
