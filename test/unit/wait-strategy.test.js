const { WaitStrategyEngine } = require('../../src/utils/wait-strategy');

describe('WaitStrategyEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new WaitStrategyEngine();
  });

  // --- getActionTypeStrategy ---

  describe('getActionTypeStrategy', () => {
    test('returns composite strategy for click', () => {
      const result = engine.getActionTypeStrategy({ type: 'click', target: { selector: '#btn' } });
      expect(result.type).toBe('composite');
      expect(result.waits).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'element_clickable' })
      ]));
    });

    test('returns composite strategy for input', () => {
      const result = engine.getActionTypeStrategy({ type: 'input', target: { selector: '#field' } });
      expect(result.type).toBe('composite');
      expect(result.waits).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'element_enabled' })
      ]));
    });

    test('returns page_load strategy for navigate', () => {
      const result = engine.getActionTypeStrategy({ type: 'navigate' });
      expect(result.type).toBe('page_load');
      expect(result.timeout).toBe(30000);
    });

    test('returns composite strategy for submit', () => {
      const result = engine.getActionTypeStrategy({ type: 'submit', target: { selector: '#form' } });
      expect(result.type).toBe('composite');
      expect(result.waits).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'form_valid' })
      ]));
    });

    test('returns undefined for unknown action type', () => {
      expect(engine.getActionTypeStrategy({ type: 'unknown' })).toBeUndefined();
    });

    test('returns element_visible for hover', () => {
      const result = engine.getActionTypeStrategy({ type: 'hover', target: { selector: '.tooltip' } });
      expect(result.type).toBe('element_visible');
    });

    test('returns composite for scroll with lazy_load_complete', () => {
      const result = engine.getActionTypeStrategy({ type: 'scroll' });
      expect(result.type).toBe('composite');
      expect(result.waits).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'lazy_load_complete', optional: true })
      ]));
    });
  });

  // --- isDynamicElement ---

  describe('isDynamicElement', () => {
    test('returns true for data-dynamic attribute', () => {
      expect(engine.isDynamicElement({ attributes: { 'data-dynamic': 'true' } })).toBeTruthy();
    });

    test('returns true for dynamic class', () => {
      expect(engine.isDynamicElement({ className: 'content dynamic-widget' })).toBeTruthy();
    });

    test('returns true for v-if attribute (Vue)', () => {
      expect(engine.isDynamicElement({ attributes: { 'v-if': 'isVisible' } })).toBeTruthy();
    });

    test('returns true for ng-if attribute (Angular)', () => {
      expect(engine.isDynamicElement({ attributes: { 'ng-if': 'show' } })).toBeTruthy();
    });

    test('returns true for *ngIf attribute (Angular)', () => {
      expect(engine.isDynamicElement({ attributes: { '*ngIf': 'show' } })).toBeTruthy();
    });

    test('returns falsy for normal element', () => {
      expect(engine.isDynamicElement({ attributes: {}, className: 'static-content' })).toBeFalsy();
    });
  });

  // --- isFormElement ---

  describe('isFormElement', () => {
    test('returns true for input', () => {
      expect(engine.isFormElement({ tagName: 'input' })).toBe(true);
    });

    test('returns true for INPUT (case insensitive)', () => {
      expect(engine.isFormElement({ tagName: 'INPUT' })).toBe(true);
    });

    test('returns true for select', () => {
      expect(engine.isFormElement({ tagName: 'SELECT' })).toBe(true);
    });

    test('returns true for textarea', () => {
      expect(engine.isFormElement({ tagName: 'TEXTAREA' })).toBe(true);
    });

    test('returns true for form', () => {
      expect(engine.isFormElement({ tagName: 'form' })).toBe(true);
    });

    test('returns false for div', () => {
      expect(engine.isFormElement({ tagName: 'DIV' })).toBe(false);
    });

    test('returns false for empty tagName', () => {
      expect(engine.isFormElement({ tagName: '' })).toBe(false);
    });

    test('returns false when tagName is undefined', () => {
      expect(engine.isFormElement({})).toBe(false);
    });
  });

  // --- calculateSmartTimeout ---

  describe('calculateSmartTimeout', () => {
    test('returns 5000 for element_exists', () => {
      expect(engine.calculateSmartTimeout({ type: 'element_exists' })).toBe(5000);
    });

    test('returns 30000 for page_load', () => {
      expect(engine.calculateSmartTimeout({ type: 'page_load' })).toBe(30000);
    });

    test('returns 10000 for network_idle', () => {
      expect(engine.calculateSmartTimeout({ type: 'network_idle' })).toBe(10000);
    });

    test('returns 2000 for element_stable', () => {
      expect(engine.calculateSmartTimeout({ type: 'element_stable' })).toBe(2000);
    });

    test('returns 3000 for animation_complete', () => {
      expect(engine.calculateSmartTimeout({ type: 'animation_complete' })).toBe(3000);
    });

    test('returns default 5000 for unknown type', () => {
      expect(engine.calculateSmartTimeout({ type: 'custom_thing' })).toBe(5000);
    });
  });

  // --- getElementStrategy ---

  describe('getElementStrategy', () => {
    test('returns null for null target', () => {
      expect(engine.getElementStrategy(null)).toBeNull();
    });

    test('returns composite with dynamic wait for dynamic element', () => {
      const target = { selector: '#widget', attributes: { 'data-dynamic': 'true' } };
      const result = engine.getElementStrategy(target);
      expect(result.type).toBe('composite');
      expect(result.waits).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'element_stable' })
      ]));
    });

    test('returns composite with form_ready for form element', () => {
      const target = { selector: '#email', tagName: 'input', attributes: {} };
      const result = engine.getElementStrategy(target);
      expect(result.type).toBe('composite');
      expect(result.waits).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'form_ready' })
      ]));
    });

    test('returns null for plain element with no special attributes', () => {
      const target = {
        selector: '#plain', tagName: 'div', attributes: {}, className: 'box',
        styles: { animation: 'none', transition: 'none' }
      };
      const result = engine.getElementStrategy(target);
      expect(result).toBeNull();
    });
  });
});
