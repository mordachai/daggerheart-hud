// module/apps/dh-actor-hud.mjs

import { L, Lpath, Ltrait } from "../helpers/i18n.mjs";
import { getSetting, S } from "../settings.mjs";
import { enrichItemDescription, toHudInlineButtons } from "../helpers/inline-rolls.mjs";
import { placeAtBottom, enableDragByRing, getSavedGlobalPosition } from "../hud/position.mjs";
import { setWingsState, setPanelOpenDirection, attachDHUDToggles } from "../hud/wings.mjs";
import { applyAppearance, reapplyAppearance } from "../hud/appearance.mjs";
import {
  registerCustomButton as registerCustomButtonImpl,
  collectCustomButtons
} from "../hud/custom-buttons.mjs";
import { attachHudEvents } from "../hud/events.mjs";
import { bindResourceAdjusters } from "../hud/resources-bar.mjs";
import { attachStatusMenu } from "../hud/status-menu.mjs";

// Function to detect if an item has actions (works with Foundry Collections)
function itemHasActions(item) {
  const actions = item.system?.actions;
  if (!actions) return false;
  
  // Check if it's a Foundry Collection with size property
  if (typeof actions.size === 'number') {
    return actions.size > 0;
  }
  
  // Fallback to standard object detection
  if (typeof actions === 'object') {
    return Object.keys(actions).length > 0;
  }
  
  return false;
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
    this.customButtons = new Map(); 
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

  // Custom buttons — public API; registry lives in hud/custom-buttons.mjs
  static registerCustomButton(config) {
    registerCustomButtonImpl(config);
  }

  async _applyCondition(conditionId) {
    if (!this.actor) return;
    
   
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
    
    
    try {
      await this.actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    } catch (err) {
      console.error("[DHUD] Failed to apply condition", err);
      ui.notifications?.error("Failed to apply condition");
    }
  }

  async _removeCondition(conditionId) {
    if (!this.actor) return;
        
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
        
    try {
      await this.actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
    } catch (err) {
      console.error("[DHUD] Failed to remove condition", err);
      ui.notifications?.error("Failed to remove condition");
    }
  }

  _isConditionActive(conditionId) {
    const actor = this.actor;
    if (!actor) return false;

    // Some Foundry versions expose effects as a Collection; both of these should work:
    const effects = Array.isArray(actor.effects) ? actor.effects : actor.effects?.contents ?? [];

    for (const e of effects) {
      if (!e || e.disabled) continue;

      // 1) Check the custom flag (safely)
      let hasFlag = false;
      try {
        hasFlag = e.getFlag?.('daggerheart-hud', 'conditionId') === conditionId;
      } catch {
        // swallow and continue
      }
      if (hasFlag) return true;

      // 2) Fallback: normalize statuses and check inclusion
      const s = e.statuses;
      const list =
        Array.isArray(s) ? s :
        s instanceof Set ? Array.from(s) :
        typeof s === 'string' ? [s] :
        (s && typeof s === 'object') ? Object.values(s) :
        [];

      if (list.includes(conditionId)) return true;
    }

    return false;
  }

  async _rollWeapon(btn, { secondary=false } = {}) {
    if (this._justDraggedTs && (Date.now() - this._justDraggedTs) < 160) return;

    const actor = this.actor;
    if (!actor) return;

    const isUnarmed = btn.dataset.unarmed === "true";
    const Action = CONFIG?.DAGGERHEART?.Action ?? CONFIG?.DH?.Action;

    try {

      const currentTargets = [...game.user.targets];
      if (currentTargets.length === 0 && getSetting(S.showTargetNotifications)) {
        ui.notifications?.info("No target selected — the attack will not auto-apply damage.");
      }

      if (isUnarmed) {
        const unarmedAttack = this.actor.system.usedUnarmed || this.actor.system.attack;
        
        try {
          // Try the attack object's own methods first
          if (typeof unarmedAttack.rollAction === "function") {
            return await unarmedAttack.rollAction("attack");
          }
          if (typeof unarmedAttack.use === "function") {
            return await unarmedAttack.use({ action: "attack" });
          }
          
          return;
          
        } catch (err) {
          console.error("[DHUD] Unarmed attack failed", err);
        }
        
        // Only open sheet if everything else fails
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

  async _prepareContext(_options) { 
    const actor = this.actor ?? null;

    // Fallbacks
    let actorName = "—";
    let portrait  = "icons/svg/mystery-man.svg";

    if (actor) {
      actorName = actor.name ?? "—";
      // Prefer the actor portrait; fall back to the prototype token's texture if empty
      const protoSrc = actor?.prototypeToken?.texture?.src;
      portrait = (actor.img && actor.img.trim()) ? actor.img : (protoSrc || portrait);
    }

    // Canonical system root (guarded)
    const sys = actor?.system ?? {};

    const customButtons = {
      traits: collectCustomButtons("traits", this.actor),
      inventory: [],
      // other sections...
    };

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

    // If none, show Unarmed from actor.system.usedUnarmed or attack
    if (!primaryWeapon) {
      const un = sys.usedUnarmed || sys.attack;
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

    // === SECONDARY WEAPON ===
    let secondaryWeapon = null;
    {
      const items = this.actor?.items ?? [];
      const weaponsAll = items.filter(i => i.type === "weapon");
      const equipped   = weaponsAll.filter(w => w.system?.equipped === true);

      const primaryId = primaryWeapon?.isUnarmed ? null : primaryWeapon?.id ?? null;
      
      // Check if primary weapon is two-handed
      const primaryWeaponItem = primaryId ? items.find(w => w.id === primaryId) : null;
      const isTwoHanded = primaryWeaponItem?.system?.burden === "twoHanded";
      
      let pick = null;
      
      if (isTwoHanded && primaryWeaponItem) {
        // For two-handed weapons, use the same weapon for both slots
        pick = primaryWeaponItem;
      } else {
        // Original logic for one-handed weapons
        pick = equipped.find(w => w.system?.secondary === true) ??
              equipped.find(w => w.id !== primaryId) ??
              null;
      }

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


    // === MISCELLANEOUS FEATURES ===
    const miscFeatures = [];
    for (const it of (this.actor?.items ?? [])) {
      if (it.type !== "feature") continue;
      if (it.system?.originItemType) continue; // Skip ancestry/community/class/subclass
      
      const hasActions = itemHasActions(it);
      miscFeatures.push({
        id: it.id,
        name: it.name,
        img: it.img || "icons/svg/aura.svg",
        description: it.system?.description ?? "", // optional raw
        descriptionHTML: toHudInlineButtons(await enrichItemDescription(it)),
        hasActions: hasActions,
        actionPath: (() => {
          const s = it.system ?? {};
          if (s.actions && typeof s.actions === "object") {
            const first = Object.values(s.actions)[0];
            return first?.systemPath || "use";
          }
          return "use";
        })()
      });
    }

    
    // === ANCESTRY / COMMUNITY FEATURES ===
    const ancestryFeatures = [];
    const communityFeatures = [];

    for (const it of (this.actor?.items ?? [])) {
      if (it.type !== "feature") continue;

      const origin = it.system?.originItemType;
      if (origin !== "ancestry" && origin !== "community") continue;

      const hasActions = itemHasActions(it);

      const entry = {
        id: it.id,
        name: it.name,
        img: it.img || "icons/svg/aura.svg",
        description: it.system?.description ?? "", // optional raw
        descriptionHTML: toHudInlineButtons(await enrichItemDescription(it)),
        hasActions: hasActions,
        system: it.system,
        actionPath: (() => {
          const sys = it.system ?? {};
          if (sys.actions && typeof sys.actions === "object") {
            const first = Object.values(sys.actions)[0];
            if (first?.systemPath) return first.systemPath;
          }
          return "use";
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
      const origin = it.system?.originItemType;

      const hasActions = itemHasActions(it);

      if (origin === "class") {
        classFeatures.push({
          id: it.id,
          name: it.name,
          img: it.img || "icons/svg/aura.svg",
          description: it.system?.description ?? "", // optional raw
          descriptionHTML: toHudInlineButtons(await enrichItemDescription(it)),
          hasActions: hasActions,
          system: it.system,
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
        if (!allowedSubclassIds.has(ident)) continue;

        subclassFeatures.push({
          id: it.id,
          name: it.name,
          img: it.img || "icons/svg/aura.svg",
          description: it.system?.description ?? "", // optional raw
          descriptionHTML: toHudInlineButtons(await enrichItemDescription(it)),
          hasActions: hasActions,
          system: it.system,
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
    
    const isDying = hitPoints.value >= hitPoints.max; 

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

    // Determine the spellcasting trait key (prefer subclass, then class)
    let spellcastingTraitKey = null;
    if (this.actor?.items) {
      const subclass = this.actor.items.find(i => i.type === "subclass" && i.system?.spellcastingTrait);
      const klass    = this.actor.items.find(i => i.type === "class"    && i.system?.spellcastingTrait);
      spellcastingTraitKey = subclass?.system?.spellcastingTrait || klass?.system?.spellcastingTrait || null;
    }

    // === TRAITS (ordered + localized via i18n helper) ===
    const TRAIT_ORDER = ["agility","strength","finesse","instinct","presence","knowledge"];

    const traits = TRAIT_ORDER.map(key => {
      const value = Number(sys.traits?.[key]?.value ?? 0);
      const loc = Ltrait(key); // { name, verbs[], description }
      return {
        key,
        name: loc.name,           // e.g., "Agility"
        value,                    // e.g., 2
        description: loc.description, // e.g., "Sprint, Leap, Maneuver"
        isSpellcasting: key === spellcastingTraitKey
      };
    });

    // === PROFICIENCY / DEFENSES ===
    const proficiency = sys.proficiency ?? 0;
    const evasion     = sys.evasion     ?? 0; 

    // === EXPERIENCES ===
    const experiences = [];
    const rawExperiences = sys.experiences ?? {};
    for (const [id, exp] of Object.entries(rawExperiences)) {
      if (!exp || typeof exp !== 'object') continue;
      experiences.push({
        id: id,                           
        key: id,                         
        name: exp.name || "Unnamed",
        value: Number(exp.value ?? 0),
        core: !!exp.core,
        description: exp.description || ""
      });
    }

    // === ARMOR (marks live on the equipped item; MAX comes from ACTOR (post-effects)) ===
    const equippedArmor = (this.actor?.items ?? []).find(item => 
      item.type === "armor" && item.system?.equipped === true
    );

    let armor;
    if (equippedArmor) {
      const armorSys    = equippedArmor.system;
      const baseScore   = Number(armorSys.armor?.max ?? armorSys.baseScore ?? 0);
      const actorScore  = this.actor?.system?.armorScore;
      const effectiveMax= Math.max(0, Number(
        (actorScore && typeof actorScore === 'object' ? actorScore.max : actorScore) ?? baseScore
      ));
      const rawMarks    = Number(armorSys.armor?.current ?? armorSys.marks?.value ?? 0);
      const marks       = Math.max(0, Math.min(effectiveMax, rawMarks));  

      armor = {
        max:   effectiveMax,      // Total armor slots (post-effects)
        value: marks,             // We keep the inverted UX: value === DAMAGE MARKS
        marks: marks,             // Damage marks taken
        isReversed: false,        // Armor doesn't use isReversed like HP/Stress
        name: equippedArmor.name,
        itemId: equippedArmor.id,
        hasArmor: true
      };
    } else {
      armor = {
        max: 0,
        value: 0,
        marks: 0,
        isReversed: false,
        name: "",
        itemId: null,
        hasArmor: false
      };
    }

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

    // === INVENTORY ===
    const invConsumables = [];
    const invLoot = [];

    for (const it of (this.actor?.items ?? [])) {
      if (it.type !== "consumable" && it.type !== "loot") continue;

      const hasActions = itemHasActions(it);

      const entry = {
        id: it.id,
        type: it.type,
        name: it.name,
        img: it.img || "icons/svg/aura.svg",
        qty: Number(it.system?.quantity ?? 0),
        description: it.system?.description ?? "", // optional raw
        descriptionHTML: toHudInlineButtons(await enrichItemDescription(it)),
        hasActions: hasActions,
        system: it.system,
        actionPath: (() => {
          if (it.type !== "consumable") return "";
          const sys = it.system ?? {};
          if (sys.actionPath) return sys.actionPath;
          if (sys.actions && typeof sys.actions === "object") {
            const first = Object.values(sys.actions)[0];
            return first?.systemPath || "use";
          }
          return "use";
        })()
      };

      if (it.type === "consumable") invConsumables.push(entry);
      if (it.type === "loot") invLoot.push(entry);
    }

    // === DOMAIN CARDS ===
    const domainLoadout = [];
    const domainVault = [];

    for (const it of (this.actor?.items ?? [])) {
      if (it.type !== "domainCard") continue;

      const isInVault = !!it.system?.inVault;
      // Cards in vault should not be clickable for actions
      const hasActions = isInVault ? false : itemHasActions(it);

      const entry = {
        id: it.id,
        name: it.name,
        img: it.img || "icons/svg/aura.svg",
        description: it.system?.description ?? "", // optional raw
        descriptionHTML: toHudInlineButtons(await enrichItemDescription(it)),
        hasActions: hasActions,
        recallCost: Number(it.system?.recallCost ?? 0),
        domain: (it.system?.domain ?? "").toString(),
        inVault: isInVault,
        system: it.system,
        actionPath: (() => {
          const s = it.system ?? {};
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
      isDying,
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
      experiences,

      //features
      miscFeatures,

      // traits & resistances (even if HBS doesn't show yet, ready to use)
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
      showGenericStatusSection: showGenericStatuses,
      
      //custom buttons
      customButtons
    };
  }
  
  async _onRender() {
    // Respect per-user disable toggle
    if (getSetting(S.disableForMe)) { this.close(); return; }

    const root = this.element;
    if (!root) return;

    // Apply dying state (btn, desaturate) 
    const hpValue = this.actor?.system?.resources?.hitPoints?.value ?? 0;
    const hpMax = this.actor?.system?.resources?.hitPoints?.max ?? 0;
    if (hpValue >= hpMax) {
      root.classList.add("dhud--dying");
    } else {
      root.classList.remove("dhud--dying");
    }

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

    // --- Theme + ring art (GM override logic lives in hud/appearance.mjs)
    applyAppearance(root, this.actor);

    // Cosmetic pointer cursor for roll targets
    root.querySelectorAll(".dhud-roll").forEach(el => {
      el.style.cursor = "pointer";
      el.setAttribute("aria-pressed", "false");
    });

    // Feature toggles on the HUD
    attachDHUDToggles(root);

    // One-time wiring for resource adjusters (guard lives in the module)
    bindResourceAdjusters(this);

    // Hooks to re-apply art/theme on changes coming from the Configurator
    if (!this._imgHooked) {
      // Re-apply both rings and theme when the Configurator saves
      this._reapplyAppearance ??= async ({ actorIds = [] } = {}) => {
        if (!this.actor) return;
        if (actorIds.length && !actorIds.includes(this.actor.id)) return;

        // rings + theme only - NO position changes
        reapplyAppearance(root, this.actor);
      };

      // Listen only to the Configurator's saves
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
        const userGlobalPos = getSavedGlobalPosition();

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

      // Replace your current resize handler with this:
      this._onResize = () => {
        if (this._isDragging) return;

        // 1) keep your existing bottom/center placement logic
        applyPlacement?.();

        // 2) if a tab panel is open, recompute whether it should open up/down
        const root  = this.element;
        const shell = root?.querySelector(".dhud");
        const openName = shell?.getAttribute("data-open");   // e.g., "traits", "inventory", etc.
        if (!openName) return;

        const panel = root.querySelector(`.dhud-panel[data-panel='${openName}']`);
        if (panel && typeof setPanelOpenDirection === "function") {
          setPanelOpenDirection(panel);
        }
      };

      // (re)attach listener
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

    // Delegated HUD interactions (ring, traits, weapons, exec, chat, move) +
    // portrait context menu / condition grid. Guards live in the modules.
    attachHudEvents(this);
    attachStatusMenu(this);

    // If a tab is open, compute its up/down direction AFTER layout paints
    requestAnimationFrame(() => {
      const shell = root.querySelector(".dhud");
      const openName = shell?.getAttribute("data-open");
      if (!openName) return;
      const panel = root.querySelector(`.dhud-panel[data-panel='${openName}']`);
      if (!panel || typeof setPanelOpenDirection !== "function") return;
      requestAnimationFrame(() => setPanelOpenDirection(panel));
    });

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
