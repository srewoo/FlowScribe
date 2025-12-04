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
    await this.optimizeStrategyOrder();
  }

  /**
   * Learn from healing history and optimize strategy order
   */
  async optimizeStrategyOrder() {
    if (this.healingHistory.length < 5) {
      return; // Not enough data to optimize
    }

    // Calculate success rate for each strategy
    const strategyStats = {};

    this.healingHistory.forEach(record => {
      if (!strategyStats[record.strategy]) {
        strategyStats[record.strategy] = {
          successes: 0,
          totalConfidence: 0
        };
      }
      strategyStats[record.strategy].successes++;
      strategyStats[record.strategy].totalConfidence += record.confidence;
    });

    // Calculate average confidence per strategy
    const strategyScores = Object.keys(strategyStats).map(strategy => ({
      strategy,
      score: strategyStats[strategy].totalConfidence / strategyStats[strategy].successes,
      count: strategyStats[strategy].successes
    }));

    // Sort strategies by score (higher = better)
    strategyScores.sort((a, b) => b.score - a.score);

    // Reorder healing strategies based on learned performance
    const optimizedOrder = strategyScores.map(s => s.strategy);

    // Add any strategies not in history at the end
    this.healingStrategies.forEach(strategy => {
      if (!optimizedOrder.includes(strategy)) {
        optimizedOrder.push(strategy);
      }
    });

    this.healingStrategies = optimizedOrder;

    console.log('🧠 Self-healing strategies optimized based on history:',
      strategyScores.map(s => `${s.strategy}: ${s.score.toFixed(2)} (${s.count} uses)`));
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

    // Service worker compatibility check
    if (typeof document === 'undefined') {
      return null;
    }

    // Build DOM context - collect relevant elements
    const domContext = this.buildDOMContext(attributes);

    const prompt = `
You are a test automation expert helping to heal a broken CSS selector.

ORIGINAL SELECTOR (now broken): "${selector}"
TARGET ELEMENT CHARACTERISTICS:
- Text content: "${targetText || 'N/A'}"
- Attributes: ${JSON.stringify(attributes, null, 2)}

CURRENT PAGE ELEMENTS (potential matches):
${domContext}

TASK:
1. Analyze the target element characteristics
2. Find the best matching element from the current page
3. Generate a stable, unique CSS selector for it

REQUIREMENTS:
- Prefer data-testid, id, or semantic attributes
- Avoid auto-generated class names (e.g., css-xyz123)
- Ensure selector uniqueness (should match only 1 element)
- Keep selector as simple as possible

Return ONLY the CSS selector, nothing else.
Example: #login-btn
Example: [data-testid="submit-button"]
Example: button[aria-label="Sign In"]
    `.trim();

    try {
      const response = await this.aiService.generateSelectorHealing(prompt);
      return this.extractSelectorFromAIResponse(response);
    } catch (error) {
      console.warn('AI semantic healing failed:', error);
      return null;
    }
  }

  buildDOMContext(targetAttributes) {
    // Build a list of potentially matching elements on the page
    const elements = [];
    const maxElements = 20; // Limit to avoid huge prompts

    try {
      // Collect elements with similar attributes
      const selectors = [
        targetAttributes.tagName ? targetAttributes.tagName.toLowerCase() : 'button,a,input',
        '[data-testid]',
        '[id]',
        '[aria-label]',
        '[role]'
      ];

      const seen = new Set();

      selectors.forEach(selector => {
        try {
          const foundElements = document.querySelectorAll(selector);
          Array.from(foundElements).slice(0, maxElements - elements.length).forEach(el => {
            const key = this.getElementKey(el);
            if (!seen.has(key)) {
              seen.add(key);
              elements.push(this.describeElement(el));
            }
          });
        } catch (e) {
          // Ignore invalid selectors
        }
      });
    } catch (error) {
      console.warn('Failed to build DOM context:', error);
    }

    if (elements.length === 0) {
      return '(No matching elements found on page)';
    }

    return elements.slice(0, maxElements).join('\n');
  }

  getElementKey(element) {
    // Generate unique key for element to avoid duplicates
    return `${element.tagName}-${element.id}-${element.className}-${element.textContent?.substring(0, 20)}`;
  }

  describeElement(element) {
    // Create human-readable description of element
    const parts = [];

    parts.push(`- ${element.tagName.toLowerCase()}`);

    if (element.id) parts.push(`#${element.id}`);
    if (element.getAttribute('data-testid')) parts.push(`[data-testid="${element.getAttribute('data-testid')}"]`);
    if (element.className) parts.push(`.${element.className.split(' ')[0]}`);
    if (element.getAttribute('aria-label')) parts.push(`aria-label="${element.getAttribute('aria-label')}"`);
    if (element.getAttribute('role')) parts.push(`role="${element.getAttribute('role')}"`);

    const text = element.textContent?.trim().substring(0, 30);
    if (text) parts.push(`text="${text}${element.textContent.length > 30 ? '...' : ''}"`);

    return parts.join(' ');
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
      // Service worker compatibility check
      if (typeof document === 'undefined') {
        return false; // Cannot check in service worker context
      }
      return document.querySelector(selector) !== null;
    } catch {
      return false;
    }
  }

  elementExistsByXPath(xpath, dom) {
    try {
      // Service worker compatibility check
      if (typeof document === 'undefined') {
        return false; // Cannot check in service worker context
      }
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
      // Service worker compatibility check
      if (typeof document === 'undefined') {
        return []; // Cannot query in service worker context
      }
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
    // Extract parent-child hierarchy patterns from selector
    const patterns = [];

    // Split by combinators (>, +, ~, space)
    const parts = selector.split(/([>+~\s]+)/).filter(p => p.trim());

    // Generate patterns at different levels of specificity
    for (let i = 0; i < parts.length; i++) {
      // Full pattern from this point
      const fullPattern = parts.slice(i).join('');
      if (fullPattern && !fullPattern.match(/^[>+~\s]+$/)) {
        patterns.push({
          selector: fullPattern,
          specificity: parts.length - i,
          depth: i
        });
      }

      // Partial patterns (skip intermediate elements)
      if (i < parts.length - 1) {
        const skipPattern = parts[i] + ' ' + parts[parts.length - 1];
        patterns.push({
          selector: skipPattern,
          specificity: 2,
          depth: i,
          isPartial: true
        });
      }
    }

    // Extract parent patterns (everything except last element)
    if (parts.length > 1) {
      const parentPattern = parts.slice(0, -1).join('');
      if (parentPattern && !parentPattern.match(/^[>+~\s]+$/)) {
        patterns.push({
          selector: parentPattern,
          specificity: parts.length - 1,
          depth: 0,
          isParent: true
        });
      }
    }

    // Sort by specificity (higher = better)
    return patterns.sort((a, b) => b.specificity - a.specificity);
  }

  findElementsByStructuralPattern(pattern, dom) {
    // Service worker compatibility check
    if (typeof document === 'undefined') {
      return [];
    }

    try {
      const selector = pattern.selector || pattern;
      const elements = document.querySelectorAll(selector);

      // Convert NodeList to Array and return
      return Array.from(elements);
    } catch (error) {
      console.warn(`Failed to find elements by pattern "${pattern.selector || pattern}":`, error.message);
      return [];
    }
  }

  matchesAttributeProfile(element, attributes) {
    if (!element || !attributes) return false;

    // Priority attributes (weighted scoring)
    const attributeWeights = {
      'data-testid': 1.0,    // Highest priority
      'id': 0.9,
      'name': 0.8,
      'role': 0.8,
      'aria-label': 0.7,
      'type': 0.6,
      'placeholder': 0.5,
      'title': 0.5,
      'class': 0.3,          // Lowest priority (often dynamic)
      'href': 0.7,
      'alt': 0.6
    };

    let totalWeight = 0;
    let matchedWeight = 0;

    // Check each attribute
    for (const [attr, value] of Object.entries(attributes)) {
      const weight = attributeWeights[attr] || 0.2; // Default weight for unknown attributes
      totalWeight += weight;

      const elementValue = element.getAttribute ? element.getAttribute(attr) : element[attr];

      if (elementValue) {
        // Exact match
        if (elementValue === value) {
          matchedWeight += weight;
        }
        // Partial match for class and similar attributes
        else if (attr === 'class' && elementValue.includes(value)) {
          matchedWeight += weight * 0.5;
        }
        // Partial match for text-based attributes
        else if (typeof value === 'string' && typeof elementValue === 'string' &&
                 value.length > 3 && elementValue.includes(value)) {
          matchedWeight += weight * 0.3;
        }
      }
    }

    // Calculate match percentage
    if (totalWeight === 0) return false;
    const matchPercentage = matchedWeight / totalWeight;

    // Require at least 50% attribute match
    return matchPercentage >= 0.5;
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
    if (!xpath) return null;

    try {
      // Handle simple XPath expressions
      let css = xpath;

      // Convert //* to *
      css = css.replace(/\/\/\*/g, '*');

      // Convert //tagname to tagname
      css = css.replace(/\/\/([a-zA-Z]+)/g, '$1');

      // Convert /tagname to tagname
      css = css.replace(/\/([a-zA-Z]+)/g, ' $1').trim();

      // Convert [@id="value"] to #value
      css = css.replace(/\[@id=['"]([^'"]+)['"]\]/g, '#$1');

      // Convert [@class="value"] to .value
      css = css.replace(/\[@class=['"]([^'"]+)['"]\]/g, '.$1');

      // Convert [@attribute="value"] to [attribute="value"]
      css = css.replace(/\[@([^=]+)=['"]([^'"]+)['"]\]/g, '[$1="$2"]');

      // Convert [@attribute] to [attribute]
      css = css.replace(/\[@([^\]]+)\]/g, '[$1]');

      // Convert [contains(@class, "value")] to [class*="value"]
      css = css.replace(/\[contains\(@([^,]+),\s*['"]([^'"]+)['"]\)\]/g, '[$1*="$2"]');

      // Convert [contains(text(), "value")] to :contains("value")
      // Note: :contains is not standard CSS, but works in many libraries
      css = css.replace(/\[contains\(text\(\),\s*['"]([^'"]+)['"]\)\]/g, ':contains("$1")');

      // Convert [text()="value"] - this needs a workaround
      // We can't directly convert this to CSS, return null for complex cases
      if (css.includes('text()')) {
        return null; // Cannot convert text() XPath to CSS
      }

      // Convert position predicates [1] to :first-child (approximate)
      css = css.replace(/\[1\]/g, ':first-child');
      css = css.replace(/\[(\d+)\]/g, ':nth-child($1)');

      // Clean up multiple spaces
      css = css.replace(/\s+/g, ' ').trim();

      // Validate the result looks like CSS
      if (css && !css.includes('//') && !css.includes('@')) {
        return css;
      }

      return null; // Return null for complex XPath that can't be converted
    } catch (error) {
      console.warn('XPath to CSS conversion failed:', error);
      return null;
    }
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