/**
 * Intelligent Assertion Generator
 * Automatically generates meaningful assertions based on user interactions and page state
 */

class AssertionGenerator {
  constructor() {
    this.assertions = [];
    this.elementStates = new Map();
    this.pageStates = new Map();
  }

  /**
   * Generate assertions based on action type and element state
   */
  generateAssertion(action, element, context) {
    const assertions = [];

    switch (action.type) {
      case 'click':
        assertions.push(...this.generateClickAssertions(element, context));
        break;
      case 'input':
      case 'change':
        assertions.push(...this.generateInputAssertions(element, action.value, context));
        break;
      case 'navigate':
        assertions.push(...this.generateNavigationAssertions(context));
        break;
      case 'select':
        assertions.push(...this.generateSelectAssertions(element, action.value, context));
        break;
      case 'hover':
        assertions.push(...this.generateHoverAssertions(element, context));
        break;
      case 'scroll':
        assertions.push(...this.generateScrollAssertions(context));
        break;
      case 'upload':
        assertions.push(...this.generateUploadAssertions(element, action.files, context));
        break;
      case 'drag':
        assertions.push(...this.generateDragAssertions(action, context));
        break;
    }

    // Add visibility assertion for all interactions
    if (element) {
      assertions.unshift(this.generateVisibilityAssertion(element));
    }

    // Add page load assertion
    if (this.shouldCheckPageLoad(action)) {
      assertions.push(this.generatePageLoadAssertion());
    }

    return assertions;
  }

  generateClickAssertions(element, context) {
    const assertions = [];

    // Check if element is enabled
    assertions.push({
      type: 'enabled',
      selector: this.getSelector(element),
      message: `Element should be enabled before clicking`
    });

    // Check for navigation after click
    if (element.tagName === 'A' || element.type === 'submit') {
      assertions.push({
        type: 'url_change',
        waitForNavigation: true,
        message: 'Page should navigate after click'
      });
    }

    // Check for modal/popup appearance
    if (this.isModalTrigger(element)) {
      assertions.push({
        type: 'element_appears',
        selector: '[role="dialog"], .modal, .popup',
        timeout: 3000,
        message: 'Modal/popup should appear after click'
      });
    }

    // Check for state changes (e.g., toggle buttons)
    if (this.isToggle(element)) {
      assertions.push({
        type: 'attribute_change',
        selector: this.getSelector(element),
        attribute: 'aria-pressed',
        message: 'Toggle state should change'
      });
    }

    // Check for loading indicators
    if (this.triggersLoading(element)) {
      assertions.push({
        type: 'loading_complete',
        selector: '.spinner, .loader, [data-loading]',
        message: 'Loading should complete after action'
      });
    }

    return assertions;
  }

  generateInputAssertions(element, value, context) {
    const assertions = [];

    // Verify input value was set
    assertions.push({
      type: 'value',
      selector: this.getSelector(element),
      expected: value,
      message: `Input value should be "${value}"`
    });

    // Check for validation messages
    if (element.required || element.pattern) {
      assertions.push({
        type: 'validation',
        selector: this.getSelector(element),
        valid: this.isValidInput(element, value),
        message: 'Input should pass validation'
      });
    }

    // Check for auto-complete or suggestions
    if (element.list || element.getAttribute('data-autocomplete')) {
      assertions.push({
        type: 'element_visible',
        selector: `#${element.list}, [role="listbox"]`,
        timeout: 1000,
        optional: true,
        message: 'Autocomplete suggestions may appear'
      });
    }

    // Check for real-time validation feedback
    const feedbackSelector = this.getValidationFeedbackSelector(element);
    if (feedbackSelector) {
      assertions.push({
        type: 'element_state',
        selector: feedbackSelector,
        state: 'visible',
        message: 'Validation feedback should be displayed'
      });
    }

    return assertions;
  }

  generateNavigationAssertions(context) {
    const assertions = [];

    // Wait for page load
    assertions.push({
      type: 'page_load',
      state: 'complete',
      message: 'Page should be fully loaded'
    });

    // Check URL
    assertions.push({
      type: 'url',
      pattern: context.url,
      message: `URL should match ${context.url}`
    });

    // Check page title
    if (context.title) {
      assertions.push({
        type: 'title',
        expected: context.title,
        message: `Page title should be "${context.title}"`
      });
    }

    // Check for critical elements
    assertions.push({
      type: 'element_visible',
      selector: 'h1, [role="main"], main',
      message: 'Main content should be visible'
    });

    return assertions;
  }

  generateSelectAssertions(element, value, context) {
    const assertions = [];

    // Verify selection
    assertions.push({
      type: 'selected',
      selector: this.getSelector(element),
      value: value,
      message: `Option "${value}" should be selected`
    });

    // Check for dependent field updates
    const dependentFields = this.getDependentFields(element);
    dependentFields.forEach(field => {
      assertions.push({
        type: 'element_update',
        selector: field,
        message: 'Dependent field should update'
      });
    });

    return assertions;
  }

  generateHoverAssertions(element, context) {
    const assertions = [];

    // Check for tooltip
    if (element.title || element.getAttribute('data-tooltip')) {
      assertions.push({
        type: 'tooltip_visible',
        selector: '[role="tooltip"], .tooltip',
        timeout: 500,
        message: 'Tooltip should appear on hover'
      });
    }

    // Check for dropdown menus
    if (this.isDropdownTrigger(element)) {
      assertions.push({
        type: 'element_visible',
        selector: this.getDropdownSelector(element),
        message: 'Dropdown menu should appear'
      });
    }

    return assertions;
  }

  generateScrollAssertions(context) {
    const assertions = [];

    // Check if target element is in viewport
    if (context.targetElement) {
      assertions.push({
        type: 'in_viewport',
        selector: this.getSelector(context.targetElement),
        message: 'Element should be visible in viewport after scroll'
      });
    }

    // Check for lazy-loaded content
    assertions.push({
      type: 'lazy_load_complete',
      selector: 'img[loading="lazy"], [data-lazy]',
      optional: true,
      message: 'Lazy-loaded content should load'
    });

    return assertions;
  }

  generateUploadAssertions(element, files, context) {
    const assertions = [];

    // Check file was accepted
    assertions.push({
      type: 'file_uploaded',
      selector: this.getSelector(element),
      fileCount: files.length,
      message: `${files.length} file(s) should be uploaded`
    });

    // Check for upload progress/success indicator
    assertions.push({
      type: 'upload_complete',
      selector: '.upload-success, [data-upload-status="success"]',
      timeout: 10000,
      message: 'Upload should complete successfully'
    });

    return assertions;
  }

  generateDragAssertions(action, context) {
    const assertions = [];

    // Check element moved
    assertions.push({
      type: 'element_moved',
      selector: this.getSelector(action.source),
      from: action.sourcePosition,
      to: action.targetPosition,
      message: 'Element should be moved to new position'
    });

    // Check for reorder if in list
    if (this.isReorderable(action.source)) {
      assertions.push({
        type: 'list_reordered',
        container: this.getListContainer(action.source),
        message: 'List should be reordered'
      });
    }

    return assertions;
  }

  generateVisibilityAssertion(element) {
    return {
      type: 'visible',
      selector: this.getSelector(element),
      message: 'Element should be visible',
      timeout: 5000
    };
  }

  generatePageLoadAssertion() {
    return {
      type: 'network_idle',
      timeout: 3000,
      message: 'Network requests should complete'
    };
  }

  /**
   * Generate smart waits based on context
   */
  generateWaitStrategies(action, context) {
    const waits = [];

    // Wait for animations to complete
    if (this.hasAnimations(action.element)) {
      waits.push({
        type: 'animation_complete',
        selector: this.getSelector(action.element),
        message: 'Wait for animations to complete'
      });
    }

    // Wait for AJAX requests
    if (this.triggersAjax(action)) {
      waits.push({
        type: 'network_idle',
        timeout: 5000,
        message: 'Wait for AJAX requests to complete'
      });
    }

    // Wait for dynamic content
    if (this.loadsDynamicContent(action)) {
      waits.push({
        type: 'element_stable',
        selector: this.getDynamicContentSelector(action),
        message: 'Wait for content to stabilize'
      });
    }

    return waits;
  }

  // Helper methods
  getSelector(element) {
    // Generate optimal selector using multiple strategies
    const strategies = [
      () => element.id ? `#${element.id}` : null,
      () => element.getAttribute('data-testid') ? `[data-testid="${element.getAttribute('data-testid')}"]` : null,
      () => element.getAttribute('aria-label') ? `[aria-label="${element.getAttribute('aria-label')}"]` : null,
      () => this.generateCssSelector(element),
      () => this.generateXPath(element)
    ];

    for (const strategy of strategies) {
      const selector = strategy();
      if (selector && this.isSelectorUnique(selector)) {
        return selector;
      }
    }

    return this.generateCssSelector(element);
  }

  generateCssSelector(element) {
    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${current.id}`;
        path.unshift(selector);
        break;
      }

      if (current.className) {
        const classes = current.className.split(' ').filter(c => c && !c.startsWith('is-') && !c.startsWith('has-'));
        if (classes.length) {
          selector += `.${classes.join('.')}`;
        }
      }

      const siblings = current.parentNode ? Array.from(current.parentNode.children) : [];
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }

      path.unshift(selector);
      current = current.parentNode;
    }

    return path.join(' > ');
  }

  generateXPath(element) {
    const paths = [];
    let current = element;

    while (current && current !== document.body) {
      let index = 0;
      const siblings = current.parentNode ? Array.from(current.parentNode.childNodes) : [];

      for (const sibling of siblings) {
        if (sibling === current) break;
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
          index++;
        }
      }

      const tagName = current.tagName.toLowerCase();
      const xpathIndex = index > 0 ? `[${index + 1}]` : '';
      paths.unshift(`${tagName}${xpathIndex}`);

      current = current.parentNode;
    }

    return `//${paths.join('/')}`;
  }

  isSelectorUnique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  isModalTrigger(element) {
    const triggers = ['data-toggle="modal"', 'data-bs-toggle="modal"', 'onclick.*modal', 'showModal'];
    return triggers.some(trigger =>
      element.outerHTML.includes(trigger) ||
      element.getAttribute('data-target')?.includes('modal')
    );
  }

  isToggle(element) {
    return element.getAttribute('role') === 'switch' ||
           element.type === 'checkbox' ||
           element.classList.contains('toggle') ||
           element.getAttribute('aria-pressed') !== null;
  }

  triggersLoading(element) {
    return element.type === 'submit' ||
           element.classList.contains('async') ||
           element.getAttribute('data-loading') !== null;
  }

  isValidInput(element, value) {
    if (element.required && !value) return false;
    if (element.pattern) {
      const regex = new RegExp(element.pattern);
      return regex.test(value);
    }
    if (element.type === 'email') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
    if (element.type === 'url') {
      return /^https?:\/\/.+/.test(value);
    }
    return true;
  }

  getValidationFeedbackSelector(element) {
    const id = element.id;
    if (id) {
      const possibleSelectors = [
        `#${id}-error`,
        `#${id}-feedback`,
        `.${id}-validation`,
        `[data-for="${id}"]`
      ];

      for (const selector of possibleSelectors) {
        if (document.querySelector(selector)) {
          return selector;
        }
      }
    }
    return null;
  }

  getDependentFields(element) {
    const dependents = [];
    const name = element.name || element.id;

    if (name) {
      const potentialDependents = document.querySelectorAll(`[data-depends-on="${name}"]`);
      potentialDependents.forEach(dep => {
        dependents.push(this.getSelector(dep));
      });
    }

    return dependents;
  }

  isDropdownTrigger(element) {
    return element.getAttribute('data-toggle') === 'dropdown' ||
           element.getAttribute('aria-haspopup') === 'true' ||
           element.classList.contains('dropdown-toggle');
  }

  getDropdownSelector(element) {
    const id = element.getAttribute('aria-controls');
    if (id) return `#${id}`;

    const dropdown = element.nextElementSibling;
    if (dropdown && dropdown.classList.contains('dropdown-menu')) {
      return this.getSelector(dropdown);
    }

    return '.dropdown-menu:visible';
  }

  isReorderable(element) {
    return element.draggable ||
           element.closest('[data-sortable]') ||
           element.closest('.sortable');
  }

  getListContainer(element) {
    const container = element.closest('ul, ol, [role="list"], .list-container');
    return container ? this.getSelector(container) : null;
  }

  hasAnimations(element) {
    if (!element) return false;
    const styles = window.getComputedStyle(element);
    return styles.animation !== 'none' ||
           styles.transition !== 'none' ||
           element.classList.toString().match(/fade|slide|animate/);
  }

  triggersAjax(action) {
    return action.type === 'click' && (
      action.element?.getAttribute('data-ajax') ||
      action.element?.classList.contains('ajax-trigger') ||
      action.element?.onclick?.toString().includes('fetch') ||
      action.element?.onclick?.toString().includes('ajax')
    );
  }

  loadsDynamicContent(action) {
    return action.element?.getAttribute('data-dynamic') ||
           action.element?.classList.contains('lazy-load') ||
           action.type === 'scroll';
  }

  getDynamicContentSelector(action) {
    const container = action.element?.getAttribute('data-target') ||
                     action.element?.getAttribute('data-container');
    return container ? `#${container}` : '[data-dynamic-content]';
  }

  shouldCheckPageLoad(action) {
    return action.type === 'navigate' ||
           (action.type === 'click' && action.element?.tagName === 'A');
  }
}

// Export for use in content script and popup
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AssertionGenerator;
}