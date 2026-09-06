// module/hud/context/features.mjs
// Feature bucketing: misc + ancestry + community + class + subclass (with subclass
// tier gating).
//
// Step 8: buckets on feature.system.granter.type / .identifier (2.9.2), with a
// one-line fallback to the legacy system.originItemType / system.identifier so
// un-migrated worlds still work. Subclass tier gate = subclass.system.featureState
// (1 foundation / 2 specialization / 3 mastery) vs granter.identifier.

import { itemHasActions, firstActionId } from "../../system/items.mjs";
import { getItemDescriptionHTML } from "../../system/descriptions.mjs";

/** { type, identifier } for a feature — granter first, legacy fields as fallback. */
function featureOrigin(it) {
  const g = it.system?.granter;
  return {
    type: g?.type ?? it.system?.originItemType ?? null,
    identifier: (g?.identifier ?? it.system?.identifier ?? "").toString().toLowerCase()
  };
}

async function featureEntry(it, { withSystem = true } = {}) {
  const entry = {
    id: it.id,
    name: it.name,
    img: it.img || "icons/svg/aura.svg",
    description: it.system?.description ?? "", // optional raw
    descriptionHTML: await getItemDescriptionHTML(it),
    hasActions: itemHasActions(it),
    actionId: firstActionId(it)
  };
  if (withSystem) entry.system = it.system;
  return entry;
}

export async function collectFeatures(app) {
  const items = [...(app.actor?.items ?? [])].filter(i => i.type === "feature");

  // Subclass tier reached on this actor (highest across multiclass).
  let subclassTier = 0;
  for (const sc of (app.actor?.items ?? [])) {
    if (sc.type !== "subclass") continue;
    const t = Number(sc.system?.featureState ?? 0);
    if (t > subclassTier) subclassTier = t;
  }
  const allowedSubclassIds = new Set();
  if (subclassTier >= 1) allowedSubclassIds.add("foundation");
  if (subclassTier >= 2) allowedSubclassIds.add("specialization");
  if (subclassTier >= 3) allowedSubclassIds.add("mastery");

  const miscFeatures = [];
  const ancestryFeatures = [];
  const communityFeatures = [];
  const classFeatures = [];
  const subclassFeatures = [];

  for (const it of items) {
    const { type, identifier } = featureOrigin(it);

    switch (type) {
      case "ancestry":
        ancestryFeatures.push(await featureEntry(it));
        break;
      case "community":
        communityFeatures.push(await featureEntry(it));
        break;
      case "class":
        classFeatures.push(await featureEntry(it));
        break;
      case "subclass":
        if (allowedSubclassIds.has(identifier)) subclassFeatures.push(await featureEntry(it));
        break;
      default:
        miscFeatures.push(await featureEntry(it, { withSystem: false }));
    }
  }

  return { miscFeatures, ancestryFeatures, communityFeatures, classFeatures, subclassFeatures };
}
