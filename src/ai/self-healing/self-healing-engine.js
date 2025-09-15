/**
 * FlowScribe Self-Healing Engine
 * Automatically adapts test selectors when DOM changes occur
 * Uses AI and heuristics to maintain test reliability
 */

class SelfHealingEngine {
  constructor() {
    this.healingStrategies = [
      'exact-match',
      'partial-text',
      'semantic-similarity', 
      'visual-similarity',
      'structural-similarity'
    ];
    
    this.confidenceThreshold = 0.7;
    this.healingHistory = [];
    this.elementSnapshots = new Map();
    this.aiService = null;
  }

  async init(aiService) {
    this.aiService = aiService;
    await this.loadHealingHistory();
  }

  /**
   * Main healing function - attempts to heal a broken selector
   * @param {Object} originalAction - The original recorded action
   * @param {Object} currentDOM - Current page DOM state
   * @returns {Object} Healed action with updated selector
   */
  async healSelector(originalAction, currentDOM) {
    const originalSelector = originalAction.element.selector;
    const targetText = originalAction.element.textContent;
    const targetAttributes = originalAction.element.attributes;

    console.log(`🔧 Self-healing: Attempting to heal selector "${originalSelector}"`);

    // Try healing strategies in order of reliability
    for (const strategy of this.healingStrategies) {
      try {
        const healedSelector = await this.applyHealingStrategy(
          strategy,
          originalSelector,
          targetText,
          targetAttributes,
          currentDOM
        );

        if (healedSelector && await this.validateSelector(healedSelector, currentDOM)) {
          const confidence = await this.calculateConfidence(
            originalAction,
            healedSelector,
            currentDOM
          );

          if (confidence >= this.confidenceThreshold) {
            await this.recordHealingSuccess(originalSelector, healedSelector, strategy, confidence);
            
            return {
              ...originalAction,
              element: {
                ...originalAction.element,
                selector: healedSelector,
                healedBy: strategy,
                confidence: confidence,
                isHealed: true
              }
            };
          }
        }
      } catch (error) {
        console.warn(`Healing strategy "${strategy}" failed:`, error.message);
      }
    }

    // If all strategies fail, return null to indicate healing failure
    console.error(`❌ Self-healing failed for selector: ${originalSelector}`);
    return null;
  }

  /**
   * Apply specific healing strategy
   */
  async applyHealingStrategy(strategy, selector, targetText, attributes, currentDOM) {
    switch (strategy) {
      case 'exact-match':
        return this.healByExactMatch(selector, currentDOM);
      
      case 'partial-text':
        return this.healByPartialText(targetText, currentDOM);
      
      case 'semantic-similarity':
        return await this.healBySemanticSimilarity(selector, targetText, attributes);
      
      case 'visual-similarity':
        return this.healByVisualSimilarity(attributes, currentDOM);
      
      case 'structural-similarity':
        return this.healByStructuralSimilarity(selector, attributes, currentDOM);
      
      default:
        throw new Error(`Unknown healing strategy: ${strategy}`);
    }
  }

  /**
   * Strategy 1: Exact match with fallback selectors
   */
  healByExactMatch(selector, currentDOM) {
    // Try alternative selector formats
    const alternativeSelectors = this.generateAlternativeSelectors(selector);
    
    for (const altSelector of alternativeSelectors) {
      if (this.elementExists(altSelector, currentDOM)) {
        return altSelector;
      }
    }
    
    return null;
  }

  /**
   * Strategy 2: Find by partial text content
   */
  healByPartialText(targetText, currentDOM) {
    if (!targetText || targetText.length < 3) return null;

    // Look for elements with similar text content
    const textQueries = [
      `[text()="${targetText}"]`,
      `[contains(text(), "${targetText.substring(0, 10)}")]`,
      `[aria-label*="${targetText}"]`,
      `[title*="${targetText}"]`,
      `[placeholder*="${targetText}"]`
    ];

    for (const query of textQueries) {
      const xpath = `//*${query}`;
      if (this.elementExistsByXPath(xpath, currentDOM)) {
        return this.xpathToCSS(xpath) || xpath;
      }
    }

    return null;
  }

  /**
   * Strategy 3: AI-powered semantic similarity
   */
  async healBySemanticSimilarity(selector, targetText, attributes) {
    if (!this.aiService || !this.aiService.isConfigured()) {
      return null;
    }

    const prompt = `
    Find a CSS selector for an element that was previously: "${selector}"
    Target text: "${targetText}"
    Target attributes: ${JSON.stringify(attributes)}
    
    Available elements on current page: [DOM_CONTEXT]
    
    Return ONLY the best CSS selector that matches the intended element.
    `;

    try {
      const response = await this.aiService.generateSelectorHealing(prompt);
      return this.extractSelectorFromAIResponse(response);
    } catch (error) {
      console.warn('AI semantic healing failed:', error);
      return null;
    }
  }

  /**
   * Strategy 4: Visual similarity based on attributes
   */
  healByVisualSimilarity(attributes, currentDOM) {
    const visualAttributes = ['class', 'id', 'data-testid', 'role', 'type'];
    const selectors = [];

    for (const attr of visualAttributes) {
      if (attributes[attr]) {
        // Try partial matches for class names
        if (attr === 'class') {
          const classes = attributes[attr].split(' ');
          for (const cls of classes) {
            selectors.push(`[class*="${cls}"]`);
            selectors.push(`.${cls}`);
          }
        } else {
          selectors.push(`[${attr}="${attributes[attr]}"]`);
          selectors.push(`[${attr}*="${attributes[attr].substring(0, 8)}"]`);
        }
      }
    }

    for (const selector of selectors) {
      if (this.elementExists(selector, currentDOM)) {
        return selector;
      }
    }

    return null;
  }

  /**
   * Strategy 5: Structural similarity (parent-child relationships)
   */
  healByStructuralSimilarity(selector, attributes, currentDOM) {
    // Extract structural patterns from original selector
    const patterns = this.extractStructuralPatterns(selector);
    
    for (const pattern of patterns) {
      const candidates = this.findElementsByStructuralPattern(pattern, currentDOM);
      
      for (const candidate of candidates) {
        if (this.matchesAttributeProfile(candidate, attributes)) {
          return this.generateSelectorForElement(candidate);
        }
      }
    }

    return null;
  }

  /**
   * Utility functions
   */
  generateAlternativeSelectors(selector) {
    const alternatives = [];

    // CSS to XPath conversions
    if (selector.startsWith('#')) {
      const id = selector.substring(1);
      alternatives.push(`[id="${id}"]`);
      alternatives.push(`*[id="${id}"]`);
      alternatives.push(`//*[@id="${id}"]`);
    }

    // Class variations
    if (selector.includes('.')) {
      const classes = selector.match(/\.[a-zA-Z0-9_-]+/g);
      if (classes) {
        classes.forEach(cls => {
          const className = cls.substring(1);
          alternatives.push(`[class*="${className}"]`);
          alternatives.push(`//*[contains(@class, "${className}")]`);
        });
      }
    }

    // Attribute variations
    const attrMatch = selector.match(/\[([^=]+)=?"?([^"]*)"?\]/);
    if (attrMatch) {
      const [, attr, value] = attrMatch;
      alternatives.push(`[${attr}*="${value}"]`);
      alternatives.push(`//*[@${attr}="${value}"]`);
    }

    return alternatives;
  }

  async validateSelector(selector, currentDOM) {
    // Check if selector returns exactly one element
    try {
      const elements = this.querySelectorAll(selector, currentDOM);
      return elements && elements.length === 1;
    } catch (error) {
      return false;
    }
  }

  async calculateConfidence(originalAction, healedSelector, currentDOM) {
    let confidence = 0.5; // Base confidence

    // Factor 1: Element uniqueness (higher = better)
    const elements = this.querySelectorAll(healedSelector, currentDOM);
    if (elements.length === 1) confidence += 0.3;
    else if (elements.length <= 3) confidence += 0.1;

    // Factor 2: Selector stability (fewer wildcards = better)
    if (!healedSelector.includes('*') && !healedSelector.includes('contains')) {
      confidence += 0.2;
    }

    // Factor 3: Attribute matching
    const element = elements[0];
    if (element && this.attributesMatch(originalAction.element.attributes, element)) {
      confidence += 0.2;
    }

    // Factor 4: Text content matching
    if (element && element.textContent === originalAction.element.textContent) {
      confidence += 0.15;
    }

    return Math.min(confidence, 1.0);
  }

  async recordHealingSuccess(originalSelector, healedSelector, strategy, confidence) {
    const healingRecord = {
      timestamp: Date.now(),
      originalSelector,
      healedSelector,
      strategy,
      confidence,
      url: window.location.href
    };

    this.healingHistory.push(healingRecord);
    
    // Keep only last 100 healing records
    if (this.healingHistory.length > 100) {
      this.healingHistory = this.healingHistory.slice(-100);
    }

    await this.saveHealingHistory();
    
    console.log(`✅ Self-healing success: "${originalSelector}" → "${healedSelector}" (${strategy}, ${confidence.toFixed(2)})`);
  }

  /**
   * Storage and persistence
   */
  async loadHealingHistory() {
    try {
      const result = await chrome.storage.local.get(['healingHistory']);
      this.healingHistory = result.healingHistory || [];
    } catch (error) {
      console.error('Failed to load healing history:', error);
      this.healingHistory = [];
    }
  }

  async saveHealingHistory() {
    try {
      await chrome.storage.local.set({ 
        healingHistory: this.healingHistory 
      });
    } catch (error) {
      console.error('Failed to save healing history:', error);
    }
  }

  /**
   * DOM interaction utilities
   */
  elementExists(selector, dom) {
    try {
      return document.querySelector(selector) !== null;
    } catch {
      return false;
    }
  }

  elementExistsByXPath(xpath, dom) {
    try {
      const result = document.evaluate(
        xpath, 
        document, 
        null, 
        XPathResult.FIRST_ORDERED_NODE_TYPE, 
        null
      );
      return result.singleNodeValue !== null;
    } catch {
      return false;
    }
  }

  querySelectorAll(selector, dom) {
    try {
      return document.querySelectorAll(selector);
    } catch {
      return [];
    }
  }

  attributesMatch(original, current) {
    const keyAttributes = ['class', 'id', 'data-testid', 'role', 'type'];
    let matches = 0;
    
    for (const attr of keyAttributes) {
      if (original[attr] && current.getAttribute && 
          original[attr] === current.getAttribute(attr)) {
        matches++;
      }
    }
    
    return matches / keyAttributes.length >= 0.5;
  }

  extractStructuralPatterns(selector) {
    // Implementation for extracting structural patterns
    return [selector]; // Simplified for now
  }

  findElementsByStructuralPattern(pattern, dom) {
    // Implementation for finding elements by structural pattern
    return []; // Simplified for now
  }

  matchesAttributeProfile(element, attributes) {
    // Implementation for matching attribute profiles
    return true; // Simplified for now
  }

  generateSelectorForElement(element) {
    // Generate optimal selector for element
    if (element.id) return `#${element.id}`;
    if (element.getAttribute('data-testid')) {
      return `[data-testid="${element.getAttribute('data-testid')}"]`;
    }
    // More selector generation logic...
    return null;
  }

  xpathToCSS(xpath) {
    // Convert simple XPath to CSS selector
    // This is a simplified implementation
    return null;
  }

  extractSelectorFromAIResponse(response) {
    // Extract selector from AI response
    const match = response.match(/(?:css|selector):\s*([^\n]+)/i);
    return match ? match[1].trim() : null;
  }

  /**
   * Get healing statistics for analytics
   */
  getHealingStats() {
    const stats = {
      totalHealings: this.healingHistory.length,
      successfulStrategies: {},
      averageConfidence: 0
    };

    if (this.healingHistory.length > 0) {
      let totalConfidence = 0;
      
      this.healingHistory.forEach(record => {
        if (!stats.successfulStrategies[record.strategy]) {
          stats.successfulStrategies[record.strategy] = 0;
        }
        stats.successfulStrategies[record.strategy]++;
        totalConfidence += record.confidence;
      });

      stats.averageConfidence = totalConfidence / this.healingHistory.length;
    }

    return stats;
  }

  /**
   * Clear healing history (for maintenance)
   */
  async clearHealingHistory() {
    this.healingHistory = [];
    await this.saveHealingHistory();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SelfHealingEngine;
} else {
  window.SelfHealingEngine = SelfHealingEngine;
}