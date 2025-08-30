// module/apps/dh-actor-hud.mjs

const BOTTOM_OFFSET = 85; // px

function placeAtBottom(appEl) {
  if (!appEl?.getBoundingClientRect) return;
  appEl.style.position = "absolute";
  appEl.style.bottom = `${BOTTOM_OFFSET}px`;
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
    if (didMove) appInstance._justDraggedTs = Date.now(); // só se arrastou de verdade
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
  if (!rootEl) return;
  const shell = rootEl.querySelector(".dhud");
  const leftWing  = rootEl.querySelector(".dhud-wing--left");
  const rightWing = rootEl.querySelector(".dhud-wing--right");
  if (!shell || !leftWing || !rightWing) return;

  shell.setAttribute("data-wings", state);

  // Accessibility & focus: when closed, take wings out of the tab order
  const closed = state === "closed";
  leftWing.toggleAttribute("inert", closed);
  rightWing.toggleAttribute("inert", closed);

  // If closing, also collapse any open panel
  if (closed) shell.setAttribute("data-open", "");
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
  }

  async getData() {
    return { actorName: this.actor?.name ?? "Daggerheart" }; // placeholders por enquanto
  }

  async _onRender() {
    const root = this.element;
    if (!root) return;

    // keep your existing bits…
    root.querySelectorAll(".dhud-roll").forEach(el => {
      el.style.cursor = "pointer";
      el.setAttribute("aria-pressed", "false");
    });
    attachDHUDToggles(root);

    // default: wings CLOSED (core only)
    if (!this._wingsInit) {
      const shell = root.querySelector(".dhud");
      if (shell) setWingsState(root, "closed");
      this._wingsInit = true;
    }

    // position the HUD above the bottom (do this after Foundry finishes layout)
    if (!this._placedOnce) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          placeAtBottom(root);
          this._placedOnce = true;
        });
      });
      this._onResize = () => { if (!this._isDragging) placeAtBottom(root); };
      window.addEventListener("resize", this._onResize);
    }

    // ring drag
    if (!this._dragHooked) {
      enableDragByRing(root, this);
      this._dragHooked = true;
    }

    // toggle wings by CLICKING THE RING
    const ring = root.querySelector(".dhud-ring");
    if (ring && !this._ringToggleHooked) {
      ring.style.cursor = "pointer";
      ring.addEventListener("click", () => {
        // só ignore se houve arrasto muito recente
        if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;
        const shell = root.querySelector(".dhud");
        const open = shell?.getAttribute("data-wings") !== "open";
        setWingsState(root, open ? "open" : "closed");
      });
      this._ringToggleHooked = true;
    }

  }

}
