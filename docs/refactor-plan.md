# Daggerheart HUD — Refactor Plan

Goal: break the 2,100-line [`module/apps/dh-actor-hud.mjs`](../module/apps/dh-actor-hud.mjs) into small
single-purpose modules, delete dead code, and route every system interaction through the real
Daggerheart 2.9.2 API (see [daggerheart-system-api.md](daggerheart-system-api.md)) so the HUD survives
system updates and is ready to expand.

Companion doc: [daggerheart-system-api.md](daggerheart-system-api.md) — §11 lists the behavioural bugs
this refactor fixes along the way.

---

## 0. Guiding rules

1. **One module = one concern.** No file over ~250 lines. Free functions take `app` explicitly;
   the class keeps only Foundry lifecycle (`_prepareContext` orchestration, `_onRender`, `close`).
2. **Never re-implement a system behaviour.** Rolls, chat cards, conditions, resource math, vault
   moves, descriptions — all go through the API. If the API is missing something, add a thin wrapper
   in `module/system/` and document why.
3. **One slice per commit.** Reload the world (F5) and smoke-test after each. No slice depends on a
   later slice compiling.
4. **Behaviour-preserving first, bug-fixes second.** Steps 1–4 must not change what the user sees
   (pure moves). Steps 5+ change behaviour and each names its expected visible difference.
5. No build step exists and CSS is generated elsewhere — do not touch `styles/`.

---

## 1. Target module layout

```
module/
  daggerheart-hud.mjs          entry: hooks + HUD lifecycle owner (trimmed, ~180 lines)
  settings.mjs                 unchanged
  constants.mjs                NEW — MODULE_ID, flag keys, template paths, hook names (single source)

  system/                      NEW — the only place that knows Daggerheart internals
    actor.mjs                  resource read/adjust, rollTrait wrappers, rest/deathmove dialogs
    items.mjs                  weapon/armour/domain/feature/inventory queries + use(action) helpers
    conditions.mjs             enumerate CONFIG.statusEffects, toggleStatusEffect, isActive
    descriptions.mjs           getEnrichedDescription + [[/r]]/[[/dr]] → HUD button rewrite
    config.mjs                 thin getters over CONFIG.DH.* (traits, domains, burden, dieFaces…)

  apps/
    dh-actor-hud.mjs           the ApplicationV2 class SHELL only (~250 lines)
    hud-rings.mjs              unchanged (already self-contained)

  hud/                         NEW — presentation/interaction, no system knowledge
    position.mjs               placeAtBottom, enableDragByRing, save/restore user position flag
    layout.mjs                 captureLayout / restoreLayout / requestRender (moved out of entry file)
    wings.mjs                  setWingsState, setPanelOpenDirection, tab toggler
    events.mjs                 attachHudEvents(app) — the data-action dispatch table
    resources-bar.mjs          bindResourceAdjusters(app) — HP/Stress/Hope/Armor pip clicks
    status-menu.mjs            portrait context menu + condition grid + tooltip
    appearance.mjs             theme + ring-image resolve/apply (per-actor flags vs GM override)
    custom-buttons.mjs         registry + registerCustomButton + section hook

  hud/context/                 NEW — _prepareContext split into collectors
    index.mjs                  buildContext(app) → merges the collectors, returns today's shape
    identity.mjs               name, portrait, dying flag, parent items (ancestry/community/class/subclass)
    resources.mjs              hitPoints, stress, hope(+pips), armor, thresholds, evasion, proficiency
    traits.mjs                 6 traits (ordered, localized, spellcasting flag), experiences
    weapons.mjs                primary/secondary/unarmed resolution
    features.mjs               misc + ancestry + community + class + subclass (granter.type + tier gate)
    domains.mjs                loadout / vault split, domain header label
    inventory.mjs              consumables / loot
    conditions.mjs             active statuses + available conditions list

  helpers/
    handlebars-helpers.mjs     keep; move getResourceInfo into hud/context/_resource-info.mjs if it grows
    i18n.mjs                   SHRINK — replace Lpath/Ltrait guesswork with system/config.mjs
    chat-utils.mjs             DELETE after system/items.mjs.sendToChat lands
    inline-rolls.mjs           MOVE to system/descriptions.mjs

  ui/
    dh-hud-toggle.mjs          DELETE (dead; see §2)
```

`buildContext` must return **byte-identical** output to today's `_prepareContext` at the end of step 4.
Only later steps change the shape (and the template with it).

---

## 2. Deletions

| Target | Why | When |
|---|---|---|
| [`module/ui/dh-hud-toggle.mjs`](../module/ui/dh-hud-toggle.mjs) | Exported `attachDHUDToggles` never imported anywhere. A subtly different, older copy of the function that lives in `dh-actor-hud.mjs`. | Step 1 (immediate — no dependents) |
| [`module/helpers/chat-utils.mjs`](../module/helpers/chat-utils.mjs) | `sendItemToChat`'s whole fallback chain targets non-existent methods (`displayCard`, `item.toChat.call(item,{speaker})` with wrong arg). Replaced by a 3-line `sendToChat` in `system/items.mjs` calling `item.toChat(item.uuid)`. | Step 6 |
| `_executeItem` fallback branches in `dh-actor-hud.mjs` | `item.rollAction`, `CONFIG.DAGGERHEART.Action`, `Action.execute` — all dead. | Step 5 |
| `_rollWeapon` unarmed/`rollAction`/`Action.execute` branches | dead paths; unarmed is `actor.system.attack.use(event)`. | Step 5 |
| `i18n.mjs` `Lpath`, `Ltrait` verb-object walking | System moved trait verbs to `CONFIG.DH.ACTOR.abilities.<k>.verbs` (array). Walking `game.i18n.translations` is fragile. | Step 7 |
| Dead `data-actionpath` plumbing (template + JS) | `systemPath` is `'actions'`/`'attack'`, not an id — never usable for targeting a specific action. Replace with `data-action-id`. | Step 5 |
| `attachDHUDToggles` duplicate + `module/ui/dh-hud-toggle.mjs` togglers | consolidated into `hud/wings.mjs`. | Step 3 |
| `_currentContext = await this._prepareContext()` re-call in `_onRender` | `_prepareContext` is already run by ApplicationV2 before render; calling it again in `_onRender` doubles all the item enrichment work every render. Store the context from the render pass instead. | Step 4 |
| `console.debug` portrait dumps in `_onRender` | noise. | Step 4 |

Nothing else gets deleted without a replacement already merged.

---

## 3. Execution order (slices)

Each slice is a commit. "Verify" = reload world, select a PC token, exercise the named surface.

### Step 1 — constants + trivial deletion (no behaviour change)
- Add `module/constants.mjs`; re-export from it in the entry file (keep old names working).
- Delete `module/ui/dh-hud-toggle.mjs`.
- Verify: HUD still loads.

### Step 2 — extract pure utilities (no behaviour change)
- `hud/position.mjs` ← `placeAtBottom`, `enableDragByRing`, the `globalPosition` flag read/write.
- `hud/layout.mjs` ← `dhudCaptureLayout`, `dhudRestoreLayout`, `dhudRequestRender` (currently in the
  **entry file**), plus `_renderQueued` handling.
- `hud/wings.mjs` ← `setWingsState`, `setPanelOpenDirection`, one tab toggler (drop the `ui/` copy's logic).
- `hud/appearance.mjs` ← `getActorThemeOrDefault`, `getActorRingImageOrDefault`, `toRouteURL`, the
  theme/ring apply block from `_onRender`.
- `hud/custom-buttons.mjs` ← `registerCustomButton` + `_customButtons` registry + the
  `daggerheart-hud:registerButtons` hook wiring.
- Class methods become `import { enableDragByRing } from '../hud/position.mjs'` etc.; where they used
  `this`, pass `app`.
- Verify: drag, wings open/close, panel up/down flip, theme switch via configurator, custom-button hook.

### Step 3 — extract interaction modules (no behaviour change)
- `hud/events.mjs` ← the whole `_bindDelegatedEvents` body as `attachHudEvents(app)`. Keep the
  one-time-bind guard on the app (`app._delegatedBound`).
- `hud/resources-bar.mjs` ← `_bindResourceAdjusters` as `bindResourceAdjusters(app)`.
- `hud/status-menu.mjs` ← `_showStatusContextMenu`, `_showStatusGrid`, `_hide*`, `_showTooltip`,
  `_hideTooltip`, and the status-menu event handlers from `_bindDelegatedEvents`.
- The class now just calls `attachHudEvents(this)`, `bindResourceAdjusters(this)`,
  `attachStatusMenu(this)` from `_onRender`.
- Verify: every click surface — traits, weapons, exec, to-chat, vault move, resource pips, dice chips,
  quantity inputs, inline rolls, portrait context menu, condition grid, rests, death move.

### Step 4 — split `_prepareContext` (no behaviour change)
- Create `hud/context/*.mjs` collectors, each a pure `function collectX(app) → object`.
- `hud/context/index.mjs` `buildContext(app)` spreads them into the exact object shape returned today.
- Class `_prepareContext` becomes `return buildContext(this)`.
- Remove the duplicate `_prepareContext()` call in `_onRender` — capture the context ApplicationV2
  already produced (store it in `_onRender`'s options or a small wrapper).
- Verify: diff the rendered DOM before/after on a fully-loaded PC (weapons, all feature buckets,
  domains loadout+vault, inventory, experiences, conditions). Must be identical.

### Step 5 — route rolls & item use through the API  *(behaviour change: correctness)*
- `system/items.mjs`: `useItemAction(item, actionId, event)`, `useWeapon(actor, { secondary }, event)`,
  `useUnarmed(actor, event)` → all via `action.use(event)` / `item.system.attack.use(event)`.
- `system/actor.mjs`: `rollTrait(actor, traitKey, { reaction })` → `actor.rollTrait(...)`.
- Template: `data-actionpath` → `data-action-id`; context collectors emit the action **id**
  (`Array.from(item.system.actions)[0]?.id`) instead of `systemPath`.
- Delete the dead fallback branches in `_executeItem` / `_rollWeapon`.
- Expected visible change: trait clicks roll immediately (no chat-text round-trip); weapon/feature
  actions that have >1 action now show the system's action picker instead of silently using the first.
- Verify: attack with primary/secondary/two-handed/unarmed; feature with 1 action; feature with 2+
  actions; domain card ability; reaction roll.

### Step 6 — chat & descriptions through the API  *(behaviour change: correctness)*
- `system/items.mjs`: `sendToChat(item)` → `item.toChat(item.uuid)`. Delete `helpers/chat-utils.mjs`.
- `system/descriptions.mjs` ← `inline-rolls.mjs`, but base description now comes from
  `item.system.getEnrichedDescription({ gmNotes: game.user.isGM, type: 'sheet' })`; keep the
  `[[/r]]`/`[[/dr]]` → HUD-button rewrite pass on top.
- Expected visible change: weapon/armor feature blurbs and gmNotes now appear in HUD descriptions;
  "send to chat" produces the system's proper ability card.
- Verify: description panels for weapon (with weaponFeatures), feature, domain card; send-to-chat for each.

### Step 7 — conditions through the API  *(behaviour change: fixes empty list)*
- `system/conditions.mjs`: `listConditions(actor)` (from `CONFIG.statusEffects`, split on
  `systemEffect`, honour `status.hud` + `conditionImmunities` + the `showGenericStatusEffects` setting),
  `toggle(actor, id)` → `actor.toggleStatusEffect(id, { active })`, `isActive(actor, id)`.
- `hud/context/conditions.mjs` + `hud/status-menu.mjs` call these.
- Delete `_applyCondition`, `_removeCondition`, `_isConditionActive`'s hand-rolled effect code.
- Expected visible change: the Daggerheart conditions (Vulnerable/Hidden/Restrained + defeated) now
  actually show in the grid and toggle correctly; immune conditions render disabled.
- Verify: apply/remove each condition; check token effect icons update; check immunity disabling.

### Step 8 — feature bucketing on `granter`  *(behaviour change: fixes broken buckets on migrated worlds)*
- `hud/context/features.mjs`: bucket by `feature.system.granter?.type`; subclass tier gate uses
  `subclass.system.featureState` vs `feature.system.granter?.identifier`
  (`foundation`/`specialization`/`mastery`).
- Keep a fallback read of the legacy `system.originItemType` for un-migrated worlds (one line), logged.
- Expected visible change: on current-format worlds the ancestry/community/class/subclass panels fill
  in again.
- Verify: a PC with ancestry + community + class + subclass features at tiers 1/2/3.

### Step 9 — domain card vault via `toggleVault`  *(behaviour change: adds recall cost)*
- `system/items.mjs`: `moveDomainCard(card, toVault, event)` → `card.system.toggleVault(event, toVault, !toVault)`
  (recall when leaving the vault).
- Expected visible change: recalling a card from the vault now prompts for its Stress recall cost and
  respects the loadout cap.
- Verify: move to vault (silent); recall from vault with recallCost 0 (silent) and >0 (prompt); recall
  when loadout full (warning).

### Step 10 — entry-file cleanup + i18n shrink
- `daggerheart-hud.mjs`: keep only hook registration + `createOrUpdateHUD` lifecycle. Move
  `DHUD_ACTOR_PATHS` and the change-relevance filter into `hud/context/index.mjs` (or a small
  `hud/refresh.mjs`).
- `helpers/i18n.mjs`: keep `L` / `Ltry`; delete `Lpath` / `Ltrait`; `system/config.mjs` exposes
  `traits()` → `[{ key, name, verbs, description }]` from `CONFIG.DH.ACTOR.abilities`.
- Verify: full HUD load; trait names/verbs; setting-driven show/hide; multi-token select.

### Step 11 — docs + CLAUDE.md
- Update [`CLAUDE.md`](../CLAUDE.md) architecture section to the new layout.
- Mark resolved rows in [daggerheart-system-api.md](daggerheart-system-api.md) §11.

---

## 4. Per-target extraction map (from today's file)

| Today (`dh-actor-hud.mjs`) | Goes to | Step |
|---|---|---|
| `placeAtBottom`, `enableDragByRing` | `hud/position.mjs` | 2 |
| `setWingsState`, `setPanelOpenDirection`, `attachDHUDToggles` | `hud/wings.mjs` | 2 |
| `getActorThemeOrDefault`, `getActorRingImageOrDefault`, `toRouteURL`, theme block in `_onRender` | `hud/appearance.mjs` | 2 |
| `registerCustomButton`, `_customButtons`, custom-button click branch | `hud/custom-buttons.mjs` | 2 |
| `clamp`, `bumpResource`, `setResource`, `_bindResourceAdjusters` | `hud/resources-bar.mjs` + `system/actor.mjs` | 3 |
| `_showStatusContextMenu`, `_showStatusGrid`, `_hide*`, `_showTooltip`, status handlers | `hud/status-menu.mjs` | 3 |
| `_bindDelegatedEvents` (everything else) | `hud/events.mjs` | 3 |
| `_executeItem`, `_rollWeapon` | `system/items.mjs` (+ thin call sites in `hud/events.mjs`) | 5 |
| `itemHasActions` | `system/items.mjs` | 5 |
| `_applyCondition`, `_removeCondition`, `_isConditionActive` | `system/conditions.mjs` | 7 |
| `_prepareContext` weapon section | `hud/context/weapons.mjs` | 4 |
| `_prepareContext` status/condition section | `hud/context/conditions.mjs` | 4/7 |
| `_prepareContext` feature sections | `hud/context/features.mjs` | 4/8 |
| `_prepareContext` domain section | `hud/context/domains.mjs` | 4/9 |
| `_prepareContext` resources/armor/thresholds | `hud/context/resources.mjs` | 4 |
| `_prepareContext` traits/experiences | `hud/context/traits.mjs` | 4 |
| `_prepareContext` inventory | `hud/context/inventory.mjs` | 4 |
| `_prepareContext` parent items / identity | `hud/context/identity.mjs` | 4 |
| `_onRender` (placement/resize/drag/hooks wiring) | stays in class, calls `hud/*` | 3–4 |
| `dhudCaptureLayout/RestoreLayout/RequestRender` (in **entry file**) | `hud/layout.mjs` | 2 |
| `DHUD_ACTOR_PATHS`, `dhudActorChangeRelevant` (entry file) | `hud/refresh.mjs` | 10 |

---

## 5. Risk register

| Area | Risk | Mitigation |
|---|---|---|
| Drag timing | `enableDragByRing` relies on `_justDraggedTs`, `_isDragging`, rAF ordering; moving it can reintroduce click-after-drag bugs | Keep the exact guard timings; test click-vs-drag on ring, weapons, pips right after Step 2 |
| Layout capture/restore | `createOrUpdateHUD` snapshots layout across a close/reopen; splitting entry file can desync `_lastHudLayout` | Step 2 keeps the same call sequence; add a temporary `console.assert` on snapshot round-trip |
| Double `_prepareContext` | Removing the `_onRender` re-call may leave `_currentContext` undefined for status menu code that reads `_currentContext.availableConditions` | Step 4 wires status menu to `hud/context/conditions.mjs` directly, not `_currentContext` |
| Action picker UX | Step 5 makes multi-action items show the system dialog where the old HUD silently used action[0] | Intended; call out in release notes. If undesired for a surface, pass `event.shiftKey`-equivalent or resolve a specific `actionId` |
| Reaction rolls | `actor.rollTrait(k, { actionType: 'reaction' })` vs old `/dr reaction=true` chat text — verify the reaction trigger/automation still fires | Test with a reaction-triggering feature active |
| Enriched descriptions | `getEnrichedDescription` is async and heavier than the old path; context build already awaits per-item | Batch with `Promise.all` in each collector as today |
| Un-migrated worlds | `granter` empty, `originItemType` still present | Step 8 keeps a one-line legacy fallback |
| `showGenericStatusEffects` setting key | old HUD uses `game.settings.get('daggerheart','Appearance')`; confirm exact key/casing in 2.9.2 (`CONFIG.DH.SETTINGS.gameSettings.appearance`) | Verify in console before Step 7; wrap in try/catch defaulting to false |

---

## 6. Definition of done

- `dh-actor-hud.mjs` ≤ ~250 lines, contains only the class.
- No file references `rollAction`, `displayCard`, `CONFIG.DAGGERHEART`, `originItemType`
  (except the single documented legacy fallback), or `usedUnarmed`.
- Daggerheart conditions appear and toggle; feature buckets populate on a current-format world;
  trait clicks roll directly; recall cost prompts on vault recall.
- `helpers/chat-utils.mjs` and `module/ui/dh-hud-toggle.mjs` deleted.
- `CLAUDE.md` architecture section matches the new tree.
- Every step verified in a running world.
