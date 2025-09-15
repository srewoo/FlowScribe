/**
 * Intelligent Locator Generator
 * Creates the best possible locators using CSS, XPath, ID, class names, and attribute combinations
 */
class IntelligentLocatorGenerator {
  constructor() {
    this.locatorStrategies = [
      { name: 'dataTestId', priority: 100, stability: 95 },
      { name: 'uniqueId', priority: 90, stability: 90 },
      { name: 'stableAttributes', priority: 85, stability: 85 },
      { name: 'semanticCombination', priority: 80, stability: 80 },
      { name: 'stableClassName', priority: 75, stability: 75 },
      { name: 'uniqueXPath', priority: 70, stability: 70 },
      { name: 'textContent', priority: 65, stability: 60 },
      { name: 'positionalXPath', priority: 50, stability: 40 },
      { name: 'fallbackCSS', priority: 30, stability: 30 }
    ];
    
    this.stableAttributes = [
      'data-testid', 'data-test', 'data-cy', 'data-qa', 'data-id',
      'id', 'name', 'aria-label', 'aria-labelledby', 'role',
      'type', 'placeholder', 'title', 'alt'
    ];
    
    this.unstableAttributes = [
      'style', 'class', 'onclick', 'onchange', 'onfocus', 'onblur'
    ];
    
    this.semanticTags = [
      'button', 'input', 'select', 'textarea', 'a', 'form',
      'nav', 'header', 'footer', 'main', 'section', 'article'
    ];
  }

  /**
   * Generate multiple locator strategies for an element
   */
  generateLocators(element, context = {}) {
    const locators = [];
    
    // Generate all possible locators
    for (const strategy of this.locatorStrategies) {
      try {
        const locator = this.generateLocatorByStrategy(element, strategy.name, context);
        if (locator) {
          locators.push({
            ...locator,
            strategy: strategy.name,
            priority: strategy.priority,
            stability: strategy.stability,
            confidence: this.calculateConfidence(element, locator)
          });
        }
      } catch (error) {
        console.warn(`Failed to generate ${strategy.name} locator:`, error);
      }
    }
    
    // Sort by priority and confidence
    locators.sort((a, b) => {
      const scoreA = (a.priority * 0.6) + (a.confidence * 0.4);
      const scoreB = (b.priority * 0.6) + (b.confidence * 0.4);
      return scoreB - scoreA;
    });
    
    return {
      primary: locators[0] || this.generateFallbackLocator(element),
      alternatives: locators.slice(1, 5), // Top 5 alternatives
      all: locators
    };
  }

  /**
   * Generate locator using specific strategy
   */
  generateLocatorByStrategy(element, strategy, context) {
    switch (strategy) {
      case 'dataTestId':
        return this.generateDataTestIdLocator(element);
      case 'uniqueId':
        return this.generateUniqueIdLocator(element);
      case 'stableAttributes':
        return this.generateStableAttributeLocator(element);
      case 'semanticCombination':
        return this.generateSemanticCombinationLocator(element, context);
      case 'stableClassName':
        return this.generateStableClassLocator(element);
      case 'uniqueXPath':
        return this.generateUniqueXPathLocator(element);
      case 'textContent':
        return this.generateTextContentLocator(element);
      case 'positionalXPath':
        return this.generatePositionalXPathLocator(element);
      case 'fallbackCSS':
        return this.generateFallbackCSSLocator(element);
      default:
        return null;
    }
  }

  /**
   * Data test ID locator (highest priority)
   */
  generateDataTestIdLocator(element) {
    const testAttributes = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
    
    for (const attr of testAttributes) {
      const value = element.getAttribute(attr);
      if (value) {
        return {
          type: 'css',
          selector: `[${attr}="${value}"]`,
          xpath: `//*[@${attr}="${value}"]`,
          description: `Element with ${attr}="${value}"`,
          reliability: 95
        };
      }
    }
    return null;
  }

  /**
   * Unique ID locator
   */
  generateUniqueIdLocator(element) {
    const id = element.getAttribute('id');
    if (id && this.isUniqueId(id, element)) {
      return {
        type: 'css',
        selector: `#${CSS.escape(id)}`,
        xpath: `//*[@id="${id}"]`,
        description: `Element with unique ID "${id}"`,
        reliability: 90
      };
    }
    return null;
  }

  /**
   * Stable attribute combination locator
   */
  generateStableAttributeLocator(element) {
    const stableAttrs = [];
    
    for (const attr of this.stableAttributes) {
      const value = element.getAttribute(attr);
      if (value && !this.isGenericValue(value)) {
        stableAttrs.push({ attr, value });
      }
    }
    
    if (stableAttrs.length > 0) {
      // Use most specific combination
      const primary = stableAttrs[0];
      const cssSelector = `[${primary.attr}="${CSS.escape(primary.value)}"]`;
      const xpath = `//*[@${primary.attr}="${primary.value}"]`;
      
      // Add tag name for better specificity
      const tagName = element.tagName.toLowerCase();
      const enhancedCSS = `${tagName}${cssSelector}`;
      const enhancedXPath = `//${tagName}[@${primary.attr}="${primary.value}"]`;
      
      return {
        type: 'css',
        selector: enhancedCSS,
        xpath: enhancedXPath,
        description: `${tagName} element with ${primary.attr}="${primary.value}"`,
        reliability: 85,
        attributes: stableAttrs
      };
    }
    return null;
  }

  /**
   * Semantic combination locator (tag + role + text)
   */
  generateSemanticCombinationLocator(element, context) {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute('role');
    const ariaLabel = element.getAttribute('aria-label');
    const text = element.textContent?.trim().slice(0, 50);
    
    if (this.semanticTags.includes(tagName)) {
      const selectors = [];
      let description = tagName;
      
      // Build progressive selector
      let cssSelector = tagName;
      let xpathSelector = `//${tagName}`;
      
      // Add role if present
      if (role) {
        cssSelector += `[role="${role}"]`;
        xpathSelector += `[@role="${role}"]`;
        description += ` with role "${role}"`;
      }
      
      // Add aria-label if present
      if (ariaLabel) {
        cssSelector += `[aria-label="${CSS.escape(ariaLabel)}"]`;
        xpathSelector += `[@aria-label="${ariaLabel}"]`;
        description += ` labeled "${ariaLabel}"`;
      }
      
      // Add text content for buttons, links, etc.
      if (text && ['button', 'a', 'span'].includes(tagName)) {
        const textXPath = `${xpathSelector}[contains(text(), "${text}")]`;
        return {
          type: 'xpath',
          selector: cssSelector,
          xpath: textXPath,
          description: `${description} containing "${text}"`,
          reliability: 80
        };
      }
      
      return {
        type: 'css',
        selector: cssSelector,
        xpath: xpathSelector,
        description,
        reliability: 75
      };
    }
    return null;
  }

  /**
   * Stable class name locator
   */
  generateStableClassLocator(element) {
    const classList = Array.from(element.classList);
    const stableClasses = classList.filter(cls => this.isStableClassName(cls));
    
    if (stableClasses.length > 0) {
      const className = stableClasses[0];
      const tagName = element.tagName.toLowerCase();
      
      return {
        type: 'css',
        selector: `${tagName}.${CSS.escape(className)}`,
        xpath: `//${tagName}[contains(@class, "${className}")]`,
        description: `${tagName} element with class "${className}"`,
        reliability: 70
      };
    }
    return null;
  }

  /**
   * Unique XPath locator
   */
  generateUniqueXPathLocator(element) {
    const xpath = this.generateAbsoluteXPath(element);
    
    if (xpath && this.isReasonablyStable(xpath)) {
      return {
        type: 'xpath',
        selector: this.xpathToCSS(xpath) || xpath,
        xpath: xpath,
        description: 'Unique XPath locator',
        reliability: 60
      };
    }
    return null;
  }

  /**
   * Text content locator
   */
  generateTextContentLocator(element) {
    const text = element.textContent?.trim();
    const tagName = element.tagName.toLowerCase();
    
    if (text && text.length > 0 && text.length < 100) {
      const exactTextXPath = `//${tagName}[text()="${text}"]`;
      const containsTextXPath = `//${tagName}[contains(text(), "${text}")]`;
      
      return {
        type: 'xpath',
        selector: `${tagName}:contains("${text}")`,
        xpath: exactTextXPath,
        fallbackXpath: containsTextXPath,
        description: `${tagName} containing text "${text}"`,
        reliability: 55
      };
    }
    return null;
  }

  /**
   * Positional XPath locator
   */
  generatePositionalXPathLocator(element) {
    const tagName = element.tagName.toLowerCase();
    const parent = element.parentElement;
    
    if (parent) {
      const siblings = Array.from(parent.children).filter(el => el.tagName.toLowerCase() === tagName);
      const index = siblings.indexOf(element) + 1;
      
      const parentPath = this.generateShortParentPath(parent);
      const xpath = `${parentPath}/${tagName}[${index}]`;
      
      return {
        type: 'xpath',
        selector: `${parentPath} > ${tagName}:nth-of-type(${index})`,
        xpath: xpath,
        description: `${index}${this.getOrdinalSuffix(index)} ${tagName} under ${parent.tagName.toLowerCase()}`,
        reliability: 40
      };
    }
    return null;
  }

  /**
   * Fallback CSS locator
   */
  generateFallbackCSSLocator(element) {
    const tagName = element.tagName.toLowerCase();
    const classList = Array.from(element.classList);
    
    if (classList.length > 0) {
      const classSelector = classList.map(cls => `.${CSS.escape(cls)}`).join('');
      return {
        type: 'css',
        selector: `${tagName}${classSelector}`,
        xpath: `//${tagName}[${classList.map(cls => `contains(@class, "${cls}")`).join(' and ')}]`,
        description: `${tagName} with classes: ${classList.join(', ')}`,
        reliability: 30
      };
    }
    
    return {
      type: 'css',
      selector: tagName,
      xpath: `//${tagName}`,
      description: `Generic ${tagName} element`,
      reliability: 20
    };
  }

  /**
   * Calculate confidence score for a locator
   */
  calculateConfidence(element, locator) {
    let confidence = locator.reliability || 50;
    
    // Boost confidence for stable attributes
    if (locator.attributes?.length > 0) {
      confidence += locator.attributes.length * 5;
    }
    
    // Reduce confidence for long selectors
    if (locator.selector.length > 100) {
      confidence -= 10;
    }
    
    // Boost confidence for semantic elements
    if (this.semanticTags.includes(element.tagName.toLowerCase())) {
      confidence += 5;
    }
    
    // Reduce confidence for deeply nested elements
    const depth = this.getElementDepth(element);
    if (depth > 10) {
      confidence -= (depth - 10) * 2;
    }
    
    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Helper methods
   */
  isUniqueId(id, element) {
    try {
      return document.querySelectorAll(`#${CSS.escape(id)}`).length === 1;
    } catch {
      return false;
    }
  }

  isGenericValue(value) {
    const generic = ['true', 'false', '1', '0', 'submit', 'button', 'text', 'click'];
    return generic.includes(value.toLowerCase());
  }

  isStableClassName(className) {
    // Avoid generated or hash-like class names
    const unstablePatterns = [
      /^[a-f0-9]{8,}$/,  // Hash-like
      /css-[a-z0-9]+/,   // CSS-in-JS
      /^_[a-zA-Z0-9]+/,  // Module CSS
      /\d{3,}/           // Numbers
    ];
    
    return !unstablePatterns.some(pattern => pattern.test(className));
  }

  generateAbsoluteXPath(element) {
    const path = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tagName = current.tagName.toLowerCase();
      const parent = current.parentElement;
      
      if (parent) {
        const siblings = Array.from(parent.children).filter(el => el.tagName.toLowerCase() === tagName);
        const index = siblings.indexOf(current) + 1;
        path.unshift(`${tagName}[${index}]`);
      } else {
        path.unshift(tagName);
      }
      
      current = parent;
    }
    
    return '/' + path.join('/');
  }

  generateShortParentPath(element, maxDepth = 3) {
    let current = element;
    let depth = 0;
    
    while (current && depth < maxDepth) {
      const id = current.getAttribute('id');
      if (id) {
        return `//*[@id="${id}"]`;
      }
      
      const stableAttr = this.stableAttributes.find(attr => 
        current.getAttribute(attr) && !this.isGenericValue(current.getAttribute(attr))
      );
      
      if (stableAttr) {
        const value = current.getAttribute(stableAttr);
        return `//*[@${stableAttr}="${value}"]`;
      }
      
      current = current.parentElement;
      depth++;
    }
    
    return '//*';
  }

  isReasonablyStable(xpath) {
    const segments = xpath.split('/');
    // Avoid XPaths with too many positional references
    const positionalCount = segments.filter(seg => /\[\d+\]$/.test(seg)).length;
    return positionalCount <= 2;
  }

  xpathToCSS(xpath) {
    // Simple XPath to CSS conversion for basic cases
    if (xpath.includes('@id=')) {
      const idMatch = xpath.match(/@id="([^"]+)"/);
      if (idMatch) return `#${idMatch[1]}`;
    }
    
    if (xpath.includes('@class=')) {
      const classMatch = xpath.match(/@class="([^"]+)"/);
      if (classMatch) return `.${classMatch[1]}`;
    }
    
    return null;
  }

  getElementDepth(element) {
    let depth = 0;
    let current = element;
    
    while (current.parentElement) {
      depth++;
      current = current.parentElement;
    }
    
    return depth;
  }

  getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  }

  generateFallbackLocator(element) {
    return {
      type: 'css',
      selector: element.tagName.toLowerCase(),
      xpath: `//${element.tagName.toLowerCase()}`,
      description: `Fallback ${element.tagName.toLowerCase()} locator`,
      reliability: 10
    };
  }

  /**
   * Validate locator uniqueness and stability
   */
  validateLocator(locator, element) {
    try {
      const elements = locator.type === 'xpath' 
        ? document.evaluate(locator.xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
        : document.querySelectorAll(locator.selector);
        
      const count = locator.type === 'xpath' ? elements.snapshotLength : elements.length;
      
      return {
        isUnique: count === 1,
        elementCount: count,
        isValid: count > 0,
        pointsToTarget: locator.type === 'xpath' 
          ? elements.snapshotItem(0) === element
          : elements[0] === element
      };
    } catch (error) {
      return {
        isUnique: false,
        elementCount: 0,
        isValid: false,
        pointsToTarget: false,
        error: error.message
      };
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IntelligentLocatorGenerator;
} else if (typeof window !== 'undefined') {
  window.IntelligentLocatorGenerator = IntelligentLocatorGenerator;
}