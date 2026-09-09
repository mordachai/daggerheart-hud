// module/hud/context/index.mjs
// buildContext(app) — merges the per-concern collectors into the exact object shape
// _prepareContext returned before refactor step 4. Byte-identical output is the
// contract; only later steps change the shape (and the template with it).

import { collectCustomButtons } from "../custom-buttons.mjs";
import { collectIdentity } from "./identity.mjs";
import { collectResources } from "./resources.mjs";
import { collectTraits } from "./traits.mjs";
import { collectWeapons } from "./weapons.mjs";
import { collectFeatures } from "./features.mjs";
import { collectDomains } from "./domains.mjs";
import { collectInventory } from "./inventory.mjs";
import { collectConditions } from "./conditions.mjs";

export async function buildContext(app) {
  const identity   = collectIdentity(app);
  const resources  = collectResources(app);
  const traits     = collectTraits(app);
  const weapons    = collectWeapons(app);
  const features   = await collectFeatures(app);
  const domains    = await collectDomains(app);
  const inventory  = await collectInventory(app);
  const conditions = collectConditions(app);

  const customButtons = {
    traits: collectCustomButtons("traits", app.actor),
    inventory: [],
    // other sections...
  };

  const { ancestryInfo, communityInfo, classInfo, subclassInfo, actorName, portrait, hasParty, hasCompanion } = identity;

  // Return everything the HBS references today (+ a few future-safe keys)
  return {
    actorName,
    portrait,
    isDying: resources.isDying,

    // resources
    hitPoints: resources.hitPoints,
    stress: resources.stress,
    hope: resources.hope,
    hopePips: resources.hopePips,

    // defenses & scores
    evasion: resources.evasion,
    armor: resources.armor,
    thresholds: resources.thresholds,
    proficiency: resources.proficiency,
    experiences: traits.experiences,

    // homebrew / feature-granted extra resources
    extraResources: resources.extraResources,

    //features
    miscFeatures: features.miscFeatures,

    // traits & resistances
    traits: traits.traits,
    resistance: resources.resistance,

    // weapons
    primaryWeapon: weapons.primaryWeapon,
    secondaryWeapon: weapons.secondaryWeapon,

    ancestryFeatures: features.ancestryFeatures,
    communityFeatures: features.communityFeatures,
    classFeatures: features.classFeatures,
    subclassFeatures: features.subclassFeatures,
    ancestryInfo, communityInfo, classInfo, subclassInfo,
    hasParty, hasCompanion,

    invConsumables: inventory.invConsumables,
    invLoot: inventory.invLoot,
    invWeapons: inventory.invWeapons,
    invArmor: inventory.invArmor,
    invCurrency: inventory.invCurrency,

    domainLoadout: domains.domainLoadout,
    domainVault: domains.domainVault,
    domainsHeader: domains.domainsHeader,
    domainsHeaderTitle: domains.domainsHeaderTitle,

    //effects
    statusEffects: conditions.statusEffects,
    availableConditions: conditions.availableConditions,
    showGenericStatusSection: conditions.showGenericStatusSection,

    //custom buttons
    customButtons
  };
}
