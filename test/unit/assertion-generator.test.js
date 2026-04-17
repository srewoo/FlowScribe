const AssertionGenerator = require('../../src/utils/assertion-generator');

// Mock DOM element helper
function mockElement(overrides = {}) {
  const el = {
    tagName: 'INPUT',
    type: 'text',
    id: '',
    className: '',
    required: false,
    pattern: '',
    list: null,
    outerHTML: '<input />',
    parentNode: null,
    classList: { contains: jest.fn(() => false) },
    getAttribute: jest.fn((attr) => {
      const attrs = overrides.dataAttributes || {};
      return attrs[attr] || null;
    }),
    closest: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    ...overrides
  };
  // Build a reasonable outerHTML if tagName is overridden
  if (!overrides.outerHTML) {
    el.outerHTML = `<${(el.tagName || 'div').toLowerCase()} />`;
  }
  return el;
}

describe('AssertionGenerator', () => {
  let generator;

  beforeEach(() => {
    // Mock document APIs used by assertion-generator
    global.document = {
      body: { tagName: 'BODY' },
      querySelectorAll: jest.fn(() => [{}]), // returns one element = unique
      querySelector: jest.fn(() => null)
    };

    generator = new AssertionGenerator();
  });

  // --- generateAssertion ---

  describe('generateAssertion', () => {
    test('returns array of assertions', () => {
      const element = mockElement({ id: 'btn' });
      const action = { type: 'click', element };
      const result = generator.generateAssertion(action, element, {});
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    test('prepends visibility assertion when element is provided', () => {
      const element = mockElement({ id: 'btn' });
      const action = { type: 'click', element };
      const result = generator.generateAssertion(action, element, {});
      expect(result[0].type).toBe('visible');
    });

    test('does not add visibility assertion when element is null', () => {
      const action = { type: 'navigate' };
      const result = generator.generateAssertion(action, null, { url: 'https://example.com' });
      const visAssert = result.find(a => a.type === 'visible');
      expect(visAssert).toBeUndefined();
    });

    test('generates click assertions for click action', () => {
      const element = mockElement({ tagName: 'BUTTON', id: 'submit' });
      const action = { type: 'click', element };
      const result = generator.generateAssertion(action, element, {});
      const enabledAssert = result.find(a => a.type === 'enabled');
      expect(enabledAssert).toBeDefined();
    });

    test('generates input assertions for input action', () => {
      const element = mockElement({ id: 'email' });
      const action = { type: 'input', value: 'test@test.com', element };
      const result = generator.generateAssertion(action, element, {});
      const valueAssert = result.find(a => a.type === 'value');
      expect(valueAssert).toBeDefined();
      expect(valueAssert.expected).toBe('test@test.com');
    });

    test('generates navigation assertions for navigate action', () => {
      const action = { type: 'navigate' };
      const context = { url: 'https://example.com/dashboard', title: 'Dashboard' };
      const result = generator.generateAssertion(action, null, context);
      const urlAssert = result.find(a => a.type === 'url');
      expect(urlAssert).toBeDefined();
      expect(urlAssert.pattern).toBe('https://example.com/dashboard');
    });
  });

  // --- generateClickAssertions ---

  describe('generateClickAssertions', () => {
    test('always includes enabled check', () => {
      const el = mockElement({ tagName: 'BUTTON', id: 'btn' });
      const result = generator.generateClickAssertions(el, {});
      expect(result[0].type).toBe('enabled');
    });

    test('adds url_change for anchor elements', () => {
      const el = mockElement({ tagName: 'A', id: 'link' });
      const result = generator.generateClickAssertions(el, {});
      const navAssert = result.find(a => a.type === 'url_change');
      expect(navAssert).toBeDefined();
    });

    test('adds url_change for submit type', () => {
      const el = mockElement({ tagName: 'BUTTON', type: 'submit', id: 'sub' });
      const result = generator.generateClickAssertions(el, {});
      const navAssert = result.find(a => a.type === 'url_change');
      expect(navAssert).toBeDefined();
    });
  });

  // --- generateInputAssertions ---

  describe('generateInputAssertions', () => {
    test('always includes value assertion', () => {
      const el = mockElement({ id: 'name' });
      const result = generator.generateInputAssertions(el, 'John', {});
      expect(result[0].type).toBe('value');
      expect(result[0].expected).toBe('John');
    });

    test('includes validation assertion for required fields', () => {
      const el = mockElement({ id: 'email', required: true });
      const result = generator.generateInputAssertions(el, 'test@test.com', {});
      const validAssert = result.find(a => a.type === 'validation');
      expect(validAssert).toBeDefined();
    });

    test('includes validation assertion for fields with pattern', () => {
      const el = mockElement({ id: 'zip', pattern: '\\d{5}' });
      const result = generator.generateInputAssertions(el, '12345', {});
      const validAssert = result.find(a => a.type === 'validation');
      expect(validAssert).toBeDefined();
    });
  });

  // --- getSelector ---

  describe('getSelector', () => {
    test('returns id selector when element has id', () => {
      const el = mockElement({ id: 'my-id' });
      const selector = generator.getSelector(el);
      expect(selector).toBe('#my-id');
    });

    test('returns data-testid selector', () => {
      const el = mockElement({
        dataAttributes: { 'data-testid': 'login-btn' },
        getAttribute: jest.fn((attr) => attr === 'data-testid' ? 'login-btn' : null)
      });
      const selector = generator.getSelector(el);
      expect(selector).toBe('[data-testid="login-btn"]');
    });

    test('returns aria-label selector', () => {
      const el = mockElement({
        dataAttributes: { 'aria-label': 'Close' },
        getAttribute: jest.fn((attr) => attr === 'aria-label' ? 'Close' : null)
      });
      const selector = generator.getSelector(el);
      expect(selector).toBe('[aria-label="Close"]');
    });
  });
});
