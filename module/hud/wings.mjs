// module/hud/wings.mjs
// Tab-panel open direction + the nav-bar tab toggler.
// Pure DOM helpers — no system knowledge, no `this`.

/**
 * Decide whether a tab panel should open up or down.
 * Sets:
 *   panel.dataset.openDir = "up" | "down"
 *   panel.style.setProperty("--dhud-panel-maxh", "<px>")  (so it scrolls if tight)
 */
export function setPanelOpenDirection(panel) {
  if (!panel) return;

  // Measure the nav bar (panel’s offset parent is .dhud-navbar / .dhud-tabwrap)
  const wrap = panel.closest(".dhud-navbar, .dhud-tabwrap") || panel.parentElement;
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
