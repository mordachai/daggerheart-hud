# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Foundry VTT module (`id: daggerheart-hud`) that draws a floating action HUD for **character** actors of the **Daggerheart** system. Compatible with Foundry v13 (minimum) / v14 (verified). It lives inside `FoundryVTT-14/Data/modules/daggerheart-hud`, so the working copy *is* the installed module — reload the world (F5) to test changes.

## Build / test / release

- **No build step, no bundler, no dependencies, no tests.** Source is plain ES modules loaded directly by Foundry (`module.json` → `esmodules`).
- **CSS is not compiled here** — `styles/dh-hud.css` and `styles/dhud-themes.css` are the shipped files. Per project convention the CSS is built automatically elsewhere; do not hand-edit or re-read it to verify unrelated work.
- **Release is automated.** `.github/workflows/release.yml` triggers on a push to `main`/`master` that changes `module.json`. It reads `.version`, and if tag `v<version>` does not exist, zips the repo (excluding dotfiles, `*.md`, `LICENSE`, `node_modules`) and publishes a GitHub release with `module.zip` + `module.json`. **To cut a release: bump `version` in `module.json` and push to main.** Recent commits (`v1.14.0`, …) are these version bumps.

## Runtime dependencies on the Daggerheart system

The HUD is a thin shell over system APIs and data. **Everything Daggerheart-specific lives in `module/system/*` — nothing else reaches into `CONFIG.DH`, system data models, or system dialogs.** It reads/calls, among others:

- Actor data paths: `system.resources.{hitPoints,stress,hope,armor}`, `system.availableExtraResources` (homebrew + feature-granted resource keys), `system.traits.*`, `system.evasion`, `system.proficiency`, `system.armorScore`, `system.damageThresholds`, `system.resistance`, `system.experiences`, `system.domains`, `system.attack` (unarmed).
- Items by `type`: `weapon` (`system.equipped`, `system.secondary`, `system.burden === "twoHanded"`, `system.attack.use(event)`), `armor` (`system.armor.current`), `domainCard` (`system.inVault`, `system.toggleVault(event, toVault, isRecall)`), `feature` (`system.granter.type` ∈ ancestry/community/class/subclass, else Features tab; `system.granter.identifier` = foundation/specialization/mastery for subclass gating — legacy `system.originItemType`/`system.identifier` read as a one-line fallback), `consumable`, `loot`, `subclass` (`system.featureState` 1/2/3).
- System APIs: `game.system.api.applications.dialogs.Downtime` (rests), `.DeathMove`; `CONFIG.DH.GENERAL.conditions()` (a **function**) — but the real status enumeration is `CONFIG.statusEffects` split on `systemEffect`; `CONFIG.DH.ACTOR.abilities` (trait labels + `verbs[]` i18n keys); `CONFIG.DH.DOMAIN.allDomains()` (a **function** — core + homebrew domains, `{ label, description, src, color }`); `actor.toggleStatusEffect(id, { active })`; `actor.rollTrait(key, { actionType })`; `item.system.getEnrichedDescription({ gmNotes, type })`; `item.toChat(item.uuid)`; `game.settings.get('daggerheart','Appearance').showGenericStatusEffects`; `game.settings.get('daggerheart','Homebrew')` (custom domains / extra resources / maxHope / maxLoadout / currency / rest moves — HUD re-renders on its `updateSetting`).
- Rolls / chat / vault moves / conditions / descriptions are **always delegated to the system** through a `module/system/*` wrapper — never re-implemented. See `docs/daggerheart-system-api.md` (companion reference) and `docs/daggerheart-active-effect-paths.md` (every actor path the system's Active Effect Path Viewer lists — resources, traits, `system.rules.*`, `system.bonuses.*` — with labels + hints; consult when touching resource/trait/bonus data paths).

## Architecture

The HUD is a ~220-line ApplicationV2 shell (`module/apps/dh-actor-hud.mjs`); everything else is single-purpose modules and free functions that take `app` explicitly. One file = one concern (no file over ~250 lines). `module/system/*` is the only place that knows Daggerheart internals; `module/hud/*` is presentation/interaction with no system knowledge.

```text
module/
  daggerheart-hud.mjs     entry: hook wiring + createOrUpdateHUD lifecycle only
  constants.mjs           MODULE_ID, flag keys, template paths, hook names
  settings.mjs            S key enum + registerSettings
  system/                 THE ONLY PLACE THAT KNOWS DAGGERHEART INTERNALS
    items.mjs             itemHasActions/firstActionId, useItemAction, useWeapon,
                          useUnarmed, sendToChat (item.toChat(uuid)),
                          moveDomainCard (system.toggleVault)
    actor.mjs             rollTrait -> actor.rollTrait(key, { actionType })
    conditions.mjs        listConditions (CONFIG.statusEffects split on systemEffect),
                          isActive (actor.statuses), toggle (actor.toggleStatusEffect)
    descriptions.mjs      getItemDescriptionHTML: system.getEnrichedDescription first,
                          manual TextEditor.enrichHTML fallback, then [[/r]]/[[/dr]]
                          -> HUD chip rewrite
    config.mjs            traits() -> [{ key, name, verbs, description }] from
                          CONFIG.DH.ACTOR.abilities; domainMeta(key) -> { label,
                          description, src, color } from CONFIG.DH.DOMAIN.allDomains()
                          (core + GM homebrew domains)
    resources.mjs         listActorResources / setActorResource / bumpActorResource
                          for homebrew + feature-granted "extra" actor resources
                          (actor.system.availableExtraResources)
  apps/
    dh-actor-hud.mjs      the ApplicationV2 class SHELL: _prepareContext (delegates to
                          buildContext), _onRender, close, static registerCustomButton
    hud-rings.mjs         appearance/theme config dialog (self-contained)
  hud/                    presentation / interaction — no system knowledge
    position.mjs          placeAtBottom, enableDragByRing, global-position flag
    layout.mjs            captureLayout / restoreLayout / requestRender
    wings.mjs             setWingsState, setPanelOpenDirection, attachDHUDToggles
    appearance.mjs        theme + ring-image resolve/apply (per-actor flags vs GM override)
    events.mjs            attachHudEvents(app) — the data-action dispatch table
    resources-bar.mjs     bindResourceAdjusters(app) — HP/Stress/Hope/Armor pip clicks
    status-menu.mjs       portrait context menu + condition grid + tooltip
    custom-buttons.mjs    registry + registerCustomButton + registerButtons hook
    refresh.mjs           DHUD_ACTOR_PATHS + dhudActorChangeRelevant
    context/              _prepareContext split into collectors
      index.mjs           buildContext(app) — merges collectors into the template shape
      identity / resources / traits / weapons / features / domains / inventory / conditions
                          resources.mjs also emits `extraResources` (homebrew /
                          feature-granted); domains.mjs labels via system/config domainMeta
  helpers/
    handlebars-helpers.mjs  registerDHUDHelpers() + getResourceInfo
    i18n.mjs                L, Ltry only
```

### Entry point — `module/daggerheart-hud.mjs`

Registers settings + Handlebars helpers on `init`, preloads `DHUD.templates` and fires the custom-button hook on `ready`, owns the **single HUD instance** `_hudApp`. Show/hide is driven by hooks:

- `controlToken` / `canvasReady` / `userConnected` / `deleteToken` → `createOrUpdateHUD(actor, token)`. Multiple selected Daggerheart tokens ⇒ HUD closes. Non-GM players with the `alwaysVisible` setting get a persistent HUD bound to their first owned character.
- `createOrUpdateHUD` captures the current layout (`captureLayout`), closes the old app, and restores position/wings after re-render to prevent visual jumps (`restoreLayout`).
- **Re-render watchers**: `updateActor`, `create/update/deleteItem`, `*ActiveEffect` hooks, all filtered to `_hudApp.actor`, plus `updateSetting` for `daggerheart.Homebrew`. `updateActor` calls `dhudActorChangeRelevant` (`hud/refresh.mjs`: `DHUD_ACTOR_PATHS` allowlist **or** any `system` change). `updateItem` deliberately **skips** simple quantity / `uses.value` / `resource.value` updates to avoid re-render churn (`_updatingQuantity` flag + `isSimpleResourceUpdate` check). Renders are coalesced through `requestRender`.

### The HUD app — `module/apps/dh-actor-hud.mjs` (`DaggerheartActorHUD`)

`ApplicationV2` + `HandlebarsApplicationMixin`, single PART `body` → `templates/actor/hud-character.hbs`.

- **`_prepareContext`** just calls `buildContext(this)` (`hud/context/index.mjs`), which runs the collectors and assembles the exact object the template consumes. Data shaping — weapon selection (primary = first equipped non-secondary, else unarmed from `system.attack`; two-handed primary fills both slots), armor marks (marks on the item, max from post-effects actor `armorScore`), feature bucketing by `granter.type` + subclass-tier gating, domain loadout/vault split, condition list, enriched descriptions — lives in the `context/*` collectors, which import from `system/*` for anything Daggerheart-specific.
- **Events are fully delegated** on `this.element`, wired once and guarded by per-app flags (`_delegatedBound`, `_resAdjBound`, `_statusMenuBound`, `_dragHooked`, `_imgHooked`, `_booted`, `_wingsInit`). `attachHudEvents` (`hud/events.mjs`) dispatches by `data-action` in one `click` listener; `bindResourceAdjusters` (`hud/resources-bar.mjs`) is a separate `click`/`contextmenu` pair where **left-click and right-click do opposite things** (HP/Stress ∓1, Hope fill/reduce to pip, Armor mark/repair); `attachStatusMenu` (`hud/status-menu.mjs`) owns the portrait context menu + condition grid.
- **Layout persistence**: dragged by the `.dhud-ring` handle; position saved to `game.user` flag `daggerheart-hud.globalPosition`, wings state to flag `daggerheart-hud.wings`. `setPanelOpenDirection` decides whether a tab panel opens up or down based on viewport room.
- **Theming applied in `_onRender`** via `applyAppearance` / `reapplyAppearance` (`hud/appearance.mjs`): resolves theme + ring images, toggles `dhud-theme-<name>`, sets `--dhud-ring-main` / `--dhud-ring-weapon` CSS vars. Re-applied on `daggerheart-hud:rings-updated` / `:appearance-updated` hooks; listeners torn down in `close()`.

### Appearance config

- Per-actor: flags `daggerheart-hud.{ringPortrait, ringWeapons, colorScheme}`.
- GM world overrides (world-scoped settings, `config: false`): `gmRingOverride` + `gmPortraitRing` / `gmWeaponsRing`, `gmThemeOverride` + `gmGlobalTheme`. When an override is enabled it wins for **all** characters (`getActorThemeOrDefault` / `getActorRingImageOrDefault`).
- Edited through **`HudRingsDialog`** (`module/apps/hud-rings.mjs`, `DialogV2` + Handlebars, template `templates/ui/hud-rings.hbs`), registered as the settings menu `HUD Theme Config`. On save it validates image paths with `foundry.canvas.loadTexture`, writes flags/settings, then fires the `:rings-updated` / `:appearance-updated` hooks.
- **Themes are discovered by parsing `styles/dhud-themes.css`** — the `/* Available themes: a,b,c */` comment between `THEME_LIST_START`/`THEME_LIST_END`, with a regex fallback over `.dhud-theme-*` selectors, and a hardcoded list as last resort. **Adding a theme = add the `.dhud-theme-<name>` var block AND update that comment.**

### Settings — `module/settings.mjs`

`S` is the key enum. Client-scoped and user-facing: `bottomOffset`, `disableForMe`, `hideHotbar`, `alwaysVisible`, `showTargetNotifications`. Setting changes broadcast via the `daggerheart-hud:setting-changed` hook, which the entry point listens to for live show/hide.

### Custom button API

`DaggerheartActorHUD.registerCustomButton({ id, section, icon, title, handler, condition })` (registry in `hud/custom-buttons.mjs`). The `daggerheart-hud:registerButtons` hook fires once on `ready` for other modules to register. Currently only `section: "traits"` is wired into the traits collector + the template (per-trait button, `handler(actor, traitKey)`).

### Helpers — `module/helpers/`

- `i18n.mjs` — `L`, `Ltry` only. The module ships **no lang files**; these read `DAGGERHEART.*` keys from the system's translations. Trait names/verbs come from `system/config.mjs` `traits()`.
- `handlebars-helpers.mjs` — `registerDHUDHelpers()` registers comparison/logic/string helpers, `l` (localize), and **`getResourceInfo`**, the single source of truth for how an inventory/feature item's resource counter is displayed and whether it is HUD-editable (quantity, item `uses`, action `uses`, `resource`, `diceValue`).

Description enrichment and `[[/r]]`/`[[/dr]]` → HUD chip rewriting live in `system/descriptions.mjs`; send-to-chat is `system/items.mjs` `sendToChat`.

## Conventions (from global user instructions)

- Use `foundry.applications.handlebars.loadTemplates()`, not the deprecated global `loadTemplates()`.
- Scene control tools (`getSceneControlButtons`, v13/v14): the click handler is `onChange`, not `onClick` — for both `toggle` and `button` tools. Toggle gets `onChange(event, active)`.

## History (archived)

This layout came from an 11-step split of the original ~2,100-line `dh-actor-hud.mjs`. That work is done; the plan and handoff notes are kept for reference only and do **not** describe the current code: `docs/refactor-plan.md`, `docs/refactor-handoff.md`.
