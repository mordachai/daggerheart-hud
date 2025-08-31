// module/helpers/chat-utils.mjs

/**
 * Send an Item to chat, trying system-rich card first,
 * then system toChat, then core toChat, then a simple fallback.
 */
export async function sendItemToChat(item, actor) {
  if (!item) return;
  const speaker = ChatMessage.getSpeaker({ actor });

  // 1) System-rich card (Foundryborne often exposes displayCard)
  try {
    if (typeof item.displayCard === "function") {
      await item.displayCard({ speaker });
      return;
    }
  } catch (e) {
    console.warn("[DHUD] displayCard threw, trying item.toChat", e);
  }

  // 2) System Item#toChat (bind item and pass options)
  try {
    if (typeof item.toChat === "function") {
      await item.toChat.call(item, { speaker });
      return;
    }
  } catch (e) {
    console.warn("[DHUD] system item.toChat threw, trying core toChat", e);
  }

  // 3) Core Foundry fallback
  try {
    if (Item?.prototype?.toChat) {
      await Item.prototype.toChat.call(item, { speaker });
      return;
    }
  } catch (e) {
    console.warn("[DHUD] core Item.prototype.toChat threw, using simple message", e);
  }

  // 4) Ultimate fallback
  const content = `<h3>${foundry.utils.escapeHTML(item.name)}</h3>${item.system?.description ?? ""}`;
  await ChatMessage.create({ speaker, content });
}
