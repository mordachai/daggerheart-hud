# Daggerheart System API Reference (for the HUD)

System: `daggerheart` v2.9.2 (Foundryborne). Source repo: `D:\FoundrySystems\daggerheart`.
Built copy in game: `D:\FoundryVTT-14\Data\systems\daggerheart` (the `build/` dir is the bundled output).

This documents **only** the surface the HUD uses or should use. Everything below was read from the
2.9.2 source; line references are `path:line` in the system repo.

---

## 1. Namespaces & entry points

| Thing | Where | Notes |
|---|---|---|
| System config | `CONFIG.DH` | Set in `daggerheart.mjs`: `CONFIG.DH = SYSTEM`. **There is no `CONFIG.DAGGERHEART`.** |
| Runtime API | `game.system.api` | `{ applications, data, models, documents, macros, dice, fields }`. Set on `init`. `models` and `data` are the same object. |
| Action classes | `game.system.api.data.actions.actionsTypes` | `{ base, attack, countdown, damage, healing, summon, effect, macro, beastform, transform, evolution, grouped }` (`data/action/_module.mjs:14`). **No `CONFIG.DH.Action`.** |
| Actor doc class | `game.system.api.documents.DhpActor` | `CONFIG.Actor.documentClass` |
| Item doc class | `game.system.api.documents.DHItem` | `CONFIG.Item.documentClass` |
| ActiveEffect doc class | `game.system.api.documents.DhActiveEffect` | |
| Dialogs | `game.system.api.applications.dialogs.*` | Exports in `applications/dialogs/_module.mjs`. Names: `Downtime`, `DeathMove`, `ActionSelectionDialog`, `MultiActionSelectionDialog`, `ResourceDiceDialog`, `RiskItAllDialog`, … |
| Dice roll classes | `CONFIG.Dice.daggerheart` | `{ DHRoll, DualityRoll, D20Roll, DamageRoll, FateRoll }` |

### Methods the old HUD calls that DO NOT EXIST in 2.9.2

- `item.rollAction(path)` — **not a method.** Every HUD call falls through to the next branch.
- `item.displayCard(...)` — **not a method** anywhere in the system.
- `CONFIG.DAGGERHEART.Action` / `CONFIG.DH.Action` — **undefined.**
- `actor.system.usedUnarmed` — **not a field.** Unarmed lives at `actor.system.attack` (see §4).
- `feature.system.originItemType` — **legacy**, migrated to `feature.system.granter.type` (see §5). Old
  worlds still carry it until `migrations.mjs` runs; new data does not.
- `feature.system.identifier` — now `feature.system.granter.identifier`.
- `CONFIG.DH.GENERAL.conditions` used as an object — it is a **function**, `conditions()` (see §7).

---

## 2. Actions — the universal "do the thing" API

Actions are `DataModel` instances (`data/action/baseAction.mjs`, `DHBaseAction`). They live on items in
two places:

- `item.system.actions` — an `ActionsField` **Collection** keyed by action id (items with
  `metadata.hasActions`: weapon, armor, feature, domainCard, consumable, loot).
- `item.system.attack` — a single `ActionField` instance, the built-in attack, on **weapon** and on the
  **character actor** (`actor.system.attack`, the unarmed attack).

### Accessors

```js
item.system.actions            // Collection<id, DHBaseAction>   (may be empty)
item.system.actionsList         // Array — for weapon: [attack, ...actions]; else the actions;
                                //  [] on non-character actors for inventory items
item.system.metadata.hasActions // boolean
item.getEmbeddedDocument('Action', id)  // resolves from actions OR the base attack
```

`baseAction.mjs` key members:

```js
action.id            // === action._id
action.systemPath    // 'actions' | 'attack'  (a PATH, not an id)
action.type          // 'attack' | 'damage' | 'healing' | 'effect' | 'macro' | 'summon' | ...
action.actionType    // 'action' | 'reaction' | ...  (choices: CONFIG.DH.ITEM.actionTypes)
action.name, action.img, action.description
action.hasRoll, action.hasDamage, action.hasHealing, action.hasSave, action.hasEffect
action.actor         // first Actor ancestor or null
action.item          // owning item

await action.use(event, configOptions = {})   // ← MAIN ENTRY. See below.
await action.executeWorkflow(config)          // lower level
await action.consume(config, successCost)     // just pay costs/uses
```

### `action.use(event, configOptions)` — behaviour

1. Throws if no actor context.
2. Builds `config` via `prepareConfig(event, configOptions)`.
3. If `requireConfigurationDialog(config)` (roughly: not shift-clicked AND has costs/uses AND no roll) →
   opens `D20RollDialog.configure`.
4. Runs the workflow (roll → costs → uses → damage/healing → effects → …), each step firing
   `daggerheart.pre<Step>Action` / `daggerheart.post<Step>Action` hooks (cancellable).
5. Applies `config.resourceUpdates`.
6. If `action.chatDisplay` and not skipped → `action.toChat(null, config)`.

**`event` matters.** `event.shiftKey` / `altKey` / `ctrlKey` skip the configuration dialog
(`applyKeybindings`, `baseAction.mjs:431`). Passing `{}` or a real `PointerEvent` both work; passing a
plain `{action: "attack"}` object (as the old HUD does) is silently treated as an event with no
modifier keys.

`configOptions` is merged into the config; useful keys: `targetUuid`, `skips: { resources, triggers,
createMessage, updateCountdowns, reaction }`.

### `item.use(event)` — behaviour (`documents/item.mjs:255`)

- Blocks if `system.isDomainTouchedSuppressed`.
- Collects `system.actionsList`. If exactly one → `action.use(event)`. If more than one and
  **not** `event.shiftKey` → opens `ActionSelectionDialog.create(this, event)` then uses the pick.
- Does nothing if there are no actions.

### Recommended HUD usage

| Intent | Call |
|---|---|
| Fire a weapon's attack | `weapon.system.attack.use(event)` |
| Fire the unarmed attack | `actor.system.attack.use(event)` |
| Use a specific action of an item | `item.system.actions.get(actionId).use(event)` — **store the id**, not `systemPath` |
| "Use this item" (let system choose/prompt) | `item.use(event)` |

The old HUD stores `data-actionpath="actions"` and passes that string around; it should store the
action **id** and resolve via `item.system.actions.get(id)`.

---

## 3. Rolls

### Trait / duality / reaction rolls

`actor.rollTrait(trait, options = {})` (`documents/actor.mjs:716`):

```js
await actor.rollTrait('agility');
await actor.rollTrait('presence', { actionType: 'reaction' });   // reaction roll
```

It builds a config and calls `actor.diceRoll(config)` which picks `DualityRoll` for
character/companion, `D20Roll` otherwise (`actor.rollClass`, `actor.mjs:736`).

Lower-level programmatic entry with target/difficulty/advantage control —
`enrichedDualityRoll(args, event)` (`enrichers/DualityRollEnricher.mjs:86`):

```js
import ... // not exported via game.system.api; re-implement or call actor.rollTrait
await enrichedDualityRoll({
  reaction: false,
  traitValue: 'agility',
  target: actor,            // a DhpActor; if null, rolls "bare"
  difficulty: 12,           // optional
  title, label,             // strings
  advantage,                // number | undefined
  grantResources: true
}, event);
```

`[[/dr ...]]` / `[[/fr ...]]` are **text enrichers** (`enrichers/_module.mjs`), not chat slash
commands. The old HUD does `ui.chat.processMessage("/dr trait=agility")`, which posts a literal chat
line that then enriches into a *button* the user must click — indirect. Prefer `actor.rollTrait`.

### Generic rolls

`actor.diceRoll(config)` → `rollClass.build(config)`. `config.roll` accepts `{ trait, type,
difficulty, advantage, lite }`.

---

## 4. Actor — `DhpActor` (`documents/actor.mjs`) and `DhCharacter` system model

### Document methods (call on the actor)

```js
await actor.rollTrait(trait, options)
await actor.diceRoll(config)
await actor.toggleStatusEffect(statusId, { active, overlay })   // ← conditions, §7
await actor.takeDamage(args, isDirect)          // full damage pipeline (thresholds, armor prompt, triggers)
await actor.takeHealing(args)                   // full healing pipeline
await actor.modifyResource([{ key, value, itemId?, target?, clear? }])  // delta-based; see note
actor.calculateDamage(baseDamage, typeArray)
actor.getResistanceStatus(damageTypes)          // { resistant, immune }
actor.getDamageTypeReduction(typeArray)
actor.getActiveEffects()                        // effects incl. transferred, minus suppressed
actor.getRollData()
await actor.setDeathMoveDefeated(iconId)
await actor.toggleDefeated(state)
actor.queueScrollText(data)
```

**`modifyResource` sign convention:** it does not simply add. `takeDamage`/`takeHealing` flip the sign
based on each resource's `isReversed` before calling it. For a plain "+1 / −1 pip" control the safest
options are:

- direct: `actor.update({ 'system.resources.stress.value': next })` (clamp yourself), or
- `actor.modifyResource([{ key: 'stress', value: +1 }])` **knowing** stress/hitPoints are
  `isReversed` (value counts *up* as it worsens) and hope is not.

### `actor.system` (character) — derived getters (`data/actor/character.mjs`)

```js
system.tier                       // 1..4
system.ancestry / system.community        // Item | null
system.class          // { value: Item?, subclass: Item? }   (non-multiclass)
system.multiclass     // { value: Item?, subclass: Item? }
system.features                   // Item[]  (type === 'feature')
system.domains                    // string[] of domain ids (class + multiclass)
system.domainData                 // [{ id, label, ... }]
system.domainCards    // { loadout: Item[], vault: Item[], total: Item[] }  (sorted by .sort)
system.loadoutSlot    // { current: number, available: boolean }
system.armor                      // the equipped armor Item | undefined
system.primaryWeapon              // equipped weapon, !secondary  | undefined
system.secondaryWeapon            // equipped weapon, secondary   | undefined
system.getWeaponBurden            // 'twoHanded' | 'oneHanded' | null
system.usesUnarmed                // boolean — true when neither weapon slot is equipped
system.spellcastingModifiers      // { main: traitKey?, multiclass: traitKey? }
system.spellcastModifierTrait     // { value, key, ... } highest spellcast trait
system.deathMoveViable            // boolean (all HP marked & not already resolved)
system.attack                     // ActionField — the UNARMED attack (has .use(event))
system.activeBeastform            // ActiveEffect | undefined
```

### `actor.system` (character) — schema fields (`character.mjs:defineSchema`)

```js
system.traits.<agility|strength|finesse|instinct|presence|knowledge>   // attributeField: { value, tierMarked }
system.proficiency                // number
system.evasion                    // number
system.damageThresholds           // { major, severe }
system.experiences                // TypedObject<{ name, value, description, core }>
system.gold                       // { coins, handfuls, bags, chests }
system.scars                      // number (reduces hope max)
system.armorScore                 // SchemaField { value, max, ... }  (character.mjs:327)
system.bonuses.*                  // roll/damage/healing/range/rest/maxLoadout bonuses (persisted:false)
system.companion                  // Actor | null
system.rules.*                    // damageReduction, conditionImmunities, roll.*, ...
system.resistance.<physical|magical>   // { resistance:bool, immunity:bool, reduction:number }  (base.mjs)
```

### Resources (`data/fields/actorField.mjs:ResourcesField`, `config/resourceConfig.mjs`)

Stored shape is minimal: `system.resources.<id> = { value, max }` where `max: null` means "use the
default". Character resource ids: **`hitPoints`, `stress`, `hope`**. Optional/homebrew ids may exist
(favor, focus, …) — see `helpers/utils.mjs:getAllResources()`.

**Extra resources (homebrew + feature-granted).** `DhCreature#availableExtraResources` (getter on the
character data model) returns the union of the GM's homebrew resource keys
(`game.settings.get('daggerheart','Homebrew').resources.<actorType>.resources`) and every prepared
`system.resources.*` entry flagged `isExtra`. Each prepared entry carries
`{ value, max (number|null), label, isReversed, isExtra, isOptional, images: { full, empty } }` where
an image slot is `{ value, isIcon, noColorFilter, opacity }` (`value` = FA class when `isIcon`, else a
file path). Write with a plain `actor.update({'system.resources.<id>.value': n})` (clamped in
`clampResources`). The HUD wraps all of this in `module/system/resources.mjs`
(`listActorResources` / `setActorResource` / `bumpActorResource`), surfaced by the resources
collector as `extraResources` and rendered as a pip row / counter next to HP/Stress.

Derived at prepare time:

- `hitPoints`: `reverse: true` → `isReversed` (value counts UP = damage marked; full health = 0).
- `stress`: `reverse: true` (default max 6).
- `hope`: `reverse: false` (default initial 2). `hope.max -= scars` (`character.mjs:763`).
- `system.resources.armor` is **synthesised** in `prepareDerivedData` from `armorScore`:
  `{ value, max, label, isReversed: true }` (`character.mjs:777`). Marks themselves live on the
  equipped **armor item** at `armor.system.armor.current` (`.max` is the base score).

---

## 5. Items — data models (`data/item/*.mjs`)

All extend `BaseDataItem` (`data/item/base.mjs`). Common metadata flags:
`hasDescription`, `hasResource`, `hasActions`, `isInventoryItem`.

```js
item.system.metadata              // the flags above + label/type
item.system.actor                 // owning actor | null
item.system.actionsList           // see §2
await item.system.getEnrichedDescription(config = {}, options = {})
  // config: { gmNotes?:bool, type?: 'sheet'|'embed' }
  // returns fully enriched HTML incl. weapon/armor feature prefix, gmNotes section
item.system.getRollData(options)
item._getTags()                   // localized string[] (trait/range/damage for weapons, etc.)
item._getLabels()                 // [string | { value, icons:[faIcon] }]  — display chips
```

### Resource sub-schema (when `hasResource`)  — `base.mjs:57`

```js
item.system.resource = {
  type,          // 'simple' | 'diceValue' | 'die'   (CONFIG.DH.ITEM.itemResourceTypes)
  value,         // integer >= 0
  max,           // FormulaField (deterministic) | null   — may be "@..." expression
  icon,
  recovery,      // refresh type id | null    (CONFIG.DH.GENERAL.refreshTypes)
  progression,   // 'increasing' | 'decreasing'  (CONFIG.DH.ITEM.itemResourceProgression)
  diceStates,    // TypedObject<{ value:int>=1, used:bool }>   keyed by numeric string
  dieFaces       // 'd4'..'d20'  (CONFIG.DH.GENERAL.diceTypes)
}
```

### weapon (`data/item/weapon.mjs`)  — `hasActions`, `hasResource`, `isInventoryItem`

```js
system.tier, system.equipped, system.secondary          // booleans
system.burden               // 'oneHanded' | 'twoHanded'   (CONFIG.DH.GENERAL.burden)
system.attack               // ActionField — .use(event) to attack; .roll.trait, .range, .damage.main
system.weaponFeatures       // [{ value, effectIds[], actionIds[] }]
system.customActions        // actions not owned by a weaponFeature
system.hasReload / system.needsReload
system.actionsList          // [attack, ...super.actionsList]
```

### armor (`data/item/armor.mjs`) — `hasActions`, `hasResource`, `isInventoryItem`

```js
system.tier, system.equipped
system.armor = { current, max }        // current = damage marks; max = base score
system.baseThresholds = { major, severe }
system.armorFeatures = [{ value, effectIds[], actionIds[] }]
```

Actor's effective armor max is `actor.system.armorScore` (post-effects), **not** `armor.system.armor.max`.

### domainCard (`data/item/domainCard.mjs`) — `hasActions`, `hasResource`

```js
system.domain          // domain id   (CONFIG.DH.DOMAIN.allDomains)
system.level, system.recallCost
system.type            // card type id (CONFIG.DH.DOMAIN.cardTypes) — ability/spell/grimoire...
system.inVault         // boolean
system.vaultActive, system.loadoutIgnore, system.domainTouched
system.domainLabel                 // localized
system.isVaultSupressed            // inVault && !vaultActive
system.isDomainTouchedSuppressed   // not enough same-domain cards in loadout

await system.toggleVault(event, toVault?, isRecall?)
  // handles loadout-limit warning + recall (stress) cost dialog. USE THIS, not a raw update.
await system.onRecallCost(event)
```

The old HUD does `item.update({ 'system.inVault': ... })` directly — that bypasses recall cost and the
loadout cap.

### feature (`data/item/feature.mjs`) — `hasActions`, `hasResource`

```js
system.granter = {                 // replaces originItemType
  id,                              // owning item id on the actor
  type,                            // 'ancestry'|'community'|'class'|'subclass'|'domainCard'|'armor'|'weapon'|...
                                   //   (CONFIG.DH.ITEM.featureTypes)
  identifier,                      // for subclass: 'foundation' | 'specialization' | 'mastery'
  multiclass                       // boolean
} | null
system.featureForm    // 'passive' | 'action' | 'reaction' | 'evolution'   (CONFIG.DH.ITEM.featureForm)
system.actorResources // SetField<string>
system.granterItem    // resolved Item (derived)
system.itemFeatures / system.getLinkedItems()
```

**Bucketing features** (ancestry / community / class / subclass panels) must use
`feature.system.granter?.type`. Subclass tier gating uses
`subclass.system.featureState` (1/2/3) vs `feature.system.granter?.identifier`.

### consumable / loot

`consumable`: `system.consumeOnUse` (bool), `isInventoryItem`, `hasActions`, `system.quantity`.
`loot`: `isInventoryItem`, `hasActions`, `system.quantity`. Neither has `hasResource`.

### DHItem document methods (`documents/item.mjs`)

```js
item.usable            // getter: owner + valid type + has actions + pack not locked
item.hasDescription
item.isInventoryItem
await item.use(event)               // §2
await item.toChat(item.uuid)        // ← REQUIRES a uuid argument; builds an 'abilityUse' chat card
await item.refreshFromCompendium({ save })
```

`item.toChat` with no/instead arg (old HUD passes `{ speaker }`) → `fromUuid(undefined)` → throws
internally / wrong card. Pass `item.uuid`.

---

## 6. Dialogs (`game.system.api.applications.dialogs`)

```js
new dialogs.Downtime(actor, shortRest)   // shortRest truthy → short rest; falsy → long rest
  .render(true)
new dialogs.DeathMove(actor).render(true)
```

Both are `ApplicationV2` + Handlebars. Constructors take positional args (not an options object).
The old HUD's `new DowntimeDialog(this.actor, 'anything')` works because any truthy 2nd arg = short rest.

Other potentially useful: `dialogs.ActionSelectionDialog.create(item, event)`,
`dialogs.MultiActionSelectionDialog`, `dialogs.ResourceDiceDialog`, `dialogs.RiskItAllDialog`.

---

## 7. Conditions / status effects

- `CONFIG.DH.GENERAL.conditions` is a **function**: `conditions()` returns
  `{ vulnerable, hidden, restrained, ...defeatedConditions() }`, each
  `{ id, name (i18n key), img, description (i18n key), autoApplyFlagId? }`
  (`config/generalConfig.mjs:235`).
- On `setup`, `daggerheart.mjs` rebuilds `CONFIG.statusEffects` = core effects (minus dead/unconscious)
  **plus** every `conditions()` entry, each tagged `systemEffect: true`.
- So the real enumeration is **`CONFIG.statusEffects`**, split by the `systemEffect` flag:
  - `systemEffect === true` → Daggerheart conditions.
  - `systemEffect` falsy → generic Foundry effects. Only show these if
    `game.settings.get('daggerheart', 'Appearance').showGenericStatusEffects`.
- Respect `status.hud === false` and `status.hud.actorTypes` (see `tokenHUD.mjs:_getStatusEffectChoices`).
- Respect `actor.system.rules.conditionImmunities?.[id]` (disable, don't hide).

**Toggle:** `await actor.toggleStatusEffect(statusId, { active })` (`actor.mjs:745`). It finds the
effect by static `_id` or by `effect.statuses`, deletes if present, creates from
`ActiveEffect.fromStatusEffect(statusId)` if not. Do **not** hand-roll
`createEmbeddedDocuments('ActiveEffect', ...)` with a custom flag like the old HUD does.

**Query active:** `actor.statuses` (Set of ids) or iterate `actor.effects` / `actor.getActiveEffects()`
and check `effect.statuses`.

The old HUD's `dhConditions = CONFIG.DH.GENERAL.conditions || {}` → `Object.values(fn)` → `[]`, and its
generic list filters out `systemEffect` entries — so the Daggerheart conditions never appear. This is a
current bug, not just a style issue.

---

## 8. Config tables the HUD needs (`CONFIG.DH.*`)

| Path | Shape |
|---|---|
| `CONFIG.DH.ACTOR.abilities` | `{ agility: { id, label, verbs: [i18nKey,i18nKey,i18nKey] }, ... }` — 6 traits, ordered agility, strength, finesse, instinct, presence, knowledge. **`verbs` is an array of i18n keys** now, not a `verb` object. |
| `CONFIG.DH.GENERAL.conditions()` | see §7 |
| `CONFIG.DH.GENERAL.burden` | `{ oneHanded: { value, label }, twoHanded: { value, label } }` |
| `CONFIG.DH.GENERAL.damageTypes` | `{ physical: { id, label, abbreviation, icon }, magical: {...} }` |
| `CONFIG.DH.GENERAL.healingTypes` | `{ hitPoints, stress, hope, armor, fear, resource }` each `{ id, label, abbreviation }` |
| `CONFIG.DH.GENERAL.diceTypes` | `{ d4:'d4', ... }` |
| `CONFIG.DH.GENERAL.dieFaces` | `[4,6,8,10,12,20]` |
| `CONFIG.DH.GENERAL.refreshTypes` | recovery/refresh ids (shortRest/longRest/session/scene) |
| `CONFIG.DH.DOMAIN.allDomains()` | `{ <id>: { id, label, color, ... } }` (function) |
| `CONFIG.DH.DOMAIN.domains` | core domains only |
| `CONFIG.DH.DOMAIN.cardTypes` | domain card types |
| `CONFIG.DH.ITEM.featureTypes` | ancestry/community/companion/class/subclass/domainCard/armor/weapon/consumable/loot/beastform/transformation |
| `CONFIG.DH.ITEM.featureForm` | `{ passive, action, reaction, evolution }` (values are i18n keys) |
| `CONFIG.DH.ITEM.itemResourceTypes` | `{ simple, diceValue, die }` |
| `CONFIG.DH.ITEM.itemResourceProgression` | `{ increasing, decreasing }` |
| `CONFIG.DH.ITEM.actionTypes` | choices for `action.actionType` |
| `CONFIG.DH.ITEM.originItemType` | `{ itemCollection, restMove }` — **unrelated** to feature origin; do not use for bucketing |
| `CONFIG.DH.ACTIONS.actionTypes` | `{ attack: { name }, ... }` per-type metadata (names/icons) |
| `CONFIG.DH.SETTINGS.gameSettings.*` | setting keys, e.g. `.appearance`, `.Homebrew`, `.Automation` |

Appearance setting: `game.settings.get('daggerheart', 'Appearance')` →
`{ showGenericStatusEffects, displayFear, displayCountdownUI, ... }`. Note the old HUD reads
`game.settings.get('daggerheart', 'Appearance')` in one place and the config key is
`CONFIG.DH.SETTINGS.gameSettings.appearance` — confirm the literal key before relying on it.

---

## 9. Hooks fired by the system (useful for HUD refresh)

From `baseAction.executeWorkflow` / `use`:
`daggerheart.preUseAction`, `daggerheart.postUseAction`, and per step
`daggerheart.pre<Step>Action` / `daggerheart.post<Step>Action` where `<Step>` ∈
`Roll, Cost, Uses, Damage, ApplyDamage, Healing, Effect, ...` (capitalised).

From actor: `daggerheart.preTakeDamage`, `daggerheart.postCalculateDamage`,
`daggerheart.postTakeDamage`, `daggerheart.preTakeHealing`, `daggerheart.postTakeHealing`.

Plus system trigger/hook ids in `CONFIG.DH.HOOKS.hooksConfig` and `CONFIG.DH.TRIGGER.triggers`.

The HUD currently only listens to core `updateActor` / `updateItem` / `*ActiveEffect`. Those still work
and are the simplest refresh signal.

---

## 10. Helper functions worth reusing (`module/helpers/utils.mjs`)

Not exported via `game.system.api` (only `fields`, `data`, etc. are). If needed, copy the small ones.
Notable:

- `signedNumber(v)` — `+3` / `-2`.
- `getAllResources()` / `getAllResourceLabels()` — full resource id → metadata map incl. homebrew.
- `getArmorSources(actor)` — resolved armor stack, ordered.
- `RefreshFeatures(refreshTypes, actorTypes, ...)` — the rest/refresh engine.
- `expireActiveEffects(actor, allowedTypes)`.
- `getIconVisibleActiveEffects(effects)`.
- `getFeaturesHTMLData(features)` — `[{ label, description(enriched) }]`.

`module/helpers/functional.mjs`: `pick, pickBy, omit, mapValues, keyBy, sortBy`.

---

## 11. Summary of behavioural bugs in the current HUD (from this audit)

Status as of the 2025 refactor (steps 1–11): ✅ = fixed, ⬜ = still open.

| # | Status | Where | Problem | Fix |
|---|---|---|---|---|
| 1 | ✅ (step 5) | `_rollWeapon`, `_executeItem` | `item.rollAction(...)` never exists; `item.use({action})` misuses the event arg | `weapon.system.attack.use(event)` / `item.system.actions.get(id).use(event)` — now in `system/items.mjs` |
| 2 | ✅ (step 6) | `sendItemToChat` | `displayCard` never exists; `item.toChat.call(item, {speaker})` passes wrong arg | `item.toChat(item.uuid)` — `system/items.mjs` `sendToChat` |
| 3 | ✅ (step 7) | condition list | `CONFIG.DH.GENERAL.conditions` is a function → DH conditions never listed; generic filter also excludes them | enumerate `CONFIG.statusEffects`, split on `systemEffect` — `system/conditions.mjs` `listConditions` |
| 4 | ✅ (step 7) | `_applyCondition` / `_removeCondition` | hand-rolled ActiveEffect create/delete with custom flag | `actor.toggleStatusEffect(id, { active })` — `system/conditions.mjs` `toggle` |
| 5 | ✅ (step 8) | feature bucketing | reads `system.originItemType` / `system.identifier` — migrated away | `system.granter.type` / `system.granter.identifier` — `hud/context/features.mjs` (one-line legacy fallback kept) |
| 6 | ✅ (step 5) | unarmed | reads `system.usedUnarmed` — not a field | `actor.system.attack` — `system/items.mjs` `useUnarmed` |
| 7 | ✅ (step 9) | domain card move | raw `item.update({'system.inVault'})` skips recall cost + loadout cap | `card.system.toggleVault(event, toVault, isRecall)` — `system/items.mjs` `moveDomainCard` |
| 8 | ✅ (step 5) | trait rolls | posts `/dr` as chat text → produces a button, not a roll | `actor.rollTrait(traitKey, { actionType })` — `system/actor.mjs` `rollTrait` |
| 9 | ✅ (step 6) | descriptions | custom `enrichItemDescription` misses weapon/armor feature prefixes, gmNotes | `item.system.getEnrichedDescription()` — `system/descriptions.mjs` (manual enrich kept as fallback) |
| 10 | ⬜ | weapon/threshold display | hand-built; system already provides | `item._getLabels()` / `item._getTags()` — not yet adopted; `hud/context/{weapons,resources}.mjs` still hand-build |
