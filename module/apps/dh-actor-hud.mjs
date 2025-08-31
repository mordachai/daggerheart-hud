// module/apps/dh-actor-hud.mjs

import { L, Lpath, Ltrait } from "../helpers/i18n.mjs";

const BOTTOM_OFFSET = 110; // px

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
    console.debug("[DHUD] ctor", {
      actorId: actor?.id, actorName: actor?.name, tokenId: token?.id
    });
    this.actor = actor ?? null;
    this.token = token ?? actor?.getActiveTokens()?.[0]?.document ?? null;
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

    // === PRIMARY WEAPON (type:"weapon"; prefer equipped) ===
    let primaryWeapon = null;
    {
      const items = this.actor?.items ?? [];
      const weapons = items.filter(i => i.type === "weapon");
      const equipped = weapons.filter(w => w.system?.equipped === true);
      const list = equipped.length ? equipped : weapons;

      // Prefer one that exposes an "attack" action if present; else first
      const pick = list.find(w => w.system?.attack) ?? list[0] ?? null;

      if (pick) {
        primaryWeapon = {
          id: pick.id,
          name: pick.name,
          img: pick.img || "icons/svg/sword.svg"
        };
      }
    }

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
    const armor = {
      max:   sys.armorScore ?? 0,               // no max in system; mirror value so UI shows X/X
      marks: 0
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

    

    // Debug (feel free to keep while wiring more keys)
    console.debug("[DHUD] _prepareContext (wired)", {
      actorId: actor?.id,
      actorName,
      portrait,
      hope: { value: hopeValue, max: hopeMax },
      hopePipsLen: hopePips.length,
      paths: {
      resources: sys.resources,
      traits: sys.traits,
      proficiency, evasion, armorScore: sys.armorScore,
      damageThresholds: sys.damageThresholds,
      resistance: sys.resistance
      }
    });

    // Return everything your HBS references today (+ a few future-safe keys)
    return {
      actorName,
      portrait,

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
      primaryWeapon
    };
  }

  async _onRender() {
    const root = this.element;
    if (!root) return;

    const imgEl = root.querySelector(".dhud-portrait img");
    console.debug("[DHUD] _onRender: portrait img element", {
      found: !!imgEl,
      src: imgEl?.getAttribute("src"),
      alt: imgEl?.getAttribute("alt")
    });

    // Make roll targets feel clickable
    root.querySelectorAll(".dhud-roll").forEach(el => {
      el.style.cursor = "pointer";
      el.setAttribute("aria-pressed", "false");
    });

    // Tabs/panels toggler
    attachDHUDToggles(root);

    // Ensure wings default CLOSED before showing anything
    if (!this._wingsInit) {
      const shell = root.querySelector(".dhud");
      if (shell && !shell.hasAttribute("data-wings")) {
        shell.setAttribute("data-wings", "closed");
      }
      this._wingsInit = true;
    }

    // First boot: hide, place at bottom, then reveal (prevents flicker/teleport)
    if (!this._booted) {
      root.classList.add("is-booting");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          placeAtBottom(root);              // anchors 110px from bottom
          root.classList.remove("is-booting");
          this._booted = true;
        });
      });
      // Keep bottom anchor on resize (unless dragging)
      this._onResize = () => { if (!this._isDragging) placeAtBottom(root); };
      window.addEventListener("resize", this._onResize);
    }

    // Drag by the ring (function should implement the didMove safeguard)
    if (!this._dragHooked) {
      enableDragByRing(root, this);
      this._dragHooked = true;
    }

    // Toggle wings by clicking the ring (ignore click right after a drag)
    const ring = root.querySelector(".dhud-ring");
    if (ring && !this._ringToggleHooked) {
      ring.style.cursor = "pointer";
      ring.addEventListener("click", () => {
        if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;
        const shell = root.querySelector(".dhud");
        const open = shell?.getAttribute("data-wings") !== "open";
        setWingsState(root, open ? "open" : "closed");
      });
      this._ringToggleHooked = true;
    }   

    // --- Traits: icon rolls immediately; only the title toggles <details>
    if (!this._traitRollHooked) {
      const panel = this.element.querySelector(".dhud-panel--traits");
      if (panel) {
        // Helper: stop <summary> default toggle
        const stopToggle = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

        // 1) Icon + value should NOT toggle the <details>
        panel.querySelectorAll("summary .icon, summary .value").forEach(el => {
          if (el._dhudBlockToggle) return;
          el.addEventListener("click",     stopToggle, true);   // capture to beat summary
          el.addEventListener("pointerup", stopToggle, true);
          el.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") stopToggle(ev);
          }, true);
          el._dhudBlockToggle = true;
        });

        // 2) Clicking the icon rolls immediately (no second click in chat)
        panel.querySelectorAll("[data-action='roll-trait']").forEach(btn => {
          if (btn._dhudRollBound) return;

          const rollNow = () => {
            if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;
            const traitKey = btn.dataset.trait;
            ui.chat?.processMessage?.(`/dr trait=${traitKey}`);
          };

          btn.addEventListener("click", (ev) => { stopToggle(ev); rollNow(); }, true);
          btn.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") { stopToggle(ev); rollNow(); }
          }, true);

          btn._dhudRollBound = true;
        });
      }
      this._traitRollHooked = true;
    }

    // --- Primary Weapon roll: click the left circle (instant system roll)
    if (!this._primaryWeaponHooked) {
      const btn = this.element.querySelector("[data-action='roll-primary']");
      if (btn) {
        btn.addEventListener("click", async (ev) => {
          // ignore accidental click right after dragging
          if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;

          const actor = this.actor;
          if (!actor) return;

          // Try to resolve the weapon from the DOM first, then heuristics
          const idFromDom = btn.dataset.itemId;
          let item = idFromDom ? actor.items.get(idFromDom) : null;
          if (!item) {
            const weapons = actor.items.filter(i => i.type === "weapon");
            const equipped = weapons.filter(w => w.system?.equipped === true);
            const list = equipped.length ? equipped : weapons;
            item = (list.find(w => w.system?.attack) ?? list[0]) ?? null;
          }
          if (!item) {
            ui.notifications?.warn("No primary weapon found");
            return;
          }

          try {
            // Prefer explicit item action hooks if the system exposes them
            if (typeof item.rollAction === "function") {
              await item.rollAction("attack"); // opens the system’s attack dialog/card
              return;
            }
            if (typeof item.use === "function") {
              await item.use({ action: "attack" });
              return;
            }
            // System-level executor (namespaced in some Foundryborne builds)
            const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;
            if (Action?.execute) {
              await Action.execute({ source: item, actionPath: "attack" });
              return;
            }

            // Fallback: open the weapon sheet so the user can click its Attack button
            item.sheet?.render(true, { focus: true });
            ui.notifications?.info("Opened weapon; click its Attack");
          } catch (err) {
            console.error("[DHUD] Primary weapon roll failed", err);
            ui.notifications?.error("Weapon roll failed (see console)");
          }
        }, true);
      }
      this._primaryWeaponHooked = true;
    }


  }


}
