/**
 * Integration test: loads the REAL background.js under a mocked Chrome and
 * replays actual event sequences through its registered handlers, verifying the
 * multi-tab capture and vision (screenshot → provider request) paths end-to-end.
 * This exercises the real message routing + session logic + generation wiring,
 * not just the pure helper modules.
 */

// ---- Mocked Chrome + environment ----
const store = {
  flowScribeSettings: { enableAI: false, enableNetworkRecording: false, includeScreenshots: true }
};
const listeners = {}; // capture addListener callbacks

function makeEvent(name) {
  return {
    addListener: (cb) => { (listeners[name] = listeners[name] || []).push(cb); },
    removeListener: () => {}
  };
}

let capturedFetchBodies = [];

beforeAll(() => {
  global.chrome = {
    runtime: {
      id: 'testextensionid',
      lastError: null,
      getURL: (p) => `chrome-extension://test/${p}`,
      onMessage: makeEvent('message'),
      onInstalled: makeEvent('installed')
    },
    action: { onClicked: makeEvent('actionClicked') },
    sidePanel: { open: () => Promise.resolve(), setOptions: () => Promise.resolve(), setPanelBehavior: () => Promise.resolve() },
    scripting: { executeScript: () => Promise.resolve([]) },
    tabs: {
      onActivated: makeEvent('tabActivated'),
      onUpdated: makeEvent('tabUpdated'),
      onCreated: makeEvent('tabCreated'),
      onRemoved: makeEvent('tabRemoved'),
      get: (id) => Promise.resolve({ id, url: 'https://app.example.com/login', title: 'Login' }),
      query: () => Promise.resolve([{ id: 1 }]),
      sendMessage: () => Promise.resolve(),
      captureVisibleTab: () => Promise.resolve('data:image/jpeg;base64,ZmFrZS1zY3JlZW5zaG90')
    },
    storage: {
      local: {
        get: (keys) => {
          const out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach(k => { if (store[k] !== undefined) out[k] = store[k]; });
          return Promise.resolve(out);
        },
        set: (obj) => { Object.assign(store, obj); return Promise.resolve(); },
        remove: (keys) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]); return Promise.resolve(); }
      },
      session: null
    },
    webRequest: {}
  };

  // Mock the AI provider HTTP call: capture the request body and return a valid script.
  const CANNED = `import { test, expect } from '@playwright/test';
test('recorded flow', async ({ page }) => {
  await page.goto('https://app.example.com/login');
  await page.locator('#email').fill('a@b.com');
  await expect(page.locator('#email')).toHaveValue('a@b.com');
});`;
  global.fetch = (url, opts) => {
    if (opts && opts.body) capturedFetchBodies.push({ url, body: opts.body });
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: CANNED } }] })
    });
  };

  // Load the real background service worker (registers all listeners).
  require('../../src/background/background.js');
});

// Fire a captured listener and wait for the async sendResponse (or a timeout).
function sendMessage(message, sender = {}) {
  const handler = listeners.message[0];
  return new Promise((resolve) => {
    let done = false;
    const respond = (r) => { if (!done) { done = true; resolve(r); } };
    const ret = handler(message, sender, respond);
    if (ret !== true) setTimeout(() => respond(undefined), 30); // sync handler
    setTimeout(() => respond(undefined), 2000); // safety timeout
  });
}
function fireTabCreated(tab) { (listeners.tabCreated || []).forEach(cb => cb(tab)); }
async function fireTabUpdated(id, changeInfo, tab) {
  for (const cb of (listeners.tabUpdated || [])) await cb(id, changeInfo, tab);
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe('background integration — real handlers', () => {
  beforeAll(async () => {
    await wait(100); // let init() (crypto + storage + listener registration) finish
  });

  it('registered the message + tab listeners on load', () => {
    expect(Array.isArray(listeners.message)).toBe(true);
    expect(listeners.message.length).toBe(1);
    expect(listeners.tabCreated.length).toBeGreaterThanOrEqual(1);
    expect(listeners.tabUpdated.length).toBeGreaterThanOrEqual(1);
  });

  it('MULTI-TAB: a new tab opened from a recording tab joins the session and its actions are captured', async () => {
    // Start recording on tab 1.
    const start = await sendMessage({ type: 'START_RECORDING_SESSION', data: { tabId: 1 } });
    expect(start.success).toBe(true);

    // A link opens tab 2 from tab 1 → should join the same session.
    fireTabCreated({ id: 2, openerTabId: 1, url: 'https://app.example.com/dashboard' });

    // An action recorded FROM tab 2 must be captured in the session.
    const rec = await sendMessage(
      { type: 'ACTION_RECORDED', action: { type: 'click', element: { id: 'dash-btn' } }, url: 'x' },
      { tab: { id: 2 } }
    );
    expect(rec.success).toBe(true);

    const cur = await sendMessage({ type: 'GET_CURRENT_SESSION' });
    const acts = cur.session.actions;
    expect(acts.some(a => a.type === 'click' && a.element?.id === 'dash-btn')).toBe(true);
  });

  it('MULTI-TAB: closing the secondary tab does NOT end the session', async () => {
    (listeners.tabRemoved || []).forEach(cb => cb(2));
    const cur = await sendMessage({ type: 'GET_CURRENT_SESSION' });
    expect(cur.session).toBeTruthy();
    expect(cur.session.status).toBe('recording');
  });

  it('template generation returns a valid script (AI disabled)', async () => {
    const res = await sendMessage({
      type: 'GENERATE_SCRIPT',
      data: {
        framework: 'playwright',
        actions: [
          { type: 'navigate', url: 'https://app.example.com/login' },
          { type: 'input', value: 'a@b.com', target: { tagName: 'input', id: 'email', selector: '#email', attributes: {} }, element: { id: 'email' } }
        ],
        options: {}
      }
    });
    expect(res.success).toBe(true);
    expect(res.script).toContain('test');
    expect(res.aiUsed).toBe(false);
  });

  it('VISION: captured page screenshots are attached to the AI provider request', async () => {
    // Enable AI + vision.
    await sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { enableAI: true, apiKey: 'sk-test-key-1234567890', aiProvider: 'openai', aiModel: 'gpt-4.1', includeScreenshots: true }
    });

    // A page finishing load during recording captures a screenshot.
    await fireTabUpdated(1, { status: 'complete', url: 'https://app.example.com/login' }, { id: 1, url: 'https://app.example.com/login', title: 'Login' });
    await wait(50);

    capturedFetchBodies = [];
    const res = await sendMessage({
      type: 'GENERATE_SCRIPT',
      data: {
        framework: 'playwright',
        actions: [{ type: 'navigate', url: 'https://app.example.com/login' }, { type: 'click', target: { id: 'go', selector: '#go', attributes: {} } }],
        options: { includeScreenshots: true }
      }
    });
    expect(res.success).toBe(true);

    // The OpenAI request body must contain an image part (vision wiring works).
    const aiCall = capturedFetchBodies.find(b => /openai\.com/.test(b.url));
    expect(aiCall).toBeTruthy();
    const body = JSON.parse(aiCall.body);
    const userMsg = body.messages.find(m => m.role === 'user');
    const hasImage = Array.isArray(userMsg.content) && userMsg.content.some(part => part.type === 'image_url');
    expect(hasImage).toBe(true);
  });
});
