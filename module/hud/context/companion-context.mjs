// module/hud/context/companion-context.mjs
// buildCompanionContext(app) — the companion equivalent of hud/context/index.mjs.
// One file (not a multi-collector folder like the character HUD) because the
// companion actor's data shape is small: stress, evasion, one fixed attack,
// experiences, a partner link, and effects. No traits/domains/inventory.

import { getPartner } from "../../system/companion.mjs";
import { listActiveEffects } from "../../system/effects.mjs";
import { collectConditions } from "./conditions.mjs";

export function buildCompanionContext(app) {
  const actor = app.actor ?? null;
  const sys = actor?.system ?? {};

  // === IDENTITY ===
  let actorName = "—";
  let portrait = "icons/svg/mystery-man.svg";
  if (actor) {
    actorName = actor.name ?? "—";
    const protoSrc = actor?.prototypeToken?.texture?.src;
    portrait = (actor.img && actor.img.trim()) ? actor.img : (protoSrc || portrait);
  }

  // === STRESS ===
  const stressMax = Math.max(0, Number(sys.resources?.stress?.max ?? 0));
  const stressValue = Math.min(stressMax, Math.max(0, Number(sys.resources?.stress?.value ?? 0)));
  const stressPips = Array.from({ length: stressMax }, (_, i) => ({ filled: i < stressValue }));

  // === EVASION ===
  const evasion = sys.evasion ?? 0;

  // === ATTACK (single fixed ActionField, same shape as a character's unarmed attack) ===
  const atk = sys.attack ?? null;
  const attack = atk ? { name: atk.name || "Attack", img: atk.img || "icons/svg/sword.svg" } : null;

  // === PARTNER ===
  const partnerActor = getPartner(actor);
  const partner = {
    hasPartner: !!partnerActor,
    name: partnerActor?.name ?? "",
    img: partnerActor?.img ?? "icons/svg/mystery-man.svg",
    uuid: partnerActor?.uuid ?? null
  };

  // === EXPERIENCES (same shape/extraction as hud/context/traits.mjs collectTraits) ===
  const experiences = [];
  const rawExperiences = sys.experiences ?? {};
  for (const [id, exp] of Object.entries(rawExperiences)) {
    if (!exp || typeof exp !== "object") continue;
    experiences.push({
      id,
      key: id,
      name: exp.name || "Unnamed",
      value: Number(exp.value ?? 0),
      core: !!exp.core,
      description: exp.description || ""
    });
  }

  // === EFFECTS ===
  const effectsList = listActiveEffects(actor);

  // === CONDITIONS (portrait context-menu status grid) ===
  const { availableConditions, showGenericStatusSection } = collectConditions(app);

  return {
    actorName,
    portrait,
    stress: { value: stressValue, max: stressMax },
    stressPips,
    evasion,
    attack,
    partner,
    experiences,
    effectsList,
    availableConditions,
    showGenericStatusSection
  };
}
