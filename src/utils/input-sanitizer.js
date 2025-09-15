// FlowScribe Input Sanitizer
class InputSanitizer {
  sanitizeJavaScript(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[\\\"'\n\r\t]/g, (s) => ({
      '\\': '\\\\', '"': '\\"', "'": "\\'", '\n': '\\n', '\r': '\\r', '\t': '\\t'
    })[s] || s);
  }

  sanitizeSelector(selector) {
    return typeof selector === 'string' ? selector.replace(/[<>"'`]/g, '').trim() : '';
  }

  validateMessageData(data) {
    if (!data || typeof data !== 'object') return {};
    const validated = {};
    
    if (data.framework) {
      const valid = ['playwright', 'selenium', 'cypress', 'puppeteer'];
      validated.framework = valid.includes(data.framework) ? data.framework : 'playwright';
    }
    
    if (data.actions && Array.isArray(data.actions)) {
      validated.actions = data.actions.filter(a => a && typeof a === 'object');
    }
    
    return validated;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = InputSanitizer;
else if (typeof window !== 'undefined') window.InputSanitizer = InputSanitizer;
else self.InputSanitizer = InputSanitizer;
