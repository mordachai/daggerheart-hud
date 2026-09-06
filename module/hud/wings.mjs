// module/hud/wings.mjs
// Wing open/close state, tab-panel open direction, and the tab toggler.
// Pure DOM helpers — no system knowledge, no `this`. Extracted in refactor step 2.

/** Toggle the wings open/closed and keep the ring core visually anchored. */
export function setWingsState(rootEl, state /* "open" | "closed" */) {
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
    if (Math.abs(dx) > 0.5) {
      const app = rootEl;
      const currentLeft = parseFloat(app.style.left || "0");
      app.style.left = `${currentLeft - dx}px`;
    }
  });
}

/**
 * Decide whether a tab panel should open up or down.
 * Sets:
 *   panel.dataset.openDir = "up" | "down"
 *   panel.style.setProperty("--dhud-panel-maxh", "<px>")  (so it scrolls if tight)
 */
export function setPanelOpenDirection(panel) {
  if (!panel) return;

  // Measure the tabwrap (panel’s offset parent is .dhud-tabwrap)
  const wrap = panel.closest(".dhud-tabwrap") || panel.parentElement;
  const rect = wrap.getBoundingClientRect();

  const spaceAbove = rect.top;                                 // px to viewport top
  const spaceBelow = window.innerHeight - rect.bottom;         // px to viewport bottom

  // Estimate needed height: content’s natural height (capped)
  // Using scrollHeight lets us respect the actual content size.
  const contentHeight = panel.scrollHeight || 320;
  const minRoom = 220;     // lower bound so short panels don’t jitter
  const need = Math.max(minRoom, Math.min(contentHeight, 700));

  // Choose direction
  let dir;
  if (spaceBelow >= need) dir = "down";
  else if (spaceAbove >= need) dir = "up";
  else dir = (spaceBelow >= spaceAbove) ? "down" : "up";

  // Apply direction and max height
  panel.setAttribute("data-open-dir", dir);
  // Let CSS clamp the panel with a friendly margin to edges
  const maxH = (dir === "down" ? Math.max(180, spaceBelow - 12) : Math.max(180, spaceAbove - 12));
  panel.style.setProperty("--dhud-panel-maxh", `${maxH}px`);
  panel.style.setProperty("--dhud-panel-gap", "6px"); // small visual gap below/above the tab
}

/** Wire the tab buttons to toggle their panel, plus outside-click / ESC close. */
export function attachDHUDToggles(root) {
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
