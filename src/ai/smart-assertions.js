/**
 * Smart Assertions Generator
 * Automatically generates intelligent assertions based on page state changes and user context
 */

class SmartAssertionsGenerator {
  constructor() {
    this.assertionLevel = 'moderate'; // minimal, moderate, comprehensive
    this.assertionHistory = [];
  }

  /**
   * Generate smart assertions for a sequence of actions
   */
  generateAssertions(actions, options = {}) {
    this.assertionLevel = options.assertionLevel || 'moderate';
    const assertions = [];

    actions.forEach((action, index) => {
      const previousAction = index > 0 ? actions[index - 1] : null;
      const nextAction = index < actions.length - 1 ? actions[index + 1] : null;

      // Generate context-aware assertions for this action
      const actionAssertions = this.generateActionAssertions(
        action,
        previousAction,
        nextAction,
        index
      );

      assertions.push({
        actionIndex: index,
        action: action.type,
        assertions: actionAssertions
      });
    });

    return assertions;
  }

  /**
   * Generate assertions for a single action based on context
   */
  generateActionAssertions(action, previousAction, nextAction, index) {
    const assertions = [];

    // Pre-action assertions (before executing the action)
    assertions.push(...this.generatePreActionAssertions(action));

    // Post-action assertions (after executing the action)
    assertions.push(...this.generatePostActionAssertions(action, nextAction));

    // Context-based assertions
    assertions.push(...this.generateContextAssertions(action, previousAction, nextAction));

    // State change assertions
    assertions.push(...this.generateStateChangeAssertions(action, nextAction));

    return this.filterByAssertionLevel(assertions);
  }

  /**
   * Generate assertions that should run before the action
   */
  generatePreActionAssertions(action) {
    const assertions = [];
    const element = action.element || action.target;

    if (!element) return assertions;

    // Element existence
    assertions.push({
      type: 'element_present',
      priority: 'high',
      timing: 'before',
      selector: element.cssSelector || element.xpath,
      description: `Verify ${this.getElementLabel(element)} exists before interaction`,
      code: {
        playwright: `await expect(${this.generateLocator(element, 'playwright')}).toBeAttached();`,
        selenium: `wait.until(ExpectedConditions.presenceOfElementLocated(By.cssSelector("${element.cssSelector}")));`,
        cypress: `cy.get('${element.cssSelector}').should('exist');`,
        puppeteer: `await page.waitForSelector('${element.cssSelector}');`
      }
    });

    // Element visibility (for clickable elements)
    if (['click', 'hover'].includes(action.type)) {
      assertions.push({
        type: 'element_visible',
        priority: 'high',
        timing: 'before',
        selector: element.cssSelector,
        description: `Verify ${this.getElementLabel(element)} is visible`,
        code: {
          playwright: `await expect(${this.generateLocator(element, 'playwright')}).toBeVisible();`,
          selenium: `wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector("${element.cssSelector}")));`,
          cypress: `cy.get('${element.cssSelector}').should('be.visible');`,
          puppeteer: `await page.waitForSelector('${element.cssSelector}', { visible: true });`
        }
      });
    }

    // Element enabled (for form elements)
    if (['input', 'change', 'select'].includes(action.type) || element.tagName === 'INPUT') {
      assertions.push({
        type: 'element_enabled',
        priority: 'medium',
        timing: 'before',
        selector: element.cssSelector,
        description: `Verify ${this.getElementLabel(element)} is enabled`,
        code: {
          playwright: `await expect(${this.generateLocator(element, 'playwright')}).toBeEnabled();`,
          selenium: `assertTrue(driver.findElement(By.cssSelector("${element.cssSelector}")).isEnabled());`,
          cypress: `cy.get('${element.cssSelector}').should('not.be.disabled');`,
          puppeteer: `const isEnabled = await page.$eval('${element.cssSelector}', el => !el.disabled);\\nassert(isEnabled, 'Element should be enabled');`
        }
      });
    }

    return assertions;
  }

  /**
   * Generate assertions that should run after the action
   */
  generatePostActionAssertions(action, nextAction) {
    const assertions = [];
    const element = action.element || action.target;

    // Input value verification
    if (action.type === 'input' && action.value) {
      assertions.push({
        type: 'input_value',
        priority: 'high',
        timing: 'after',
        selector: element?.cssSelector,
        expectedValue: action.value,
        description: `Verify input contains value "${action.value}"`,
        code: {
          playwright: `await expect(${this.generateLocator(element, 'playwright')}).toHaveValue('${this.escapeString(action.value)}');`,
          selenium: `assertEquals("${this.escapeString(action.value)}", driver.findElement(By.cssSelector("${element.cssSelector}")).getAttribute("value"));`,
          cypress: `cy.get('${element.cssSelector}').should('have.value', '${this.escapeString(action.value)}');`,
          puppeteer: `const value = await page.$eval('${element.cssSelector}', el => el.value);\\nassert.strictEqual(value, '${this.escapeString(action.value)}');`
        }
      });
    }

    // Checkbox/radio state
    if (action.type === 'change' && action.checked !== undefined) {
      assertions.push({
        type: 'checkbox_state',
        priority: 'high',
        timing: 'after',
        selector: element?.cssSelector,
        expectedState: action.checked,
        description: `Verify checkbox is ${action.checked ? 'checked' : 'unchecked'}`,
        code: {
          playwright: action.checked
            ? `await expect(${this.generateLocator(element, 'playwright')}).toBeChecked();`
            : `await expect(${this.generateLocator(element, 'playwright')}).not.toBeChecked();`,
          selenium: action.checked
            ? `assertTrue(driver.findElement(By.cssSelector("${element.cssSelector}")).isSelected());`
            : `assertFalse(driver.findElement(By.cssSelector("${element.cssSelector}")).isSelected());`,
          cypress: action.checked
            ? `cy.get('${element.cssSelector}').should('be.checked');`
            : `cy.get('${element.cssSelector}').should('not.be.checked');`,
          puppeteer: `const isChecked = await page.$eval('${element.cssSelector}', el => el.checked);\\nassert.strictEqual(isChecked, ${action.checked});`
        }
      });
    }

    // Select value verification
    if (action.type === 'change' && element?.tagName === 'SELECT' && action.value) {
      assertions.push({
        type: 'select_value',
        priority: 'high',
        timing: 'after',
        selector: element.cssSelector,
        expectedValue: action.value,
        description: `Verify selected option is "${action.value}"`,
        code: {
          playwright: `await expect(${this.generateLocator(element, 'playwright')}).toHaveValue('${this.escapeString(action.value)}');`,
          selenium: `assertEquals("${this.escapeString(action.value)}", new Select(driver.findElement(By.cssSelector("${element.cssSelector}"))).getFirstSelectedOption().getAttribute("value"));`,
          cypress: `cy.get('${element.cssSelector}').should('have.value', '${this.escapeString(action.value)}');`,
          puppeteer: `const value = await page.$eval('${element.cssSelector}', el => el.value);\\nassert.strictEqual(value, '${this.escapeString(action.value)}');`
        }
      });
    }

    // Navigation assertions
    if (nextAction && nextAction.url !== action.url) {
      assertions.push({
        type: 'navigation',
        priority: 'high',
        timing: 'after',
        expectedUrl: nextAction.url,
        description: `Verify navigation to ${this.formatUrl(nextAction.url)}`,
        code: {
          playwright: `await expect(page).toHaveURL(/${this.getUrlPattern(nextAction.url)}/);`,
          selenium: `wait.until(ExpectedConditions.urlMatches("${this.getUrlPattern(nextAction.url)}"));`,
          cypress: `cy.url().should('include', '${this.getUrlPattern(nextAction.url)}');`,
          puppeteer: `await page.waitForNavigation();\\nassert(page.url().includes('${this.getUrlPattern(nextAction.url)}'));`
        }
      });
    }

    // Form submission assertions
    if (action.type === 'submit' || (action.type === 'click' && element?.type === 'submit')) {
      assertions.push({
        type: 'form_submission',
        priority: 'high',
        timing: 'after',
        description: 'Verify form submission success',
        code: {
          playwright: `await page.waitForLoadState('networkidle');\\nawait expect(page).toHaveURL(/.*/); // Verify navigation occurred`,
          selenium: `wait.until(ExpectedConditions.not(ExpectedConditions.urlToBe(driver.getCurrentUrl())));`,
          cypress: `cy.url().should('not.eq', Cypress.config().baseUrl);`,
          puppeteer: `await page.waitForNavigation({ waitUntil: 'networkidle0' });`
        }
      });

      // Check for success message
      assertions.push({
        type: 'success_message',
        priority: 'medium',
        timing: 'after',
        description: 'Verify success message appears',
        code: {
          playwright: `await expect(page.getByText(/success|submitted|thank you/i)).toBeVisible({ timeout: 10000 });`,
          selenium: `wait.until(ExpectedConditions.visibilityOfElementLocated(By.xpath("//*[contains(translate(text(), 'SUCCESS', 'success'), 'success') or contains(translate(text(), 'SUBMITTED', 'submitted'), 'submitted')]")));`,
          cypress: `cy.contains(/success|submitted|thank you/i, { timeout: 10000 }).should('be.visible');`,
          puppeteer: `await page.waitForFunction(() => document.body.innerText.match(/success|submitted|thank you/i), { timeout: 10000 });`
        }
      });
    }

    return assertions;
  }

  /**
   * Generate context-based assertions
   */
  generateContextAssertions(action, previousAction, nextAction) {
    const assertions = [];

    // Modal/dialog detection
    if (this.detectsModal(action)) {
      assertions.push({
        type: 'modal_visible',
        priority: 'medium',
        timing: 'after',
        description: 'Verify modal/dialog is visible',
        code: {
          playwright: `await expect(page.locator('[role="dialog"], .modal, .dialog-container')).toBeVisible();`,
          selenium: `wait.until(ExpectedConditions.visibilityOfElementLocated(By.cssSelector("[role='dialog'], .modal, .dialog-container")));`,
          cypress: `cy.get('[role="dialog"], .modal, .dialog-container').should('be.visible');`,
          puppeteer: `await page.waitForSelector('[role="dialog"], .modal, .dialog-container', { visible: true });`
        }
      });
    }

    // Loading state detection
    if (this.triggersLoading(action)) {
      assertions.push({
        type: 'loading_complete',
        priority: 'high',
        timing: 'after',
        description: 'Wait for loading to complete',
        code: {
          playwright: `await expect(page.locator('.loading, .spinner, [aria-busy="true"]')).toBeHidden({ timeout: 30000 });`,
          selenium: `wait.until(ExpectedConditions.invisibilityOfElementLocated(By.cssSelector(".loading, .spinner, [aria-busy='true']")));`,
          cypress: `cy.get('.loading, .spinner, [aria-busy="true"]', { timeout: 30000 }).should('not.exist');`,
          puppeteer: `await page.waitForSelector('.loading, .spinner, [aria-busy="true"]', { hidden: true, timeout: 30000 });`
        }
      });
    }

    // Error state detection
    if (this.shouldCheckForErrors(action)) {
      assertions.push({
        type: 'no_errors',
        priority: 'medium',
        timing: 'after',
        description: 'Verify no error messages appear',
        code: {
          playwright: `await expect(page.locator('.error, .alert-danger, [role="alert"]')).toBeHidden();`,
          selenium: `assertEquals(0, driver.findElements(By.cssSelector(".error, .alert-danger, [role='alert']")).size());`,
          cypress: `cy.get('.error, .alert-danger, [role="alert"]').should('not.exist');`,
          puppeteer: `const errors = await page.$$('.error, .alert-danger, [role="alert"]');\\nassert.strictEqual(errors.length, 0, 'No error messages should be present');`
        }
      });
    }

    return assertions;
  }

  /**
   * Generate state change assertions
   */
  generateStateChangeAssertions(action, nextAction) {
    const assertions = [];

    // Button state changes (disabled after click)
    if (action.type === 'click' && action.element?.tagName === 'BUTTON') {
      const element = action.element;

      // Check if button might be disabled after click (submit buttons often are)
      if (element.type === 'submit' || element.textContent?.match(/submit|send|save/i)) {
        assertions.push({
          type: 'button_disabled',
          priority: 'low',
          timing: 'after',
          selector: element.cssSelector,
          description: 'Verify button is disabled during processing (optional)',
          code: {
            playwright: `// Optional: Check if button is disabled during processing\\ntry { await expect(${this.generateLocator(element, 'playwright')}).toBeDisabled({ timeout: 1000 }); } catch {}`,
            selenium: `// Optional: Button might be disabled during processing`,
            cypress: `// Optional: cy.get('${element.cssSelector}').should('be.disabled');`,
            puppeteer: `// Optional: Check if button is disabled`
          }
        });
      }
    }

    // Element appearance/disappearance
    if (this.shouldCheckElementAppearance(action, nextAction)) {
      assertions.push({
        type: 'element_appears',
        priority: 'medium',
        timing: 'after',
        description: 'Verify expected element appears after action',
        code: {
          playwright: `// Add assertion for element that should appear after this action`,
          selenium: `// Add assertion for element that should appear after this action`,
          cypress: `// Add assertion for element that should appear after this action`,
          puppeteer: `// Add assertion for element that should appear after this action`
        }
      });
    }

    return assertions;
  }

  /**
   * Filter assertions based on assertion level
   */
  filterByAssertionLevel(assertions) {
    switch (this.assertionLevel) {
      case 'minimal':
        return assertions.filter(a => a.priority === 'high');
      case 'moderate':
        return assertions.filter(a => ['high', 'medium'].includes(a.priority));
      case 'comprehensive':
        return assertions; // Include all
      default:
        return assertions.filter(a => ['high', 'medium'].includes(a.priority));
    }
  }

  /**
   * Helper methods
   */

  getElementLabel(element) {
    if (element.attributes?.['aria-label']) {
      return `"${element.attributes['aria-label']}"`;
    }
    if (element.textContent) {
      return `"${element.textContent.substring(0, 25)}"`;
    }
    if (element.id) {
      return `#${element.id}`;
    }
    if (element.tagName) {
      return element.tagName.toLowerCase();
    }
    return 'element';
  }

  generateLocator(element, framework) {
    if (!element) return 'page.locator("body")';

    // Playwright-specific
    if (framework === 'playwright') {
      if (element.attributes?.['data-testid']) {
        return `page.getByTestId('${element.attributes['data-testid']}')`;
      }
      if (element.attributes?.['aria-label']) {
        return `page.getByLabel('${element.attributes['aria-label']}')`;
      }
      if (element.textContent && element.textContent.trim().length < 50) {
        return `page.getByText('${this.escapeString(element.textContent.trim())}')`;
      }
    }

    return `page.locator('${element.cssSelector || 'body'}')`;
  }

  escapeString(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  formatUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  getUrlPattern(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.replace(/\//g, '\\/');
    } catch {
      return url.replace(/\//g, '\\/');
    }
  }

  detectsModal(action) {
    const element = action.element || action.target;
    if (!element) return false;

    return element.attributes?.['data-toggle'] === 'modal' ||
           element.attributes?.['data-bs-toggle'] === 'modal' ||
           element.className?.includes('modal') ||
           element.textContent?.match(/open|show|display/i);
  }

  triggersLoading(action) {
    return ['click', 'submit', 'navigate'].includes(action.type);
  }

  shouldCheckForErrors(action) {
    return ['submit', 'input', 'change'].includes(action.type);
  }

  shouldCheckElementAppearance(action, nextAction) {
    // Check if next action targets a different element (suggesting something appeared)
    if (!nextAction) return false;

    const currentElement = action.element || action.target;
    const nextElement = nextAction.element || nextAction.target;

    return currentElement?.cssSelector !== nextElement?.cssSelector;
  }

  /**
   * Generate AI-powered assertion suggestions
   */
  async generateAIAssertions(action, context, aiService) {
    if (!aiService || !aiService.isConfigured()) {
      return [];
    }

    const prompt = `
Given this user action, suggest relevant assertions:

ACTION: ${action.type}
ELEMENT: ${JSON.stringify(action.element || action.target, null, 2)}
VALUE: ${action.value || 'N/A'}
PAGE CONTEXT: ${context.pageTitle || 'Unknown'}
URL: ${action.url || 'N/A'}

Suggest 2-3 critical assertions that should be validated after this action.
Focus on: state changes, user feedback, navigation, and data validation.

Return as JSON array:
[
  {
    "type": "assertion_type",
    "description": "What to verify",
    "selector": "CSS selector or locator strategy",
    "expectedValue": "expected value if applicable"
  }
]
`;

    try {
      const response = await aiService.generateAssertionSuggestions(prompt);
      return this.parseAIAssertions(response);
    } catch (error) {
      console.warn('AI assertion generation failed:', error);
      return [];
    }
  }

  parseAIAssertions(aiResponse) {
    try {
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('Failed to parse AI assertions:', error);
    }
    return [];
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SmartAssertionsGenerator;
}
