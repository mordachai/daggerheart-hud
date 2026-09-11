// module/system/companion.mjs
// Daggerheart-companion-specific glue (GH #19). A `companion` actor's own melee
// attack reuses `useUnarmed()` from system/items.mjs unchanged (same ActionField
// shape as a character's unarmed attack: `actor.system.attack.use(event)`).
//
// The two things unique to companions:
//   - the "Action Roll": the linked partner rolls duality using their own
//     spellcast trait. Mirrors the system's private DhCompanionSheet.#actionRoll
//     (build/daggerheart.js ~L27573-27589) — `diceRoll` is a public Actor method,
//     so calling it on the partner is a legitimate delegation, not reimplemented
//     roll math. That sheet method also calls `this.consumeResource(result?.costs)`
//     afterwards, but that's sheet-instance state and moot here: this specific
//     roll config carries no `cost`.
//   - sending an experience to chat: companion experiences are narrative bonuses
//     applied to the partner's roll, not something the companion rolls itself, so
//     the companion sheet posts a static chat card instead (DHBaseActorSheet.
//     #sendExpToChat, ~L15709-15741, a private sheet method — reusing the
//     system's own chat template is the closest available delegation).

/** The linked partner Actor (the character this companion belongs to), or null. */
export function getPartner(actor) {
  const p = actor?.system?.partner;
  return (p && typeof p === "object") ? p : null;
}

/** Open the partner's character sheet. */
export function openPartnerSheet(actor) {
  const partner = getPartner(actor);
  if (!partner) {
    ui.notifications?.warn("This companion has no linked partner.");
    return;
  }
  partner.sheet?.render(true, { focus: true });
}

/** Fire the companion's "Action Roll" — the partner rolls duality using their spellcast trait. */
export async function useCompanionActionRoll(actor, event) {
  const partner = getPartner(actor);
  if (!partner) {
    ui.notifications?.warn("DAGGERHEART.UI.Notifications.partnerRequired", { localize: true });
    return;
  }
  try {
    const config = {
      event,
      title: `${game.i18n.localize("DAGGERHEART.GENERAL.Roll.action")}: ${actor.name}`,
      headerTitle: `Companion ${game.i18n.localize("DAGGERHEART.GENERAL.Roll.action")}`,
      roll: {
        trait: partner.system?.spellcastModifierTrait?.key,
        companionRoll: true
      },
      hasRoll: true
    };
    const result = await partner.diceRoll(config);
    await result?.resourceUpdates?.updateResources?.();
    return result;
  } catch (err) {
    console.error("[DHUD] Companion action roll failed", err);
    ui.notifications?.error("Companion action roll failed (see console)");
  }
}

/** Post one companion experience to chat, matching the system's own companion sheet. */
export async function sendExperienceToChat(actor, experienceId) {
  const experience = actor?.system?.experiences?.[experienceId];
  if (!experience) return;
  try {
    const cls = getDocumentClass("ChatMessage");
    const systemData = {
      actor: { name: actor.name, img: actor.img },
      author: game.users.get(game.user.id),
      action: {
        name: `${experience.name} ${experience.value.signedString()}`,
        img: "/icons/sundries/misc/admission-ticket-blue.webp"
      },
      itemOrigin: { name: game.i18n.localize("DAGGERHEART.GENERAL.Experience.single") },
      description: experience.description
    };
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/daggerheart/templates/ui/chat/action.hbs",
      systemData
    );
    await cls.create({
      user: game.user.id,
      content,
      speaker: cls.getSpeaker({ actor }),
      flags: { daggerheart: { cssClass: "dh-chat-message dh-style" } }
    });
  } catch (err) {
    console.error("[DHUD] Send experience to chat failed", err);
    ui.notifications?.error("Send to chat failed (see console)");
  }
}
