// module/hud/context/_helpers.mjs
// Shared helpers for the _prepareContext collectors. Extracted in refactor step 4.
// Step 5 relocates itemHasActions to system/items.mjs.

/** Detect if an item has actions (works with Foundry Collections). */
export function itemHasActions(item) {
  const actions = item.system?.actions;
  if (!actions) return false;

  // Check if it's a Foundry Collection with size property
  if (typeof actions.size === 'number') {
    return actions.size > 0;
  }

  // Fallback to standard object detection
  if (typeof actions === 'object') {
    return Object.keys(actions).length > 0;
  }

  return false;
}
