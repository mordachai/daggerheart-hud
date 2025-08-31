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

  console.debug("[DHUD] Handlebars helpers registered.");
}
