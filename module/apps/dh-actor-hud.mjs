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

  _bindDelegatedEvents() {
    const rootEl = this.element;
    if (!rootEl || this._delegatedBound) return;

    const stop = (ev) => { ev.preventDefault(); ev.stopPropagation(); };

    rootEl.addEventListener("click", async (ev) => {
      const actor = this.actor;
      if (!actor) return;

      // Ring toggle (wings)
      const ring = ev.target.closest(".dhud-ring");
      if (ring) {
        if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;
        stop(ev);
        const shell = rootEl.querySelector(".dhud");
        const willOpen = shell?.getAttribute("data-wings") !== "open";
        setWingsState(rootEl, willOpen ? "open" : "closed");
        this._wingsState = willOpen ? "open" : "closed";
        return;
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
        if (item) await sendItemToChat(item, actor); // helper already handles fallbacks:contentReference[oaicite:3]{index=3}
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

    const hasRingArt = !!(getSetting(S.ringMainImg)?.trim());

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
      hasRingArt,

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
    if (getSetting(S.disableForMe)) { this.close(); return; } // ← bail out
    const root = this.element;
    if (!root) return;

    // Debug/visibility
    const imgEl = root.querySelector(".dhud-portrait img");
    console.debug("[DHUD] _onRender: portrait img element", {
      found: !!imgEl,
      src: imgEl?.getAttribute("src"),
      alt: imgEl?.getAttribute("alt")
    });

    // Fixed image URL handling
    function toRouteURL(p) {
      if (!p) return "none";
      
      // Clean the path - handle both relative and absolute paths
      let cleanPath = p.trim();
      
      // If it's already a full URL (http/https), use it as-is
      if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
        return `url("${cleanPath}")`;
      }
      
      // If it starts with a slash, it's already absolute
      if (cleanPath.startsWith("/")) {
        const abs = foundry.utils.getRoute(cleanPath);
        return `url("${abs}")`;
      }
      
      // If it doesn't start with slash, add one
      if (!cleanPath.startsWith("/")) {
        cleanPath = `/${cleanPath}`;
      }
      
      const abs = foundry.utils.getRoute(cleanPath);
      return `url("${abs}")`;
    }

    function getEffectiveRingImage(playerSetting, gmSetting) {
      const playerImg = getSetting(playerSetting)?.trim();
      const gmImg = getSetting(gmSetting)?.trim();
      return playerImg || gmImg || ""; // Player overrides GM, GM overrides empty
    }

    const mainRing = getEffectiveRingImage(S.ringMainImgPlayer, S.ringMainImg);
    const weapRing = getEffectiveRingImage(S.ringWeaponImgPlayer, S.ringWeaponImg);

    // Apply the CSS custom properties
    root.style.setProperty("--dhud-ring-main", toRouteURL(mainRing));
    root.style.setProperty("--dhud-ring-weapon", toRouteURL(weapRing));

    // const offset = Number(getSetting(S.bottomOffset)) || 110;

    // Make roll targets feel clickable (purely cosmetic)
    root.querySelectorAll(".dhud-roll").forEach(el => {
      el.style.cursor = "pointer";
      el.setAttribute("aria-pressed", "false");
    });

    attachDHUDToggles(root);

    // Ensure wings default CLOSED before showing; also init internal state
    if (!this._wingsInit) {
      const shell = root.querySelector(".dhud");
      if (shell && !shell.hasAttribute("data-wings")) shell.setAttribute("data-wings", "closed");
      this._wingsState = shell?.getAttribute("data-wings") || "closed";
      this._wingsInit = true;
    }

    // First boot: place & wire resize (reads fresh setting every time)
    if (!this._booted) {
      const applyPlacement = () => {
        const fresh = Number(getSetting(S.bottomOffset)) || 110;
        placeAtBottom(root, fresh);
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

    // Drag by the ring
    if (!this._dragHooked) { enableDragByRing(root, this); this._dragHooked = true; }

    // Delegated handlers (ring, traits, weapons, exec, chat, move)
    this._bindDelegatedEvents();   
  }

  async close(opts) {
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
      this._onResize = null;
    }
    return super.close(opts);
  }

}
