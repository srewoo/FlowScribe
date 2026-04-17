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
    const originalActions = actions || [];
    const optimizedActions = this.optimizeActionSequence(originalActions);
    const pageAnalysis = this.analyzePageStructure(optimizedActions);
    const userJourney = this.extractUserJourney(optimizedActions);
    const elementContext = this.extractElementContext(optimizedActions);
    
    return {
      systemPrompt: this.buildAdvancedSystemPrompt(framework, options),
      userPrompt: this.buildAdvancedUserPrompt(optimizedActions, framework, pageAnalysis, userJourney, elementContext, options),
      contextData: {
        pageAnalysis,
        userJourney,
        elementContext,
        totalActions: optimizedActions.length,
        originalActionCount: originalActions.length,
        uniquePages: [...new Set(originalActions.map(a => a.url))].length,
        frameworkCapabilities: this.getFrameworkCapabilities(framework)
      }
    };
  }

  /**
   * Remove redundant navigations, rapid duplicates, and noise events from the
   * recorded action sequence, keeping only user-meaningful interactions.
   * @param {Array<{ type: string, url?: string, timestamp?: number, isUserInitiated?: boolean, element?: object }>} actions - Raw recorded actions
   * @returns {Array<object>} Filtered and optimized action list
   */
  optimizeActionSequence(actions) {
    const optimizedActions = [];
    let lastUrl = '';
    let lastActionTime = 0;

    if (!actions || !Array.isArray(actions)) {
      console.warn('optimizeActionSequence: actions is not a valid array');
      return [];
    }

    for (const action of actions) {
      // Skip redundant navigation actions
      if (action.type === 'navigation') {
        // Keep only user-initiated navigations or significant page changes
        if (action.isUserInitiated || this.isSignificantPageChange(action.url, lastUrl)) {
          // Merge with meaningful description instead of just URL
          const pageContext = this.getPageContext(action.url);
          optimizedActions.push({
            ...action,
            type: 'navigate',
            description: `Navigate to ${pageContext}`,
            isUserNavigation: true
          });
          lastUrl = action.url;
        }
        continue;
      }

      // Skip rapid duplicate actions
      if (this.isDuplicateAction(action, optimizedActions[optimizedActions.length - 1], lastActionTime)) {
        continue;
      }

      // Keep meaningful interactions
      if (this.isMeaningfulAction(action)) {
        optimizedActions.push(action);
        lastActionTime = action.timestamp;
        if (action.url) lastUrl = action.url;
      }
    }

    return optimizedActions;
  }

  /**
   * Determine whether a URL transition represents a meaningful page change
   * (different domain or path), ignoring query-param-only and hash changes.
   * @param {string} newUrl - The new URL navigated to
   * @param {string} lastUrl - The previous URL
   * @returns {boolean} True if the navigation is significant
   */
  isSignificantPageChange(newUrl, lastUrl) {
    if (!lastUrl) return true;
    
    // Different domains
    try {
      const newDomain = new URL(newUrl).hostname;
      const lastDomain = new URL(lastUrl).hostname;
      if (newDomain !== lastDomain) return true;
    } catch (e) {
      return true;
    }

    // Different path structure (not just query params)
    const newPath = newUrl.split('?')[0].split('#')[0];
    const lastPath = lastUrl.split('?')[0].split('#')[0];
    return newPath !== lastPath;
  }

  getPageContext(url) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      
      // Extract meaningful page identifiers
      if (pathParts.includes('login')) return 'login page';
      if (pathParts.includes('dashboard')) return 'dashboard';
      if (pathParts.includes('profile')) return 'user profile';
      if (pathParts.includes('home')) return 'home page';
      if (pathParts.includes('settings')) return 'settings page';
      
      // Use last meaningful path segment
      const lastSegment = pathParts[pathParts.length - 1];
      return lastSegment ? `${lastSegment} page` : urlObj.hostname;
    } catch (e) {
      return 'page';
    }
  }

  /**
   * Check if an action is a rapid duplicate of the immediately preceding action
   * (same type, same element, within 500ms).
   * @param {{ type: string, timestamp?: number, element?: { cssSelector?: string } }} action - Current action
   * @param {{ type: string, element?: { cssSelector?: string } } | undefined} lastAction - Previous action
   * @param {number} lastTime - Timestamp of the previous action
   * @returns {boolean} True if this action should be discarded as a duplicate
   */
  isDuplicateAction(action, lastAction, lastTime) {
    if (!lastAction) return false;
    
    // Same action type on same element within 500ms
    if (action.type === lastAction.type && 
        action.element?.cssSelector === lastAction.element?.cssSelector &&
        (action.timestamp - lastTime) < 500) {
      return true;
    }
    
    return false;
  }

  /**
   * Determine whether an action type represents a user-meaningful interaction
   * (click, input, change, submit, select, navigate) vs. noise (mouseover, blur, etc.).
   * @param {{ type: string }} action - Recorded action
   * @returns {boolean} True if the action should be kept in the optimized sequence
   */
  isMeaningfulAction(action) {
    const meaningfulTypes = ['click', 'input', 'change', 'submit', 'select', 'navigate'];
    
    // Skip noise events
    if (['mouseover', 'mouseout', 'focus', 'blur'].includes(action.type)) {
      return false;
    }
    
    return meaningfulTypes.includes(action.type);
  }

  /**
   * Build advanced system prompt with locator intelligence
   */
  buildAdvancedSystemPrompt(framework, options) {
    return `You are an expert ${framework} test automation engineer. Generate production-ready test scripts.

APPROACH:
- Infer the high-level user intent and journey goal from the recorded actions. Generate a test that validates the workflow outcome, not just replays clicks.
- Structure: setup/config → navigation → interaction → validation → cleanup.

RULES:
- Output ONLY valid, executable ${framework} code. No markdown fences, no explanations.
- Convert EVERY recorded action into test code. Do not skip actions.
- Locator priority: data-testid > ID > aria-label > name > role+text > placeholder > CSS.
- Avoid brittle selectors: no nth-child, no dynamic classes (e.g. "btn-xyz123", "css-1a2b3c"), no absolute XPath positions.
- Add assertions: element visibility before interaction, value verification after fill, URL check after navigation, success indicator after form submit.
- Use framework auto-waiting. Never use hardcoded sleep/waitForTimeout/time.sleep.
- Handle dynamic UI: wait for SPA route transitions, async-rendered content, and animations to settle before asserting.
- Mask sensitive data: replace passwords with "{{PASSWORD}}", API keys with "{{API_KEY}}", tokens with "{{TOKEN}}".
- Include test.describe wrapper, beforeEach setup, and proper teardown.

${framework.toUpperCase()} GUIDELINES:
${this.getFrameworkSpecificGuidelines(framework)}

LOCATOR EXAMPLES:

<button data-testid="login-btn" class="btn-xyz123">Login</button>
GOOD: page.getByTestId('login-btn').click()
BAD: page.click('.btn-xyz123')

<input name="email" aria-label="Email address" placeholder="Enter email">
GOOD: page.getByLabel('Email address').fill('user@example.com')
ALSO: page.locator('[name="email"]').fill('user@example.com')

<a href="/dashboard" class="nav-abc">Go to Dashboard</a>
GOOD: page.getByRole('link', { name: 'Go to Dashboard' }).click()
BAD: page.click('.nav-abc')

<input type="password" name="password" placeholder="Password">
GOOD: page.locator('[name="password"]').fill('{{PASSWORD}}')
BAD: page.locator('[name="password"]').fill('actual_password_here')`;
  }

  /**
   * Build advanced user prompt with detailed context
   */
  buildAdvancedUserPrompt(actions, framework, pageAnalysis, userJourney, elementContext, options) {
    const domStructure = this.buildDOMContextString(elementContext);
    
    return `Generate a complete ${framework} test for this user journey. Use ONLY the DOM data provided below.

Test Name: "${options.testName || 'FlowScribe User Journey'}"
Total actions: ${actions.length}
Pages visited: ${[...new Set(actions.map(a => a.url).filter(Boolean))].length}
URL patterns: ${this.extractURLPatterns(actions)}

USER JOURNEY:
${this.formatUserJourney(userJourney)}

PAGE ANALYSIS:
${this.formatPageAnalysis(pageAnalysis)}

DOM ELEMENTS:
${domStructure}

REQUIREMENTS:
- Convert ALL ${actions.length} actions into test steps
- Use the best locator from each element's DOM data (prefer testid > id > aria-label > name > role)
- Add visibility assertion before each interaction
- Add value assertion after fill operations
- Add URL assertion after navigation
- After page loads, verify page title or key heading is present
- Use framework auto-waiting, never hardcoded waits
- Wrap in test.describe with beforeEach setup`;
  }

  /**
   * Group actions by URL and analyze the page structure for each unique page:
   * element types, form interactions, modal presence, and interaction timeline.
   * @param {Array<{ url?: string, title?: string, element?: object, type: string, timestamp?: number, formContext?: { id?: string } }>} actions - Recorded actions
   * @returns {Array<{ url: string, title: string, elements: Array<object>, interactions: Array<object>, forms: Set<string>, modals: boolean, navigation: Array<any> }>} Per-page analysis
   */
  analyzePageStructure(actions) {
    const pages = new Map();
    
    if (!actions || !Array.isArray(actions)) {
      console.warn('analyzePageStructure: actions is not a valid array');
      return [];
    }
    
    actions.forEach(action => {
      if (!action || !action.url) return;
      
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
   * Build a numbered step-by-step user journey from recorded actions,
   * tracking page navigations and individual interactions.
   * @param {Array<{ url?: string, type: string, timestamp?: number, element?: object }>} actions - Recorded actions
   * @returns {Array<{ step: number, type: string, description: string, url?: string, timestamp?: number }>} Ordered journey steps
   */
  extractUserJourney(actions) {
    const journey = [];
    let currentPage = null;
    let stepCounter = 1;
    
    if (!actions || !Array.isArray(actions)) {
      console.warn('extractUserJourney: actions is not a valid array');
      return [];
    }
    
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
    if (!actions || !Array.isArray(actions)) {
      console.warn('extractElementContext: actions is not a valid array');
      return [];
    }

    const elementContext = actions.map(action => {
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

    console.log('🧩 Element context extracted:', {
      totalActions: actions.length,
      actionsWithElements: elementContext.length,
      elementTypes: elementContext.map(e => e.element?.tagName).filter(Boolean),
      hasFormContext: elementContext.some(e => e.element?.formContext && Object.keys(e.element.formContext).length > 0),
      hasAttributes: elementContext.some(e => e.element?.attributes && Object.keys(e.element.attributes).length > 0)
    });

    return elementContext;
  }

  /**
   * Generate an array of locator strategies for an element, ranked by priority
   * and stability score, covering data-testid, id, aria-label, name, text, and CSS fallbacks.
   * @param {{ id?: string, attributes?: Record<string, string>, name?: string, tagName: string, textContent?: string, className?: string, cssSelector?: string }} element - Recorded element data
   * @returns {Array<{ type: string, selector: string, priority: number, stability: number }>} Ranked locator strategies
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
    const steps = actions.slice(0, 20).map((action, i) => {
      const el = action.element;
      const selector = el?.id ? `#${el.id}` : (el?.name ? `[name="${el.name}"]` : (el?.cssSelector || el?.tagName?.toLowerCase() || 'unknown'));
      switch (action.type) {
        case 'click': return `// Step ${i + 1}: Click ${el?.tagName || 'element'}\nawait page.locator('${selector}').click();`;
        case 'input': return `// Step ${i + 1}: Fill ${el?.tagName || 'input'}\nawait page.locator('${selector}').fill('${(action.value || '').substring(0, 50)}');`;
        case 'navigation': return `// Step ${i + 1}: Navigate\nawait page.goto('${action.url || ''}');`;
        default: return `// Step ${i + 1}: ${action.type} on ${el?.tagName || 'element'}`;
      }
    });
    return `// Basic ${framework} script with ${actions.length} actions\n${steps.join('\n')}`;
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

// ESM export for webpack/service worker
export { EnhancedLocatorPromptGenerator };
