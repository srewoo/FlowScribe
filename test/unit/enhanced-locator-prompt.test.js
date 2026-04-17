const { EnhancedLocatorPromptGenerator } = require('../../src/ai/prompt-templates/enhanced-locator-prompt');

describe('EnhancedLocatorPromptGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new EnhancedLocatorPromptGenerator();
  });

  // --- optimizeActionSequence ---

  describe('optimizeActionSequence', () => {
    test('returns empty array for null input', () => {
      expect(generator.optimizeActionSequence(null)).toEqual([]);
    });

    test('returns empty array for non-array input', () => {
      expect(generator.optimizeActionSequence('not-an-array')).toEqual([]);
    });

    test('keeps meaningful click actions', () => {
      const actions = [
        { type: 'click', timestamp: 1000, element: { cssSelector: '#btn' } }
      ];
      const result = generator.optimizeActionSequence(actions);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('click');
    });

    test('filters out noise events like mouseover and blur', () => {
      const actions = [
        { type: 'mouseover', timestamp: 1000, element: {} },
        { type: 'blur', timestamp: 1100, element: {} },
        { type: 'focus', timestamp: 1200, element: {} },
        { type: 'click', timestamp: 1300, element: { cssSelector: '#btn' } }
      ];
      const result = generator.optimizeActionSequence(actions);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('click');
    });

    test('removes rapid duplicate actions on same element', () => {
      const actions = [
        { type: 'click', timestamp: 1000, element: { cssSelector: '#btn' } },
        { type: 'click', timestamp: 1100, element: { cssSelector: '#btn' } } // <500ms later
      ];
      const result = generator.optimizeActionSequence(actions);
      expect(result.length).toBe(1);
    });

    test('keeps duplicate actions separated by >500ms', () => {
      const actions = [
        { type: 'click', timestamp: 1000, element: { cssSelector: '#btn' } },
        { type: 'click', timestamp: 2000, element: { cssSelector: '#btn' } } // >500ms later
      ];
      const result = generator.optimizeActionSequence(actions);
      expect(result.length).toBe(2);
    });
  });

  // --- isSignificantPageChange ---

  describe('isSignificantPageChange', () => {
    test('returns true when lastUrl is empty', () => {
      expect(generator.isSignificantPageChange('https://example.com', '')).toBe(true);
    });

    test('returns true for different domains', () => {
      expect(generator.isSignificantPageChange('https://b.com/path', 'https://a.com/path')).toBe(true);
    });

    test('returns true for different paths', () => {
      expect(generator.isSignificantPageChange('https://a.com/login', 'https://a.com/dashboard')).toBe(true);
    });

    test('returns false for same path with different query params', () => {
      expect(generator.isSignificantPageChange('https://a.com/page?a=1', 'https://a.com/page?b=2')).toBe(false);
    });

    test('returns false for same path with different hash', () => {
      expect(generator.isSignificantPageChange('https://a.com/page#one', 'https://a.com/page#two')).toBe(false);
    });

    test('returns true for invalid URLs', () => {
      expect(generator.isSignificantPageChange('not-a-url', 'https://a.com')).toBe(true);
    });
  });

  // --- isDuplicateAction ---

  describe('isDuplicateAction', () => {
    test('returns false when lastAction is null', () => {
      expect(generator.isDuplicateAction({ type: 'click' }, null, 0)).toBe(false);
    });

    test('returns true for same type, same element, within 500ms', () => {
      const action = { type: 'click', timestamp: 1200, element: { cssSelector: '#btn' } };
      const last = { type: 'click', element: { cssSelector: '#btn' } };
      expect(generator.isDuplicateAction(action, last, 1000)).toBe(true);
    });

    test('returns false for different element selectors', () => {
      const action = { type: 'click', timestamp: 1200, element: { cssSelector: '#btn2' } };
      const last = { type: 'click', element: { cssSelector: '#btn1' } };
      expect(generator.isDuplicateAction(action, last, 1000)).toBe(false);
    });

    test('returns false for different action types', () => {
      const action = { type: 'input', timestamp: 1200, element: { cssSelector: '#field' } };
      const last = { type: 'click', element: { cssSelector: '#field' } };
      expect(generator.isDuplicateAction(action, last, 1000)).toBe(false);
    });
  });

  // --- isMeaningfulAction ---

  describe('isMeaningfulAction', () => {
    test('returns true for click', () => {
      expect(generator.isMeaningfulAction({ type: 'click' })).toBe(true);
    });

    test('returns true for input', () => {
      expect(generator.isMeaningfulAction({ type: 'input' })).toBe(true);
    });

    test('returns true for submit', () => {
      expect(generator.isMeaningfulAction({ type: 'submit' })).toBe(true);
    });

    test('returns false for mouseover', () => {
      expect(generator.isMeaningfulAction({ type: 'mouseover' })).toBe(false);
    });

    test('returns false for blur', () => {
      expect(generator.isMeaningfulAction({ type: 'blur' })).toBe(false);
    });

    test('returns false for focus', () => {
      expect(generator.isMeaningfulAction({ type: 'focus' })).toBe(false);
    });

    test('returns false for mouseout', () => {
      expect(generator.isMeaningfulAction({ type: 'mouseout' })).toBe(false);
    });
  });

  // --- analyzePageStructure ---

  describe('analyzePageStructure', () => {
    test('returns empty array for null input', () => {
      expect(generator.analyzePageStructure(null)).toEqual([]);
    });

    test('groups actions by URL', () => {
      const actions = [
        { url: 'https://a.com/login', type: 'click', element: { tagName: 'BUTTON' } },
        { url: 'https://a.com/login', type: 'input', element: { tagName: 'INPUT' } },
        { url: 'https://a.com/dashboard', type: 'click', element: { tagName: 'A' } }
      ];
      const result = generator.analyzePageStructure(actions);
      expect(result.length).toBe(2);
      expect(result[0].url).toBe('https://a.com/login');
      expect(result[0].interactions.length).toBe(2);
      expect(result[1].url).toBe('https://a.com/dashboard');
    });

    test('detects form elements', () => {
      const actions = [
        { url: 'https://a.com', type: 'input', element: { tagName: 'INPUT', type: 'text' } }
      ];
      const result = generator.analyzePageStructure(actions);
      expect(result[0].elements[0].isFormElement).toBe(true);
    });

    test('detects modal interactions', () => {
      const actions = [
        { url: 'https://a.com', type: 'click', element: { tagName: 'BUTTON', className: 'modal-trigger' } }
      ];
      const result = generator.analyzePageStructure(actions);
      expect(result[0].modals).toBe(true);
    });
  });

  // --- extractUserJourney ---

  describe('extractUserJourney', () => {
    test('returns empty array for null input', () => {
      expect(generator.extractUserJourney(null)).toEqual([]);
    });

    test('creates navigation steps on URL change', () => {
      const actions = [
        { url: 'https://a.com/login', type: 'click', element: { tagName: 'BUTTON' } },
        { url: 'https://a.com/dashboard', type: 'click', element: { tagName: 'A' } }
      ];
      const result = generator.extractUserJourney(actions);
      const navSteps = result.filter(s => s.type === 'navigation');
      expect(navSteps.length).toBe(2); // two different URLs
    });

    test('numbers steps sequentially', () => {
      const actions = [
        { url: 'https://a.com', type: 'click', timestamp: 1000, element: { tagName: 'BUTTON', textContent: 'Go' } }
      ];
      const result = generator.extractUserJourney(actions);
      expect(result[0].step).toBe(1);
      if (result.length > 1) {
        expect(result[1].step).toBe(2);
      }
    });
  });

  // --- generateLocatorStrategies ---

  describe('generateLocatorStrategies', () => {
    test('returns data-testid strategy with priority 100', () => {
      const el = { tagName: 'BUTTON', attributes: { 'data-testid': 'submit-btn' } };
      const strategies = generator.generateLocatorStrategies(el);
      expect(strategies[0]).toEqual(expect.objectContaining({
        type: 'data-testid',
        priority: 100,
        stability: 95
      }));
    });

    test('returns id strategy with priority 90', () => {
      const el = { id: 'main-header', tagName: 'H1', attributes: {} };
      const strategies = generator.generateLocatorStrategies(el);
      expect(strategies).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'unique-id', selector: '#main-header', priority: 90 })
      ]));
    });

    test('excludes auto-generated ids', () => {
      const el = { id: 'generated_abc123', tagName: 'DIV', attributes: {} };
      const strategies = generator.generateLocatorStrategies(el);
      expect(strategies.find(s => s.type === 'unique-id')).toBeUndefined();
    });

    test('includes aria-label strategy', () => {
      const el = { tagName: 'BUTTON', attributes: { 'aria-label': 'Close' } };
      const strategies = generator.generateLocatorStrategies(el);
      expect(strategies).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'aria-label', priority: 85 })
      ]));
    });

    test('includes name strategy for form elements', () => {
      const el = { tagName: 'INPUT', name: 'email', attributes: {} };
      const strategies = generator.generateLocatorStrategies(el);
      expect(strategies).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'name-attribute', priority: 80 })
      ]));
    });
  });
});
