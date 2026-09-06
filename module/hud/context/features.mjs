// module/hud/context/features.mjs
// Feature bucketing: misc + ancestry + community + class + subclass (with subclass
// tier gating). Extracted verbatim from _prepareContext in refactor step 4.
// NOTE: still buckets on the legacy system.originItemType — step 8 switches to
// system.granter.type and fills in the empty Class/Heritage panels on migrated worlds.

import { itemHasActions, firstActionId } from "../../system/items.mjs";
import { getItemDescriptionHTML } from "../../system/descriptions.mjs";

export async function collectFeatures(app) {
  // === MISCELLANEOUS FEATURES ===
  const miscFeatures = [];
  for (const it of (app.actor?.items ?? [])) {
    if (it.type !== "feature") continue;
    if (it.system?.originItemType) continue; // Skip ancestry/community/class/subclass

    const hasActions = itemHasActions(it);
    miscFeatures.push({
      id: it.id,
      name: it.name,
      img: it.img || "icons/svg/aura.svg",
      description: it.system?.description ?? "", // optional raw
      descriptionHTML: await getItemDescriptionHTML(it),
      hasActions: hasActions,
      actionId: firstActionId(it)
    });
  }


  // === ANCESTRY / COMMUNITY FEATURES ===
  const ancestryFeatures = [];
  const communityFeatures = [];

  for (const it of (app.actor?.items ?? [])) {
    if (it.type !== "feature") continue;

    const origin = it.system?.originItemType;
    if (origin !== "ancestry" && origin !== "community") continue;

    const hasActions = itemHasActions(it);

    const entry = {
      id: it.id,
      name: it.name,
      img: it.img || "icons/svg/aura.svg",
      description: it.system?.description ?? "", // optional raw
      descriptionHTML: await getItemDescriptionHTML(it),
      hasActions: hasActions,
      system: it.system,
      actionId: firstActionId(it)
    };

    if (origin === "ancestry") ancestryFeatures.push(entry);
    else communityFeatures.push(entry);
  }

  // === CLASS / SUBCLASS FEATURES (originItemType) with TIER GATING FOR SUBCLASS ===
  const classFeatures = [];
  const subclassFeatures = [];

  // 1) Determine allowed subclass identifiers from the actor's subclass featureState
  //    featureState: 1 = foundation, 2 = specialization, 3 = mastery
  const subclasses = (app.actor?.items ?? []).filter(i => i.type === "subclass");
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
  for (const it of (app.actor?.items ?? [])) {
    if (it.type !== "feature") continue;
    const origin = it.system?.originItemType;

    const hasActions = itemHasActions(it);

    if (origin === "class") {
      classFeatures.push({
        id: it.id,
        name: it.name,
        img: it.img || "icons/svg/aura.svg",
        description: it.system?.description ?? "", // optional raw
        descriptionHTML: await getItemDescriptionHTML(it),
        hasActions: hasActions,
        system: it.system,
        actionId: firstActionId(it)
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
        descriptionHTML: await getItemDescriptionHTML(it),
        hasActions: hasActions,
        system: it.system,
        actionId: firstActionId(it)
      });
    }
  }

  return { miscFeatures, ancestryFeatures, communityFeatures, classFeatures, subclassFeatures };
}
