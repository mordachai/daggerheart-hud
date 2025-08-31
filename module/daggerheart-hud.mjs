// module/daggerheart-hud.mjs
import { DaggerheartActorHUD } from "./apps/dh-actor-hud.mjs";
import { registerDHUDHelpers } from "./helpers/handlebars-helpers.mjs";


const TEMPLATE_PATHS = [
  "modules/daggerheart-hud/templates/actor/hud-character.hbs"
];

export const DHUD = { ID: "daggerheart-hud", templates: TEMPLATE_PATHS };

// Hooks.once("init", () => {
//   console.log(`${DHUD.ID} | init`);
//   // helpers básicos
//   Handlebars.registerHelper("signed", (n) => (n >= 0 ? `+${n}` : `${n}`));
// });

Hooks.once("init", () => {
  registerDHUDHelpers();
});

Hooks.once("ready", async () => {
  // ✅ V13+: usar namespace oficial para loadTemplates
  await foundry.applications.handlebars.loadTemplates(DHUD.templates);
  console.log(`${DHUD.ID} | templates preloaded`);
});

let _hudApp;

const isDaggerheartPC = (token) => {
  const a = token?.actor;
  return a && a.type === "character" && game.system?.id === "daggerheart";
};

Hooks.on("controlToken", async (token, controlled) => {
  if (!controlled || !isDaggerheartPC(token)) {
    if (_hudApp) { _hudApp.close({ force: true }); _hudApp = null; }
    return;
  }
  if (_hudApp) await _hudApp.close({ force: true });

  // ✅ Application V2
  _hudApp = new DaggerheartActorHUD({ actor: token.actor, token: token.document });
  _hudApp.render(true);
});

// (opcional) fechar em pan/remoção
Hooks.on("canvasPan", () => _hudApp?.close({ force: true }));
Hooks.on("deleteToken", (scene, tokenDoc) => {
  const t = canvas.tokens?.controlled[0];
  if (!t || t.id === tokenDoc.id) _hudApp?.close({ force: true });
});
