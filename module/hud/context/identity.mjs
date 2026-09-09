// module/hud/context/identity.mjs
// Name, portrait, and parent items (ancestry/community/class/subclass captions).
// Extracted verbatim from _prepareContext in refactor step 4 — no behaviour change.

import { getParties, getCompanion } from "../../system/actor.mjs";

export function collectIdentity(app) {
  const actor = app.actor ?? null;

  // Fallbacks
  let actorName = "—";
  let portrait  = "icons/svg/mystery-man.svg";

  if (actor) {
    actorName = actor.name ?? "—";
    // Prefer the actor portrait; fall back to the prototype token's texture if empty
    const protoSrc = actor?.prototypeToken?.texture?.src;
    portrait = (actor.img && actor.img.trim()) ? actor.img : (protoSrc || portrait);
  }

  // === PARENT ITEMS: ancestry / community / class / subclass (for header captions) ===
  const byType = (t) => (app.actor?.items ?? []).find(i => i.type === t) ?? null;

  const ancestryItem  = byType("ancestry");
  const communityItem = byType("community");
  const classItem     = byType("class");
  const subclassItem  = byType("subclass");

  const ancestryInfo  = ancestryItem  ? { id: ancestryItem.id,  name: ancestryItem.name,  img: ancestryItem.img  } : null;
  const communityInfo = communityItem ? { id: communityItem.id, name: communityItem.name, img: communityItem.img } : null;
  const classInfo     = classItem     ? { id: classItem.id,     name: classItem.name,     img: classItem.img     } : null;
  const subclassInfo  = subclassItem  ? { id: subclassItem.id,  name: subclassItem.name,  img: subclassItem.img  } : null;

  // Portrait context-menu extras: link to the actor's party sheet / companion sheet
  const hasParty     = getParties(actor).length > 0;
  const hasCompanion = !!getCompanion(actor);

  return { actorName, portrait, ancestryInfo, communityInfo, classInfo, subclassInfo, hasParty, hasCompanion };
}
