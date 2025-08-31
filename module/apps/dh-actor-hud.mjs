// module/apps/dh-actor-hud.mjs

import { L, Lpath, Ltrait } from "../helpers/i18n.mjs";
import { sendItemToChat } from "../helpers/chat-utils.mjs";


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
      resistance: sys.resistance,
      ancestry: ancestryFeatures.map(f => f.name),
      community: communityFeatures.map(f => f.name),
      subclassTier,
      allowed: Array.from(allowedSubclassIds),
      shownSubclass: subclassFeatures.map(f => `${f.name}`),
      }
    });

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
      domainLoadout, domainVault,domainsHeader, domainsHeaderTitle  
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
        const willOpen = shell?.getAttribute("data-wings") !== "open";

        setWingsState(root, willOpen ? "open" : "closed");
        // keep internal state in sync (used by layout restore, etc.)
        this._wingsState = willOpen ? "open" : "closed";
      });

      // mark hooked
      this._ringToggleHooked = true;

      // initialize internal state from current DOM
      const shell = root.querySelector(".dhud");
      this._wingsState = shell?.getAttribute("data-wings") || "closed";
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

    // --- Primary Weapon roll: click the left circle (item or unarmed)
    if (!this._primaryWeaponHooked) {
      const btn = this.element.querySelector("[data-action='roll-primary']");
      if (btn) {
        btn.addEventListener("click", async (ev) => {
          if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;

          const actor = this.actor;
          if (!actor) return;

          const isUnarmed = btn.dataset.unarmed === "true";
          const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;

          try {
            if (isUnarmed) {
              // Unarmed: execute the actor-level "attack" action so the system builds the full chat card
              if (Action?.execute) {
                await Action.execute({ source: actor, actionPath: "attack" });
                return;
              }
              // Fallback if executor not exposed: open the actor sheet to the Actions tab
              actor.sheet?.render(true, { focus: true });
              ui.notifications?.info("Open the Unarmed Attack and click Attack");
              return;
            }

            // Weapon item: resolve by dataset or re-pick
            const idFromDom = btn.dataset.itemId;
            let item = idFromDom ? actor.items.get(idFromDom) : null;
            if (!item) {
              // re-pick: ONLY equipped & NOT secondary
              const weapons = actor.items.filter(i => i.type === "weapon");
              const equippedNonSecondary = weapons.filter(w => w.system?.equipped === true && w.system?.secondary !== true);
              item = equippedNonSecondary[0] ?? null;

            }
            if (!item) {
              ui.notifications?.warn("No primary weapon found");
              return;
            }

            // Prefer item action methods if provided by the system
            if (typeof item.rollAction === "function") { await item.rollAction("attack"); return; }
            if (typeof item.use       === "function") { await item.use({ action: "attack" }); return; }

            // Or a system-level executor
            if (Action?.execute) { await Action.execute({ source: item, actionPath: "attack" }); return; }

            // Last resort: open the weapon sheet
            item.sheet?.render(true, { focus: true });
            ui.notifications?.info("Open the weapon and click Attack");
          } catch (err) {
            console.error("[DHUD] Primary weapon roll failed", err);
            ui.notifications?.error("Weapon roll failed (see console)");
          }
        }, true);
      }
      this._primaryWeaponHooked = true;
    }

    // --- Secondary Weapon roll: click the right circle (item or unarmed)
    if (!this._secondaryWeaponHooked) {
      const btn = this.element.querySelector("[data-action='roll-secondary']");
      if (btn) {
        btn.addEventListener("click", async (ev) => {
          if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;

          const actor = this.actor;
          if (!actor) return;

          const isUnarmed = btn.dataset.unarmed === "true";
          const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;

          try {
            if (isUnarmed) {
              // Use actor-level unarmed attack so the system builds the full card flow
              if (Action?.execute) {
                await Action.execute({ source: actor, actionPath: "attack" });
                return;
              }
              actor.sheet?.render(true, { focus: true });
              ui.notifications?.info("Open the Unarmed Attack and click Attack");
              return;
            }

            // Resolve secondary item by dataset or re-pick from equipped†secondary
            const idFromDom = btn.dataset.itemId;
            let item = idFromDom ? actor.items.get(idFromDom) : null;
            if (!item) {
            const weaponsAll = actor.items.filter(i => i.type === "weapon");
            const equipped   = weaponsAll.filter(w => w.system?.equipped === true);

            const primaryId = this.element.querySelector("[data-action='roll-primary']")?.dataset?.itemId ?? null;

            // 1) prefer an equipped weapon flagged secondary
            // 2) else any other equipped weapon that's not the primary
            item =
              equipped.find(w => w.system?.secondary === true) ??
              equipped.find(w => w.id && w.id !== primaryId) ??
              null;

            }
            if (!item) { ui.notifications?.warn("No secondary weapon found"); return; }

            // Same action order as primary
            if (typeof item.rollAction === "function") { await item.rollAction("attack"); return; }
            if (typeof item.use       === "function") { await item.use({ action: "attack" }); return; }
            if (Action?.execute) { await Action.execute({ source: item, actionPath: "attack" }); return; }

            item.sheet?.render(true, { focus: true });
            ui.notifications?.info("Open the weapon and click Attack");
          } catch (err) {
            console.error("[DHUD] Secondary weapon roll failed", err);
            ui.notifications?.error("Weapon roll failed (see console)");
          }
        }, true);
      }
      this._secondaryWeaponHooked = true;
    }

    // --- ANCESTRY/COMMUNITY: icon executes; title toggles; chat bubble sends to chat
    if (!this._ancestryHooked) {
      const panel = this.element.querySelector(".dhud-panel--ancestry");
      if (panel) {
        const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

        // prevent <summary> toggle when clicking the icon or chat icon
        panel.querySelectorAll("summary .icon, summary .chat").forEach(el => {
          if (el._dhudBlockToggle) return;
          el.addEventListener("click", stop, true);
          el.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") stop(ev);
          }, true);
          el._dhudBlockToggle = true;
        });

        // execute feature on icon click
        panel.addEventListener("click", async (ev) => {
          const execBtn = ev.target.closest("[data-action='item-exec']");
          if (!execBtn) return;
          stop(ev);

          const actor = this.actor;
          const itemId = execBtn.dataset.itemId;
          const actionPath = execBtn.dataset.actionpath || "use";
          const item = actor?.items.get(itemId);
          if (!item) return;

          const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;

          try {
            if (typeof item.rollAction === "function") {
              await item.rollAction(actionPath);
              return;
            }
            if (typeof item.use === "function") {
              await item.use({ action: actionPath });
              return;
            }
            if (Action?.execute) {
              await Action.execute({ source: item, actionPath });
              return;
            }
            // fallback: open the item so user can click whatever the sheet provides
            item.sheet?.render(true, { focus: true });
          } catch (err) {
            console.error("[DHUD] Ancestry feature exec failed", err);
            ui.notifications?.error("Feature execution failed (see console)");
          }
        }, true);

        // send to chat on bubble click
        panel.addEventListener("click", async (ev) => {
          const chatBtn = ev.target.closest("[data-action='to-chat']");
          if (!chatBtn) return;
          stop(ev);

          const actor = this.actor;
          const item = actor?.items.get(chatBtn.dataset.itemId);
          if (!item) return;

          try {
            await sendItemToChat(item, actor);
          } catch (err) {
            console.error("[DHUD] Ancestry to-chat failed (after fallbacks)", err);
            ui.notifications?.error("Failed to send to chat (see console)");
          }
        }, true);

      }
      this._ancestryHooked = true;
    }

    // --- CLASS/SUBCLASS: icon executes; title toggles; chat bubble sends to chat
    if (!this._classHooked) {
      const panel = this.element.querySelector(".dhud-panel--class");
      if (panel) {
        const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

        // prevent <summary> toggle when clicking the icon or chat icon
        panel.querySelectorAll("summary .icon, summary .chat").forEach(el => {
          if (el._dhudBlockToggle) return;
          el.addEventListener("click", stop, true);
          el.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") stop(ev);
          }, true);
          el._dhudBlockToggle = true;
        });

        // execute feature on icon click
        panel.addEventListener("click", async (ev) => {
          const execBtn = ev.target.closest("[data-action='item-exec']");
          if (!execBtn) return;
          stop(ev);

          const actor = this.actor;
          const itemId = execBtn.dataset.itemId;
          const actionPath = execBtn.dataset.actionpath || "use";
          const item = actor?.items.get(itemId);
          if (!item) return;

          const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;

          try {
            if (typeof item.rollAction === "function") { await item.rollAction(actionPath); return; }
            if (typeof item.use       === "function") { await item.use({ action: actionPath }); return; }
            if (Action?.execute) { await Action.execute({ source: item, actionPath }); return; }
            item.sheet?.render(true, { focus: true });
          } catch (err) {
            console.error("[DHUD] Class feature exec failed", err);
            ui.notifications?.error("Feature execution failed (see console)");
          }
        }, true);

        // send to chat on bubble click
        panel.addEventListener("click", async (ev) => {
          const chatBtn = ev.target.closest("[data-action='to-chat']");
          if (!chatBtn) return;
          stop(ev);

          const actor = this.actor;
          const item = actor?.items.get(chatBtn.dataset.itemId);
          if (!item) return;

          try {
            await sendItemToChat(item, actor);
          } catch (err) {
            console.error("[DHUD] Class to-chat failed (after fallbacks)", err);
            ui.notifications?.error("Failed to send to chat (see console)");
          }
        }, true);

      }
      this._classHooked = true;
    }

    // --- INVENTORY (Consumables, Loot): icon executes (consumables), title toggles, chat posts
    if (!this._inventoryHooked) {
      const panel = this.element.querySelector(".dhud-panel--inventory");
      if (panel) {
        const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

        // stop <summary> toggle on icon/chat
        panel.querySelectorAll("summary .icon, summary .chat").forEach(el => {
          if (el._dhudBlockToggle) return;
          el.addEventListener("click", stop, true);
          el.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") stop(ev);
          }, true);
          el._dhudBlockToggle = true;
        });

        // optional import-level helper
        const _sendToChat = (typeof sendItemToChat === "function")
          ? sendItemToChat
          : async (item, actor) => {
              const speaker = ChatMessage.getSpeaker({ actor });
              try {
                if (typeof item.displayCard === "function") { await item.displayCard({ speaker }); return; }
              } catch {}
              try {
                if (typeof item.toChat === "function") { await item.toChat.call(item, { speaker }); return; }
              } catch {}
              try {
                if (Item?.prototype?.toChat) { await Item.prototype.toChat.call(item, { speaker }); return; }
              } catch {}
              const content = `<h3>${foundry.utils.escapeHTML(item.name)}</h3>${item.system?.description ?? ""}`;
              await ChatMessage.create({ speaker, content });
            };

        // execute on icon
        panel.addEventListener("click", async (ev) => {
          const execBtn = ev.target.closest("[data-action='item-exec']");
          if (!execBtn) return;
          stop(ev);

          const actor = this.actor;
          const itemId = execBtn.dataset.itemId;
          const actionPath = execBtn.dataset.actionpath || "";
          const item = actor?.items.get(itemId);
          if (!item) return;

          // Consumables: try to "use"; Loot: open sheet (no real action)
          try {
            if (item.type === "consumable") {
              const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;
              if (typeof item.rollAction === "function") { await item.rollAction(actionPath || "use"); return; }
              if (typeof item.use       === "function") { await item.use({ action: actionPath || "use" }); return; }
              if (Action?.execute) { await Action.execute({ source: item, actionPath: actionPath || "use" }); return; }
            }

            // default: just open the item
            item.sheet?.render(true, { focus: true });
          } catch (err) {
            console.error("[DHUD] Inventory item exec failed", err);
            ui.notifications?.error("Item action failed (see console)");
          }
        }, true);

        // send to chat
        panel.addEventListener("click", async (ev) => {
          const chatBtn = ev.target.closest("[data-action='to-chat']");
          if (!chatBtn) return;
          stop(ev);

          const actor = this.actor;
          const item = actor?.items.get(chatBtn.dataset.itemId);
          if (!item) return;

          try {
            await _sendToChat(item, actor);
          } catch (err) {
            console.error("[DHUD] Inventory to-chat failed (after fallbacks)", err);
            ui.notifications?.error("Failed to send to chat (see console)");
          }
        }, true);
      }
      this._inventoryHooked = true;
    }

    // --- DOMAINS / LOADOUT + VAULT
    if (!this._domainsHooked) {
      const panels = this.element.querySelectorAll(".dhud-panel--domains, .dhud-panel--vault");
      panels.forEach((panel) => {
        const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

        // prevent <summary> toggle on icon/chat/move
        panel.querySelectorAll("summary .icon, summary .chat, summary .move").forEach(el => {
          if (el._dhudBlockToggle) return;
          el.addEventListener("click", stop, true);
          el.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") stop(ev);
          }, true);
          el._dhudBlockToggle = true;
        });

        // EXECUTE on icon
        panel.addEventListener("click", async (ev) => {
          const btn = ev.target.closest("[data-action='item-exec']");
          if (!btn) return;
          stop(ev);

          const actor = this.actor;
          const item  = actor?.items.get(btn.dataset.itemId);
          if (!item) return;

          const actionPath = btn.dataset.actionpath || "use";
          const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;

          try {
            if (typeof item.rollAction === "function") { await item.rollAction(actionPath); return; }
            if (typeof item.use       === "function") { await item.use({ action: actionPath }); return; }
            if (Action?.execute) { await Action.execute({ source: item, actionPath }); return; }
            item.sheet?.render(true, { focus: true });
          } catch (err) {
            console.error("[DHUD] Domain exec failed", err);
            ui.notifications?.error("Domain action failed (see console)");
          }
        }, true);

        // MOVE: to vault / to loadout
        panel.addEventListener("click", async (ev) => {
          const mv = ev.target.closest("[data-action='to-vault'],[data-action='to-loadout']");
          if (!mv) return;
          stop(ev);

          const actor = this.actor;
          const item  = actor?.items.get(mv.dataset.itemId);
          if (!item) return;

          const toVault = mv.dataset.action === "to-vault";
          try {
            await item.update({ "system.inVault": toVault });
            // your update hooks will re-render; layout snapshot restores position/wings
          } catch (err) {
            console.error("[DHUD] Domain move failed", err);
            ui.notifications?.error("Failed to move domain card");
          }
        }, true);

        // SEND TO CHAT
        panel.addEventListener("click", async (ev) => {
          const chatBtn = ev.target.closest("[data-action='to-chat']");
          if (!chatBtn) return;
          stop(ev);

          const actor = this.actor;
          const item  = actor?.items.get(chatBtn.dataset.itemId);
          if (!item) return;

          try {
            if (typeof sendItemToChat === "function") {
              await sendItemToChat(item, actor);
            } else {
              const speaker = ChatMessage.getSpeaker({ actor });
              try { if (typeof item.displayCard === "function") return void (await item.displayCard({ speaker })); } catch {}
              try { if (typeof item.toChat       === "function") return void (await item.toChat.call(item, { speaker })); } catch {}
              try { if (Item?.prototype?.toChat) return void (await Item.prototype.toChat.call(item, { speaker })); } catch {}
              const content = `<h3>${foundry.utils.escapeHTML(item.name)}</h3>${item.system?.description ?? ""}`;
              await ChatMessage.create({ speaker, content });
            }
          } catch (err) {
            console.error("[DHUD] Domain to-chat failed", err);
            ui.notifications?.error("Failed to send to chat (see console)");
          }
        }, true);
      });

      this._domainsHooked = true;
    }

  }


}
