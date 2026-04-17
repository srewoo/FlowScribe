class AIService {
  constructor(skipAutoLoad = false) {
    this.providers = {
      openai: {
        name: 'OpenAI',
        models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'],
        endpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4.1-mini'
      },
      anthropic: {
        name: 'Anthropic',
        models: ['claude-sonnet-4-5-20250514', 'claude-haiku-4-5-20251001'],
        endpoint: 'https://api.anthropic.com/v1/messages',
        defaultModel: 'claude-sonnet-4-5-20250514'
      },
      google: {
        name: 'Google AI',
        models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
        defaultModel: 'gemini-2.5-flash'
      }
    };

    this.settings = {
      provider: 'openai',
      model: 'gpt-4.1-mini',
      apiKey: '',
      enableAI: false,
      maxTokens: 8000,
      temperature: 0.1
    };

    // Only auto-load settings if not skipped (for service worker compatibility)
    if (!skipAutoLoad) {
      this.loadSettings();
    }
  }

  async loadSettings() {
    try {
      // Service worker availability check
      if (!chrome?.storage?.local) {
        console.warn('Chrome storage API not available in current context');
        throw new Error('Chrome storage API not available');
      }

      // Load from the main settings storage to maintain consistency
      const result = await chrome.storage.local.get(['flowScribeSettings']);
      const mainSettings = result.flowScribeSettings || {};

      this.settings = {
        provider: mainSettings.aiProvider || 'openai',
        model: mainSettings.aiModel || 'gpt-4.1-mini',
        apiKey: mainSettings.apiKey || '',
        enableAI: mainSettings.enableAI || false,
        maxTokens: 8096,
        temperature: 0.1
      };

      // Validate model for the selected provider
      this.validateModelForProvider();

      console.log('🤖 AI settings loaded successfully:', {
        provider: this.settings.provider,
        model: this.settings.model,
        enableAI: this.settings.enableAI,
        hasApiKey: !!this.settings.apiKey
      });
    } catch (error) {
      console.error('Failed to load AI settings:', error.message || error);
      // Use default settings if storage is unavailable
      this.settings = {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        apiKey: '',
        enableAI: false,
        maxTokens: 8000,
        temperature: 0.1
      };
    }
  }

  validateModelForProvider() {
    const provider = this.providers[this.settings.provider];
    if (provider && provider.models && !provider.models.includes(this.settings.model)) {
      console.warn(`⚠️ Model '${this.settings.model}' not valid for provider '${this.settings.provider}', using default '${provider.defaultModel}'`);
      this.settings.model = provider.defaultModel;
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
      model: newSettings.model || newSettings.aiModel || this.settings.model,
      apiKey: newSettings.apiKey || this.settings.apiKey,
      enableAI: newSettings.enableAI !== undefined ? newSettings.enableAI : this.settings.enableAI
    };
    console.log('🤖 AI Service settings updated:', this.settings);
  }

  isConfigured() {
    return this.settings.enableAI && this.settings.apiKey && this.settings.provider;
  }

  /**
   * Strip markdown fences and extract the largest code block from an AI response.
   * @param {string} response - Raw AI response that may contain markdown fences
   * @returns {string} Cleaned code string with fences removed
   */
  validateAIOutput(code, framework) {
    if (!code || typeof code !== 'string') return false;
    if (code.length < 100) return false;
    const signatures = {
      playwright: [/test\(|it\(|describe\(/],
      cypress:    [/describe\(|it\(|cy\./],
      selenium:   [/def test_|@Test|testRecordedFlow/],
      puppeteer:  [/puppeteer|browser\.|page\./]
    };
    const checks = signatures[framework] || [/.+/];
    return checks.some(re => re.test(code));
  }

  cleanAIResponse(response) {
    if (!response || typeof response !== 'string') return response;
    let cleaned = response.trim();
    const fenceMatch = cleaned.match(/^```[\w]*\n?([\s\S]*?)```$/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }
    if (cleaned.includes('```')) {
      const blocks = cleaned.match(/```[\w]*\n?([\s\S]*?)```/g);
      if (blocks && blocks.length > 0) {
        let largest = '';
        for (const block of blocks) {
          const code = block.replace(/^```[\w]*\n?/, '').replace(/```$/, '').trim();
          if (code.length > largest.length) largest = code;
        }
        if (largest.length > 0) cleaned = largest;
      }
    }
    return cleaned;
  }

  async enhanceScript(actions, framework, options = {}) {
    console.log('🤖 LLM ENHANCEMENT STARTED:', {
      provider: this.settings.provider,
      model: this.settings.model,
      framework,
      actionCount: actions?.length || 0,
      hasElementData: actions?.some(a => a.element && Object.keys(a.element).length > 0),
      isConfigured: this.isConfigured()
    });

    if (!this.isConfigured()) {
      console.log('❌ AI not configured, using template mode');
      return { script: this.generateTemplateScript(actions, framework), aiUsed: false, fallbackReason: 'not_configured' };
    }

    try {
      const prompt = this.buildEnhancementPrompt(actions, framework, options);
      console.log('📝 Sending prompt to LLM with action data...');
      const response = await this.callAIProvider(prompt);

      if (response && response.enhancedScript) {
        const cleaned = this.cleanAIResponse(response.enhancedScript);
        if (this.validateAIOutput(cleaned, framework)) {
          return cleaned;
        }
        console.warn('❌ AI output failed validation, falling back to template');
        return { script: this.generateTemplateScript(actions, framework), aiUsed: false, fallbackReason: 'validation_failed' };
      } else {
        console.warn('❌ AI response invalid, falling back to template');
        return { script: this.generateTemplateScript(actions, framework), aiUsed: false, fallbackReason: 'empty_response' };
      }
    } catch (error) {
      console.error('❌ LLM ENHANCEMENT FAILED:', error);
      return { script: this.generateTemplateScript(actions, framework), aiUsed: false, fallbackReason: 'api_error' };
    }
  }

  buildEnhancementPrompt(actions, framework, options) {
    // Build enhancement prompt with element context
    const baseScript = this.generateTemplateScript(actions, framework);
    const pageAnalysis = this.analyzeActionsForContext(actions);
    const elementDetails = this.extractElementDetails(actions);

    return {
      systemPrompt: `You are an expert ${framework} test automation engineer. Generate production-ready test scripts.

APPROACH:
- Infer the user's high-level intent from the recorded actions. Test the workflow outcome, not just replay clicks.
- Structure: setup → navigation → interaction → validation → cleanup.

RULES:
- Output ONLY valid ${framework} code. No markdown fences, no explanations.
- Convert EVERY recorded action into test code.
- Locator priority: data-testid > ID > aria-label > name > role+text > placeholder > CSS.
- Avoid brittle selectors: no nth-child, no dynamic/generated classes, no absolute XPath.
- Add assertions: visibility before interaction, value after fill, URL after navigation, success indicator after submit.
- Use framework auto-waiting. Never use hardcoded sleep/waitForTimeout/time.sleep.
- Handle dynamic UI: wait for SPA route changes, async content, and animations before asserting.
- Mask sensitive data: passwords → "{{PASSWORD}}", API keys → "{{API_KEY}}".
- Include test.describe wrapper, setup, and teardown.`,

      userPrompt: `Generate a complete ${framework} test from this data.

Test Name: "${options.testName || 'FlowScribe User Journey'}"
Total actions: ${actions.length}
Pages: ${[...new Set(actions.map(a => a.url))].length} unique

USER JOURNEY:
${this.formatUserJourney(actions)}

ELEMENT DATA:
${elementDetails}

PAGE ANALYSIS:
${pageAnalysis}

BASE SCRIPT (enhance this):
${baseScript}

URL patterns: ${this.extractURLPatterns(actions)}`
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
   * Generate a ranked array of possible locator strategies for an element,
   * each with a type, CSS selector, and stability score (0-100).
   * @param {{ id?: string, attributes?: Record<string, string>, name?: string, tagName: string, textContent?: string, className?: string, cssSelector?: string }} element - Recorded element data
   * @returns {Array<{ type: string, selector: string, stability: number }>} Locator options sorted by stability
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
   * Convert a recorded action into a short human-readable description for test comments.
   * @param {{ type: string, value?: string, key?: string, element: { tagName: string, textContent?: string, placeholder?: string } }} action - Recorded user action
   * @returns {string} Description like 'Click BUTTON ("Submit")'
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
   * Extract a short page name from a URL (e.g. 'checkout', 'homepage').
   * @param {string} url - Full URL
   * @returns {string} Short page descriptor
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
    // Validate model for OpenAI
    const validModels = provider.models || ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'];
    let modelToUse = this.settings.model;

    if (!validModels.includes(modelToUse)) {
      console.warn(`⚠️ Invalid OpenAI model '${modelToUse}', falling back to '${provider.defaultModel}'`);
      modelToUse = provider.defaultModel;
    }

    // Validate prompt lengths to prevent 400 errors
    const maxPromptLength = 50000; // Conservative limit
    let systemPrompt = prompt.systemPrompt || '';
    let userPrompt = prompt.userPrompt || '';

    if (systemPrompt.length > maxPromptLength) {
      console.warn(`⚠️ System prompt too long (${systemPrompt.length} chars), truncating to ${maxPromptLength}`);
      systemPrompt = systemPrompt.substring(0, maxPromptLength) + '\n\n[Content truncated due to length]';
    }

    if (userPrompt.length > maxPromptLength) {
      console.warn(`⚠️ User prompt too long (${userPrompt.length} chars), truncating to ${maxPromptLength}`);
      userPrompt = userPrompt.substring(0, maxPromptLength) + '\n\n[Content truncated due to length]';
    }

    const requestBody = {
      model: modelToUse,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: this.settings.maxTokens,
      temperature: this.settings.temperature
    };

    console.log('🔧 OpenAI API Request:', {
      endpoint: provider.endpoint,
      model: modelToUse,
      messageCount: requestBody.messages.length,
      systemPromptLength: prompt.systemPrompt?.length || 0,
      userPromptLength: prompt.userPrompt?.length || 0,
      maxTokens: this.settings.maxTokens,
      temperature: this.settings.temperature
    });

    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
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
        systemInstruction: {
          parts: [{ text: prompt.systemPrompt }]
        },
        contents: [{
          parts: [{
            text: prompt.userPrompt
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
    console.log('📝 TEMPLATE GENERATION STARTED (Non-AI):', {
      framework,
      actionCount: actions?.length || 0,
      reason: 'AI disabled or fallback mode'
    });

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

    const templateScript = generator.call(this, actions);
    console.log('✅ TEMPLATE GENERATION COMPLETED (Non-AI)');
    console.log('📏 Template script length:', templateScript?.length || 0, 'characters');

    return templateScript;
  }

  generatePlaywrightTemplate(actions) {
    if (!actions || !Array.isArray(actions)) {
      console.warn('generatePlaywrightTemplate: actions is not a valid array');
      actions = [];
    }

    const lines = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test.describe('FlowScribe recorded test', () => {`,
      `  test.beforeEach(async ({ page }) => {`,
      `    test.setTimeout(60000);`,
      `  });`,
      ``,
      `  test('recorded user flow', async ({ page }) => {`,
      `    // Test recorded on ${new Date().toISOString()}`,
      `    // Total actions: ${actions.length}`,
      ``
    ];

    let currentUrl = '';
    let stepCounter = 1;
    let frameVarCounter = 0;

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`    // Step ${stepCounter++}: Navigate to page`);
        lines.push(`    await page.goto('${action.url}');`);
        lines.push(`    await page.waitForLoadState('domcontentloaded');`);
        lines.push(``);
        currentUrl = action.url;
      }

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelector(action.element);
          lines.push(`    // Step ${stepCounter++}: Click on ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            const fVar = `frame${++frameVarCounter}`;
            lines.push(`    const ${fVar} = page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`    await ${fVar}.locator('${clickSelector}').click();`);
          } else {
            lines.push(`    await expect(page.locator('${clickSelector}')).toBeVisible();`);
            lines.push(`    await page.locator('${clickSelector}').click();`);
          }
          lines.push(``);
          break;

        case 'input':
        case 'change': {
          const inputSelector = this.getBestSelector(action.element);
          const value = action.value || '';
          const isSensitive = action.element?.type === 'password' ||
            /pass(word)?|secret|token|key|auth/i.test(action.element?.name || action.element?.id || '');
          lines.push(`    // Step ${stepCounter++}: Enter text in ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            const fVar = `frame${++frameVarCounter}`;
            lines.push(`    const ${fVar} = page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
            if (isSensitive) {
              lines.push(`    // TODO: set TEST_PASSWORD env var (value masked for security)`);
              lines.push(`    await ${fVar}.locator('${inputSelector}').fill(process.env.TEST_PASSWORD || '');`);
            } else {
              lines.push(`    await ${fVar}.locator('${inputSelector}').fill('${value.replace(/'/g, "\\'")}');`);
            }
          } else {
            lines.push(`    await expect(page.locator('${inputSelector}')).toBeVisible();`);
            if (isSensitive) {
              lines.push(`    // TODO: set TEST_PASSWORD env var (value masked for security)`);
              lines.push(`    await page.locator('${inputSelector}').fill(process.env.TEST_PASSWORD || '');`);
            } else {
              lines.push(`    await page.locator('${inputSelector}').fill('${value.replace(/'/g, "\\'")}');`);
              if (value) {
                lines.push(`    await expect(page.locator('${inputSelector}')).toHaveValue('${value.replace(/'/g, "\\'")}');`);
              }
            }
          }
          lines.push(``);
          break;
        }

        case 'keydown':
          if (action.key === 'Enter') {
            const enterSelector = this.getBestSelector(action.element);
            lines.push(`    // Step ${stepCounter++}: Press Enter`);
            if (action.iframeInfo) {
              const fVar = `frame${++frameVarCounter}`;
              lines.push(`    const ${fVar} = page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
              lines.push(`    await ${fVar}.locator('${enterSelector}').press('Enter');`);
            } else {
              lines.push(`    await page.locator('${enterSelector}').press('Enter');`);
              lines.push(`    await page.waitForLoadState('domcontentloaded');`);
            }
            lines.push(``);
          }
          break;
      }
    });

    // Verify final page state
    lines.push(`    // Verify final page state`);
    if (currentUrl) {
      lines.push(`    await expect(page).toHaveURL(/${currentUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/);`);
    }

    lines.push(`  });`);
    lines.push(`});`);
    return lines.join('\n');
  }

  generateSeleniumTemplate(actions) {
    if (!actions || !Array.isArray(actions)) {
      console.warn('generateSeleniumTemplate: actions is not a valid array');
      actions = [];
    }

    const lines = [
      `from selenium import webdriver`,
      `from selenium.webdriver.common.by import By`,
      `from selenium.webdriver.support.ui import WebDriverWait`,
      `from selenium.webdriver.support import expected_conditions as EC`,
      `from selenium.webdriver.common.keys import Keys`,
      `from selenium.webdriver.chrome.options import Options`,
      ``,
      `# FlowScribe generated test - ${new Date().toISOString()}`,
      `# Total actions: ${actions.length}`,
      ``,
      `class TestRecordedWorkflow:`,
      `    def setup_method(self):`,
      `        options = Options()`,
      `        options.add_argument('--start-maximized')`,
      `        self.driver = webdriver.Chrome(options=options)`,
      `        self.wait = WebDriverWait(self.driver, 10)`,
      ``,
      `    def teardown_method(self):`,
      `        if self.driver:`,
      `            self.driver.quit()`,
      ``,
      `    def test_recorded_workflow(self):`
    ];

    let currentUrl = '';
    let stepCounter = 1;

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`        # Step ${stepCounter++}: Navigate to page`);
        lines.push(`        self.driver.get("${action.url}")`);
        lines.push(`        self.wait.until(lambda d: d.execute_script('return document.readyState') == 'complete')`);
        lines.push(``);
        currentUrl = action.url;
      }

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelectorForSelenium(action.element);
          lines.push(`        # Step ${stepCounter++}: Click on ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`        self.driver.switch_to.frame(self.driver.find_element(By.CSS_SELECTOR, "iframe[src*='${action.iframeInfo.origin}']"))`);
            lines.push(`        element = self.wait.until(EC.element_to_be_clickable((${clickSelector})))`);
            lines.push(`        element.click()`);
            lines.push(`        self.driver.switch_to.default_content()`);
          } else {
            lines.push(`        element = self.wait.until(EC.element_to_be_clickable((${clickSelector})))`);
            lines.push(`        element.click()`);
          }
          lines.push(``);
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelectorForSelenium(action.element);
          const value = action.value || '';
          lines.push(`        # Step ${stepCounter++}: Enter text in ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            lines.push(`        self.driver.switch_to.frame(self.driver.find_element(By.CSS_SELECTOR, "iframe[src*='${action.iframeInfo.origin}']"))`);
            lines.push(`        element = self.wait.until(EC.presence_of_element_located((${inputSelector})))`);
            lines.push(`        element.send_keys("${value.replace(/"/g, '\\"')}")`);
            lines.push(`        self.driver.switch_to.default_content()`);
          } else {
            lines.push(`        element = self.wait.until(EC.presence_of_element_located((${inputSelector})))`);
            lines.push(`        element.send_keys("${value.replace(/"/g, '\\"')}")`);
            if (value) {
              lines.push(`        assert element.get_attribute("value") == "${value.replace(/"/g, '\\"')}"`);
            }
          }
          lines.push(``);
          break;
      }
    });

    lines.push(`        # Verify final state`);
    if (currentUrl) {
      lines.push(`        assert "${currentUrl}" in self.driver.current_url`);
    }

    return lines.join('\n');
  }

  generateCypressTemplate(actions) {
    if (!actions || !Array.isArray(actions)) {
      console.warn('generateCypressTemplate: actions is not a valid array');
      actions = [];
    }

    const lines = [
      `// FlowScribe generated test - ${new Date().toISOString()}`,
      `// Total actions: ${actions.length}`,
      ``,
      `describe('FlowScribe recorded test', () => {`,
      `  beforeEach(() => {`,
      `    cy.viewport(1280, 720);`,
      `  });`,
      ``,
      `  it('should complete the recorded workflow', () => {`
    ];

    let currentUrl = '';
    let stepCounter = 1;

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`    // Step ${stepCounter++}: Navigate to page`);
        lines.push(`    cy.visit('${action.url}');`);
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
            lines.push(`    cy.iframe().find('${inputSelector}').type('${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`    cy.get('${inputSelector}').should('be.visible').type('${value.replace(/'/g, "\\'")}');`);
            if (value) {
              lines.push(`    cy.get('${inputSelector}').should('have.value', '${value.replace(/'/g, "\\'")}');`);
            }
          }
          lines.push(``);
          break;
      }
    });

    lines.push(`    // Verify final state`);
    if (currentUrl) {
      try {
        lines.push(`    cy.url().should('include', '${new URL(currentUrl).pathname}');`);
      } catch (e) {
        lines.push(`    cy.url().should('not.be.empty');`);
      }
    }
    lines.push(`  });`);
    lines.push(`});`);

    return lines.join('\n');
  }

  generatePuppeteerTemplate(actions) {
    if (!actions || !Array.isArray(actions)) {
      console.warn('generatePuppeteerTemplate: actions is not a valid array');
      actions = [];
    }

    const lines = [
      `const puppeteer = require('puppeteer');`,
      `const assert = require('assert');`,
      ``,
      `// FlowScribe generated test - ${new Date().toISOString()}`,
      `// Total actions: ${actions.length}`,
      ``,
      `describe('FlowScribe recorded test', () => {`,
      `  let browser;`,
      `  let page;`,
      ``,
      `  beforeAll(async () => {`,
      `    browser = await puppeteer.launch({ headless: false, defaultViewport: { width: 1280, height: 720 } });`,
      `    page = await browser.newPage();`,
      `    page.setDefaultTimeout(30000);`,
      `  });`,
      ``,
      `  afterAll(async () => {`,
      `    if (browser) await browser.close();`,
      `  });`,
      ``,
      `  test('recorded user flow', async () => {`
    ];

    let currentUrl = '';
    let stepCounter = 1;
    let frameVarCounter = 0;

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
            const fVar = `frame${++frameVarCounter}`;
            lines.push(`    const ${fVar} = page.frames().find(f => f.url().includes('${action.iframeInfo.origin}'));`);
            lines.push(`    await ${fVar}.waitForSelector('${clickSelector}');`);
            lines.push(`    await ${fVar}.click('${clickSelector}');`);
          } else {
            lines.push(`    await page.waitForSelector('${clickSelector}', { visible: true });`);
            lines.push(`    await page.click('${clickSelector}');`);
          }
          lines.push(``);
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelector(action.element);
          const value = action.value || '';
          lines.push(`    // Step ${stepCounter++}: Enter text in ${this.getElementDescription(action.element)}`);
          if (action.iframeInfo) {
            const fVar = `frame${++frameVarCounter}`;
            lines.push(`    const ${fVar} = page.frames().find(f => f.url().includes('${action.iframeInfo.origin}'));`);
            lines.push(`    await ${fVar}.waitForSelector('${inputSelector}');`);
            lines.push(`    await ${fVar}.type('${inputSelector}', '${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`    await page.waitForSelector('${inputSelector}', { visible: true });`);
            lines.push(`    await page.type('${inputSelector}', '${value.replace(/'/g, "\\'")}');`);
            if (value) {
              lines.push(`    const val = await page.$eval('${inputSelector}', el => el.value);`);
              lines.push(`    assert.strictEqual(val, '${value.replace(/'/g, "\\'")}');`);
            }
          }
          lines.push(``);
          break;
      }
    });

    lines.push(`    // Verify final state`);
    if (currentUrl) {
      lines.push(`    assert.ok(page.url().includes('${currentUrl}'), 'Expected URL to include ${currentUrl}');`);
    }
    lines.push(`  });`);
    lines.push(`});`);

    return lines.join('\n');
  }

  /**
   * Return the most stable CSS selector for an element using a priority hierarchy:
   * id > data-testid > name > aria-label > cssSelector > tagName.
   * @param {{ id?: string, attributes?: Record<string, string>, name?: string, tagName: string, cssSelector?: string }} element - Recorded element data
   * @returns {string} Best CSS selector string
   */
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

  /**
   * Return a Selenium-style locator string (e.g. 'By.ID, "foo"') using the same
   * priority hierarchy as getBestSelector.
   * @param {{ id?: string, attributes?: Record<string, string>, name?: string, tagName: string, cssSelector?: string }} element - Recorded element data
   * @returns {string} Selenium By-locator string
   */
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

  /**
   * Generate a human-readable description of an element for use in test comments.
   * @param {{ id?: string, name?: string, tagName: string, textContent?: string, placeholder?: string }} element - Recorded element data
   * @returns {string} Human-readable element description
   */
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