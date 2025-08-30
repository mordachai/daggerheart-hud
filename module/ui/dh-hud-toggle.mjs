// Minimal toggler for the HUD panels (no data wiring).
export function attachDHUDToggles(root) {
  if (!root) return;
  const tabs = root.querySelectorAll('.dhud-tab');

  function setOpen(name) {
    const current = root.getAttribute('data-open') || '';
    const next = current === name ? '' : name;
    root.setAttribute('data-open', next);
    tabs.forEach(t => t.setAttribute('aria-expanded', String(t.dataset.tab === next)));
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => setOpen(tab.dataset.tab));
    tab.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setOpen(tab.dataset.tab); }
    });
  });

  // Close on outside click
  function onDocClick(ev) {
    if (!root.contains(ev.target)) setOpen('');
  }
  document.addEventListener('pointerdown', onDocClick);

  // Close on ESC when focus is inside
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') setOpen('');
  });
}
