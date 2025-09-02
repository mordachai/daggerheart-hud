// module/apps/hud-rings.mjs
// Daggerheart HUD – HUD Images Config dialog (per-Actor rings + per-Actor color scheme)
// Foundry VTT v13 — V2 dialog (DialogV2 + Handlebars mixin)

const MODULE_ID = "daggerheart-hud";
const FLAG_NS   = MODULE_ID;
const TPL_PATH  = `modules/${MODULE_ID}/templates/ui/hud-rings.hbs`;

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FP      = foundry.applications.apps.FilePicker.implementation; // v13 namespace
const loadTex = foundry.canvas.loadTexture;                           // v13 namespace

const LOG = (...a) => console.log("[HUD Images Config]", ...a);

/** Fixed color choices (Configurator is the only source of truth) */
function getColorSchemeEntries() {
  return [
    { value: "default",    label: "Default" },
    { value: "crimson",    label: "Crimson" },
    { value: "emerald",    label: "Emerald" },
    { value: "midnight",   label: "Midnight" },
    { value: "oceanic",    label: "Oceanic" },
    { value: "solarflare", label: "Solarflare" }
  ];
}

export class HudRingsDialog extends HandlebarsApplicationMixin(DialogV2) {
  static DEFAULT_OPTIONS = {
    id: "dh-hud-images-config",
    window: { title: "HUD Images Config" },
    position: { width: 850, height: "auto" },
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fas fa-times" },
      { action: "save",   label: "Save",   icon: "fas fa-save", default: true }
    ]
  };

  static PARTS = { content: { template: TPL_PATH } };

  _onClickButton(_event, button) {
    if (button.action === "cancel") return this.close();
    if (button.action === "save")   return this.#saveFromDOM();
  }

  async _prepareContext() {
    // Only characters (regardless of owner)
    const pcs = game.actors.contents
      .filter(a => String(a?.type ?? "").toLowerCase() === "character")
      .sort((a,b) => (a.name || "").localeCompare(b.name || ""));

    const rows = await Promise.all(pcs.map(async (a) => {
      // First non-GM owner (if any), else "Unassigned"
      const owners = game.users?.filter(u => !u.isGM && a.testUserPermission?.(u, "OWNER")) || [];
      const playerLabel = owners.length ? owners[0].name : "Unassigned";

      return {
        id: a.id,
        name: a.name,
        playerLabel,
        portrait:    await a.getFlag(FLAG_NS, "ringPortrait") || "",
        weapons:     await a.getFlag(FLAG_NS, "ringWeapons")  || "",
        colorScheme: await a.getFlag(FLAG_NS, "colorScheme")  || ""
      };
    }));

    const colorChoices = getColorSchemeEntries();

    LOG("_prepareContext actors snapshot", game.actors.contents.map(x => ({ name: x.name, type: x.type })));
    LOG("filtered PCs", rows.map(r => r.name));
    LOG("colorChoices", colorChoices);

    return { actors: rows, colorChoices };
  }

  _onRender(_context, _parts) {
    const root = this.element;
    LOG("_onRender cards:", root.querySelectorAll(".card[data-actor-id]").length);

    root.querySelectorAll(".card[data-actor-id]").forEach(card => {
      const sel = card.querySelector("select.dh-color");
      if (sel) sel.value = card.getAttribute("data-color") || "";

      // (NEW) apply theme class to the card now, and whenever the select changes
      this._applyCardTheme(card);                               // initial
      sel?.addEventListener("change", () => this._applyCardTheme(card)); // live

      if (card.dataset.bound === "1") return; // don’t double-bind
      card.dataset.bound = "1";

      // (existing) live image preview bindings…
      const inP = card.querySelector(".path-portrait");
      const inW = card.querySelector(".path-weapons");
      const imgP = card.querySelector(".preview-portrait");
      const imgW = card.querySelector(".preview-weapons");
      const updP = () => { if (imgP) imgP.src = inP?.value || ""; };
      const updW = () => { if (imgW) imgW.src = inW?.value || ""; };
      inP?.addEventListener("input", updP);  inP?.addEventListener("change", updP);
      inW?.addEventListener("input", updW);  inW?.addEventListener("change", updW);

      // (existing) click-to-pick & clear handlers…
      card.querySelectorAll(".preview-box").forEach(box => {
        box.addEventListener("click", (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const selector = box.getAttribute("data-target");
          const target   = selector ? card.querySelector(selector) : null;
          const current  = target?.value || "";
          const fp = new FP({
            type: "image",
            current,
            callback: (path) => {
              if (!target) return;
              target.value = path;
              target.dispatchEvent(new Event("change", { bubbles: true }));
            }
          });
          fp.render(true);
        });
      });

      card.querySelectorAll(".clear-path").forEach(btn => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const selector = btn.getAttribute("data-target");
          const target   = selector ? card.querySelector(selector) : null;
          if (!target) return;
          target.value = "";
          target.dispatchEvent(new Event("change", { bubbles: true }));
        });
      });
    });

    // (existing) footer buttons…
    root.querySelector(".dh-cancel")?.addEventListener("click", (ev) => { ev.preventDefault(); this.close(); });
    root.querySelector(".dh-save")?.addEventListener("click", async (ev) => { ev.preventDefault(); await this.#saveFromDOM(); });
  }

  async #saveFromDOM() {
    const root = this.element;

    // 1) Validate non-empty image paths in parallel
    const validations = [];
    root.querySelectorAll(".card[data-actor-id]").forEach(card => {
      const p = card.querySelector(".path-portrait")?.value?.trim();
      const w = card.querySelector(".path-weapons")?.value?.trim();
      if (p) validations.push(loadTex(p).catch(e => this.#warnInvalid(card, "portrait", p, e)));
      if (w) validations.push(loadTex(w).catch(e => this.#warnInvalid(card, "weapons",  w, e)));
    });
    await Promise.all(validations);

    // 2) Save flags (empty clears)
    const updatedIds = [];
    const saves = [];
    root.querySelectorAll(".card[data-actor-id]").forEach(card => {
      const id = card.getAttribute("data-actor-id");
      const actor = game.actors.get(id);
      if (!actor) return;
      const portrait = String(card.querySelector(".path-portrait")?.value ?? "").trim();
      const weapons  = String(card.querySelector(".path-weapons")?.value  ?? "").trim();
      const scheme   = String(card.querySelector("select.dh-color")?.value ?? "").trim();

      LOG("saving actor", { id, name: actor.name, portrait, weapons, scheme });

      updatedIds.push(id);
      saves.push(this.#setOrClearFlag(actor, "ringPortrait", portrait));
      saves.push(this.#setOrClearFlag(actor, "ringWeapons",  weapons));
      saves.push(this.#setOrClearFlag(actor, "colorScheme",  scheme));
    });
    await Promise.all(saves);

    // 3) Echo flags to verify persistence (debug)
    for (const id of updatedIds) {
      const a = game.actors.get(id);
      const back = {
        portrait: await a.getFlag(FLAG_NS, "ringPortrait"),
        weapons:  await a.getFlag(FLAG_NS, "ringWeapons"),
        scheme:   await a.getFlag(FLAG_NS, "colorScheme")
      };
      LOG("saved flags (echo):", { id, name: a?.name, back });
    }

    // 4) Notify HUDs and close
    Hooks.callAll("daggerheart-hud:rings-updated",      { actorIds: updatedIds });
    Hooks.callAll("daggerheart-hud:appearance-updated", { actorIds: updatedIds });
    ui.notifications.info("HUD images & colors saved.");
    this.close();
  }

  #warnInvalid(card, kind, path, err) {
    const name = card.querySelector(".char")?.textContent?.trim()
             || card.querySelector(".label")?.textContent?.trim()
             || "Actor";
    console.warn(`[Daggerheart HUD] Invalid ${kind} path for ${name}:`, path, err);
    ui.notifications.warn(`${name}: invalid ${kind} image.`, { permanent: false });
  }

  async #setOrClearFlag(actor, key, value) {
    try {
      if (value) return await actor.setFlag(FLAG_NS, key, value);
      try { return await actor.unsetFlag(FLAG_NS, key); }
      catch { return; }
    } catch (e) {
      console.error("[Daggerheart HUD] setOrClearFlag error", actor?.name, key, value, e);
    }
  }
}

// Convenience open function used by the Settings launcher
export function openHudRingsDialog() {
  const app = new HudRingsDialog();
  app.render(true);
}
