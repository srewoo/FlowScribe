/**
 * action-optimizer.js — pure helpers that clean up a recorded action list
 * before it's turned into a script. Shared by the content recorder (live
 * coalescing) and the background service worker (pre-AI cleanup) so the LLM
 * never sees per-keystroke noise or duplicated navigations.
 */

// Only these keydowns carry test intent; everything else is captured by the
// resulting input event and would just be noise.
const MEANINGFUL_KEYS = new Set([
  'Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'
]);

function isMeaningfulKeydown(key) {
  return MEANINGFUL_KEYS.has(key);
}

function actionElementKey(action) {
  const el = action.element || action.target || {};
  return el.id || el.name || el.cssSelector || el.selector || el.xpath || '';
}

function isInputLike(type) {
  return type === 'input' || type === 'change';
}

/**
 * Collapse a recorded action list:
 *  - successive inputs/changes into the same field → keep only the final value
 *  - consecutive navigations to the same URL → keep one
 *  - keydowns that aren't meaningful navigation keys → drop
 *  - focus/blur → drop (click/fill imply focus)
 *
 * @param {Array} actions
 * @returns {Array} cleaned actions (new array; inputs unchanged objects reused)
 */
function optimizeActions(actions) {
  if (!Array.isArray(actions)) return [];
  const out = [];

  for (const action of actions) {
    if (!action || !action.type) continue;
    const type = action.type;

    // Drop focus/blur and non-meaningful keydowns.
    if (type === 'focus' || type === 'blur') continue;
    if (type === 'keydown' && !isMeaningfulKeydown(action.key)) continue;

    const last = out[out.length - 1];

    // Collapse successive inputs into the same field.
    if (isInputLike(type) && last && isInputLike(last.type) &&
        actionElementKey(action) && actionElementKey(action) === actionElementKey(last)) {
      out[out.length - 1] = { ...last, type, value: action.value, timestamp: action.timestamp };
      continue;
    }

    // Drop consecutive duplicate navigations (same URL).
    if ((type === 'navigate' || type === 'navigation') && last &&
        (last.type === 'navigate' || last.type === 'navigation') &&
        action.url && action.url === last.url) {
      continue;
    }

    // Drop rapid duplicate clicks on the same element (< 300ms).
    if (type === 'click' && last && last.type === 'click' &&
        actionElementKey(action) && actionElementKey(action) === actionElementKey(last) &&
        typeof action.timestamp === 'number' && typeof last.timestamp === 'number' &&
        (action.timestamp - last.timestamp) < 300) {
      continue;
    }

    out.push(action);
  }

  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { optimizeActions, isMeaningfulKeydown, MEANINGFUL_KEYS };
}
