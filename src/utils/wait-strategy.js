/**
 * Intelligent Wait Strategy System
 * Automatically determines optimal wait conditions based on action context
 */

class WaitStrategyEngine {
  constructor() {
    this.strategies = {
      element: new ElementWaitStrategy(),
      network: new NetworkWaitStrategy(),
      animation: new AnimationWaitStrategy(),
      navigation: new NavigationWaitStrategy(),
      custom: new CustomWaitStrategy()
    };
  }

  /**
   * Analyze action and determine optimal wait strategies
   */
  determineWaitStrategy(action, previousAction, pageContext) {
    const strategies = [];

    // Analyze action type
    const typeBasedStrategy = this.getActionTypeStrategy(action);
    if (typeBasedStrategy) strategies.push(typeBasedStrategy);

    // Analyze element properties
    const elementStrategy = this.getElementStrategy(action.target);
    if (elementStrategy) strategies.push(elementStrategy);

    // Analyze page context
    const contextStrategy = this.getContextStrategy(pageContext);
    if (contextStrategy) strategies.push(contextStrategy);

    // Analyze transition between actions
    const transitionStrategy = this.getTransitionStrategy(previousAction, action);
    if (transitionStrategy) strategies.push(transitionStrategy);

    // Optimize and combine strategies
    return this.optimizeStrategies(strategies);
  }

  getActionTypeStrategy(action) {
    const strategies = {
      click: {
        type: 'composite',
        waits: [
          { type: 'element_clickable', selector: action.target?.selector },
          { type: 'element_stable', duration: 500 }
        ]
      },
      input: {
        type: 'composite',
        waits: [
          { type: 'element_enabled', selector: action.target?.selector },
          { type: 'element_focused', afterAction: true }
        ]
      },
      navigate: {
        type: 'page_load',
        conditions: ['domcontentloaded', 'networkidle0'],
        timeout: 30000
      },
      submit: {
        type: 'composite',
        waits: [
          { type: 'form_valid', selector: action.target?.selector },
          { type: 'network_idle', afterAction: true, timeout: 5000 }
        ]
      },
      hover: {
        type: 'element_visible',
        selector: action.target?.selector,
        stable: true
      },
      scroll: {
        type: 'composite',
        waits: [
          { type: 'scroll_stable', duration: 300 },
          { type: 'lazy_load_complete', optional: true }
        ]
      },
      'drag-drop': {
        type: 'composite',
        waits: [
          { type: 'element_draggable', selector: action.source?.element?.selector },
          { type: 'drop_zone_ready', selector: action.target?.selector }
        ]
      }
    };

    return strategies[action.type];
  }

  getElementStrategy(target) {
    if (!target) return null;

    const strategies = [];

    // Check for dynamic elements
    if (this.isDynamicElement(target)) {
      strategies.push({
        type: 'element_stable',
        selector: target.selector,
        duration: 1000,
        description: 'Wait for dynamic element to stabilize'
      });
    }

    // Check for async loaded elements
    if (this.isAsyncElement(target)) {
      strategies.push({
        type: 'element_loaded',
        selector: target.selector,
        timeout: 5000,
        description: 'Wait for async element to load'
      });
    }

    // Check for animated elements
    if (this.isAnimatedElement(target)) {
      strategies.push({
        type: 'animation_complete',
        selector: target.selector,
        description: 'Wait for animations to complete'
      });
    }

    // Check for form elements
    if (this.isFormElement(target)) {
      strategies.push({
        type: 'form_ready',
        selector: target.selector,
        description: 'Wait for form to be ready'
      });
    }

    return strategies.length ? { type: 'composite', waits: strategies } : null;
  }

  getContextStrategy(pageContext) {
    if (!pageContext) return null;

    const strategies = [];

    // SPA detection
    if (this.isSPA(pageContext)) {
      strategies.push({
        type: 'spa_navigation',
        indicators: ['route_change', 'history_update'],
        description: 'Wait for SPA navigation'
      });
    }

    // Heavy JavaScript framework detection
    if (this.hasFramework(pageContext)) {
      strategies.push({
        type: 'framework_ready',
        framework: pageContext.framework,
        description: `Wait for ${pageContext.framework} to be ready`
      });
    }

    // AJAX heavy site
    if (this.isAjaxHeavy(pageContext)) {
      strategies.push({
        type: 'xhr_complete',
        patterns: pageContext.ajaxPatterns,
        description: 'Wait for AJAX requests to complete'
      });
    }

    return strategies.length ? { type: 'composite', waits: strategies } : null;
  }

  getTransitionStrategy(previousAction, currentAction) {
    if (!previousAction) return null;

    const strategies = [];

    // Navigation transition
    if (this.isNavigationTransition(previousAction, currentAction)) {
      strategies.push({
        type: 'navigation_complete',
        fromUrl: previousAction.url,
        toUrl: currentAction.url,
        description: 'Wait for page navigation'
      });
    }

    // Modal/Dialog transition
    if (this.isModalTransition(previousAction, currentAction)) {
      strategies.push({
        type: 'modal_ready',
        action: this.getModalAction(previousAction),
        description: 'Wait for modal to be ready'
      });
    }

    // Tab/Window switch
    if (this.isTabSwitch(previousAction, currentAction)) {
      strategies.push({
        type: 'tab_ready',
        tabId: currentAction.tabId,
        description: 'Wait for tab to be ready'
      });
    }

    return strategies.length ? { type: 'composite', waits: strategies } : null;
  }

  optimizeStrategies(strategies) {
    // Remove duplicates
    const unique = this.removeDuplicateStrategies(strategies);

    // Combine related strategies
    const combined = this.combineRelatedStrategies(unique);

    // Order by priority
    const ordered = this.orderByPriority(combined);

    // Add smart timeouts
    return this.addSmartTimeouts(ordered);
  }

  removeDuplicateStrategies(strategies) {
    const seen = new Set();
    return strategies.filter(strategy => {
      const key = JSON.stringify(strategy);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  combineRelatedStrategies(strategies) {
    const combined = [];
    const groups = {};

    // Group by type
    strategies.forEach(strategy => {
      const type = strategy.type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(strategy);
    });

    // Combine groups
    Object.entries(groups).forEach(([type, group]) => {
      if (group.length === 1) {
        combined.push(group[0]);
      } else {
        combined.push(this.mergeStrategies(type, group));
      }
    });

    return combined;
  }

  mergeStrategies(type, strategies) {
    // Merge strategies of the same type
    const merged = { type, conditions: [] };

    strategies.forEach(strategy => {
      if (strategy.selector) {
        merged.selectors = merged.selectors || [];
        merged.selectors.push(strategy.selector);
      }
      if (strategy.conditions) {
        merged.conditions.push(...strategy.conditions);
      }
      if (strategy.timeout) {
        merged.timeout = Math.max(merged.timeout || 0, strategy.timeout);
      }
    });

    // Deduplicate
    if (merged.selectors) {
      merged.selectors = [...new Set(merged.selectors)];
    }
    if (merged.conditions) {
      merged.conditions = [...new Set(merged.conditions)];
    }

    return merged;
  }

  orderByPriority(strategies) {
    const priorityOrder = [
      'element_exists',
      'element_visible',
      'element_clickable',
      'element_stable',
      'animation_complete',
      'network_idle',
      'page_load',
      'custom'
    ];

    return strategies.sort((a, b) => {
      const aPriority = priorityOrder.indexOf(a.type);
      const bPriority = priorityOrder.indexOf(b.type);
      return aPriority - bPriority;
    });
  }

  addSmartTimeouts(strategies) {
    return strategies.map(strategy => {
      if (!strategy.timeout) {
        strategy.timeout = this.calculateSmartTimeout(strategy);
      }
      return strategy;
    });
  }

  calculateSmartTimeout(strategy) {
    const timeouts = {
      'element_exists': 5000,
      'element_visible': 5000,
      'element_clickable': 5000,
      'element_stable': 2000,
      'animation_complete': 3000,
      'network_idle': 10000,
      'page_load': 30000,
      'spa_navigation': 5000,
      'framework_ready': 5000,
      'xhr_complete': 10000,
      'custom': 5000
    };

    return timeouts[strategy.type] || 5000;
  }

  // Helper methods
  isDynamicElement(target) {
    return target.attributes?.['data-dynamic'] ||
           target.className?.includes('dynamic') ||
           target.attributes?.['v-if'] ||
           target.attributes?.['ng-if'] ||
           target.attributes?.['*ngIf'];
  }

  isAsyncElement(target) {
    return target.attributes?.['data-async'] ||
           target.className?.includes('lazy') ||
           target.attributes?.['loading'];
  }

  isAnimatedElement(target) {
    return target.styles?.animation !== 'none' ||
           target.styles?.transition !== 'none' ||
           target.className?.match(/fade|slide|animate|transition/);
  }

  isFormElement(target) {
    const tagName = (target.tagName || '').toLowerCase();
    return ['input', 'select', 'textarea', 'form'].includes(tagName);
  }

  isSPA(pageContext) {
    // Auto-detect framework if not provided
    const detectedFramework = this.detectFrameworkFromDOM();

    return pageContext?.framework?.match(/react|angular|vue|svelte|ember/) ||
           detectedFramework ||
           pageContext?.hasPushState ||
           pageContext?.hasRouter;
  }

  hasFramework(pageContext) {
    // Auto-detect framework if not provided
    if (pageContext?.framework) {
      return true;
    }

    return !!this.detectFrameworkFromDOM();
  }

  /**
   * Auto-detect JavaScript framework from DOM elements
   * Looks for framework-specific attributes and patterns
   */
  detectFrameworkFromDOM() {
    // This runs in the extension context, not page context
    // Would need to be injected into page or use content script
    // For now, return null and rely on pageContext
    // TODO: Implement via content script injection
    return null;
  }

  /**
   * Detect framework from page context (to be called from content script)
   * This method should be injected into the page context
   */
  static detectFrameworkInPage() {
    const detectors = {
      react: () => {
        // React 16+ (with Fiber)
        if (document.querySelector('[data-reactroot]') ||
            document.querySelector('[data-reactid]')) {
          return 'react';
        }

        // React 17+
        const root = document.getElementById('root');
        if (root && root._reactRootContainer) {
          return 'react';
        }

        // Check for React DevTools
        if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
          return 'react';
        }

        // Check for React in window
        if (window.React || window.ReactDOM) {
          return 'react';
        }

        return null;
      },

      angular: () => {
        // Angular.js (1.x)
        if (document.querySelector('[ng-app]') ||
            document.querySelector('[data-ng-app]') ||
            document.querySelector('[ng-controller]')) {
          return 'angular';
        }

        // Angular 2+
        if (document.querySelector('[ng-version]')) {
          return 'angular';
        }

        // Check for Angular in window
        if (window.angular || window.ng) {
          return 'angular';
        }

        // Check for Angular elements
        if (document.querySelector('app-root') ||
            document.querySelectorAll('[_ngcontent]').length > 0 ||
            document.querySelectorAll('[_nghost]').length > 0) {
          return 'angular';
        }

        return null;
      },

      vue: () => {
        // Vue 2/3
        if (document.querySelector('[data-v-]') ||
            document.querySelector('[v-cloak]')) {
          return 'vue';
        }

        // Check for Vue-specific attributes
        const vueAttrs = document.querySelectorAll('[class*="v-"]');
        if (vueAttrs.length > 0) {
          return 'vue';
        }

        // Check for Vue in window
        if (window.Vue || window.__VUE__) {
          return 'vue';
        }

        // Vue DevTools detection
        if (window.__VUE_DEVTOOLS_GLOBAL_HOOK__) {
          return 'vue';
        }

        return null;
      },

      svelte: () => {
        // Svelte adds data-svelte-* attributes
        if (document.querySelector('[data-svelte-h]') ||
            document.querySelector('[class*="svelte-"]')) {
          return 'svelte';
        }

        // Check for Svelte-specific patterns
        const svelteClasses = document.querySelectorAll('[class*="s-"]');
        if (svelteClasses.length > 5) { // Svelte generates s-xxx classes
          return 'svelte';
        }

        return null;
      },

      ember: () => {
        // Ember.js
        if (document.querySelector('[class*="ember-"]') ||
            document.querySelector('[id*="ember"]')) {
          return 'ember';
        }

        // Check for Ember in window
        if (window.Ember || window.Em) {
          return 'ember';
        }

        return null;
      },

      nextjs: () => {
        // Next.js detection
        if (document.getElementById('__next') ||
            document.querySelector('[id="__NEXT_DATA__"]')) {
          return 'nextjs';
        }

        return null;
      },

      nuxt: () => {
        // Nuxt.js detection
        if (document.getElementById('__nuxt') ||
            document.querySelector('[data-n-head]')) {
          return 'nuxt';
        }

        return null;
      },

      gatsby: () => {
        // Gatsby detection
        if (document.getElementById('___gatsby') ||
            document.querySelector('[id="gatsby-focus-wrapper"]')) {
          return 'gatsby';
        }

        return null;
      }
    };

    // Try each detector in order
    for (const [name, detector] of Object.entries(detectors)) {
      const result = detector();
      if (result) {
        return result;
      }
    }

    return null;
  }

  isAjaxHeavy(pageContext) {
    return pageContext?.ajaxRequestCount > 5 ||
           pageContext?.hasWebSocket ||
           pageContext?.hasEventSource;
  }

  isNavigationTransition(prev, curr) {
    return prev.url !== curr.url;
  }

  isModalTransition(prev, curr) {
    return prev.type === 'click' &&
           (prev.target?.attributes?.['data-toggle'] === 'modal' ||
            curr.target?.className?.includes('modal'));
  }

  isTabSwitch(prev, curr) {
    return prev.tabId !== curr.tabId;
  }

  getModalAction(action) {
    return action.target?.attributes?.['data-toggle'] === 'modal' ? 'open' : 'close';
  }
}

/**
 * Element Wait Strategy
 */
class ElementWaitStrategy {
  generateCode(strategy, framework) {
    const generators = {
      playwright: this.generatePlaywright.bind(this),
      selenium: this.generateSelenium.bind(this),
      cypress: this.generateCypress.bind(this),
      puppeteer: this.generatePuppeteer.bind(this)
    };

    return generators[framework](strategy);
  }

  generatePlaywright(strategy) {
    switch (strategy.type) {
      case 'element_visible':
        return `await page.waitForSelector('${strategy.selector}', { state: 'visible', timeout: ${strategy.timeout} });`;
      case 'element_clickable':
        return `await page.waitForSelector('${strategy.selector}', { state: 'attached', timeout: ${strategy.timeout} });`;
      case 'element_stable':
        return `await page.waitForSelector('${strategy.selector}', { state: 'stable', timeout: ${strategy.timeout} });`;
      case 'element_enabled':
        return `await page.waitForSelector('${strategy.selector}:enabled', { timeout: ${strategy.timeout} });`;
      default:
        return `await page.waitForSelector('${strategy.selector}', { timeout: ${strategy.timeout} });`;
    }
  }

  generateSelenium(strategy) {
    switch (strategy.type) {
      case 'element_visible':
        return `wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector("${strategy.selector}")));`;
      case 'element_clickable':
        return `wait.until(ExpectedConditions.elementToBeClickable(By.cssSelector("${strategy.selector}")));`;
      case 'element_enabled':
        return `wait.until(ExpectedConditions.presenceOfElementLocated(By.cssSelector("${strategy.selector}:enabled")));`;
      default:
        return `wait.until(ExpectedConditions.presenceOfElementLocated(By.cssSelector("${strategy.selector}")));`;
    }
  }

  generateCypress(strategy) {
    switch (strategy.type) {
      case 'element_visible':
        return `cy.get('${strategy.selector}', { timeout: ${strategy.timeout} }).should('be.visible');`;
      case 'element_clickable':
        return `cy.get('${strategy.selector}', { timeout: ${strategy.timeout} }).should('not.be.disabled');`;
      case 'element_enabled':
        return `cy.get('${strategy.selector}', { timeout: ${strategy.timeout} }).should('be.enabled');`;
      default:
        return `cy.get('${strategy.selector}', { timeout: ${strategy.timeout} }).should('exist');`;
    }
  }

  generatePuppeteer(strategy) {
    switch (strategy.type) {
      case 'element_visible':
        return `await page.waitForSelector('${strategy.selector}', { visible: true, timeout: ${strategy.timeout} });`;
      case 'element_clickable':
        return `await page.waitForSelector('${strategy.selector}', { visible: true, timeout: ${strategy.timeout} });`;
      default:
        return `await page.waitForSelector('${strategy.selector}', { timeout: ${strategy.timeout} });`;
    }
  }
}

/**
 * Network Wait Strategy
 */
class NetworkWaitStrategy {
  generateCode(strategy, framework) {
    const generators = {
      playwright: () => `await page.waitForLoadState('networkidle', { timeout: ${strategy.timeout} });`,
      selenium: () => `// Wait for network idle - implement custom wait`,
      cypress: () => `cy.intercept('**').as('requests');\ncy.wait('@requests', { timeout: ${strategy.timeout} });`,
      puppeteer: () => `await page.waitForLoadState('networkidle0', { timeout: ${strategy.timeout} });`
    };

    return generators[framework]();
  }
}

/**
 * Animation Wait Strategy
 */
class AnimationWaitStrategy {
  generateCode(strategy, framework) {
    const generators = {
      playwright: () => `await page.waitForSelector('${strategy.selector}', { state: 'stable' });\nawait page.waitForTimeout(500); // Animation complete`,
      selenium: () => `Thread.sleep(500); // Wait for animation`,
      cypress: () => `cy.get('${strategy.selector}').should('have.css', 'animation').and('not.be', 'running');`,
      puppeteer: () => `await page.waitForSelector('${strategy.selector}');\nawait page.waitForTimeout(500);`
    };

    return generators[framework]();
  }
}

/**
 * Navigation Wait Strategy
 */
class NavigationWaitStrategy {
  generateCode(strategy, framework) {
    const generators = {
      playwright: () => `await page.waitForURL(${strategy.urlPattern ? `'${strategy.urlPattern}'` : '/./'}, { timeout: ${strategy.timeout} });`,
      selenium: () => `wait.until(ExpectedConditions.urlMatches("${strategy.urlPattern || '.*'}"));`,
      cypress: () => `cy.url().should('include', '${strategy.urlPattern || ''}');`,
      puppeteer: () => `await page.waitForNavigation({ timeout: ${strategy.timeout} });`
    };

    return generators[framework]();
  }
}

/**
 * Custom Wait Strategy
 */
class CustomWaitStrategy {
  generateCode(strategy, framework) {
    const generators = {
      playwright: () => this.generatePlaywrightCustom(strategy),
      selenium: () => this.generateSeleniumCustom(strategy),
      cypress: () => this.generateCypressCustom(strategy),
      puppeteer: () => this.generatePuppeteerCustom(strategy)
    };

    return generators[framework]();
  }

  generatePlaywrightCustom(strategy) {
    return `// Custom wait: ${strategy.description}
await page.waitForFunction(
  ${strategy.condition},
  { timeout: ${strategy.timeout} }
);`;
  }

  generateSeleniumCustom(strategy) {
    return `// Custom wait: ${strategy.description}
wait.until(new ExpectedCondition<Boolean>() {
    public Boolean apply(WebDriver driver) {
        return (Boolean) ((JavascriptExecutor) driver).executeScript(
            "${strategy.condition}"
        );
    }
});`;
  }

  generateCypressCustom(strategy) {
    return `// Custom wait: ${strategy.description}
cy.window().then(win => {
  cy.wrap(null).should(() => {
    expect(win.eval(\`${strategy.condition}\`)).to.be.true;
  });
});`;
  }

  generatePuppeteerCustom(strategy) {
    return `// Custom wait: ${strategy.description}
await page.waitForFunction(
  ${strategy.condition},
  { timeout: ${strategy.timeout} }
);`;
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WaitStrategyEngine;
}