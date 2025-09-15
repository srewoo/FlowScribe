/**
 * Enhanced AI Prompt Templates for Intelligent Locator Generation and Comprehensive Assertions
 * Generates the best possible CSS/XPath selectors and creates complete test automation scripts
 */

class EnhancedLocatorPromptGenerator {
  constructor() {
    this.locatorStrategies = [
      'data-testid attributes (highest priority)',
      'unique IDs with semantic meaning',
      'stable attribute combinations',
      'aria-labels and accessibility attributes',
      'semantic element combinations',
      'text content with partial matching',
      'relative positioning from stable parents',
      'smart XPath with multiple fallbacks'
    ];

    this.assertionTypes = [
      'element_presence',
      'element_visibility',
      'text_content_validation',
      'attribute_validation',
      'url_pattern_matching',
      'form_validation',
      'network_response_validation',
      'page_state_validation',
      'accessibility_validation',
      'performance_validation'
    ];
  }

  /**
   * Generate comprehensive AI prompt for script enhancement
   */
  generateEnhancedPrompt(actions, framework, options = {}) {
    const pageAnalysis = this.analyzePageStructure(actions);
    const userJourney = this.extractUserJourney(actions);
    const elementContext = this.extractElementContext(actions);
    
    return {
      systemPrompt: this.buildAdvancedSystemPrompt(framework, options),
      userPrompt: this.buildAdvancedUserPrompt(actions, framework, pageAnalysis, userJourney, elementContext, options),
      contextData: {
        pageAnalysis,
        userJourney,
        elementContext,
        totalActions: actions.length,
        uniquePages: [...new Set(actions.map(a => a.url))].length,
        frameworkCapabilities: this.getFrameworkCapabilities(framework)
      }
    };
  }

  /**
   * Build advanced system prompt with locator intelligence
   */
  buildAdvancedSystemPrompt(framework, options) {
    return `You are an expert test automation architect specializing in ${framework} with deep expertise in:
1. INTELLIGENT LOCATOR GENERATION - Create the most stable, maintainable selectors
2. COMPREHENSIVE TEST COVERAGE - Ensure no user journey step is missed
3. ROBUST ASSERTION STRATEGIES - Validate every critical aspect of the application

CRITICAL REQUIREMENTS:

🎯 LOCATOR GENERATION EXCELLENCE:
- ANALYZE the actual DOM structure provided, don't assume element attributes
- PRIORITIZE stability over brevity: data-testid > unique ID > aria-label > semantic combo > text content
- GENERATE multiple fallback strategies for each element
- AVOID brittle selectors like nth-child, absolute positions, or dynamic classes
- CREATE smart XPath expressions that adapt to DOM changes
- USE relative positioning from the most stable parent elements
- COMBINE multiple attributes for uniqueness when single attributes aren't sufficient

🛡️ ASSERTION COMPLETENESS:
- VALIDATE element presence before interaction
- VERIFY text content matches expected values
- CHECK form validation states and error messages
- ASSERT URL patterns and navigation success
- VALIDATE dynamic content loading and API responses
- ENSURE accessibility attributes are present and correct
- MONITOR page performance and loading states
- VERIFY user feedback (success messages, error states)

🔄 JOURNEY COMPLETENESS:
- CAPTURE every step of the user's recorded journey
- ADD meaningful waits for dynamic content
- HANDLE form submissions and their results
- VERIFY each page transition and state change
- INCLUDE error handling for network failures
- TEST both positive and negative scenarios when possible

🎨 ${framework.toUpperCase()} BEST PRACTICES:
${this.getFrameworkSpecificGuidelines(framework)}

LOCATOR PRIORITY HIERARCHY:
1. [data-testid] - Highest priority, purpose-built for testing
2. #unique-id - Stable IDs with semantic meaning (avoid auto-generated)
3. [aria-label] - Accessibility attributes with descriptive labels
4. [name] - Form element names (for inputs, selects)
5. [role] + semantic context - ARIA roles with surrounding context
6. text() content - Exact text match with fallback to contains()
7. Smart attribute combinations - Multiple attributes for uniqueness
8. Relative positioning - From stable parent to child element
9. Smart XPath - Multiple strategies with fallbacks

RETURN: Only valid, executable ${framework} code with comprehensive comments explaining locator choices.`;
  }

  /**
   * Build advanced user prompt with detailed context
   */
  buildAdvancedUserPrompt(actions, framework, pageAnalysis, userJourney, elementContext, options) {
    const domStructure = this.buildDOMContextString(elementContext);
    
    return `ENHANCE this ${framework} test script using the ACTUAL DOM STRUCTURE and RECORDED USER JOURNEY:

==== RECORDED USER JOURNEY ====
${this.formatUserJourney(userJourney)}

==== PAGE ANALYSIS ====
${this.formatPageAnalysis(pageAnalysis)}

==== ACTUAL DOM STRUCTURE ====
${domStructure}

==== CURRENT BASIC SCRIPT ====
${this.generateBasicScript(actions, framework)}

==== ENHANCEMENT REQUIREMENTS ====

🎯 LOCATOR INTELLIGENCE:
- Analyze the PROVIDED DOM structure (above) to generate the best selectors
- Create multiple fallback strategies for each element
- Explain your locator choice reasoning in comments
- Avoid assumptions - use only elements that exist in the DOM data

🛡️ COMPREHENSIVE ASSERTIONS:
- Add element presence validation before each interaction
- Verify text content where applicable: "${this.extractExpectedTexts(actions)}"
- Check URL patterns for navigation: ${this.extractURLPatterns(actions)}
- Validate form states and submissions
- Assert loading states and dynamic content
- Include accessibility checks for key interactions

🔄 COMPLETE JOURNEY COVERAGE:
- Ensure EVERY recorded action is represented in the final script
- Add appropriate waits for dynamic content
- Handle page transitions and loading states
- Include error handling and retry logic
- Verify the complete user workflow end-to-end

📊 TEST DATA & CONFIGURATION:
- Test Name: "${options.testName || 'FlowScribe Complete User Journey'}"
- Environment: ${options.environment || 'staging'}
- Include Screenshots: ${options.includeScreenshots !== false}
- Network Validation: ${options.includeNetworkAssertions || false}
- Accessibility Checks: ${options.includeA11yChecks || false}

GENERATE: A complete, production-ready ${framework} test script that:
1. Uses the BEST possible locators based on the actual DOM provided
2. Includes comprehensive assertions for the complete user journey
3. Handles all edge cases and potential failures
4. Follows ${framework} best practices and patterns
5. Is maintainable and self-documenting with clear comments

Remember: Use ONLY the DOM elements and attributes provided above - do not assume or guess element properties!`;
  }

  /**
   * Analyze page structure from recorded actions
   */
  analyzePageStructure(actions) {
    const pages = new Map();
    
    actions.forEach(action => {
      if (!action.url) return;
      
      if (!pages.has(action.url)) {
        pages.set(action.url, {
          url: action.url,
          title: action.title || 'Unknown Page',
          elements: [],
          interactions: [],
          forms: new Set(),
          modals: false,
          navigation: []
        });
      }
      
      const page = pages.get(action.url);
      
      // Analyze element types and patterns
      if (action.element) {
        page.elements.push({
          tagName: action.element.tagName,
          type: action.element.type,
          role: action.element.role,
          hasId: !!action.element.id,
          hasTestId: !!(action.element.attributes && 
            Object.keys(action.element.attributes).some(attr => 
              attr.includes('test') || attr.includes('qa') || attr.includes('cy'))),
          hasAriaLabel: !!(action.element.attributes && action.element.attributes['aria-label']),
          isFormElement: ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(action.element.tagName)
        });
        
        // Track form interactions
        if (action.formContext) {
          page.forms.add(action.formContext.id || 'unnamed-form');
        }
        
        // Detect modal interactions
        if (action.element.className && 
            (action.element.className.includes('modal') || 
             action.element.className.includes('dialog'))) {
          page.modals = true;
        }
      }
      
      page.interactions.push({
        type: action.type,
        timestamp: action.timestamp,
        elementType: action.element?.tagName
      });
    });
    
    return Array.from(pages.values());
  }

  /**
   * Extract user journey narrative
   */
  extractUserJourney(actions) {
    const journey = [];
    let currentPage = null;
    let stepCounter = 1;
    
    actions.forEach((action, index) => {
      // Page navigation
      if (action.url && action.url !== currentPage) {
        journey.push({
          step: stepCounter++,
          type: 'navigation',
          description: `Navigate to ${this.getPageDescription(action.url)}`,
          url: action.url,
          timestamp: action.timestamp
        });
        currentPage = action.url;
      }
      
      // User interactions
      const interactionDesc = this.getInteractionDescription(action);
      if (interactionDesc) {
        journey.push({
          step: stepCounter++,
          type: action.type,
          description: interactionDesc,
          element: action.element,
          value: action.value,
          timestamp: action.timestamp,
          assertions: this.suggestAssertions(action, actions, index)
        });
      }
    });
    
    return journey;
  }

  /**
   * Extract detailed element context for each interaction
   */
  extractElementContext(actions) {
    return actions.map(action => {
      if (!action.element) return null;
      
      return {
        action: action.type,
        element: {
          tagName: action.element.tagName,
          id: action.element.id,
          className: action.element.className,
          name: action.element.name,
          type: action.element.type,
          textContent: action.element.textContent,
          value: action.element.value,
          placeholder: action.element.placeholder,
          attributes: action.element.attributes || {},
          xpath: action.element.xpath,
          cssSelector: action.element.cssSelector,
          accessibility: action.accessibility || {},
          parentContext: action.parentContext || {},
          formContext: action.formContext || {}
        },
        locatorStrategies: this.generateLocatorStrategies(action.element),
        suggestedAssertions: this.suggestElementAssertions(action.element, action.type)
      };
    }).filter(Boolean);
  }

  /**
   * Generate multiple locator strategies for an element
   */
  generateLocatorStrategies(element) {
    const strategies = [];
    
    // Strategy 1: Data test attributes
    if (element.attributes) {
      const testAttrs = Object.keys(element.attributes).filter(attr => 
        attr.includes('test') || attr.includes('qa') || attr.includes('cy'));
      if (testAttrs.length > 0) {
        testAttrs.forEach(attr => {
          strategies.push({
            type: 'data-testid',
            selector: `[${attr}="${element.attributes[attr]}"]`,
            priority: 100,
            stability: 95
          });
        });
      }
    }
    
    // Strategy 2: Unique ID
    if (element.id && !element.id.match(/^(generated|auto|temp|uid)/i)) {
      strategies.push({
        type: 'unique-id',
        selector: `#${element.id}`,
        priority: 90,
        stability: 90
      });
    }
    
    // Strategy 3: Aria labels
    if (element.attributes && element.attributes['aria-label']) {
      strategies.push({
        type: 'aria-label',
        selector: `[aria-label="${element.attributes['aria-label']}"]`,
        priority: 85,
        stability: 85
      });
    }
    
    // Strategy 4: Name attribute (for form elements)
    if (element.name && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
      strategies.push({
        type: 'name-attribute',
        selector: `[name="${element.name}"]`,
        priority: 80,
        stability: 80
      });
    }
    
    // Strategy 5: Text content
    if (element.textContent && element.textContent.trim().length > 0) {
      const text = element.textContent.trim().substring(0, 50);
      strategies.push({
        type: 'text-content',
        selector: `text="${text}"`,
        priority: 70,
        stability: 60
      });
    }
    
    // Strategy 6: Attribute combination
    if (element.attributes && Object.keys(element.attributes).length > 1) {
      const stableAttrs = Object.entries(element.attributes)
        .filter(([key, value]) => !key.includes('class') && !key.includes('style'))
        .slice(0, 2);
      if (stableAttrs.length > 1) {
        const selector = stableAttrs.map(([key, value]) => `[${key}="${value}"]`).join('');
        strategies.push({
          type: 'attribute-combination',
          selector: selector,
          priority: 75,
          stability: 75
        });
      }
    }
    
    // Strategy 7: CSS Selector (refined)
    if (element.cssSelector) {
      strategies.push({
        type: 'css-selector',
        selector: element.cssSelector,
        priority: 65,
        stability: 50
      });
    }
    
    // Strategy 8: XPath (refined)
    if (element.xpath) {
      strategies.push({
        type: 'xpath',
        selector: element.xpath,
        priority: 60,
        stability: 45
      });
    }
    
    return strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Build DOM context string for AI prompt
   */
  buildDOMContextString(elementContext) {
    return elementContext.map((ctx, index) => {
      const el = ctx.element;
      return `
ELEMENT ${index + 1} (Action: ${ctx.action}):
  Tag: ${el.tagName}
  ID: ${el.id || 'none'}
  Classes: ${el.className || 'none'}
  Name: ${el.name || 'none'}
  Type: ${el.type || 'none'}
  Text: "${el.textContent || ''}"
  Value: "${el.value || ''}"
  Placeholder: "${el.placeholder || ''}"
  Attributes: ${JSON.stringify(el.attributes || {}, null, 2)}
  Accessibility: ${JSON.stringify(el.accessibility || {}, null, 2)}
  Parent Context: ${JSON.stringify(el.parentContext || {}, null, 2)}
  Best Locators: ${ctx.locatorStrategies.slice(0, 3).map(s => s.selector).join(', ')}
      `.trim();
    }).join('\n\n');
  }

  /**
   * Suggest intelligent assertions based on action context
   */
  suggestAssertions(action, allActions, currentIndex) {
    const assertions = [];
    
    // Element presence assertion
    assertions.push({
      type: 'element_presence',
      description: `Verify ${action.element?.tagName || 'element'} is present on page`
    });
    
    // Text content assertions
    if (action.element?.textContent) {
      assertions.push({
        type: 'text_content',
        description: `Verify element contains text: "${action.element.textContent.substring(0, 50)}"`
      });
    }
    
    // Form submission assertions
    if (action.type === 'click' && 
        (action.element?.type === 'submit' || 
         action.element?.textContent?.toLowerCase().includes('submit'))) {
      assertions.push({
        type: 'form_submission',
        description: 'Verify form submission success (URL change, success message, or redirect)'
      });
    }
    
    // Navigation assertions
    if (currentIndex < allActions.length - 1) {
      const nextAction = allActions[currentIndex + 1];
      if (nextAction.url && nextAction.url !== action.url) {
        assertions.push({
          type: 'navigation',
          description: `Verify navigation to ${nextAction.url}`
        });
      }
    }
    
    // Input validation assertions
    if (action.type === 'input' && action.value) {
      assertions.push({
        type: 'input_validation',
        description: `Verify input field contains value: "${action.value}"`
      });
    }
    
    return assertions;
  }

  /**
   * Get framework-specific guidelines
   */
  getFrameworkSpecificGuidelines(framework) {
    const guidelines = {
      playwright: `
- Use page.locator() with intelligent fallback strategies
- Implement page.waitForSelector() for dynamic content
- Use expect() assertions with descriptive error messages
- Leverage auto-waiting capabilities but add explicit waits when needed
- Use page.screenshot() for visual debugging
- Implement proper error handling with try-catch blocks`,
      
      selenium: `
- Use WebDriverWait with expected_conditions for robust element waiting
- Implement multiple locator strategies with graceful fallbacks
- Use explicit waits over implicit waits
- Add proper exception handling for StaleElementReferenceException
- Implement Page Object Model for maintainability
- Use ActionChains for complex interactions`,
      
      cypress: `
- Use cy.get() with intelligent selector strategies
- Implement proper command chaining with should() assertions
- Use cy.intercept() for network request validation
- Add custom commands for reusable functionality
- Use cy.wait() strategically for dynamic content
- Implement proper error handling with cy.on('fail')`,
      
      puppeteer: `
- Use page.$() and page.$$() with multiple selector strategies
- Implement page.waitForSelector() with proper timeout handling
- Use page.evaluate() for complex DOM interactions
- Add proper error handling with try-catch blocks
- Implement screenshot capabilities for debugging
- Use page.setViewport() for responsive testing`
    };
    
    return guidelines[framework] || 'Follow framework best practices';
  }

  /**
   * Format user journey for prompt
   */
  formatUserJourney(journey) {
    return journey.map(step => 
      `Step ${step.step}: ${step.description}${step.assertions ? 
        '\n  Expected: ' + step.assertions.map(a => a.description).join(', ') : ''}`
    ).join('\n');
  }

  /**
   * Format page analysis for prompt
   */
  formatPageAnalysis(pageAnalysis) {
    return pageAnalysis.map(page => `
Page: ${page.url}
- Elements: ${page.elements.length} total
- Forms: ${page.forms.size} detected
- Test IDs: ${page.elements.filter(e => e.hasTestId).length} elements
- Aria Labels: ${page.elements.filter(e => e.hasAriaLabel).length} elements
- Interactions: ${page.interactions.length} actions
    `).join('\n');
  }

  /**
   * Extract expected texts from actions
   */
  extractExpectedTexts(actions) {
    return actions
      .filter(a => a.element?.textContent)
      .map(a => a.element.textContent.substring(0, 30))
      .slice(0, 5)
      .join('", "');
  }

  /**
   * Extract URL patterns from actions
   */
  extractURLPatterns(actions) {
    const urls = [...new Set(actions.map(a => a.url).filter(Boolean))];
    return urls.map(url => {
      try {
        const urlObj = new URL(url);
        return `${urlObj.pathname}*`;
      } catch {
        return url;
      }
    }).join(', ');
  }

  /**
   * Get interaction description
   */
  getInteractionDescription(action) {
    const element = action.element;
    if (!element) return null;
    
    switch (action.type) {
      case 'click':
        return `Click on ${element.tagName}${element.textContent ? ` ("${element.textContent.substring(0, 30)}")` : ''}`;
      case 'input':
        return `Enter "${action.value}" in ${element.tagName}${element.placeholder ? ` (placeholder: "${element.placeholder}")` : ''}`;
      case 'change':
        return `Select "${action.value}" in ${element.tagName}`;
      case 'keydown':
        return `Press ${action.key} key`;
      default:
        return `${action.type} on ${element.tagName}`;
    }
  }

  /**
   * Get page description from URL
   */
  getPageDescription(url) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      if (path === '/' || path === '') return 'homepage';
      return path.split('/').filter(Boolean).join(' > ') || 'page';
    } catch {
      return url;
    }
  }

  /**
   * Generate basic script for reference
   */
  generateBasicScript(actions, framework) {
    // This would call the existing template generation
    return `// Basic ${framework} script with ${actions.length} actions
// This is the current template that needs enhancement`;
  }

  /**
   * Suggest element-specific assertions
   */
  suggestElementAssertions(element, actionType) {
    const assertions = [];
    
    if (element.textContent) {
      assertions.push(`text content validation`);
    }
    if (element.value) {
      assertions.push(`input value verification`);
    }
    if (element.attributes && element.attributes['aria-label']) {
      assertions.push(`accessibility label verification`);
    }
    
    return assertions;
  }

  /**
   * Get framework capabilities
   */
  getFrameworkCapabilities(framework) {
    const capabilities = {
      playwright: ['auto-wait', 'parallel-execution', 'multiple-browsers', 'network-interception'],
      selenium: ['cross-browser', 'grid-execution', 'mobile-testing', 'parallel-execution'],
      cypress: ['time-travel', 'network-stubbing', 'real-browser', 'visual-testing'],
      puppeteer: ['headless-chrome', 'pdf-generation', 'performance-metrics', 'network-interception']
    };
    
    return capabilities[framework] || [];
  }
}

module.exports = EnhancedLocatorPromptGenerator;
