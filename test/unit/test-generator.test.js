const TestGenerator = require('../../src/generators/test-generator');

// Minimal recorded-action factory matching the shapes the generators consume.
function clickAction(overrides = {}) {
  return {
    type: 'click',
    target: { tagName: 'button', id: 'submit-btn', selector: '#submit-btn', attributes: {} },
    ...overrides
  };
}

function inputAction(value, targetOverrides = {}) {
  return {
    type: 'input',
    value,
    target: { tagName: 'input', type: 'text', id: 'email', name: 'email', selector: '#email', attributes: {} },
    ...targetOverrides
  };
}

function navigateAction(url) {
  return { type: 'navigate', url };
}

describe('TestGenerator', () => {
  let gen;
  beforeEach(() => { gen = new TestGenerator(); });

  describe('framework dispatch', () => {
    it('throws on an unsupported framework', () => {
      expect(() => gen.generateScript([clickAction()], 'nightwatch')).toThrow(/Unsupported framework/);
    });

    it.each(['playwright', 'selenium', 'cypress', 'puppeteer'])(
      'produces a non-empty script for %s',
      (framework) => {
        const script = gen.generateScript([clickAction(), inputAction('hello')], framework, {});
        expect(typeof script).toBe('string');
        expect(script.length).toBeGreaterThan(50);
      }
    );
  });

  describe('Playwright emitter', () => {
    it('emits a click and a fill for a click + input sequence', () => {
      const script = gen.generateScript([clickAction(), inputAction('john@test.com')], 'playwright', {});
      expect(script).toContain('.click()');
      expect(script).toContain(".fill('john@test.com')");
    });

    it('navigates with page.goto', () => {
      const script = gen.generateScript([navigateAction('https://example.com/login')], 'playwright', {});
      expect(script).toContain("page.goto('https://example.com/login'");
    });
  });

  describe('sensitive-value masking', () => {
    it('masks a password-type field into an env var (Playwright)', () => {
      const pwd = inputAction('hunter2', { target: { tagName: 'input', type: 'password', id: 'pwd', name: 'password', selector: '#pwd', attributes: {} } });
      const script = gen.generateScript([pwd], 'playwright', {});
      expect(script).not.toContain('hunter2');
      expect(script).toContain('process.env.TEST_PASSWORD');
    });

    it('masks fields whose name looks like a secret even without type=password', () => {
      const token = inputAction('abc.jwt.token', { target: { tagName: 'input', type: 'text', id: 'x', name: 'authToken', selector: '#x', attributes: {} } });
      const script = gen.generateScript([token], 'playwright', {});
      expect(script).not.toContain('abc.jwt.token');
      expect(script).toContain('TEST_PASSWORD');
    });
  });

  describe('string escaping (injection safety)', () => {
    it('escapes single quotes so the emitted literal is not broken', () => {
      const script = gen.generateScript([inputAction("O'Brien")], 'playwright', {});
      // The raw apostrophe must be backslash-escaped, never left to terminate the literal.
      expect(script).toContain("O\\'Brien");
      expect(script).not.toMatch(/fill\('O'Brien'\)/);
    });

    it('escapes backslashes and newlines', () => {
      const script = gen.generateScript([inputAction('line1\nback\\slash')], 'playwright', {});
      expect(script).toContain('\\n');
      expect(script).toContain('\\\\slash');
      // No literal newline inside the generated fill() argument.
      expect(script).not.toContain('line1\nback');
    });
  });

  describe('selector prioritization (BaseGenerator.generateSelector)', () => {
    const base = new (Object.getPrototypeOf(new TestGenerator().frameworks.playwright).constructor)();

    it('prefers data-testid over id and raw selector (quotes escaped for the host literal)', () => {
      const sel = base.generateSelector({ id: 'the-id', selector: '.raw', attributes: { 'data-testid': 'save' } });
      // generateSelector escapes its output because every call site embeds it in a quoted string.
      expect(sel).toBe('[data-testid=\\"save\\"]');
      expect(sel).toContain('data-testid');
    });

    it('falls back to id when no data-testid', () => {
      const sel = base.generateSelector({ id: 'the-id', selector: '.raw', attributes: {} });
      expect(sel).toBe('#the-id');
    });

    it('falls back to the raw selector when neither testid nor id present', () => {
      const sel = base.generateSelector({ selector: '.raw-class', attributes: {} });
      expect(sel).toBe('.raw-class');
    });
  });

  describe('iframe switching', () => {
    const iframeClick = clickAction({ iframe: { id: 'checkout-frame' } });

    it('Playwright scopes into the frame with frameLocator', () => {
      const script = gen.generateScript([iframeClick], 'playwright', {});
      expect(script).toContain("frameLocator('#checkout-frame')");
    });

    it('Selenium Java switches into and back out of the frame', () => {
      const script = gen.generateScript([iframeClick], 'selenium', { language: 'java' });
      expect(script).toContain('switchTo().frame(');
      expect(script).toContain('defaultContent()');
    });

    it('Selenium Python switches into the frame', () => {
      const script = gen.generateScript([iframeClick], 'selenium', { language: 'python' });
      expect(script).toContain('switch_to.frame(');
    });

    it('Cypress resolves the element through cy.iframe()', () => {
      const script = gen.generateScript([iframeClick], 'cypress', {});
      expect(script).toContain("cy.frameLoaded('#checkout-frame')");
      expect(script).toContain("cy.iframe('#checkout-frame').find('#submit-btn').click()");
    });

    it('Puppeteer resolves the frame via contentFrame() and acts on it', () => {
      const script = gen.generateScript([iframeClick], 'puppeteer', {});
      expect(script).toContain("await page.$('#checkout-frame')");
      expect(script).toContain('contentFrame()');
      expect(script).toContain("await frame.click('#submit-btn')");
    });
  });

  describe('repeated elements do not collide (no duplicate declarations)', () => {
    const twoInputs = [
      inputAction('first', { target: { tagName: 'input', type: 'text', id: 'a', name: 'a', selector: '#a', attributes: {} } }),
      inputAction('second', { target: { tagName: 'input', type: 'text', id: 'b', name: 'b', selector: '#b', attributes: {} } })
    ];

    it('Selenium Java uses distinct variable names for two inputs', () => {
      const s = gen.generateScript(twoInputs, 'selenium', { language: 'java' });
      const decls = (s.match(/WebElement inputElement\S* =/g) || []);
      const names = decls.map(d => d.split(' ')[1]);
      expect(new Set(names).size).toBe(names.length); // all unique
      expect(names.length).toBe(2);
    });

    it('Selenium JS uses distinct const names for two inputs', () => {
      const s = gen.generateScript(twoInputs, 'selenium', { language: 'javascript' });
      const names = (s.match(/const (inputElement\S*) =/g) || []).map(d => d.split(' ')[1]);
      expect(new Set(names).size).toBe(names.length);
      expect(names.length).toBe(2);
    });

    it('Selenium C# uses distinct var names for two inputs', () => {
      const s = gen.generateScript(twoInputs, 'selenium', { language: 'csharp' });
      const names = (s.match(/var (inputElement\S*) =/g) || []).map(d => d.split(' ')[1]);
      expect(new Set(names).size).toBe(names.length);
      expect(names.length).toBe(2);
    });
  });

  describe('secret masking across all Selenium languages', () => {
    const pwd = inputAction('topsecret', { target: { tagName: 'input', type: 'password', id: 'p', name: 'password', selector: '#p', attributes: {} } });
    it.each(['java', 'python', 'csharp', 'javascript'])('never emits the raw secret (%s)', (language) => {
      const s = gen.generateScript([pwd], 'selenium', { language });
      expect(s).not.toContain('topsecret');
      expect(s).toMatch(/TEST_PASSWORD/);
    });
  });

  describe('initial navigation is not duplicated', () => {
    it.each([
      ['playwright', 'javascript'],
      ['selenium', 'java'],
      ['cypress', 'javascript'],
      ['puppeteer', 'javascript']
    ])('%s emits the start URL exactly once', (framework, language) => {
      const flow = [navigateAction('https://start.example.com'), clickAction()];
      const s = gen.generateScript(flow, framework, { language });
      const count = (s.match(/https:\/\/start\.example\.com/g) || []).length;
      expect(count).toBe(1);
    });
  });

  describe('Selenium Java correctness', () => {
    it('uses Duration.ofSeconds for WebDriverWait', () => {
      const script = gen.generateScript([clickAction()], 'selenium', { language: 'java' });
      expect(script).toContain('Duration.ofSeconds');
      expect(script).toContain('import java.time.Duration;');
    });
  });
});
