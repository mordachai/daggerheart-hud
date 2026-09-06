# Refactor Handoff

Written 2026-09-06. Read this first, then [refactor-plan.md](refactor-plan.md) and
[daggerheart-system-api.md](daggerheart-system-api.md).

## State

- **No code changed yet.** Only the three `docs/*.md` files exist. `git status` is clean apart from `docs/`.
- Module runs live from `d:\FoundryVTT-14\Data\modules\daggerheart-hud` (the working copy *is* the
  installed module). Reload world with F5 to test. No build step. Do not touch `styles/`.
- Current module version: `1.12.3` (`module.json`). Release = bump that + push `main`.

## What was done

1. Audited the Daggerheart system (v2.9.2) at `D:\FoundrySystems\daggerheart` →
   [daggerheart-system-api.md](daggerheart-system-api.md). §11 = 10 behavioural bugs in the current HUD.
2. Wrote the 11-step slice plan → [refactor-plan.md](refactor-plan.md). Target layout: `module/system/`,
   `module/hud/`, `module/hud/context/`; class shell ≤250 lines.
3. Updated [CLAUDE.md](../CLAUDE.md) (architecture of the *current* code, pre-refactor).

## Next action

**Step 1** of [refactor-plan.md](refactor-plan.md):
- Create `module/constants.mjs` (MODULE_ID, flag keys, template paths, hook names). Re-export from
  `module/daggerheart-hud.mjs` so existing names keep working.
- Delete `module/ui/dh-hud-toggle.mjs` (dead — never imported).
- Reload world, confirm HUD still loads. Commit.

Then Steps 2→11 in order. Steps 1–4 must not change what the user sees (pure moves + verify
byte-identical `_prepareContext` output at Step 4). Steps 5+ change behaviour; each step in the plan
names its expected visible difference and its verify checklist.

## Key facts for the new session

- System source: `D:\FoundrySystems\daggerheart` (readable repo, v2.9.2) and
  `D:\FoundryVTT-14\Data\systems\daggerheart` (bundled, in-game). **Re-read the relevant system file
  before coding each step** — confirm the method/field still exists in the installed version.
- System namespace is `CONFIG.DH` (not `CONFIG.DAGGERHEART`). Runtime API: `game.system.api`.
- Real call patterns (see API doc §2–§7): `action.use(event)` / `weapon.system.attack.use(event)`;
  `actor.rollTrait(key, { actionType })`; `actor.toggleStatusEffect(id, { active })`;
  `card.system.toggleVault(event, toVault, isRecall)`; `item.toChat(item.uuid)`;
  `item.system.getEnrichedDescription(...)`; feature origin via `feature.system.granter.type`.
- Global convention: use `foundry.applications.handlebars.loadTemplates()` (namespaced), not the
  deprecated global.
- Memory file `hud-refactor.md` mirrors this.

## Definition of done

See [refactor-plan.md](refactor-plan.md) §6. Short version: `dh-actor-hud.mjs` ≤250 lines (class only);
no references to `rollAction`/`displayCard`/`CONFIG.DAGGERHEART`/`usedUnarmed`/`originItemType` (bar one
documented legacy fallback); conditions + feature buckets + direct trait rolls + recall prompt all
working; `helpers/chat-utils.mjs` and `module/ui/dh-hud-toggle.mjs` deleted; CLAUDE.md updated.
