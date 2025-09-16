// module/helpers/handlebars-helpers.mjs

/** Register all Handlebars helpers used by the Daggerheart HUD. */
export function registerDHUDHelpers() {
  // Avoid double-registration
  if (registerDHUDHelpers._done) return;
  registerDHUDHelpers._done = true;

  const Hb = globalThis.Handlebars;
  if (!Hb) {
    console.warn("[DHUD] Handlebars not present at init; helpers not registered.");
    return;
  }

  // ---- Resource detection helper (MOVED TO TOP) ----
  function getResourceInfo(item) {
    const sys = item.system || {};
    
    // Helper: should this resource be user-editable?
    function determineIfEditable(item, field) {
      // Domain cards - read-only (system manages them)
      if (item.type === "domainCard") return false;
      // Action-level uses - read-only (system manages through actions)
      if (field.startsWith("actions.")) return false;
      // Simple counters without fixed max - user-editable
      if (field === "resource.value" && (!item.system.resource.max || item.system.resource.max === "")) return true;
      // Regular resources with max - user-editable
      if (field === "resource.value" || field === "quantity") return true;
      // Item-level uses - read-only if they have actions, editable if they don't
      if (field === "uses.value") {
        return !item.system.actions || item.system.actions.size === 0;
      }
      return true; // Default to editable
    }

    // Helper: resolve computed max values (supports @actor.path style)
    function resolveMaxValue(maxString, item) {
      if (!maxString || maxString === "") return null;
      if (typeof maxString === "number") return maxString;

      if (typeof maxString === "string" && maxString.startsWith("@")) {
        try {
          const actor = item.parent;
          if (actor) {
            const resolvedMax = foundry.utils.getProperty(actor, maxString.substring(1));
            return parseInt(resolvedMax) || null;
          }
        } catch (e) {
          console.warn("[DHUD] Could not resolve computed max:", maxString);
          return null;
        }
      } else {
        return parseInt(maxString) || null;
      }
      return null;
    }

    // Quantity (consumables/loot)
    if (sys.quantity !== null && sys.quantity !== undefined) {
      const field = "quantity";
      return {
        field,
        value: sys.quantity,
        max: null,
        editable: determineIfEditable(item, field)
      };
    }

    // Item-level uses (features with limited uses) — display SPENT (unchanged)
    if (sys.uses?.max !== null && sys.uses?.max !== undefined && sys.uses.max !== "") {
      const maxVal = resolveMaxValue(sys.uses.max, item);
      if (maxVal && maxVal > 0) {
        const field = "uses.value";
        return {
          field,
          value: sys.uses.value || 0,   // SPENT
          max: maxVal,
          editable: determineIfEditable(item, field)
        };
      }
    }

    // for diceValue
    if (sys.resource?.type === "diceValue") {
      const dieFaces = String(sys.resource.dieFaces || "d12").toLowerCase(); // e.g., "d4","d12"
      const statesObj = sys.resource.diceStates || {};

      // Build dice array from diceStates in numeric key order
      let dice = Object.entries(statesObj)
        .map(([k, s]) => ({
          key: k,
          value: Number(s?.value ?? 0),
          used: Boolean(s?.used === true)
        }))
        .sort((a, b) => Number(a.key) - Number(b.key));

      // If no diceStates, fall back to a single die using resource.value
      if (dice.length === 0) {
        dice = [{
          key: "0",
          value: Number(sys.resource.value ?? 0),
          used: Boolean(sys.resource.used === true)
        }];
      }

      return {
        displayType: "diceValues",
        field: null,       // read-only from HUD
        dieFaces,          // "d4","d6","d8","d10","d12","d20"
        dice,              // [{ key, value, used }, ...] (length can be 1)
        max: null,
        editable: false
      };
    }


    // Action-level uses — DISPLAY AVAILABLE (max - spent), keep field pointing to SPENT
    if (sys.actions && typeof sys.actions === "object") {
      const actions = sys.actions.contents || Object.values(sys.actions);
      for (const action of actions) {
        if (action?.uses?.max !== null && action.uses.max !== undefined && action.uses.max !== "") {
          const maxVal = resolveMaxValue(action.uses.max, item);
          if (maxVal && maxVal > 0) {
            const field = `actions.${action._id}.uses.value`;
            const spent = Math.max(0, Number(action.uses.value || 0));
            const available = Math.max(0, maxVal - spent);
            return {
              field,                     // still updates the SPENT field
              value: available,          // DISPLAY AVAILABLE
              max: maxVal,
              editable: determineIfEditable(item, field) // stays read-only for actions
            };
          }
        }
      }
    }

    // Item-level resource (including those without fixed max)
    if (sys.resource && (sys.resource.value !== null && sys.resource.value !== undefined)) {
      const maxVal = resolveMaxValue(sys.resource.max, item);
      const field = "resource.value";
      return {
        field,
        value: sys.resource.value || 0,
        max: maxVal,
        editable: determineIfEditable(item, field)
      };
    }

    return null;
  }

  // Register the helper
  Hb.registerHelper("getResourceInfo", getResourceInfo);

  // ---- Value formatting ----
  Hb.registerHelper("signed", (v) => {
    const n = Number(v) || 0;
    return (n > 0 ? `+${n}` : `${n}`);
  });

  // ---- Comparisons / logic ----
  Hb.registerHelper("eq",  (a, b) => a === b);
  Hb.registerHelper("ne",  (a, b) => a !== b);
  Hb.registerHelper("lt",  (a, b) => Number(a) <  Number(b));
  Hb.registerHelper("lte", (a, b) => Number(a) <= Number(b));
  Hb.registerHelper("gt",  (a, b) => Number(a) >  Number(b));
  Hb.registerHelper("gte", (a, b) => Number(a) >= Number(b));
  Hb.registerHelper("and", function (...args) { return args.slice(0, -1).every(Boolean); });
  Hb.registerHelper("or",  function (...args) { return args.slice(0, -1).some(Boolean); });
  Hb.registerHelper("not", (a) => !a);

  // ---- Strings / debug ----
  Hb.registerHelper("concat", function (...args) { return args.slice(0, -1).join(""); });
  Hb.registerHelper("json",   function (obj) {
    try { return new Hb.SafeString(JSON.stringify(obj)); }
    catch { return "{}"; }
  });

  // ---- Localization: {{l "KEY"}} or {{l keyVar}} (hash becomes format data) ----
  Hb.registerHelper("l", function (key, options) {
    const k = typeof key === "string" ? key : String(key);
    const data = options?.hash && Object.keys(options.hash).length ? options.hash : undefined;
    try {
      const i18n = game?.i18n;
      let out;
      if (data && i18n?.format) out = i18n.format(k, data);
      else if (i18n?.has?.(k))  out = i18n.localize(k);
      else out = k; // fallback shows the key
      return new Hb.SafeString(out);
    } catch {
      return k;
    }
  });

  console.debug("[DHUD] Handlebars helpers registered successfully.");
}