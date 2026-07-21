/**
 * session-actions.js — pure logic behind the background message handlers that
 * mutate a recording session's action list (ACTION_RECORDED, ACTIONS_RECORDED,
 * CLEAR_ACTIONS, UPDATE_ACTIONS). Kept free of chrome APIs so it's unit-testable
 * in isolation; the service worker wires persistence around these.
 *
 * A "store" is `{ sessions: Map<id, session>, activeSessionsByTab: Map<tabId,id>,
 * currentSessionId: string|null }`.
 */

function resolveActiveSession(store, tabId) {
  let sessionId = (tabId != null && store.activeSessionsByTab)
    ? store.activeSessionsByTab.get(tabId)
    : null;
  if (!sessionId) sessionId = store.currentSessionId;
  if (!sessionId) return null;
  return store.sessions.get(sessionId) || null;
}

/**
 * Whether `tabId` belongs to `session`. A session owns its original tab
 * (session.tabId) AND any additional tab explicitly mapped to it in
 * activeSessionsByTab (multi-tab flows: links opening new tabs).
 */
function ownsTab(store, session, tabId) {
  if (tabId == null) return true;
  if (session.tabId === tabId) return true;
  if (store.activeSessionsByTab && store.activeSessionsByTab.get(tabId) === session.id) return true;
  return false;
}

/** Append a single recorded action to the tab's session. Returns true if stored. */
function appendAction(store, action, tabId) {
  const session = resolveActiveSession(store, tabId);
  if (!session || !ownsTab(store, session, tabId)) return false;
  if (!Array.isArray(session.actions)) session.actions = [];
  session.actions.push(action);
  return true;
}

/** Append a batch of actions. Returns true if stored. */
function appendActions(store, actions, tabId) {
  const session = resolveActiveSession(store, tabId);
  if (!session || !Array.isArray(actions) || !ownsTab(store, session, tabId)) return false;
  if (!Array.isArray(session.actions)) session.actions = [];
  session.actions.push(...actions);
  return true;
}

/** Clear the session's actions (CLEAR_ACTIONS). Returns true if a session matched. */
function clearActions(store, tabId) {
  const session = resolveActiveSession(store, tabId);
  if (!session) return false;
  session.actions = [];
  return true;
}

/** Replace the session's actions with an authoritative list (UPDATE_ACTIONS). */
function replaceActions(store, actions, tabId) {
  const session = resolveActiveSession(store, tabId);
  if (!session || !Array.isArray(actions)) return false;
  session.actions = actions;
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveActiveSession, ownsTab, appendAction, appendActions, clearActions, replaceActions };
}
