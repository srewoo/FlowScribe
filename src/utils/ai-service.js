class AIService {
  constructor() {
    this.providers = {
      openai: {
        name: 'OpenAI',
        models: ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
        endpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o-mini'
      },
      anthropic: {
        name: 'Anthropic',
        models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
        endpoint: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-3-5-sonnet-20241022'
      },
      google: {
        name: 'Google AI',
        models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
        defaultModel: 'gemini-1.5-flash'
      }
    };
    
    this.settings = {};
    this.loadSettings();
  }

  async loadSettings() {
    try {
      // Load from the main settings storage to maintain consistency
      const result = await chrome.storage.local.get(['flowScribeSettings']);
      const mainSettings = result.flowScribeSettings || {};
      
      this.settings = {
        provider: mainSettings.aiProvider || 'openai',
        model: 'gpt-4o-mini',
        apiKey: mainSettings.apiKey || '',
        enableAI: mainSettings.enableAI || false,
        maxTokens: 2000,
        temperature: 0.1
      };
    } catch (error) {
      console.error('Failed to load AI settings:', error);
      this.settings = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: '',
        enableAI: false,
        maxTokens: 2000,
        temperature: 0.1
      };
    }
  }

  async saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    // Don't save to separate aiSettings - let background script handle main storage
  }

  async updateSettings(newSettings) {
    // Update AI-specific settings when called from background script
    this.settings = {
      ...this.settings,
      provider: newSettings.provider || this.settings.provider,
      apiKey: newSettings.apiKey || this.settings.apiKey,
      enableAI: newSettings.enableAI !== undefined ? newSettings.enableAI : this.settings.enableAI
    };
    console.log('🤖 AI Service settings updated:', this.settings);
  }

  isConfigured() {
    return this.settings.enableAI && this.settings.apiKey && this.settings.provider;
  }

  async enhanceScript(actions, framework, options = {}) {
    if (!this.isConfigured()) {
      console.log('AI not configured, using template mode');
      return this.generateTemplateScript(actions, framework);
    }

    try {
      const prompt = this.buildEnhancementPrompt(actions, framework, options);
      const response = await this.callAIProvider(prompt);
      
      if (response && response.enhancedScript) {
        return response.enhancedScript;
      } else {
        console.warn('AI response invalid, falling back to template');
        return this.generateTemplateScript(actions, framework);
      }
    } catch (error) {
      console.error('AI enhancement failed:', error);
      return this.generateTemplateScript(actions, framework);
    }
  }

  buildEnhancementPrompt(actions, framework, options) {
    // Use the new enhanced prompt generator if available
    try {
      if (typeof require !== 'undefined') {
        const EnhancedLocatorPromptGenerator = require('../ai/prompt-templates/enhanced-locator-prompt.js');
        const promptGenerator = new EnhancedLocatorPromptGenerator();
        return promptGenerator.generateEnhancedPrompt(actions, framework, options);
      }
    } catch (error) {
      console.warn('Enhanced prompt generator not available, using fallback:', error);
    }

    // Fallback to enhanced version of original prompt
    const baseScript = this.generateTemplateScript(actions, framework);
    const pageAnalysis = this.analyzeActionsForContext(actions);
    const elementDetails = this.extractElementDetails(actions);
    
    return {
      systemPrompt: `You are an expert test automation architect specializing in ${framework} with advanced expertise in:

🎯 INTELLIGENT LOCATOR GENERATION:
- Analyze ACTUAL DOM structure from provided element data
- Create multiple fallback strategies for each element
- Prioritize: data-testid > unique ID > aria-label > name > stable attributes > text content
- Avoid brittle selectors (nth-child, dynamic classes, absolute positions)
- Generate robust XPath and CSS selectors with multiple fallback options
- Use relative positioning from stable parent elements

🛡️ COMPREHENSIVE ASSERTION STRATEGY:
- Validate element presence before interaction
- Verify text content, attributes, and form states
- Assert URL patterns and navigation success
- Check loading states and dynamic content
- Validate form submissions and error states
- Include accessibility and performance checks
- Test both positive and negative scenarios

🔄 COMPLETE JOURNEY COVERAGE:
- Ensure EVERY recorded action is represented
- Add intelligent waits for dynamic content
- Handle page transitions and form submissions
- Include error handling and retry mechanisms
- Verify complete user workflow end-to-end
- Add meaningful test descriptions and comments

Return only valid, executable ${framework} code with detailed comments explaining locator choices.`,
      
      userPrompt: `ENHANCE this ${framework} test script using ACTUAL ELEMENT DATA and COMPREHENSIVE TESTING:

==== CURRENT BASIC SCRIPT ====
${baseScript}

==== RECORDED USER JOURNEY ====
${this.formatUserJourney(actions)}

==== ACTUAL ELEMENT DATA ====
${elementDetails}

==== PAGE ANALYSIS ====
${pageAnalysis}

==== ENHANCEMENT REQUIREMENTS ====

🎯 INTELLIGENT LOCATORS:
- Use the provided element data above to create the best possible selectors
- Generate multiple fallback strategies for each element
- Prioritize stability: data-testid > unique ID > aria-label > name > stable attributes
- Explain your locator choices in comments
- NEVER assume element properties - use only the data provided above

🛡️ COMPREHENSIVE ASSERTIONS:
- Add element presence validation before each interaction
- Verify text content where applicable
- Check URL patterns for navigation: ${this.extractURLPatterns(actions)}
- Validate form states and submission results
- Assert loading states and dynamic content
- Include error handling for network failures

🔄 COMPLETE COVERAGE:
- Represent ALL ${actions.length} recorded actions
- Add appropriate waits for dynamic content
- Handle page transitions: ${[...new Set(actions.map(a => a.url))].length} unique pages
- Include retry logic and error recovery
- Test Name: "${options.testName || 'FlowScribe Complete User Journey'}"

CONFIGURATION:
- Include Screenshots: ${options.includeScreenshots !== false}
- Network Validation: ${options.includeNetworkAssertions || false}
- Accessibility Checks: ${options.includeA11yChecks || false}
- Self-Healing: ${options.applySelfHealing || false}

Generate a complete, production-ready ${framework} test that uses the BEST possible locators from the element data provided and includes comprehensive assertions for the entire user journey.`
    };
  }

  /**
   * Analyze actions to extract contextual information
   */
  analyzeActionsForContext(actions) {
    const pages = [...new Set(actions.map(a => a.url))];
    const elements = actions.filter(a => a.element).map(a => a.element);
    const interactions = actions.map(a => a.type);
    
    const hasTestIds = elements.some(e => 
      e.attributes && Object.keys(e.attributes).some(attr => 
        attr.includes('test') || attr.includes('qa') || attr.includes('cy')));
    
    const hasAriaLabels = elements.some(e => 
      e.attributes && e.attributes['aria-label']);
    
    const formElements = elements.filter(e => 
      ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.tagName));
    
    return `
Pages visited: ${pages.length} (${pages.map(p => new URL(p).pathname).join(', ')})
Total interactions: ${actions.length}
Element types: ${[...new Set(elements.map(e => e.tagName))].join(', ')}
Has test IDs: ${hasTestIds ? 'Yes' : 'No'}
Has ARIA labels: ${hasAriaLabels ? 'Yes' : 'No'}
Form elements: ${formElements.length}
Interaction types: ${[...new Set(interactions)].join(', ')}
    `.trim();
  }

  /**
   * Extract detailed element information for AI prompt
   */
  extractElementDetails(actions) {
    return actions.map((action, index) => {
      if (!action.element) return null;
      
      const el = action.element;
      const locatorOptions = this.generateLocatorOptions(el);
      
      return `
ACTION ${index + 1} (${action.type}):
  Element: ${el.tagName}${el.type ? `[type="${el.type}"]` : ''}
  ID: ${el.id || 'none'}
  Classes: ${el.className || 'none'}
  Name: ${el.name || 'none'}
  Text: "${el.textContent || ''}"
  Value: "${el.value || ''}"
  Placeholder: "${el.placeholder || ''}"
  Attributes: ${JSON.stringify(el.attributes || {}, null, 2)}
  Best Locator Options:
    ${locatorOptions.map(opt => `- ${opt.type}: ${opt.selector} (stability: ${opt.stability}/100)`).join('\n    ')}
      `.trim();
    }).filter(Boolean).join('\n\n');
  }

  /**
   * Generate locator options for an element
   */
  generateLocatorOptions(element) {
    const options = [];
    
    // Check for test attributes
    if (element.attributes) {
      const testAttrs = Object.keys(element.attributes).filter(attr => 
        ['data-testid', 'data-test', 'data-cy', 'data-qa'].includes(attr));
      testAttrs.forEach(attr => {
        options.push({
          type: 'data-testid',
          selector: `[${attr}="${element.attributes[attr]}"]`,
          stability: 95
        });
      });
    }
    
    // Unique ID
    if (element.id && !element.id.match(/^(generated|auto|temp|uid)/i)) {
      options.push({
        type: 'unique-id',
        selector: `#${element.id}`,
        stability: 90
      });
    }
    
    // ARIA label
    if (element.attributes && element.attributes['aria-label']) {
      options.push({
        type: 'aria-label',
        selector: `[aria-label="${element.attributes['aria-label']}"]`,
        stability: 85
      });
    }
    
    // Name attribute
    if (element.name) {
      options.push({
        type: 'name',
        selector: `[name="${element.name}"]`,
        stability: 80
      });
    }
    
    // Text content
    if (element.textContent && element.textContent.trim()) {
      const text = element.textContent.trim().substring(0, 30);
      options.push({
        type: 'text-content',
        selector: `text="${text}"`,
        stability: 65
      });
    }
    
    // CSS selector as fallback
    if (element.cssSelector) {
      options.push({
        type: 'css-fallback',
        selector: element.cssSelector,
        stability: 50
      });
    }
    
    return options.sort((a, b) => b.stability - a.stability).slice(0, 3);
  }

  /**
   * Format user journey for prompt
   */
  formatUserJourney(actions) {
    let currentUrl = '';
    let stepCounter = 1;
    
    return actions.map(action => {
      let description = '';
      
      // Page navigation
      if (action.url && action.url !== currentUrl) {
        const pageDesc = this.getPageDescription(action.url);
        description += `Step ${stepCounter++}: Navigate to ${pageDesc}\n`;
        currentUrl = action.url;
      }
      
      // Action description
      if (action.element) {
        const actionDesc = this.getActionDescription(action);
        description += `Step ${stepCounter++}: ${actionDesc}`;
      }
      
      return description;
    }).filter(Boolean).join('\n');
  }

  /**
   * Get action description
   */
  getActionDescription(action) {
    const el = action.element;
    switch (action.type) {
      case 'click':
        return `Click ${el.tagName}${el.textContent ? ` ("${el.textContent.substring(0, 25)}")` : ''}`;
      case 'input':
        return `Enter "${action.value}" in ${el.tagName}${el.placeholder ? ` (${el.placeholder})` : ''}`;
      case 'change':
        return `Select "${action.value}" in ${el.tagName}`;
      case 'keydown':
        return `Press ${action.key} key`;
      default:
        return `${action.type} on ${el.tagName}`;
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
      return path.split('/').filter(Boolean).pop() || 'page';
    } catch {
      return 'page';
    }
  }

  /**
   * Extract URL patterns from actions
   */
  extractURLPatterns(actions) {
    const urls = [...new Set(actions.map(a => a.url).filter(Boolean))];
    return urls.map(url => {
      try {
        const urlObj = new URL(url);
        return urlObj.pathname;
      } catch {
        return url;
      }
    }).join(', ');
  }

  async callAIProvider(prompt) {
    const provider = this.providers[this.settings.provider];
    
    switch (this.settings.provider) {
      case 'openai':
        return await this.callOpenAI(prompt, provider);
      case 'anthropic':
        return await this.callAnthropic(prompt, provider);
      case 'google':
        return await this.callGoogleAI(prompt, provider);
      default:
        throw new Error(`Unsupported AI provider: ${this.settings.provider}`);
    }
  }

  async callOpenAI(prompt, provider) {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.apiKey}`
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages: [
          { role: 'system', content: prompt.systemPrompt },
          { role: 'user', content: prompt.userPrompt }
        ],
        max_tokens: this.settings.maxTokens,
        temperature: this.settings.temperature
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      enhancedScript: data.choices[0]?.message?.content || null,
      usage: data.usage
    };
  }

  async callAnthropic(prompt, provider) {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.settings.model,
        max_tokens: this.settings.maxTokens,
        system: prompt.systemPrompt,
        messages: [
          { role: 'user', content: prompt.userPrompt }
        ],
        temperature: this.settings.temperature
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      enhancedScript: data.content[0]?.text || null,
      usage: data.usage
    };
  }

  async callGoogleAI(prompt, provider) {
    const model = this.settings.model;
    const endpoint = `${provider.endpoint}${model}:generateContent?key=${this.settings.apiKey}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${prompt.systemPrompt}\n\n${prompt.userPrompt}`
          }]
        }],
        generationConfig: {
          maxOutputTokens: this.settings.maxTokens,
          temperature: this.settings.temperature
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Google AI API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      enhancedScript: data.candidates[0]?.content?.parts[0]?.text || null,
      usage: data.usageMetadata
    };
  }

  generateTemplateScript(actions, framework) {
    const generators = {
      playwright: this.generatePlaywrightTemplate,
      selenium: this.generateSeleniumTemplate,
      cypress: this.generateCypressTemplate,
      puppeteer: this.generatePuppeteerTemplate
    };

    const generator = generators[framework];
    if (!generator) {
      throw new Error(`Unsupported framework: ${framework}`);
    }

    return generator.call(this, actions);
  }

  generatePlaywrightTemplate(actions) {
    const lines = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test('FlowScribe recorded test', async ({ page }) => {`,
      `  // Test recorded on ${new Date().toISOString()}`,
      `  // Total actions: ${actions.length}`,
      ``
    ];

    let currentUrl = '';
    let stepCounter = 1;

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`  // Step ${stepCounter++}: Navigate to page`);
        lines.push(`  await page.goto('${action.url}');`);
        lines.push(`  await page.waitForLoadState('networkidle');`);
        lines.push(``);
        currentUrl = action.url;
      }

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelector(action.element);
          lines.push(`  // Step ${stepCounter++}: Click on ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`  await frame.locator('${clickSelector}').click();`);
          } else {
            lines.push(`  await page.locator('${clickSelector}').click();`);
          }
          lines.push(`  await page.waitForTimeout(500); // Brief pause for UI updates`);
          lines.push(``);
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelector(action.element);
          const value = action.value || '';
          lines.push(`  // Step ${stepCounter++}: Enter text in ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`  await frame.locator('${inputSelector}').fill('${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`  await page.locator('${inputSelector}').fill('${value.replace(/'/g, "\\'")}');`);
          }
          lines.push(``);
          break;

        case 'keydown':
          if (action.key === 'Enter') {
            const enterSelector = this.getBestSelector(action.element);
            lines.push(`  // Step ${stepCounter++}: Press Enter`);
            if (action.iframeInfo) {
              lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
              lines.push(`  await frame.locator('${enterSelector}').press('Enter');`);
            } else {
              lines.push(`  await page.locator('${enterSelector}').press('Enter');`);
            }
            lines.push(``);
          }
          break;
      }
    });

    // Add basic assertions
    lines.push(`  // Verify final page state`);
    lines.push(`  await expect(page).toHaveURL(/${currentUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/);`);
    
    lines.push(`});`);
    return lines.join('\n');
  }

  generateSeleniumTemplate(actions) {
    const lines = [
      `from selenium import webdriver`,
      `from selenium.webdriver.common.by import By`,
      `from selenium.webdriver.support.ui import WebDriverWait`,
      `from selenium.webdriver.support import expected_conditions as EC`,
      `from selenium.webdriver.common.keys import Keys`,
      `import time`,
      ``,
      `# FlowScribe generated test - ${new Date().toISOString()}`,
      `# Total actions: ${actions.length}`,
      ``,
      `def test_recorded_workflow():`,
      `    driver = webdriver.Chrome()`,
      `    wait = WebDriverWait(driver, 10)`,
      `    `,
      `    try:`
    ];

    let currentUrl = '';
    let stepCounter = 1;

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`        # Step ${stepCounter++}: Navigate to page`);
        lines.push(`        driver.get("${action.url}")`);
        lines.push(`        time.sleep(2)  # Wait for page load`);
        lines.push(``);
        currentUrl = action.url;
      }

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelectorForSelenium(action.element);
          lines.push(`        # Step ${stepCounter++}: Click on ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`        driver.switch_to.frame(driver.find_element(By.CSS_SELECTOR, "iframe[src*='${action.iframeInfo.origin}']"))`);
            lines.push(`        element = wait.until(EC.element_to_be_clickable((${clickSelector})))`);
            lines.push(`        element.click()`);
            lines.push(`        driver.switch_to.default_content()`);
          } else {
            lines.push(`        element = wait.until(EC.element_to_be_clickable((${clickSelector})))`);
            lines.push(`        element.click()`);
          }
          lines.push(`        time.sleep(0.5)`);
          lines.push(``);
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelectorForSelenium(action.element);
          const value = action.value || '';
          lines.push(`        # Step ${stepCounter++}: Enter text in ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`        driver.switch_to.frame(driver.find_element(By.CSS_SELECTOR, "iframe[src*='${action.iframeInfo.origin}']"))`);
            lines.push(`        element = wait.until(EC.presence_of_element_located((${inputSelector})))`);
            lines.push(`        element.clear()`);
            lines.push(`        element.send_keys("${value.replace(/"/g, '\\"')}")`);
            lines.push(`        driver.switch_to.default_content()`);
          } else {
            lines.push(`        element = wait.until(EC.presence_of_element_located((${inputSelector})))`);
            lines.push(`        element.clear()`);
            lines.push(`        element.send_keys("${value.replace(/"/g, '\\"')}")`);
          }
          lines.push(``);
          break;
      }
    });

    lines.push(`        # Verify final state`);
    lines.push(`        assert "${currentUrl}" in driver.current_url`);
    lines.push(``);
    lines.push(`    finally:`);
    lines.push(`        driver.quit()`);
    lines.push(``);
    lines.push(`if __name__ == "__main__":`);
    lines.push(`    test_recorded_workflow()`);
    
    return lines.join('\n');
  }

  generateCypressTemplate(actions) {
    const lines = [
      `// FlowScribe generated test - ${new Date().toISOString()}`,
      `// Total actions: ${actions.length}`,
      ``,
      `describe('FlowScribe recorded test', () => {`,
      `  it('should complete the recorded workflow', () => {`
    ];

    let currentUrl = '';
    let stepCounter = 1;

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`    // Step ${stepCounter++}: Navigate to page`);
        lines.push(`    cy.visit('${action.url}');`);
        lines.push(`    cy.wait(1000);`);
        lines.push(``);
        currentUrl = action.url;
      }

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelector(action.element);
          lines.push(`    // Step ${stepCounter++}: Click on ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`    cy.frameLoaded('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`    cy.iframe().find('${clickSelector}').click();`);
          } else {
            lines.push(`    cy.get('${clickSelector}').should('be.visible').click();`);
          }
          lines.push(``);
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelector(action.element);
          const value = action.value || '';
          lines.push(`    // Step ${stepCounter++}: Enter text in ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`    cy.frameLoaded('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`    cy.iframe().find('${inputSelector}').clear().type('${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`    cy.get('${inputSelector}').should('be.visible').clear().type('${value.replace(/'/g, "\\'")}');`);
          }
          lines.push(``);
          break;
      }
    });

    lines.push(`    // Verify final state`);
    lines.push(`    cy.url().should('include', '${new URL(currentUrl).pathname}');`);
    lines.push(`  });`);
    lines.push(`});`);
    
    return lines.join('\n');
  }

  generatePuppeteerTemplate(actions) {
    const lines = [
      `const puppeteer = require('puppeteer');`,
      ``,
      `// FlowScribe generated test - ${new Date().toISOString()}`,
      `// Total actions: ${actions.length}`,
      ``,
      `(async () => {`,
      `  const browser = await puppeteer.launch({ headless: false });`,
      `  const page = await browser.newPage();`,
      `  `,
      `  try {`
    ];

    let currentUrl = '';
    let stepCounter = 1;

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`    // Step ${stepCounter++}: Navigate to page`);
        lines.push(`    await page.goto('${action.url}', { waitUntil: 'networkidle2' });`);
        lines.push(``);
        currentUrl = action.url;
      }

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelector(action.element);
          lines.push(`    // Step ${stepCounter++}: Click on ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`    const frame = await page.frames().find(frame => frame.url().includes('${action.iframeInfo.origin}'));`);
            lines.push(`    await frame.waitForSelector('${clickSelector}');`);
            lines.push(`    await frame.click('${clickSelector}');`);
          } else {
            lines.push(`    await page.waitForSelector('${clickSelector}');`);
            lines.push(`    await page.click('${clickSelector}');`);
          }
          lines.push(`    await page.waitForTimeout(500);`);
          lines.push(``);
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelector(action.element);
          const value = action.value || '';
          lines.push(`    // Step ${stepCounter++}: Enter text in ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`    const frame = await page.frames().find(frame => frame.url().includes('${action.iframeInfo.origin}'));`);
            lines.push(`    await frame.waitForSelector('${inputSelector}');`);
            lines.push(`    await frame.type('${inputSelector}', '${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`    await page.waitForSelector('${inputSelector}');`);
            lines.push(`    await page.type('${inputSelector}', '${value.replace(/'/g, "\\'")}');`);
          }
          lines.push(``);
          break;
      }
    });

    lines.push(`    // Verify final state`);
    lines.push(`    console.log('Final URL:', page.url());`);
    lines.push(``);
    lines.push(`  } catch (error) {`);
    lines.push(`    console.error('Test failed:', error);`);
    lines.push(`  } finally {`);
    lines.push(`    await browser.close();`);
    lines.push(`  }`);
    lines.push(`})();`);
    
    return lines.join('\n');
  }

  getBestSelector(element) {
    // Priority order for selectors
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Check for test-specific attributes
    if (element.attributes) {
      if (element.attributes['data-testid']) return `[data-testid="${element.attributes['data-testid']}"]`;
      if (element.attributes['data-test']) return `[data-test="${element.attributes['data-test']}"]`;
      if (element.attributes['data-cy']) return `[data-cy="${element.attributes['data-cy']}"]`;
    }
    
    if (element.name && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
      return `[name="${element.name}"]`;
    }
    
    // Use aria-label if available
    if (element.attributes && element.attributes['aria-label']) {
      return `[aria-label="${element.attributes['aria-label']}"]`;
    }
    
    if (element.cssSelector) {
      return element.cssSelector;
    }
    
    return element.tagName.toLowerCase();
  }

  getBestSelectorForSelenium(element) {
    if (element.id) {
      return `By.ID, "${element.id}"`;
    }
    
    if (element.attributes) {
      if (element.attributes['data-testid']) return `By.CSS_SELECTOR, "[data-testid='${element.attributes['data-testid']}']"`;
      if (element.attributes['data-test']) return `By.CSS_SELECTOR, "[data-test='${element.attributes['data-test']}']"`;
    }
    
    if (element.name && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
      return `By.NAME, "${element.name}"`;
    }
    
    if (element.cssSelector) {
      return `By.CSS_SELECTOR, "${element.cssSelector}"`;
    }
    
    return `By.TAG_NAME, "${element.tagName.toLowerCase()}"`;
  }

  getElementDescription(element) {
    if (element.id) return `element with ID "${element.id}"`;
    if (element.name) return `${element.tagName.toLowerCase()} with name "${element.name}"`;
    if (element.textContent) return `${element.tagName.toLowerCase()} containing "${element.textContent.substring(0, 30)}..."`;
    if (element.placeholder) return `${element.tagName.toLowerCase()} with placeholder "${element.placeholder}"`;
    return element.tagName.toLowerCase();
  }

  async generateAssertions(actions, framework) {
    const assertions = [];
    
    // Analyze actions to suggest meaningful assertions
    actions.forEach((action, index) => {
      switch (action.type) {
        case 'click':
          if (action.element.textContent && action.element.textContent.toLowerCase().includes('submit')) {
            assertions.push({
              type: 'form_submission',
              selector: this.getBestSelector(action.element),
              description: 'Form should be submitted successfully'
            });
          }
          break;
          
        case 'input':
          if (action.element.type === 'email') {
            assertions.push({
              type: 'email_validation',
              selector: this.getBestSelector(action.element),
              value: action.value,
              description: 'Email field should accept valid email'
            });
          }
          break;
          
        case 'navigation':
          assertions.push({
            type: 'url_validation',
            expectedUrl: action.url,
            description: 'Page should navigate to correct URL'
          });
          break;
      }
    });

    return assertions;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIService;
} else if (typeof window !== 'undefined') {
  window.AIService = AIService;
}