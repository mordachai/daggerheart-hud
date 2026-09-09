<!--
  Reverse-engineered from the Daggerheart system source (D:\FoundrySystems\daggerheart):
    - module/applications/dialogs/activeEffectPathViewerDialog.mjs   (the dialog the macro opens)
    - module/applications/sheets-configs/activeEffectConfig.mjs       (static getChangeChoices())
    - module/config/actorConfig.mjs                                   (activeEffectExtraPaths)
    - module/data/actor/{base,creature,character,adversary,companion}.mjs  (schema)
    - daggerheart.mjs  ->  CONFIG.Actor.trackableAttributes            (the bar/value lists)
    - lang/en.json                                                    (labels + hints)

  Macro:  game.system.api.macros.showActiveEffectPathViewer();
  -> new game.system.api.applications.dialogs.ActiveEffectPathViewer().render(true)

  HOW THE LIST IS BUILT (getChangeChoices):
    1. Start with the "allActors" extra paths (@fear, @partySize).
    2. Walk game.system.api.models.actors. Its keys come from an ES module namespace
       object, so they are iterated ALPHABETICALLY: DhAdversary, DhCharacter, DhCompanion,
       (DhEnvironment / DhNPC / DhParty / config are skipped by ignoredActorKeys).
       That is why the dialog shows Adversary before Character.
    3. Per actor, in this order, append:
         extra   = CONFIG.DH.ACTOR.activeEffectExtraPaths[type]        (full @paths)
         bars    = CONFIG.Actor.trackableAttributes[type].bar   -> each "<path>.max"
         values  = CONFIG.Actor.trackableAttributes[type].value -> each "<path>"
         rules   = every leaf field under system.rules   (skips "standardAttack")
         bonuses = every leaf field under system.bonuses
    4. Group header = localized actor label (Adversary / Character / Companion).
    5. Display value = isFullPath ? value : `@system.${value}`.
       In the Active Effect "Changes" tab the effect key is written WITHOUT the "@"
       (e.g. system.bonuses.roll.attack.bonus); the "@..." form shown here is the
       roll-data form used in formulas.

  CAVEATS / HINTS:
    - Boolean rule flags and resistance/immunity fields are stored as 0 / 1. Use
      change mode "Override" with value 1 to switch them on.
    - Dice-index fields: 0=d4, 1=d6, 2=d8, 3=d10, 4=d12, 5=d20.
    - `.dice` bonus fields take an array of die strings (e.g. ["d6"]); `.bonus`
      fields take a flat integer.
    - Homebrew / feature-granted extra actor resources (system.resources.<key>) are
      NOT in this list - they are not registered in trackableAttributes. You can still
      target them by typing the path manually.
    - @fear / @partySize are world globals, not actor data.
    - This list is generated at runtime from the schema; re-run the macro after a
      system update to catch changes.

  Generated for daggerheart-hud consultation. System version: see D:\FoundrySystems\daggerheart\system.json
-->

# Daggerheart – Active Effect Paths

Consultable dump of every path the in-game **Active Effect Path Viewer**
(`game.system.api.macros.showActiveEffectPathViewer();`) lists, grouped exactly as the
dialog groups them. `Path` is the roll-data form shown in the dialog; drop the leading
`@` for the actual Active Effect *change key*.

---

## All Actors

World globals – available on every actor.

| Label | Path | Hint |
|---|---|---|
| Fear Amount | `@fear` | The GM Fear counter. |
| Party Size | `@partySize` | Number of members in the active party. |

---

## Adversary

### Resources (bars)

| Label | Path | Hint |
|---|---|---|
| Stress | `@system.resources.stress.max` | |
| Hit Points | `@system.resources.hitPoints.max` | |

### Values

| Label | Path | Hint |
|---|---|---|
| Damage Resistance: Physical | `@system.resistance.physical.resistance` | Physical Damage is halved if this is set to 1. |
| Damage Immunity: Physical | `@system.resistance.physical.immunity` | Immune to Physical Damage if this is set to 1. |
| Damage Reduction: Physical | `@system.resistance.physical.reduction` | Physical Damage is reduced by the amount set here. |
| Damage Resistance: Magical | `@system.resistance.magical.resistance` | Magical Damage is halved if this is set to 1. |
| Damage Immunity: Magical | `@system.resistance.magical.immunity` | Immune to Magical Damage if this is set to 1. |
| Damage Reduction: Magical | `@system.resistance.magical.reduction` | Magical Damage is reduced by the amount set here. |
| Advantage Sources | `@system.advantageSources` | Add single words or short text as reminders and hints of what has advantage. |
| Disadvantage Sources | `@system.disadvantageSources` | Add single words or short text as reminders and hints of what has disadvantage. |
| Major Damage Threshold | `@system.damageThresholds.major` | |
| Severe Damage Threshold | `@system.damageThresholds.severe` | |
| Critical Threshold | `@system.criticalThreshold` | |
| Difficulty | `@system.difficulty` | |

### Rules

| Label | Path | Hint |
|---|---|---|
| Condition Immunity: Hidden | `@system.rules.conditionImmunities.hidden` | |
| Condition Immunity: Restrained | `@system.rules.conditionImmunities.restrained` | |
| Condition Immunity: Vulnerable | `@system.rules.conditionImmunities.vulnerable` | |
| Threshold Immunities: Minor | `@system.rules.damageReduction.thresholdImmunities.minor` | Automatically ignores minor damage when set to 1. |
| Reduce Damage Severity: Magical | `@system.rules.damageReduction.reduceSeverity.magical` | Lowers any magical damage received by the set amount of severity degrees. |
| Reduce Damage Severity: Physical | `@system.rules.damageReduction.reduceSeverity.physical` | Lowers any physical damage received by the set amount of severity degrees. |
| HP Damage Multiplier | `@system.rules.attack.damage.hpDamageMultiplier` | Multiply any damage you deal by this number. |
| HP Damage Taken Multiplier | `@system.rules.attack.damage.hpDamageTakenMultiplier` | Multiply any damage dealt to you by this number. |

### Bonuses

| Label | Path | Hint |
|---|---|---|
| Attack Roll Value | `@system.bonuses.roll.attack.bonus` | |
| Attack Roll Dice | `@system.bonuses.roll.attack.dice` | |
| Action Roll Value | `@system.bonuses.roll.action.bonus` | |
| Action Roll Dice | `@system.bonuses.roll.action.dice` | |
| Reaction Roll Value | `@system.bonuses.roll.reaction.bonus` | |
| Reaction Roll Dice | `@system.bonuses.roll.reaction.dice` | |
| Physical Damage Value | `@system.bonuses.damage.physical.bonus` | |
| Physical Damage Dice | `@system.bonuses.damage.physical.dice` | |
| Magical Damage Value | `@system.bonuses.damage.magical.bonus` | |
| Magical Damage Dice | `@system.bonuses.damage.magical.dice` | |

---

## Character

### Extra

| Label | Path | Hint |
|---|---|---|
| Proficiency | `@prof` | Shortcut for the proficiency value. |
| Spellcasting Modifier | `@cast` | Shortcut for the character's spellcast trait value. |

### Resources (bars)

| Label | Path | Hint |
|---|---|---|
| Stress | `@system.resources.stress.max` | |
| Hit Points | `@system.resources.hitPoints.max` | |
| Max Hope | `@system.resources.hope.max` | |

### Values

| Label | Path | Hint |
|---|---|---|
| Damage Resistance: Physical | `@system.resistance.physical.resistance` | Physical Damage is halved if this is set to 1. |
| Damage Immunity: Physical | `@system.resistance.physical.immunity` | Immune to Physical Damage if this is set to 1. |
| Damage Reduction: Physical | `@system.resistance.physical.reduction` | Physical Damage is reduced by the amount set here. |
| Damage Resistance: Magical | `@system.resistance.magical.resistance` | Magical Damage is halved if this is set to 1. |
| Damage Immunity: Magical | `@system.resistance.magical.immunity` | Immune to Magical Damage if this is set to 1. |
| Damage Reduction: Magical | `@system.resistance.magical.reduction` | Magical Damage is reduced by the amount set here. |
| Advantage Sources | `@system.advantageSources` | Add single words or short text as reminders and hints of what a character has advantage on. |
| Disadvantage Sources | `@system.disadvantageSources` | Add single words or short text as reminders and hints of what a character has disadvantage on. |
| Agility | `@system.traits.agility.value` | |
| Strength | `@system.traits.strength.value` | |
| Finesse | `@system.traits.finesse.value` | |
| Instinct | `@system.traits.instinct.value` | |
| Presence | `@system.traits.presence.value` | |
| Knowledge | `@system.traits.knowledge.value` | |
| Major Damage Threshold | `@system.damageThresholds.major` | |
| Severe Damage Threshold | `@system.damageThresholds.severe` | |
| Proficiency | `@system.proficiency` | |
| Evasion | `@system.evasion` | |
| Scars | `@system.scars` | |
| Current Level | `@system.levelData.level.current` | |

### Rules

| Label | Path | Hint |
|---|---|---|
| Condition Immunity: Hidden | `@system.rules.conditionImmunities.hidden` | |
| Condition Immunity: Restrained | `@system.rules.conditionImmunities.restrained` | |
| Condition Immunity: Vulnerable | `@system.rules.conditionImmunities.vulnerable` | |
| Threshold Immunities: Minor | `@system.rules.damageReduction.thresholdImmunities.minor` | Automatically ignores minor damage when set to 1. |
| Reduce Damage Severity: Magical | `@system.rules.damageReduction.reduceSeverity.magical` | Lowers any magical damage received by the set amount of severity degrees. |
| Reduce Damage Severity: Physical | `@system.rules.damageReduction.reduceSeverity.physical` | Lowers any physical damage received by the set amount of severity degrees. |
| Damage Reduction: Only Magical | `@system.rules.damageReduction.magical` | Armor can only be used to reduce magical damage. |
| Damage Reduction: Only Physical | `@system.rules.damageReduction.physical` | Armor can only be used to reduce physical damage. |
| Max Armor Used | `@system.rules.damageReduction.maxArmorMarked.value` | Bonus to the maximum number of Armor Marks usable at once. |
| Max Armor Used With Stress | `@system.rules.damageReduction.maxArmorMarked.stressExtra` | If set, you can spend up to that much Stress to mark additional Armor beyond your normal maximum. |
| Stress Damage Reduction: Severe | `@system.rules.damageReduction.stressDamageReduction.severe.cost` | The cost in Stress you can pay to reduce severe damage down to major. |
| Stress Damage Reduction: Major | `@system.rules.damageReduction.stressDamageReduction.major.cost` | The cost in Stress you can pay to reduce major damage down to minor. |
| Stress Damage Reduction: Minor | `@system.rules.damageReduction.stressDamageReduction.minor.cost` | The cost in Stress you can pay to reduce minor damage to none. |
| Stress Damage Reduction: Any | `@system.rules.damageReduction.stressDamageReduction.any.cost` | The cost in Stress you can pay to reduce incoming damage down one threshold. |
| Damage Reduction per Armor Slot | `@system.rules.damageReduction.increasePerArmorMark` | A used armor slot normally reduces damage by one step; this increases the number of steps. |
| Disabled Armorslots | `@system.rules.damageReduction.disabledArmor` | |
| HP Damage Multiplier | `@system.rules.attack.damage.hpDamageMultiplier` | Multiply any damage you deal by this number. |
| HP Damage Taken Multiplier | `@system.rules.attack.damage.hpDamageTakenMultiplier` | Multiply any damage dealt to you by this number. |
| Base Attack: Damage Dice Index | `@system.rules.attack.damage.diceIndex` | Index for the damage dice used on the basic attack. 0=d4, 1=d6, 2=d8, 3=d10, 4=d12, 5=d20. |
| Base Attack: Damage Bonus | `@system.rules.attack.damage.bonus` | |
| Base Attack: Trait | `@system.rules.attack.roll.trait` | |
| Default Hope Dice | `@system.rules.dualityRoll.defaultHopeDice` | |
| Default Fear Dice | `@system.rules.dualityRoll.defaultFearDice` | |
| Burden: Ignore | `@system.rules.burden.ignore` | |
| Guaranteed Critical | `@system.rules.roll.guaranteedCritical` | Set to 1 to always roll a critical. |
| Default Advantage Dice | `@system.rules.roll.defaultAdvantageDice` | |
| Default Disadvantage Dice | `@system.rules.roll.defaultDisadvantageDice` | |
| Combo Die Index | `@system.rules.roll.comboDieIndex` | The number of dice sizes your combo die has been raised from 1d4. Add +1 to increase it one size. |

### Bonuses

| Label | Path | Hint |
|---|---|---|
| Attack Roll Value | `@system.bonuses.roll.attack.bonus` | |
| Attack Roll Dice | `@system.bonuses.roll.attack.dice` | |
| Spellcast Roll Value | `@system.bonuses.roll.spellcast.bonus` | |
| Spellcast Roll Dice | `@system.bonuses.roll.spellcast.dice` | |
| Trait Roll Value | `@system.bonuses.roll.trait.bonus` | |
| Trait Roll Dice | `@system.bonuses.roll.trait.dice` | |
| Action Roll Value | `@system.bonuses.roll.action.bonus` | |
| Action Roll Dice | `@system.bonuses.roll.action.dice` | |
| Reaction Roll Value | `@system.bonuses.roll.reaction.bonus` | |
| Reaction Roll Dice | `@system.bonuses.roll.reaction.dice` | |
| Primary Weapon Attack Roll Value | `@system.bonuses.roll.primaryWeapon.bonus` | |
| Primary Weapon Attack Roll Dice | `@system.bonuses.roll.primaryWeapon.dice` | |
| Secondary Weapon Attack Roll Value | `@system.bonuses.roll.secondaryWeapon.bonus` | |
| Secondary Weapon Attack Roll Dice | `@system.bonuses.roll.secondaryWeapon.dice` | |
| Physical Damage Value | `@system.bonuses.damage.physical.bonus` | |
| Physical Damage Dice | `@system.bonuses.damage.physical.dice` | |
| Magical Damage Value | `@system.bonuses.damage.magical.bonus` | |
| Magical Damage Dice | `@system.bonuses.damage.magical.dice` | |
| Primary Weapon Damage Value | `@system.bonuses.damage.primaryWeapon.bonus` | |
| Primary Weapon Damage Dice | `@system.bonuses.damage.primaryWeapon.dice` | |
| Secondary Weapon Damage Value | `@system.bonuses.damage.secondaryWeapon.bonus` | |
| Secondary Weapon Damage Dice | `@system.bonuses.damage.secondaryWeapon.dice` | |
| Healing Amount Value | `@system.bonuses.healing.bonus` | |
| Healing Amount Dice | `@system.bonuses.healing.dice` | |
| Range Increase: Weapon | `@system.bonuses.range.weapon` | |
| Range Increase: Spell | `@system.bonuses.range.spell` | |
| Range Increase: Other | `@system.bonuses.range.other` | |
| Bardic Rally Dice | `@system.bonuses.rally` | |
| Short Rest: Bonus Short Rest Moves | `@system.bonuses.rest.shortRest.shortMoves` | Extra Short Rest Moves the character can take during a Short Rest. |
| Short Rest: Bonus Long Rest Moves | `@system.bonuses.rest.shortRest.longMoves` | Extra Long Rest Moves the character can take during a Short Rest. |
| Long Rest: Bonus Short Rest Moves | `@system.bonuses.rest.longRest.shortMoves` | Extra Short Rest Moves the character can take during a Long Rest. |
| Long Rest: Bonus Long Rest Moves | `@system.bonuses.rest.longRest.longMoves` | Extra Long Rest Moves the character can take during a Long Rest. |
| Max Loadout Cards Bonus | `@system.bonuses.maxLoadout` | |

---

## Companion

### Resources (bars)

| Label | Path | Hint |
|---|---|---|
| Stress | `@system.resources.stress.max` | |

### Values

| Label | Path | Hint |
|---|---|---|
| Damage Resistance: Physical | `@system.resistance.physical.resistance` | Physical Damage is halved if this is set to 1. |
| Damage Immunity: Physical | `@system.resistance.physical.immunity` | Immune to Physical Damage if this is set to 1. |
| Damage Reduction: Physical | `@system.resistance.physical.reduction` | Physical Damage is reduced by the amount set here. |
| Damage Resistance: Magical | `@system.resistance.magical.resistance` | Magical Damage is halved if this is set to 1. |
| Damage Immunity: Magical | `@system.resistance.magical.immunity` | Immune to Magical Damage if this is set to 1. |
| Damage Reduction: Magical | `@system.resistance.magical.reduction` | Magical Damage is reduced by the amount set here. |
| Advantage Sources | `@system.advantageSources` | Add single words or short text as reminders and hints of what has advantage. |
| Disadvantage Sources | `@system.disadvantageSources` | Add single words or short text as reminders and hints of what has disadvantage. |
| Evasion | `@system.evasion` | |
| Current Level | `@system.levelData.level.current` | |

### Rules

| Label | Path | Hint |
|---|---|---|
| Condition Immunity: Hidden | `@system.rules.conditionImmunities.hidden` | |
| Condition Immunity: Restrained | `@system.rules.conditionImmunities.restrained` | |
| Condition Immunity: Vulnerable | `@system.rules.conditionImmunities.vulnerable` | |
| Default Advantage Dice | `@system.rules.roll.defaultAdvantageDice` | |
| Default Disadvantage Dice | `@system.rules.roll.defaultDisadvantageDice` | |

### Bonuses

| Label | Path | Hint |
|---|---|---|
| Physical Damage Value | `@system.bonuses.damage.physical.bonus` | |
| Physical Damage Dice | `@system.bonuses.damage.physical.dice` | |
| Magical Damage Value | `@system.bonuses.damage.magical.bonus` | |
| Magical Damage Dice | `@system.bonuses.damage.magical.dice` | |
