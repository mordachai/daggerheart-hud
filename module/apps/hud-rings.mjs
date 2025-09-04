// Daggerheart HUD – HUD Theme Config dialog (per-Actor rings + per-Actor color scheme)
// Foundry VTT v13 — V2 Application (DialogV2) + Handlebars mixin

const MODULE_ID = "daggerheart-hud";
const FLAG_NS   = MODULE_ID;
const TPL_PATH  = `modules/${MODULE_ID}/templates/ui/hud-rings.hbs`;

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const FP      = foundry.applications.apps.FilePicker.implementation; // v13 namespace
const loadTex = foundry.canvas.loadTexture;                           // v13 namespace



async function getThemeChoicesFromCSS() {
  
  try {
    const cssPath = `modules/${MODULE_ID}/styles/dhud-themes.css`;
    LOG("Attempting to fetch CSS file:", cssPath);
    
    const response = await foundry.utils.fetchWithTimeout(cssPath);
    
    if (response.ok) {
      const cssText = await response.text();
      LOG("CSS file loaded, length:", cssText.length);
      
      // Method 1: Try to read from special comment first
      const commentMatch = cssText.match(/\/\*\s*Available themes:\s*([^*]+)\*\//);
      if (commentMatch) {
        const themeNames = commentMatch[1]
          .split(',')
          .map(name => name.trim())
          .filter(Boolean);
        
        if (themeNames.length > 0) {
          LOG("Found themes from comment:", themeNames);
          const nicify = v => v.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          const all = themeNames.map(v => ({ value: v, label: nicify(v) }));
          
          // Ensure default is first
          const hasDefault = all.some(x => x.value === "default");
          const result = hasDefault
            ? [{ value: "default", label: "Default" }, ...all.filter(x => x.value !== "default")]
            : [{ value: "default", label: "Default" }, ...all];
            
          LOG("Final theme choices from comment:", result);
          return result;
        }
      }
      
      // Method 2: Fallback to regex parsing if comment method fails
      const names = new Set();
      const re = /\.dhud-theme-([a-z0-9_-]+)/gi;
      
      let match;
      while ((match = re.exec(cssText)) !== null) {
        names.add(match[1]);
        LOG("Found theme via regex:", match[1]);
      }
      
      if (names.size > 0) {
        LOG("Successfully extracted themes from CSS via regex:", Array.from(names));
        
        const nicify = v => v.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
        const all = Array.from(names).sort().map(v => ({ value: v, label: nicify(v) }));
        
        const hasDefault = all.some(x => x.value === "default");
        const result = hasDefault
          ? [{ value: "default", label: "Default" }, ...all.filter(x => x.value !== "default")]
          : [{ value: "default", label: "Default" }, ...all];
          
        LOG("Final theme choices from regex:", result);
        return result;
      }
    } else {
      LOG("Failed to fetch CSS file, status:", response.status);
    }
  } catch (error) {
    LOG("Error reading CSS file:", error);
  }

  // Method 3: Ultimate fallback to hardcoded list
  LOG("Using fallback themes");
  
  const fallbackThemes = [
    "default",
    "shadowveil",
    "ironclad", 
    "wildfire",
    "frostbite",
    "thornwood",
    "bloodmoon",
    "goldenhour",
    "stormcloud",
    "mysticvoid"
  ];
  
  const nicify = v => v.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return fallbackThemes.map(v => ({ value: v, label: nicify(v) }));
}

export class HudRingsDialog extends HandlebarsApplicationMixin(DialogV2) {
  static DEFAULT_OPTIONS = {
    id: "dh-hud-images-config",
    window: { title: "HUD Theme Config" },
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

  /** Add/remove theme class on a card so it previews the selected scheme. */
  _applyCardTheme(card) {
    const prefix = "dhud-theme-";
    // remove prior theme classes
    Array.from(card.classList).forEach(c => { if (c.startsWith(prefix)) card.classList.remove(c); });
    const sel = card.querySelector("select.dh-color");
    const val = (sel?.value || card.getAttribute("data-color") || "default").trim() || "default";
    card.classList.add(prefix + val);
  }

// Update the _prepareContext method in your HudRingsDialog class:

async _prepareContext() {
  // Only character actors (owner or not), sorted by name
  const pcs = game.actors.contents
    .filter(a => String(a?.type ?? "").toLowerCase() === "character")
    .sort((a,b) => (a.name || "").localeCompare(b.name || ""));

  const rows = await Promise.all(pcs.map(async (a) => {
    // first non-GM owner label if any
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

  // Now this properly awaits the async function
  const colorChoices = await getThemeChoicesFromCSS();

  LOG("_prepareContext actors snapshot", game.actors.contents.map(x => ({ name: x.name, type: x.type })));
  LOG("filtered PCs", rows.map(r => r.name));
  LOG("colorChoices", colorChoices);

  return { actors: rows, colorChoices };
  }

  _onRender(_context, _parts) {
    const root = this.element;
    LOG("_onRender cards:", root.querySelectorAll(".card[data-actor-id]").length);

    // initialize & bind once per card
    root.querySelectorAll(".card[data-actor-id]").forEach(card => {
      const sel = card.querySelector("select.dh-color");
      if (sel) sel.value = card.getAttribute("data-color") || "";

      // live theme preview on the card
      this._applyCardTheme(card);
      sel?.addEventListener("change", () => this._applyCardTheme(card));

      if (card.dataset.bound === "1") return;
      card.dataset.bound = "1";

      // live image preview bindings
      const inP = card.querySelector(".path-portrait");
      const inW = card.querySelector(".path-weapons");
      const imgP = card.querySelector(".preview-portrait");
      const imgW = card.querySelector(".preview-weapons");
      const updP = () => { if (imgP) imgP.src = inP?.value || ""; };
      const updW = () => { if (imgW) imgW.src = inW?.value || ""; };
      inP?.addEventListener("input", updP);  inP?.addEventListener("change", updP);
      inW?.addEventListener("input", updW);  inW?.addEventListener("change", updW);

      // click preview → FilePicker (image)
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

      // clear-path (✕) buttons
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

    // footer buttons inside template (mouse users)
    root.querySelector(".dh-cancel")?.addEventListener("click", (ev) => {
      ev.preventDefault(); this.close();
    });
    root.querySelector(".dh-save")?.addEventListener("click", async (ev) => {
      ev.preventDefault(); await this.#saveFromDOM();
    });
  }

  async #saveFromDOM() {
    const root = this.element;

    // 1) validate non-empty paths first (portrait/weapons)
    const validations = [];
    root.querySelectorAll(".card[data-actor-id]").forEach(card => {
      const p = card.querySelector(".path-portrait")?.value?.trim();
      const w = card.querySelector(".path-weapons")?.value?.trim();
      if (p) validations.push(loadTex(p).catch(e => this.#warnInvalid(card, "portrait", p, e)));
      if (w) validations.push(loadTex(w).catch(e => this.#warnInvalid(card, "weapons",  w, e)));
    });
    await Promise.all(validations);

    // 2) save flags (empty clears)
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

    // 3) notify HUDs and close
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

// Settings launcher helper
export function openHudRingsDialog() {
  const app = new HudRingsDialog();
  app.render(true);
}
