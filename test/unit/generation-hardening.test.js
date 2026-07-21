const { validateGeneratedScript, hardInvalidReason, stripCodeFences, hasBalancedDelimiters } = require('../../src/utils/script-validator');
const { optimizeActions, isMeaningfulKeydown } = require('../../src/utils/action-optimizer');
const sa = require('../../src/utils/session-actions');

describe('script-validator', () => {
  const goodPlaywright = `import { test, expect } from '@playwright/test';
test('flow', async ({ page }) => {
  await page.goto('https://example.com');
  await page.locator('#email').fill('a@b.com');
  await expect(page.locator('#email')).toHaveValue('a@b.com');
});`;

  it('accepts a valid Playwright script', () => {
    expect(validateGeneratedScript(goodPlaywright, 'playwright', 'javascript', 3).valid).toBe(true);
  });

  it('rejects a JS syntax error (unclosed paren)', () => {
    const bad = goodPlaywright.replace("fill('a@b.com')", "fill('a@b.com'");
    const r = validateGeneratedScript(bad, 'playwright', 'javascript', 3);
    expect(r.valid).toBe(false);
  });

  it('rejects unbalanced braces', () => {
    const bad = `test('x', async ({ page }) => { await page.goto('u');`;
    expect(validateGeneratedScript(bad, 'playwright', 'javascript', 1).valid).toBe(false);
  });

  it('strips markdown fences rather than rejecting fenced output', () => {
    const fenced = '```javascript\n' + goodPlaywright + '\n```';
    const clean = stripCodeFences(fenced);
    expect(clean.startsWith('```')).toBe(false);
    expect(clean.endsWith('```')).toBe(false);
    expect(validateGeneratedScript(clean, 'playwright', 'javascript', 3).valid).toBe(true);
    // And a fenced-but-otherwise-valid script is NOT a hard failure.
    expect(hardInvalidReason(clean, 'playwright')).toBeNull();
  });

  it('rejects missing framework signature', () => {
    const bad = `const x = 1; const y = 2; console.log(x + y); // no test harness at all here`;
    expect(validateGeneratedScript(bad, 'playwright', 'javascript', 1).reason).toBe('missing_framework_signature');
  });

  it('flags pathological verbosity (huge output for few actions) as a soft issue', () => {
    const lines = Array.from({ length: 400 }, (_, i) => `  await page.locator('#e').fill('v${i}');`).join('\n');
    const bloated = `import { test } from '@playwright/test';\ntest('x', async ({ page }) => {\n${lines}\n});`;
    // Soft issue: full validation flags it (drives a retry) but it is NOT a hard
    // structural failure (so structurally-valid AI output is never discarded).
    expect(validateGeneratedScript(bloated, 'playwright', 'javascript', 3).reason).toBe('excessive_length');
    expect(hardInvalidReason(bloated, 'playwright')).toBeNull();
  });

  it('validates a Python Selenium script structurally (no JS syntax check)', () => {
    const py = `import unittest\nclass FlowScribeTest(unittest.TestCase):\n    def test_recorded_flow(self):\n        self.driver.get("u")\n`;
    expect(validateGeneratedScript(py, 'selenium', 'python', 2).valid).toBe(true);
  });

  it('balanced-delimiter check ignores braces inside strings', () => {
    expect(hasBalancedDelimiters(`const s = "a { b ( c";`)).toBe(true);
  });
});

describe('action-optimizer', () => {
  it('isMeaningfulKeydown keeps navigation keys, drops printables', () => {
    expect(isMeaningfulKeydown('Enter')).toBe(true);
    expect(isMeaningfulKeydown('Tab')).toBe(true);
    expect(isMeaningfulKeydown('a')).toBe(false);
    expect(isMeaningfulKeydown('Shift')).toBe(false);
  });

  it('collapses per-keystroke inputs into the final value', () => {
    const el = { id: 'email' };
    const actions = ['s', 'sh', 'sha', 'shar', 'sharaj'].map((v, i) => ({
      type: 'input', value: v, element: el, timestamp: i
    }));
    const out = optimizeActions(actions);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('sharaj');
  });

  it('drops keydowns interleaved with inputs and still collapses', () => {
    const el = { id: 'email' };
    const actions = [
      { type: 'keydown', key: 's', element: el },
      { type: 'input', value: 's', element: el, timestamp: 1 },
      { type: 'keydown', key: 'h', element: el },
      { type: 'input', value: 'sh', element: el, timestamp: 2 }
    ];
    const out = optimizeActions(actions);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('sh');
  });

  it('drops focus/blur noise', () => {
    const out = optimizeActions([
      { type: 'focus', element: { id: 'a' } },
      { type: 'click', element: { id: 'a' }, timestamp: 1 }
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('click');
  });

  it('dedupes consecutive same-URL navigations', () => {
    const out = optimizeActions([
      { type: 'navigate', url: 'https://x.com' },
      { type: 'navigation', url: 'https://x.com' },
      { type: 'navigate', url: 'https://y.com' }
    ]);
    expect(out.map(a => a.url)).toEqual(['https://x.com', 'https://y.com']);
  });

  it('drops rapid duplicate clicks (<300ms) on same element', () => {
    const el = { id: 'btn' };
    const out = optimizeActions([
      { type: 'click', element: el, timestamp: 1000 },
      { type: 'click', element: el, timestamp: 1100 }
    ]);
    expect(out).toHaveLength(1);
  });

  it('keeps inputs into different fields separate', () => {
    const out = optimizeActions([
      { type: 'input', value: 'a@b.com', element: { id: 'email' }, timestamp: 1 },
      { type: 'input', value: 'secret', element: { id: 'pass' }, timestamp: 2 }
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('session-actions (message-path core)', () => {
  function makeStore() {
    const session = { id: 's1', tabId: 5, actions: [] };
    return {
      sessions: new Map([['s1', session]]),
      activeSessionsByTab: new Map([[5, 's1']]),
      currentSessionId: 's1',
      _session: session
    };
  }

  it('resolves the active session by tabId', () => {
    const store = makeStore();
    expect(sa.resolveActiveSession(store, 5)).toBe(store._session);
  });

  it('falls back to currentSessionId when tab has no mapping', () => {
    const store = makeStore();
    expect(sa.resolveActiveSession(store, 999)).toBe(store._session);
  });

  it('appendAction stores into the owning tab session', () => {
    const store = makeStore();
    expect(sa.appendAction(store, { type: 'click' }, 5)).toBe(true);
    expect(store._session.actions).toHaveLength(1);
  });

  it('appendAction rejects a tab that neither owns nor is mapped to the session', () => {
    const store = makeStore();
    // tab 8 is unmapped; falls back to currentSessionId but session.tabId=5 !== 8
    expect(sa.appendAction(store, { type: 'click' }, 8)).toBe(false);
    expect(store._session.actions).toHaveLength(0);
  });

  it('appendAction accepts a second tab explicitly mapped to the session (multi-tab)', () => {
    const store = makeStore();
    store.activeSessionsByTab.set(7, 's1'); // link opened a new tab, registered to s1
    expect(sa.appendAction(store, { type: 'click' }, 7)).toBe(true);
    expect(store._session.actions).toHaveLength(1);
  });

  it('clearActions empties the session (CLEAR_ACTIONS)', () => {
    const store = makeStore();
    store._session.actions = [{ type: 'click' }, { type: 'input' }];
    expect(sa.clearActions(store, 5)).toBe(true);
    expect(store._session.actions).toHaveLength(0);
  });

  it('replaceActions swaps the list (UPDATE_ACTIONS)', () => {
    const store = makeStore();
    store._session.actions = [{ type: 'click' }];
    expect(sa.replaceActions(store, [{ type: 'navigate' }, { type: 'input' }], 5)).toBe(true);
    expect(store._session.actions).toHaveLength(2);
    expect(store._session.actions[0].type).toBe('navigate');
  });

  it('returns false when there is no active session', () => {
    const empty = { sessions: new Map(), activeSessionsByTab: new Map(), currentSessionId: null };
    expect(sa.clearActions(empty, 1)).toBe(false);
    expect(sa.replaceActions(empty, [], 1)).toBe(false);
    expect(sa.appendAction(empty, {}, 1)).toBe(false);
  });
});
