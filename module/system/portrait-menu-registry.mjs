// module/system/portrait-menu-registry.mjs
// Curated list of buttons that OTHER Daggerheart modules add to the character sheet,
// surfaced in the HUD portrait context menu. Each entry is opt-in and only shows when
// its module is active and `available()` returns true.
//
// Entry shape:
//   id        unique string (used as the menu item key)
//   moduleId  the other module's id — item hidden unless that module is active
//   label     menu text
//   icon      Font Awesome classes
//   available ()      -> boolean   the module's API is actually loaded
//   enabled   (actor) -> boolean   optional; false => item shown but dimmed / no-op
//   invoke    (actor) -> any       preferred: call the module's global API
//   selector  string               fallback when there is no global API: a CSS
//                                   selector for the button the module injects into
//                                   the rendered sheet. The invoker renders the
//                                   sheet and clicks that element.
//
// Extra items can also be contributed at runtime via the
// `daggerheart-hud:collectPortraitMenuItems` hook — see portrait-menu-extras.mjs.

export const PORTRAIT_MENU_REGISTRY = [
  {
    id: "quickactions",
    moduleId: "daggerheart-quickactions",
    label: "Quick Actions",
    icon: "fa-solid fa-bolt",
    available: () => typeof globalThis.QuickActions?.QuickActionsMenu === "function",
    invoke: () => globalThis.QuickActions.QuickActionsMenu(),
  },
  {
    id: "tagteam",
    moduleId: "dh-tagteam",
    label: "Tag Team",
    icon: "fa-solid fa-hand-fist",
    available: () => typeof globalThis.DHTagTeam?.onTagTeamClick === "function",
    // Mirrors the module's own "already used" gate. The 3-Hope gate the module
    // applies in its button rendering is intentionally NOT reproduced here.
    enabled: (actor) => !actor?.getFlag?.("dh-tagteam", "tagTeamUsed"),
    invoke: (actor) => globalThis.DHTagTeam.onTagTeamClick(actor),
  },
];
