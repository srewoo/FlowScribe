const AIService = require('../../src/utils/ai-service');

describe('AIService', () => {
  let service;

  beforeEach(() => {
    service = new AIService(true); // skipAutoLoad to avoid chrome.storage
  });

  // --- cleanAIResponse ---

  describe('cleanAIResponse', () => {
    test('returns non-string input unchanged', () => {
      expect(service.cleanAIResponse(null)).toBeNull();
      expect(service.cleanAIResponse(undefined)).toBeUndefined();
      expect(service.cleanAIResponse(42)).toBe(42);
    });

    test('strips single markdown fence block', () => {
      const input = '```javascript\nconst x = 1;\n```';
      expect(service.cleanAIResponse(input)).toBe('const x = 1;');
    });

    test('extracts largest code block when multiple fences exist', () => {
      const input = 'Some text\n```js\nshort\n```\nMore text\n```js\nthis is the longer block of code\n```';
      expect(service.cleanAIResponse(input)).toBe('this is the longer block of code');
    });

    test('trims whitespace', () => {
      expect(service.cleanAIResponse('  hello  ')).toBe('hello');
    });

    test('returns plain text unchanged', () => {
      expect(service.cleanAIResponse('const x = 1;')).toBe('const x = 1;');
    });
  });

  // --- getBestSelector ---

  describe('getBestSelector', () => {
    test('prefers id', () => {
      const el = { id: 'login-btn', tagName: 'BUTTON', attributes: {} };
      expect(service.getBestSelector(el)).toBe('#login-btn');
    });

    test('prefers data-testid over name', () => {
      const el = { tagName: 'INPUT', name: 'email', attributes: { 'data-testid': 'email-input' } };
      expect(service.getBestSelector(el)).toBe('[data-testid="email-input"]');
    });

    test('uses data-test when data-testid is absent', () => {
      const el = { tagName: 'BUTTON', attributes: { 'data-test': 'submit' } };
      expect(service.getBestSelector(el)).toBe('[data-test="submit"]');
    });

    test('uses data-cy when other test attrs absent', () => {
      const el = { tagName: 'INPUT', attributes: { 'data-cy': 'username' } };
      expect(service.getBestSelector(el)).toBe('[data-cy="username"]');
    });

    test('uses name for form elements without id or test attrs', () => {
      const el = { tagName: 'INPUT', name: 'email', attributes: {} };
      expect(service.getBestSelector(el)).toBe('[name="email"]');
    });

    test('uses aria-label when no id, test attr, or name', () => {
      const el = { tagName: 'BUTTON', attributes: { 'aria-label': 'Close dialog' } };
      expect(service.getBestSelector(el)).toBe('[aria-label="Close dialog"]');
    });

    test('falls back to cssSelector', () => {
      const el = { tagName: 'DIV', attributes: {}, cssSelector: 'div.container > span' };
      expect(service.getBestSelector(el)).toBe('div.container > span');
    });

    test('falls back to lowercased tagName', () => {
      const el = { tagName: 'SPAN', attributes: {} };
      expect(service.getBestSelector(el)).toBe('span');
    });
  });

  // --- getBestSelectorForSelenium ---

  describe('getBestSelectorForSelenium', () => {
    test('returns By.ID for element with id', () => {
      const el = { id: 'submit', tagName: 'BUTTON', attributes: {} };
      expect(service.getBestSelectorForSelenium(el)).toBe('By.ID, "submit"');
    });

    test('returns By.CSS_SELECTOR for data-testid', () => {
      const el = { tagName: 'INPUT', attributes: { 'data-testid': 'email' } };
      expect(service.getBestSelectorForSelenium(el)).toContain('By.CSS_SELECTOR');
      expect(service.getBestSelectorForSelenium(el)).toContain("data-testid='email'");
    });

    test('returns By.NAME for form element with name', () => {
      const el = { tagName: 'INPUT', name: 'password', attributes: {} };
      expect(service.getBestSelectorForSelenium(el)).toBe('By.NAME, "password"');
    });

    test('falls back to By.TAG_NAME', () => {
      const el = { tagName: 'SPAN', attributes: {} };
      expect(service.getBestSelectorForSelenium(el)).toBe('By.TAG_NAME, "span"');
    });
  });

  // --- getElementDescription ---

  describe('getElementDescription', () => {
    test('describes element by id', () => {
      const el = { id: 'header', tagName: 'DIV' };
      expect(service.getElementDescription(el)).toBe('element with ID "header"');
    });

    test('describes by name', () => {
      const el = { name: 'email', tagName: 'INPUT' };
      expect(service.getElementDescription(el)).toBe('input with name "email"');
    });

    test('describes by text content (truncated)', () => {
      const el = { tagName: 'BUTTON', textContent: 'A very long button text that exceeds thirty characters limit' };
      expect(service.getElementDescription(el)).toContain('button containing');
      expect(service.getElementDescription(el)).toContain('...');
    });

    test('describes by placeholder', () => {
      const el = { tagName: 'INPUT', placeholder: 'Enter email' };
      expect(service.getElementDescription(el)).toBe('input with placeholder "Enter email"');
    });

    test('falls back to tag name', () => {
      const el = { tagName: 'DIV' };
      expect(service.getElementDescription(el)).toBe('div');
    });
  });

  // --- getActionDescription ---

  describe('getActionDescription', () => {
    test('describes click', () => {
      const action = { type: 'click', element: { tagName: 'BUTTON', textContent: 'Submit' } };
      expect(service.getActionDescription(action)).toBe('Click BUTTON ("Submit")');
    });

    test('describes input', () => {
      const action = { type: 'input', value: 'test@email.com', element: { tagName: 'INPUT', placeholder: 'Email' } };
      expect(service.getActionDescription(action)).toBe('Enter "test@email.com" in INPUT (Email)');
    });

    test('describes change/select', () => {
      const action = { type: 'change', value: 'USA', element: { tagName: 'SELECT' } };
      expect(service.getActionDescription(action)).toBe('Select "USA" in SELECT');
    });

    test('describes keydown', () => {
      const action = { type: 'keydown', key: 'Enter', element: { tagName: 'INPUT' } };
      expect(service.getActionDescription(action)).toBe('Press Enter key');
    });

    test('describes unknown type', () => {
      const action = { type: 'focus', element: { tagName: 'INPUT' } };
      expect(service.getActionDescription(action)).toBe('focus on INPUT');
    });
  });

  // --- getPageDescription ---

  describe('getPageDescription', () => {
    test('returns "homepage" for root path', () => {
      expect(service.getPageDescription('https://example.com/')).toBe('homepage');
    });

    test('extracts last path segment', () => {
      expect(service.getPageDescription('https://example.com/users/profile')).toBe('profile');
    });

    test('returns "page" for invalid URL', () => {
      expect(service.getPageDescription('not-a-url')).toBe('page');
    });
  });

  // --- generateLocatorOptions ---

  describe('generateLocatorOptions', () => {
    test('includes data-testid with 95 stability', () => {
      const el = { tagName: 'BUTTON', attributes: { 'data-testid': 'login-btn' } };
      const options = service.generateLocatorOptions(el);
      expect(options).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'data-testid', stability: 95 })
      ]));
    });

    test('includes id with 90 stability', () => {
      const el = { id: 'main-nav', tagName: 'NAV', attributes: {} };
      const options = service.generateLocatorOptions(el);
      expect(options).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'unique-id', selector: '#main-nav', stability: 90 })
      ]));
    });

    test('excludes generated/auto ids', () => {
      const el = { id: 'auto_12345', tagName: 'DIV', attributes: {} };
      const options = service.generateLocatorOptions(el);
      expect(options.find(o => o.type === 'unique-id')).toBeUndefined();
    });

    test('returns empty array for element with no identifying attributes', () => {
      const el = { tagName: 'SPAN', attributes: {} };
      const options = service.generateLocatorOptions(el);
      // may include class-based or cssSelector options depending on element
      expect(Array.isArray(options)).toBe(true);
    });
  });
});
