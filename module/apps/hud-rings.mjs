// Daggerheart HUD – HUD Images Config dialog (per-Actor ring images)
// Foundry VTT v13 — V2 dialog (DialogV2 + Handlebars mixin)
// Lists ALL actors (even without owners), lets GM set portrait/weapons ring images.
// Saves per-Actor flags used by the HUD and emits a refresh hook.

const MODULE_ID = "daggerheart-hud";                  // keep consistent with your module id
const FLAG_NS   = MODULE_ID;                            // flags namespace
const TPL_PATH  = `modules/${MODULE_ID}/templates/ui/hud-rings.hbs`;
const LOG = (...a) => console.log("[HUD Images Config]", ...a);

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FP = foundry.applications.apps.FilePicker.implementation;


export class HudRingsDialog extends HandlebarsApplicationMixin(DialogV2) {
  static DEFAULT_OPTIONS = {
    id: "dh-hud-images-config",
    window: { title: "HUD Images Config" },
    position: { width: 720, height: "auto" },
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fas fa-times" },
      { action: "save",   label: "Save",   icon: "fas fa-save", default: true }
    ]
  };

  static PARTS = {
    content: { template: TPL_PATH }
  };

  async _prepareContext() {
    // Filtra SOMENTE atores do tipo "character" (independe de owner)
    const pcs = game.actors.contents
      .filter(a => String(a?.type ?? "").toLowerCase() === "character")
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const rows = await Promise.all(pcs.map(async (a) => ({
      id: a.id,
      name: a.name,
      portrait: await a.getFlag(FLAG_NS, "ringPortrait") || "",
      weapons:  await a.getFlag(FLAG_NS, "ringWeapons")  || ""
    })));

LOG("_prepareContext actors snapshot",
  game.actors.contents.map(a => ({ name: a.name, type: a.type }))
);
LOG("filtered PCs", pcs.map(a => a.name));

    return { actors: rows };
  }


  // Wire events after render
  _onRender(_context, _parts) {
    
    LOG("_onRender called. rows found:",
  this.element.querySelectorAll(".row[data-actor-id]").length
);

    const root = this.element;
    // Live preview bindings
    root.querySelectorAll(".row").forEach(row => {
      const inputPortrait = row.querySelector(".path-portrait");
      const inputWeapons  = row.querySelector(".path-weapons");
      const prevPortrait  = row.querySelector(".preview-portrait");
      const prevWeapons   = row.querySelector(".preview-weapons");
      const updP = () => { if (prevPortrait) prevPortrait.src = inputPortrait?.value || ""; };
      const updW = () => { if (prevWeapons)  prevWeapons.src  = inputWeapons?.value  || ""; };
      inputPortrait?.addEventListener("input", updP);
      inputPortrait?.addEventListener("change", updP);
      inputWeapons?.addEventListener("input", updW);
      inputWeapons?.addEventListener("change", updW);

      // FilePicker buttons
      row.querySelectorAll(".dh-picker").forEach(btn => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const selector = btn.getAttribute("data-target") || "input.path";
          const target = row.querySelector(selector);
          const type   = btn.getAttribute("data-type") || "image";
          const current= target?.value || "";
          const fp = new FP({ type, current, callback: (path) => {
            if (!target) return;
            target.value = path;
            target.dispatchEvent(new Event("change", { bubbles: true }));
          }});
          fp.render(true);
        });
      });
    });

    // Footer buttons inside the template (we avoid dialog chrome issues)
    root.querySelector(".dh-cancel")?.addEventListener("click", (ev) => {
      ev.preventDefault(); this.close();
    });

    root.querySelector(".dh-save")?.addEventListener("click", async (ev) => {
      ev.preventDefault(); await this.#saveFromDOM();
    });

  }

  async _onClickButton(_event, button) {
    if (button.action === "cancel") return this.close();
    if (button.action === "save")   return this.#saveFromDOM();
  }

  async #saveFromDOM() {
    const root = this.element;

    // 1) Validate all non-empty paths in parallel
    const validations = [];
    root.querySelectorAll(".row[data-actor-id]").forEach(row => {
      const p = row.querySelector(".path-portrait")?.value?.trim();
      const w = row.querySelector(".path-weapons")?.value?.trim();
      if (p) validations.push(loadTexture(p).catch(e => this.#warnInvalid(row, "portrait", p, e)));
      if (w) validations.push(loadTexture(w).catch(e => this.#warnInvalid(row, "weapons",  w, e)));
    });
    await Promise.all(validations);

    // 2) Save flags (empty clears)
    const updatedIds = [];
    const saves = [];
    root.querySelectorAll(".row[data-actor-id]").forEach(row => {
      const id = row.getAttribute("data-actor-id");
      const actor = game.actors.get(id);
      if (!actor) return;
      const portrait = String(row.querySelector(".path-portrait")?.value ?? "").trim();
      const weapons  = String(row.querySelector(".path-weapons")?.value  ?? "").trim();
      updatedIds.push(id);
      saves.push(this.#setOrClearFlag(actor, "ringPortrait", portrait));
      saves.push(this.#setOrClearFlag(actor, "ringWeapons",  weapons));
    });
    await Promise.all(saves);

    // 3) Notify and close
    Hooks.callAll("daggerheart-hud:rings-updated", { actorIds: updatedIds });
    ui.notifications.info("HUD ring images saved.");
    this.close();
  }

  #warnInvalid(row, kind, path, err) {
    const name = row.querySelector(".label")?.textContent?.trim() || "Actor";
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
