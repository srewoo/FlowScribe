/**
 * FlowScribe Unified Background Script
 * Consolidated implementation with all features from background, background-enhanced, and extension/background
 */

import { WaitStrategyEngine } from '../utils/wait-strategy.js';
import { EnhancedLocatorPromptGenerator } from '../ai/prompt-templates/enhanced-locator-prompt.js';
import { NetworkRecorder } from '../network/network-recorder.js';
import PageObjectGenerator from '../pom/page-object-generator.js';

// Debug mode - set to false for production
const DEBUG_MODE = false;

// Logger utility for conditional logging
const Logger = {
  log: (...args) => DEBUG_MODE && console.log('[FlowScribe]', ...args),
  warn: (...args) => DEBUG_MODE && console.warn('[FlowScribe]', ...args),
  error: (...args) => console.error('[FlowScribe]', ...args), // Always show errors
  debug: (...args) => DEBUG_MODE && console.debug('[FlowScribe]', ...args)
};

class FlowScribeBackground {
  constructor() {
    this.sessions = new Map();
    this.activeSessionsByTab = new Map(); // tabId -> sessionId mapping for multi-tab support
    this.currentSessionId = null; // Keep for backwards compatibility
    this.aiService = null;
    this.networkRecorder = new NetworkRecorder();
    this.settings = {};
    this.sessionHistory = [];
    this.cryptoKey = null; // AES-GCM encryption key
    this.aiUsageStats = { callCount: 0, lastWarningTime: 0 }; // Track AI usage for warnings

    // Batch processing constants
    this.BATCH_THRESHOLD = 100;          // Actions count to trigger batch processing
    this.MAX_TOKENS_PER_CHUNK = 10000;   // Token limit per AI call
    this.DEFAULT_CHUNK_TOKENS = 3000;    // Default chunk size for action splitting
    this.BATCH_BASE_DELAY = 1500;        // Base delay between batch API calls (ms)
    this.BATCH_MAX_DELAY = 10000;        // Max delay between batch API calls (ms)
    this.BATCH_BACKOFF_FACTOR = 1.5;     // Exponential backoff multiplier

    // Smart wait strategy engine
    this.waitStrategyEngine = new WaitStrategyEngine();

    // Enhanced prompt generator for intelligent locator generation
    this.enhancedPromptGenerator = new EnhancedLocatorPromptGenerator();

    // Page Object Model generator
    this.pageObjectGenerator = new PageObjectGenerator();

    this.init();
  }

  /**
   * Initialize or retrieve the encryption key for secure API key storage
   * Uses AES-GCM with a device-specific key stored in chrome.storage.local
   */
  async initCryptoKey() {
    try {
      const stored = await chrome.storage.local.get(['flowScribeCryptoKey']);

      if (stored.flowScribeCryptoKey) {
        // Import existing key
        const keyData = new Uint8Array(stored.flowScribeCryptoKey);
        this.cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyData,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
      } else {
        // Generate new key
        this.cryptoKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        // Export and store key
        const exportedKey = await crypto.subtle.exportKey('raw', this.cryptoKey);
        await chrome.storage.local.set({
          flowScribeCryptoKey: Array.from(new Uint8Array(exportedKey))
        });
      }
      Logger.log('🔐 Crypto key initialized');
    } catch (error) {
      Logger.error('Failed to initialize crypto key:', error);
      // Fallback: create in-memory key (won't persist across restarts)
      this.cryptoKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    }
  }

  /**
   * Encrypt API key using AES-GCM (cryptographically secure)
   */
  async encryptApiKey(plaintext) {
    if (!plaintext) return '';
    if (!this.cryptoKey) await this.initCryptoKey();

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);

      // Generate random IV for each encryption
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        this.cryptoKey,
        data
      );

      // Combine IV + encrypted data and encode as base64
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      Logger.error('Encryption failed:', error);
      return ''; // Don't store key if encryption fails
    }
  }

  /**
   * Decrypt API key using AES-GCM
   */
  async decryptApiKey(encryptedBase64) {
    if (!encryptedBase64) return '';
    if (!this.cryptoKey) await this.initCryptoKey();

    try {
      // Decode base64
      const combined = new Uint8Array(
        atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
      );

      // Extract IV (first 12 bytes) and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        this.cryptoKey,
        encrypted
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      // Try legacy XOR decryption for backward compatibility
      Logger.warn('AES decryption failed, trying legacy format...');
      return this.deobfuscateLegacyKey(encryptedBase64);
    }
  }

  /**
   * Legacy XOR deobfuscation for backward compatibility with old stored keys
   */
  deobfuscateLegacyKey(obfuscated) {
    if (!obfuscated) return '';
    const legacyKey = 'flowscribe-v1';
    try {
      return atob(obfuscated).split('').map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ legacyKey.charCodeAt(i % legacyKey.length))
      ).join('');
    } catch {
      return obfuscated; // Return as-is if not encoded
    }
  }

  async init() {
    await this.initCryptoKey(); // Initialize encryption first
    await this.loadSettings();
    await this.loadSessionHistory();
    await this.initializeAI();
    this.setupMessageHandlers();
    this.setupTabHandlers();
    this.setupActionClickHandler();
    Logger.log('FlowScribe background service worker loaded');
  }

  /**
   * Handle extension icon click — send TOGGLE_PANEL to active tab
   * (No default_popup so this fires on icon click)
   */
  setupActionClickHandler() {
    chrome.action.onClicked.addListener(async (tab) => {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
      } catch (error) {
        Logger.warn('Could not toggle panel, injecting content script first:', error.message);
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          // Retry after injection
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' });
            } catch (e) {
              Logger.error('Failed to toggle panel after injection:', e.message);
            }
          }, 300);
        } catch (injectError) {
          Logger.error('Cannot inject content script:', injectError.message);
        }
      }
    });
  }

  async loadSettings() {
    try {
      // Add service worker availability check
      if (!chrome?.storage?.local) {
        throw new Error('Chrome storage API not available');
      }
      
      const result = await chrome.storage.local.get(['flowScribeSettings']);
      this.settings = result.flowScribeSettings || {
        selectedFramework: 'playwright',
        enableAI: false,
        aiProvider: 'openai',
        aiModel: 'gpt-4.1-mini',
        apiKey: '',
        includeScreenshots: true,
        includeAssertions: true,
        addComments: true,
        theme: 'light',
        enableSelfHealing: true,
        enableNetworkRecording: true,
        enablePOMGeneration: true,
      };

      // Decrypt API key if it exists (uses AES-GCM with legacy fallback)
      if (this.settings.apiKey) {
        this.settings.apiKey = await this.decryptApiKey(this.settings.apiKey);
      }

      Logger.log('Settings loaded successfully');
    } catch (error) {
      Logger.error('Failed to load settings:', error);
      this.settings = {
        selectedFramework: 'playwright',
        enableAI: false,
        aiProvider: 'openai',
        aiModel: 'gpt-4.1-mini',
        apiKey: '',
        includeScreenshots: true,
        includeAssertions: true,
        addComments: true,
        theme: 'light',
        enableSelfHealing: true,
        enableNetworkRecording: true,
        enablePOMGeneration: true,
      };
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({ flowScribeSettings: this.settings });
    } catch (error) {
      Logger.error('Failed to save settings:', error);
    }
  }

  async loadSessionHistory() {
    try {
      const result = await chrome.storage.local.get(['sessionHistory']);
      this.sessionHistory = result.sessionHistory || [];
    } catch (error) {
      Logger.error('Failed to load session history:', error);
      this.sessionHistory = [];
    }
  }

  async saveSessionHistory() {
    try {
      // Keep only last 50 sessions to prevent storage bloat
      const recentHistory = this.sessionHistory.slice(-50);
      await chrome.storage.local.set({ sessionHistory: recentHistory });
      this.sessionHistory = recentHistory;
    } catch (error) {
      Logger.error('Failed to save session history:', error);
    }
  }

  async initializeAI() {
    // Service worker-compatible AI service using direct fetch calls
    this.aiService = {
      isConfigured: () => {
        return this.settings.enableAI && this.settings.apiKey && this.settings.apiKey.length > 10;
      },
      enhanceScript: async (framework, actions, options) => {
        return this.callAIProvider(framework, actions, options);
      },
      updateSettings: () => Promise.resolve(),
      loadSettings: () => Promise.resolve()
    };

    Logger.log('🤖 AI service initialized (service worker compatible)');
  }

  /**
   * Call AI provider directly using fetch (service worker compatible)
   * Automatically handles chunking for large action sets
   */
  async callAIProvider(framework, actions, options = {}) {
    if (!this.settings.enableAI || !this.settings.apiKey) {
      Logger.log('⚠️ AI not configured - using template generation');
      return null;
    }

    const provider = this.settings.aiProvider || 'openai';
    const model = this.settings.aiModel || 'gpt-4.1-mini';

    try {
      Logger.log(`🤖 Calling ${provider} (${model}) for script enhancement...`);
      Logger.log(`📊 Processing ${actions.length} actions`);

      // Deduplicate keystrokes and redundant clicks before sending to AI
      const optimizedActions = this.optimizeActionsForScript(actions);
      Logger.log(`📊 Optimized: ${actions.length} → ${optimizedActions.length} actions`);

      // Check if we need batched processing for large recordings
      if (optimizedActions.length > this.BATCH_THRESHOLD) {
        Logger.log('📊 Large recording detected - using chunked batch processing');
        const batchedResult = await this.processActionsInBatches(framework, optimizedActions, options);
        if (batchedResult) {
          Logger.log('✅ Batched AI enhancement successful');
          return batchedResult;
        }
      }

      // Single call for smaller recordings
      const prompt = this.buildAIPrompt(framework, optimizedActions, options);
      const estimatedTokens = this.estimateTokens(prompt);
      Logger.log(`📊 Estimated prompt tokens: ~${estimatedTokens}`);

      let response;
      switch (provider) {
        case 'openai':
          response = await this.callOpenAI(model, prompt);
          break;
        case 'anthropic':
          response = await this.callAnthropic(model, prompt);
          break;
        case 'google':
          response = await this.callGoogleAI(model, prompt);
          break;
        default:
          Logger.warn(`Unknown AI provider: ${provider}`);
          return null;
      }

      if (response) {
        Logger.log('AI enhancement successful');
        return this.cleanAIResponse(response);
      }
    } catch (error) {
      Logger.error('AI enhancement failed:', error.message);
    }

    return null;
  }

  /**
   * Strip markdown fences and clean AI response to extract pure code
   */
  cleanAIResponse(response) {
    if (!response || typeof response !== 'string') return response;

    let cleaned = response.trim();

    // Remove markdown code fences (```javascript ... ``` or ```python ... ```)
    const fenceMatch = cleaned.match(/^```[\w]*\n?([\s\S]*?)```$/);
    if (fenceMatch) {
      cleaned = fenceMatch[1].trim();
    }

    // Also handle responses that start with ``` but may have text before/after
    if (cleaned.includes('```')) {
      const blocks = cleaned.match(/```[\w]*\n?([\s\S]*?)```/g);
      if (blocks && blocks.length > 0) {
        // Extract the largest code block (most likely the full script)
        let largest = '';
        for (const block of blocks) {
          const code = block.replace(/^```[\w]*\n?/, '').replace(/```$/, '').trim();
          if (code.length > largest.length) {
            largest = code;
          }
        }
        if (largest.length > 0) {
          cleaned = largest;
        }
      }
    }

    return cleaned;
  }

  /**
   * Estimate token count for a string (rough approximation: ~4 chars per token)
   */
  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  /**
   * Compress action data to reduce token usage
   */
  compressAction(action) {
    // Keep essential fields + semantic data for AI locator generation
    const compressed = {
      type: action.type,
      timestamp: action.timestamp
    };

    if (action.url) compressed.url = action.url;
    if (action.value) compressed.value = action.value;
    if (action.key) compressed.key = action.key;

    // Preserve semantic element data for intelligent locator generation
    if (action.element) {
      compressed.element = {};
      if (action.element.id) compressed.element.id = action.element.id;
      if (action.element.name) compressed.element.name = action.element.name;
      if (action.element.tagName) compressed.element.tagName = action.element.tagName;
      if (action.element.type) compressed.element.type = action.element.type;
      if (action.element.placeholder) compressed.element.placeholder = action.element.placeholder;
      if (action.element.textContent) {
        compressed.element.text = action.element.textContent.substring(0, 50);
      }
      // Semantic data critical for AI locators (getByRole, getByLabel, etc.)
      if (action.element.className) {
        compressed.element.className = action.element.className.substring(0, 100);
      }
      if (action.element.role) compressed.element.role = action.element.role;
      // Preserve attributes (aria-label, data-testid, etc.)
      if (action.element.attributes && Object.keys(action.element.attributes).length > 0) {
        compressed.element.attributes = action.element.attributes;
      }
      // Include test attributes if available
      if (action.element.testAttributes && Object.keys(action.element.testAttributes).length > 0) {
        compressed.element.testAttrs = action.element.testAttributes;
      }
      // Include best selector
      if (action.element.cssSelector) {
        compressed.element.selector = action.element.cssSelector;
      }
      if (action.element.xpath && !this.isFragileXPath(action.element.xpath)) {
        compressed.element.xpath = action.element.xpath;
      }
    }

    // Attach smart wait strategy
    if (this.waitStrategyEngine) {
      try {
        const normalizedAction = { ...action, target: action.target || action.element || null };
        const strategies = this.waitStrategyEngine.determineWaitStrategy(normalizedAction, null, null);
        if (strategies && strategies.length > 0) {
          compressed.waitStrategy = strategies.map(s => ({ type: s.type, timeout: s.timeout }));
        }
      } catch (e) {
        // Skip wait strategy on error
      }
    }

    // Attach timing for think-time detection
    if (action.timeSinceLastAction) {
      compressed.timeSinceLastAction = action.timeSinceLastAction;
    }

    return compressed;
  }

  /**
   * Chunk actions into batches that fit within token limits
   */
  chunkActions(actions, maxTokensPerChunk = this.DEFAULT_CHUNK_TOKENS) {
    const chunks = [];
    let currentChunk = [];
    let currentTokens = 0;

    for (const action of actions) {
      const compressed = this.compressAction(action);
      const actionJson = JSON.stringify(compressed);
      const actionTokens = this.estimateTokens(actionJson);

      // If single action exceeds limit, add it alone (will be truncated if needed)
      if (actionTokens > maxTokensPerChunk) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentTokens = 0;
        }
        chunks.push([compressed]);
        continue;
      }

      // Check if adding this action would exceed the limit
      if (currentTokens + actionTokens > maxTokensPerChunk) {
        chunks.push(currentChunk);
        currentChunk = [compressed];
        currentTokens = actionTokens;
      } else {
        currentChunk.push(compressed);
        currentTokens += actionTokens;
      }
    }

    // Add remaining actions
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Build prompt for AI script generation with chunking support
   */
  buildAIPrompt(framework, actions, options, chunkInfo = null) {
    let chunkContext = '';
    if (chunkInfo) {
      if (chunkInfo.current === 1) {
        chunkContext = `\nThis is part ${chunkInfo.current} of ${chunkInfo.total}. Include ALL imports and test setup at the beginning.`;
      } else if (chunkInfo.current === chunkInfo.total) {
        chunkContext = `\nThis is part ${chunkInfo.current} of ${chunkInfo.total} (FINAL). Continue the test steps and include proper cleanup/teardown.`;
      } else {
        chunkContext = `\nThis is part ${chunkInfo.current} of ${chunkInfo.total}. Continue the test steps (no imports needed, no cleanup yet).`;
      }
    }

    // Use EnhancedLocatorPromptGenerator for superior prompt quality
    if (this.enhancedPromptGenerator) {
      try {
        const enhanced = this.enhancedPromptGenerator.generateEnhancedPrompt(actions, framework, options);

        // Compress actions for the data section
        const compressedActions = actions.map(a => this.compressAction(a));
        const actionsJson = JSON.stringify(compressedActions, null, 2);

        return `${enhanced.systemPrompt}

## SMART WAIT STRATEGY:
Each action may include a "waitStrategy" field with intelligent wait recommendations. Use these instead of generic waitForTimeout():
- "element_clickable" → wait for element to be clickable/interactable before clicking
- "element_enabled" → wait for form element to be enabled before filling
- "element_visible" → wait for element to be visible in viewport
- "network_idle" → wait for network activity to settle (after form submits, navigation)
- "page_load" → wait for full page load after navigation
- For SPA route changes: wait for URL change + new content to render before asserting
- For animations/transitions: wait for element stability (no layout shift) before interacting
- NEVER use hardcoded sleep/waitForTimeout/time.sleep

## OUTPUT RULES:
- Output ONLY valid ${framework} code
- NO markdown code blocks, NO explanations
- NO placeholder comments like "// Add more steps here"
- Script must be copy-paste ready to run
- Include descriptive comments for each step${chunkContext}

${enhanced.userPrompt}

## COMPRESSED ACTION DATA (with wait strategies and semantic attributes):
${actionsJson}`;
      } catch (e) {
        Logger.warn('Enhanced prompt generation failed, falling back to basic prompt:', e.message);
      }
    }

    // Fallback to basic prompt
    const compressedActions = actions.map(a => this.compressAction(a));
    const actionsJson = JSON.stringify(compressedActions, null, 2);
    const startUrl = actions.find(a => a.url)?.url || 'https://example.com';
    const frameworkTemplates = this.getFrameworkTemplate(framework);

    return `You are an expert ${framework} test automation engineer. Generate a COMPLETE, READY-TO-RUN test script.

## Framework: ${framework}
## Starting URL: ${startUrl}
## Total Actions: ${actions.length}${chunkContext}

## APPROACH:
- Infer the user's high-level intent from the recorded actions. Test the workflow outcome, not just replay clicks.
- Structure: setup/imports → navigation → interaction → validation → cleanup.

## REQUIREMENTS:
1. Generate a COMPLETE script that runs without modifications
2. Include ALL necessary imports
3. Convert EVERY action into test code — do not skip any
4. Use proper async/await syntax
5. Use framework auto-waiting (waitForSelector, waitForLoadState). Never use hardcoded sleep/waitForTimeout.
6. Handle dynamic UI: wait for SPA route transitions, async content, and animations before asserting.
7. Add assertions: visibility before interaction, value after fill, URL after navigation, success indicator after submit.
8. Mask sensitive data: passwords → "{{PASSWORD}}", API keys → "{{API_KEY}}".

## Selector Priority:
1. data-testid, data-test, data-cy, data-qa attributes
2. id attribute (if not dynamic/generated)
3. name attribute (for form elements)
4. aria-label or role attributes
5. Stable CSS selectors (no nth-child, no dynamic classes like "css-1a2b3c")
6. Text content for buttons/links

## ${framework.toUpperCase()} TEMPLATE TO FOLLOW:
${frameworkTemplates}

## Recorded Actions (convert ALL of these):
${actionsJson}

## OUTPUT RULES:
- Output ONLY valid ${framework} code
- NO markdown code blocks, NO explanations
- Script must be copy-paste ready to run
- Include descriptive comments for each step`;
  }

  /**
   * Get framework-specific code template
   */
  getFrameworkTemplate(framework) {
    const templates = {
      playwright: `
import { test, expect } from '@playwright/test';

test.describe('User Flow Test', () => {
  test('should complete the recorded user journey', async ({ page }) => {
    // Set default timeout
    test.setTimeout(60000);

    // Navigate to starting page
    await page.goto('URL_HERE');
    await page.waitForLoadState('networkidle');

    // Step 1: Description
    await page.locator('selector').click();
    await expect(page.locator('selector')).toBeVisible();

    // Continue with all steps...
  });
});`,

      cypress: `
describe('User Flow Test', () => {
  beforeEach(() => {
    cy.viewport(1280, 720);
  });

  it('should complete the recorded user journey', () => {
    // Navigate to starting page
    cy.visit('URL_HERE');

    // Step 1: Description
    cy.get('selector').should('be.visible').click();

    // Continue with all steps...
  });
});`,

      selenium: `
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
import time

class TestUserFlow:
    def setup_method(self):
        options = Options()
        options.add_argument('--start-maximized')
        self.driver = webdriver.Chrome(options=options)
        self.wait = WebDriverWait(self.driver, 10)

    def teardown_method(self):
        if self.driver:
            self.driver.quit()

    def test_user_journey(self):
        # Navigate to starting page
        self.driver.get('URL_HERE')

        # Step 1: Description
        element = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, 'selector')))
        element.click()

        # Continue with all steps...`,

      puppeteer: `
const puppeteer = require('puppeteer');

describe('User Flow Test', () => {
  let browser;
  let page;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 720 }
    });
    page = await browser.newPage();
    page.setDefaultTimeout(30000);
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  test('should complete the recorded user journey', async () => {
    // Navigate to starting page
    await page.goto('URL_HERE', { waitUntil: 'networkidle0' });

    // Step 1: Description
    await page.waitForSelector('selector');
    await page.click('selector');

    // Continue with all steps...
  });
});`
    };

    return templates[framework] || templates.playwright;
  }

  /**
   * Process large action sets in batches
   */
  async processActionsInBatches(framework, actions, options) {
    const MAX_ACTIONS_FOR_SINGLE_CALL = this.BATCH_THRESHOLD;
    const MAX_TOKENS_PER_CHUNK = this.MAX_TOKENS_PER_CHUNK;

    // For small action sets, process in single call
    if (actions.length <= MAX_ACTIONS_FOR_SINGLE_CALL) {
      const prompt = this.buildAIPrompt(framework, actions, options);
      const estimatedTokens = this.estimateTokens(prompt);
      Logger.log(`📊 Single batch: ${actions.length} actions, ~${estimatedTokens} tokens`);
      return null; // Let caller use single call
    }

    // For larger sets, chunk and batch process
    Logger.log(`📊 Large recording: ${actions.length} actions - using chunked processing`);
    const chunks = this.chunkActions(actions, MAX_TOKENS_PER_CHUNK);
    Logger.log(`📊 Split into ${chunks.length} chunks`);

    const scriptParts = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkInfo = { current: i + 1, total: chunks.length };

      Logger.log(`🔄 Processing chunk ${i + 1}/${chunks.length} (${chunk.length} actions)`);

      const prompt = this.buildAIPrompt(framework, chunk, options, chunkInfo);

      let result;
      const provider = this.settings.aiProvider || 'openai';
      const model = this.settings.aiModel || 'gpt-4.1-mini';

      switch (provider) {
        case 'openai':
          result = await this.callOpenAI(model, prompt);
          break;
        case 'anthropic':
          result = await this.callAnthropic(model, prompt);
          break;
        case 'google':
          result = await this.callGoogleAI(model, prompt);
          break;
      }

      if (result) {
        scriptParts.push(result);
      }

      // Exponential backoff between API calls to avoid rate limiting
      if (i < chunks.length - 1) {
        const delay = Math.min(this.BATCH_BASE_DELAY * Math.pow(this.BATCH_BACKOFF_FACTOR, i), this.BATCH_MAX_DELAY);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Merge script parts
    if (scriptParts.length > 0) {
      return this.mergeScriptParts(framework, scriptParts);
    }

    return null;
  }

  /**
   * Merge multiple AI-generated script chunks into one valid test file.
   * Each chunk may be a full test.describe wrapper — we extract the inner
   * test body lines and stitch them under a single test.describe.
   */
  /**
   * Ensure the script contains an initial page navigation.
   * If the LLM omitted it, inject it after the test function's opening line.
   */
  ensureInitialNavigation(script, framework, actions) {
    const startUrl = actions.find(a => a.url)?.url || '';
    if (!startUrl) return script;

    const hasPat = {
      playwright: /page\.goto\s*\(/,
      cypress:    /cy\.visit\s*\(/,
      selenium:   /driver\.get\s*\(/,
      puppeteer:  /page\.goto\s*\(/
    };
    if (hasPat[framework]?.test(script)) return script;

    const navLine = {
      playwright: `    await page.goto('${startUrl}');\n    await page.waitForLoadState('networkidle');\n`,
      cypress:    `    cy.visit('${startUrl}');\n`,
      selenium:   `        self.driver.get('${startUrl}')\n`,
      puppeteer:  `    await page.goto('${startUrl}', { waitUntil: 'networkidle0' });\n`
    }[framework];
    if (!navLine) return script;

    const openPat = {
      playwright: /(test\s*\(\s*['"`][^'"`]*['"`]\s*,\s*async\s*\(\s*\{\s*page[^}]*\}\s*\)\s*=>\s*\{)/,
      cypress:    /(it\s*\(\s*['"`][^'"`]*['"`]\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{)/,
      selenium:   /(def test_\w+\s*\(self\)\s*:)/,
      puppeteer:  /(test\s*\(\s*['"`][^'"`]*['"`]\s*,\s*async\s*\(\s*\)\s*=>\s*\{)/
    }[framework];

    if (openPat) {
      return script.replace(openPat, (match) => `${match}\n${navLine}`);
    }
    return script;
  }

  mergeScriptParts(framework, parts) {
    if (parts.length === 1) return this.cleanAIResponse(parts[0]);

    const cleaned = parts.map(p => this.cleanAIResponse(p));

    if (framework === 'playwright') {
      return this.mergePlaywrightChunks(cleaned);
    }
    if (framework === 'cypress') {
      return this.mergeCypressChunks(cleaned);
    }
    // For Selenium/Puppeteer: extract body lines and concatenate
    return this.mergeGenericChunks(cleaned, framework);
  }

  extractTestBodyLines(scriptText, bodyOpenPattern) {
    const lines = scriptText.split('\n');
    const bodyLines = [];
    let collecting = false;
    let depth = 0;

    for (const line of lines) {
      if (!collecting) {
        if (bodyOpenPattern.test(line)) {
          collecting = true;
          depth = 0;
          continue;
        }
        continue;
      }
      // Count braces to track when the test function closes
      for (const ch of line) {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
      }
      if (depth < 0) break; // closed the test function
      bodyLines.push(line);
    }
    return bodyLines;
  }

  deduplicateConsts(lines) {
    // First pass: find variable names declared with const more than once
    const constCounts = new Map();
    for (const line of lines) {
      const m = line.match(/^\s*const\s+(\w+)\s*=/);
      if (m) constCounts.set(m[1], (constCounts.get(m[1]) || 0) + 1);
    }
    // Second pass: first occurrence of duplicated vars → let; subsequent → no keyword
    const seen = new Set();
    return lines.map(line => {
      const m = line.match(/^(\s*)const\s+(\w+)\s*=/);
      if (m) {
        const varName = m[2];
        if ((constCounts.get(varName) || 0) > 1) {
          if (!seen.has(varName)) {
            seen.add(varName);
            return line.replace(/^(\s*)const\s+/, '$1let ');
          }
          return line.replace(/^(\s*)const\s+/, '$1');
        }
      }
      return line;
    });
  }

  mergePlaywrightChunks(parts) {
    const importLines = parts[0].split('\n').filter(l => l.trim().startsWith('import '));
    const describeMatch = parts[0].match(/test\.describe\(['"`]([^'"`]+)['"`]/);
    const testName = describeMatch ? describeMatch[1] : 'FlowScribe Generated Test';

    const allBodyLines = [];
    for (const part of parts) {
      const body = this.extractTestBodyLines(part, /test\s*\(\s*['"`].*['"`]\s*,\s*async/);
      allBodyLines.push(...body, '');
    }

    const deduped = this.deduplicateConsts(allBodyLines);

    return [
      importLines.join('\n'),
      '',
      `test.describe('${testName}', () => {`,
      `  test.beforeEach(async ({ page }) => {`,
      `    test.setTimeout(60000);`,
      `  });`,
      '',
      `  test('recorded user flow', async ({ page }) => {`,
      ...deduped,
      `  });`,
      `});`
    ].join('\n');
  }

  mergeCypressChunks(parts) {
    const describeMatch = parts[0].match(/describe\(['"`]([^'"`]+)['"`]/);
    const testName = describeMatch ? describeMatch[1] : 'FlowScribe Generated Test';

    const allBodyLines = [];
    for (const part of parts) {
      const body = this.extractTestBodyLines(part, /it\s*\(\s*['"`].*['"`]\s*,\s*\(\s*\)\s*=>/);
      allBodyLines.push(...body, '');
    }

    const deduped = this.deduplicateConsts(allBodyLines);

    return [
      `describe('${testName}', () => {`,
      `  beforeEach(() => {`,
      `    cy.viewport(1280, 720);`,
      `  });`,
      '',
      `  it('should complete the recorded user journey', () => {`,
      ...deduped,
      `  });`,
      `});`
    ].join('\n');
  }

  mergeGenericChunks(parts, framework) {
    const headerLines = parts[0].split('\n');
    const headerEnd = headerLines.findIndex(l => /def test_|test\s*\(|try\s*\{/.test(l));
    const header = headerLines.slice(0, headerEnd + 1).join('\n');

    const allBodyLines = [];
    for (const part of parts) {
      const body = this.extractTestBodyLines(part, /def test_|test\s*\(.*async/);
      allBodyLines.push(...body, '');
    }

    const deduped = this.deduplicateConsts(allBodyLines);
    const footer = framework === 'selenium'
      ? '\n    } finally {\n        await driver.quit();\n    }\n})();'
      : '\n  });\n});';

    return header + '\n' + deduped.join('\n') + footer;
  }

  /**
   * Call OpenAI API
   */
  async callOpenAI(model, prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.settings.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are a test automation expert. Generate clean, production-ready test scripts with comprehensive assertions.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 8192,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  }

  /**
   * Call Anthropic API
   */
  async callAnthropic(model, prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.settings.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-5-20250514',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text?.trim() || null;
  }

  /**
   * Call Google AI (Gemini) API
   */
  async callGoogleAI(model, prompt) {
    const geminiModel = model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${this.settings.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192
        }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`Google AI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'START_RECORDING_SESSION':
          const tabId = message.data?.tabId || sender.tab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: 'No tab ID available' });
            return;
          }
          this.startRecordingSession(tabId, message.data)
            .then(sessionId => sendResponse({ success: true, sessionId }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true; // Keep channel open for async response

        case 'STOP_RECORDING_SESSION':
          const stopTabId = message.data?.tabId || sender.tab?.id;
          this.stopRecordingSession(stopTabId)
            .then(session => sendResponse({ success: true, session }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'PAUSE_RECORDING':
          this.pauseRecordingSession()
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'RESUME_RECORDING':
          this.resumeRecordingSession()
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'GET_CURRENT_SESSION':
          const currentSession = this.getCurrentSession();
          sendResponse({ success: true, session: currentSession });
          break;

        case 'CHECK_RECORDING_STATE':
          // Tab-specific recording state check for multi-tab support
          const checkTabId = sender.tab?.id;
          let checkSessionId = null;
          let checkIsRecording = false;

          if (checkTabId && this.activeSessionsByTab.has(checkTabId)) {
            checkSessionId = this.activeSessionsByTab.get(checkTabId);
            const checkSession = this.sessions.get(checkSessionId);
            checkIsRecording = checkSession && checkSession.status === 'recording';
          } else if (this.currentSessionId) {
            // Fallback to legacy single-session check
            checkSessionId = this.currentSessionId;
            const checkSession = this.sessions.get(this.currentSessionId);
            checkIsRecording = checkSession && checkSession.status === 'recording' &&
              (!checkSession.tabId || checkSession.tabId === checkTabId);
          }

          sendResponse({
            success: true,
            isRecording: checkIsRecording,
            sessionId: checkSessionId,
            settings: this.settings
          });
          break;

        case 'UPDATE_SETTINGS':
          this.updateSettings(message.settings)
            .then(() => sendResponse({ success: true, settings: this.settings }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true; // Keep channel open for async response

        case 'ACTION_RECORDED':
          this.handleSingleActionRecorded(message, sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'ACTIONS_RECORDED':
          this.handleActionsRecorded(message, sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'GET_SESSION_ACTIONS':
          const sessionForActions = this.sessions.get(this.currentSessionId);
          if (sessionForActions) {
            Logger.log('📤 Sending', sessionForActions.actions.length, 'actions to content script for restoration');
            sendResponse({ 
              success: true, 
              actions: sessionForActions.actions,
              sessionId: this.currentSessionId
            });
          } else {
            sendResponse({ success: false, actions: [] });
          }
          break;

        case 'GENERATE_SCRIPT':
          const framework = message.data?.framework || message.framework;
          let actions = message.data?.actions || message.actions;
          const options = message.data?.options || message.options || {};
          const sessionId = message.data?.sessionId;
          
          if (!framework) {
            sendResponse({ success: false, error: 'Framework not specified' });
            return;
          }
          
          // Get actions from session if not provided
          if (!actions && sessionId) {
            const session = this.sessions.get(sessionId);
            if (session) {
              actions = session.actions;
            }
          }
          
          // Get actions from current session if still no actions
          if (!actions && this.currentSessionId) {
            const currentSession = this.sessions.get(this.currentSessionId);
            if (currentSession) {
              actions = currentSession.actions;
            }
          }
          
          if (!actions || actions.length === 0) {
            Logger.warn('❌ No actions found for script generation');
            sendResponse({ success: false, error: 'No actions found to generate script' });
            return;
          }
          
          Logger.log('🎬 Generating script with actions:', {
            actionCount: actions.length,
            actionTypes: actions.map(a => a.type),
            hasElementData: actions.some(a => a.element && Object.keys(a.element).length > 0),
            framework
          });
          
          this.generateScript(framework, actions, options)
            .then(result => sendResponse({ success: true, script: result.script, aiUsed: result.aiUsed, fallbackReason: result.fallbackReason, pomFiles: result.pomFiles || [] }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'CLEAR_SESSIONS':
          this.clearSessions();
          sendResponse({ success: true });
          break;

        case 'GET_SETTINGS':
          sendResponse({ success: true, settings: this.settings });
          break;

        case 'GET_SESSION_HISTORY':
          sendResponse({ success: true, history: this.sessionHistory });
          break;

        case 'DELETE_SESSION':
          this.deleteSession(message.sessionId)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'OPEN_POPUP':
          chrome.action.openPopup().catch(() => {
            // Fallback: open popup.html in a small window
            chrome.windows.create({
              url: chrome.runtime.getURL('popup.html'),
              type: 'popup',
              width: 420,
              height: 620,
              focused: true
            });
          });
          sendResponse({ success: true });
          break;

        case 'ENHANCE_SCRIPT':
          // Delegate AI enhancement to popup context
          this.requestAIEnhancement(message.framework, message.actions, message.options)
            .then(script => sendResponse({ success: true, script }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'CAPTURE_SCREENSHOT':
          this.captureScreenshot(sender.tab.id, message.options)
            .then(screenshot => sendResponse({ success: true, screenshot }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'EXPORT_SESSION':
          try {
            this.exportSession(message.sessionId, message.format)
              .then(exportData => {
                Logger.log('✅ Export session successful:', exportData);
                sendResponse({ success: true, data: exportData });
              })
              .catch(error => {
                Logger.error('❌ Export session failed:', error);
                sendResponse({ success: false, error: error.message });
              });
          } catch (error) {
            Logger.error('❌ Export session error:', error);
            sendResponse({ success: false, error: error.message });
          }
          return true;
      }
    });
  }

  setupTabHandlers() {
    // Handle tab updates to track navigation and restore recording
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      // Multi-tab support: look up session by tabId
      const sessionId = this.activeSessionsByTab.get(tabId) || this.currentSessionId;

      if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (session && session.tabId === tabId) {

          // Track navigation (TEMPORARILY DISABLED FILTERING - record all navigations)
          if (changeInfo.url) {
            session.actions.push({
              id: Date.now(),
              type: 'navigation',
              timestamp: Date.now(),
              url: changeInfo.url,
              title: tab.title || '',
              isUserInitiated: this.isUserInitiatedNavigation(session.actions)
            });
            Logger.log('📍 Navigation recorded:', changeInfo.url);
          }

          // Auto-restore recording after page loads
          if (changeInfo.status === 'complete' && session.status === 'recording') {
            Logger.log('🔄 Page loaded, restoring recording on:', tab.url);

            // Wait for content script to initialize, then restore recording
            setTimeout(async () => {
              try {
                await chrome.tabs.sendMessage(tabId, {
                  type: 'START_RECORDING',
                  sessionId: sessionId,
                  settings: this.settings,
                  isRestore: true
                });
                Logger.log('✅ Recording restored after navigation');
              } catch (error) {
                // Content script might not be ready yet, retry once more
                setTimeout(async () => {
                  try {
                    await chrome.tabs.sendMessage(tabId, {
                      type: 'START_RECORDING',
                      sessionId: sessionId,
                      settings: this.settings,
                      isRestore: true
                    });
                    Logger.log('✅ Recording restored after retry');
                  } catch (retryError) {
                    Logger.warn('Failed to restore recording after retry:', retryError.message);
                  }
                }, 1000);
              }
            }, 500);
          }
        }
      }
    });

    // Handle tab removal - Multi-tab support
    chrome.tabs.onRemoved.addListener((tabId) => {
      // Check if tab has an active session
      if (this.activeSessionsByTab.has(tabId)) {
        this.stopRecordingSession(tabId);
      } else if (this.currentSessionId) {
        // Fallback for legacy single-session mode
        const session = this.sessions.get(this.currentSessionId);
        if (session && session.tabId === tabId) {
          this.stopRecordingSession(tabId);
        }
      }
    });
  }

  async startRecordingSession(tabId, sessionData = {}) {
    // Check if tab already has an active recording session
    if (this.activeSessionsByTab.has(tabId)) {
      const existingSessionId = this.activeSessionsByTab.get(tabId);
      const existingSession = this.sessions.get(existingSessionId);
      if (existingSession && existingSession.status === 'recording') {
        Logger.warn(`Tab ${tabId} already has active session ${existingSessionId}`);
        return existingSessionId; // Return existing session instead of creating new one
      }
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const tab = await chrome.tabs.get(tabId);

    const session = {
      id: sessionId,
      tabId: tabId,
      url: tab.url,
      title: tab.title,
      startTime: Date.now(),
      endTime: null,
      actions: [],
      status: 'recording'
    };

    this.sessions.set(sessionId, session);
    this.activeSessionsByTab.set(tabId, sessionId); // Multi-tab support: map tab to session
    this.currentSessionId = sessionId; // Keep for backwards compatibility

    // Inject content script if not already present
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
    } catch (error) {
      Logger.warn('Content script may already be injected:', error);
    }

    // Start recording in content script
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING' });
    } catch (error) {
      Logger.error('Failed to start recording in content script:', error);
      // Cleanup the session if we can't start recording
      this.sessions.delete(sessionId);
      this.currentSessionId = null;
      throw new Error('Failed to start recording. Please refresh the page and try again.');
    }

    // Start network recording if available
    if (this.networkRecorder && this.settings.enableNetworkRecording !== false) {
      try {
        await this.networkRecorder.init();
        await this.networkRecorder.startRecording();
      } catch (error) {
        Logger.warn('Network recording could not start:', error);
      }
    }

    return sessionId;
  }

  async stopRecordingSession(tabId = null) {
    // Multi-tab support: find session by tabId or fall back to currentSessionId
    let sessionId = null;

    if (tabId && this.activeSessionsByTab.has(tabId)) {
      sessionId = this.activeSessionsByTab.get(tabId);
    } else if (this.currentSessionId) {
      sessionId = this.currentSessionId;
    }

    if (!sessionId) {
      throw new Error('No active recording session');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.endTime = Date.now();
    session.status = 'completed';
    session.duration = session.endTime - session.startTime;
    session.actionCount = session.actions.length;

    // Stop recording in content script
    try {
      const response = await chrome.tabs.sendMessage(session.tabId, { type: 'STOP_RECORDING' });
      if (response && response.actions) {
        session.actions.push(...response.actions);
        session.actionCount = session.actions.length;
      }
    } catch (error) {
      Logger.warn('Could not get final actions from content script:', error);
    }

    // Stop network recording and store results on session
    if (this.networkRecorder && this.networkRecorder.isRecording) {
      try {
        const networkData = await this.networkRecorder.stopRecording();
        session.networkRequests = networkData.requests || [];
        session.networkSummary = networkData.summary || {};
      } catch (error) {
        Logger.warn('Network recording stop failed:', error);
      }
    }

    // Add to session history
    const historyEntry = {
      id: session.id,
      title: session.title || `Recording ${new Date(session.startTime).toLocaleString()}`,
      url: session.url,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
      actionCount: session.actionCount,
      framework: this.settings.selectedFramework,
      thumbnail: null // Will be populated if screenshots were captured
    };

    this.sessionHistory.unshift(historyEntry);
    await this.saveSessionHistory();

    const completedSession = { ...session };

    // Multi-tab cleanup: remove from activeSessionsByTab
    this.activeSessionsByTab.delete(session.tabId);

    // Clear currentSessionId only if it matches
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }

    // Stop visual indicator in content script
    try {
      await chrome.tabs.sendMessage(session.tabId, { type: 'HIDE_RECORDING_INDICATOR' });
    } catch (error) {
      Logger.warn('Could not hide recording indicator:', error);
    }

    return completedSession;
  }

  getCurrentSession() {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId);
  }

  async pauseRecordingSession() {
    if (!this.currentSessionId) {
      throw new Error('No active recording session');
    }

    const session = this.sessions.get(this.currentSessionId);
    if (!session) {
      throw new Error('Recording session not found');
    }

    session.status = 'paused';
    session.pausedTime = Date.now();

    // Pause recording in content script
    try {
      await chrome.tabs.sendMessage(session.tabId, { type: 'PAUSE_RECORDING' });
    } catch (error) {
      Logger.warn('Could not pause content script recording:', error);
    }

    Logger.log('🔄 Recording session paused');
  }

  async resumeRecordingSession() {
    if (!this.currentSessionId) {
      throw new Error('No active recording session');
    }

    const session = this.sessions.get(this.currentSessionId);
    if (!session) {
      throw new Error('Recording session not found');
    }

    session.status = 'recording';
    session.resumedTime = Date.now();

    // Resume recording in content script
    try {
      await chrome.tabs.sendMessage(session.tabId, { type: 'RESUME_RECORDING' });
    } catch (error) {
      Logger.warn('Could not resume content script recording:', error);
    }

    Logger.log('▶️ Recording session resumed');
  }

  shouldRecordNavigation(newUrl, existingActions) {
    // Don't record if it's the same URL as the last action
    const lastAction = existingActions[existingActions.length - 1];
    if (lastAction && lastAction.url === newUrl) {
      return false;
    }

    // Don't record rapid successive navigation changes (likely redirects)
    const recentNavigations = existingActions
      .filter(a => a.type === 'navigation')
      .slice(-2);
    
    if (recentNavigations.length >= 2) {
      const timeDiff = Date.now() - recentNavigations[recentNavigations.length - 1].timestamp;
      if (timeDiff < 2000) { // Less than 2 seconds
        return false;
      }
    }

    // Skip common single-page app hash changes that don't represent user navigation
    if (lastAction && lastAction.url && newUrl) {
      const lastBase = lastAction.url.split('#')[0].split('?')[0];
      const newBase = newUrl.split('#')[0].split('?')[0];
      if (lastBase === newBase) {
        return false; // Same base URL, likely SPA navigation
      }
    }

    return true;
  }

  isUserInitiatedNavigation(existingActions) {
    // Check if there was a recent click action that might have triggered this navigation
    const recentActions = existingActions.slice(-5); // Last 5 actions
    const hasRecentClick = recentActions.some(action => 
      action.type === 'click' && 
      (Date.now() - action.timestamp) < 3000 && // Within 3 seconds
      (action.element?.tagName === 'A' || action.element?.type === 'submit')
    );
    
    return hasRecentClick;
  }

  handleSingleActionRecorded(message, tabId) {
    // Multi-tab support: look up session by tabId first
    let sessionId = this.activeSessionsByTab.get(tabId);

    // Fallback to currentSessionId if tab-specific lookup fails
    if (!sessionId) {
      sessionId = this.currentSessionId;
    }

    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (session && session.tabId === tabId) {
      session.actions.push(message.action);
      Logger.log('💾 Action stored in session:', {
        type: message.action.type,
        totalSessionActions: session.actions.length,
        url: message.url,
        sessionId: sessionId
      });
    }
  }

  handleActionsRecorded(message, tabId) {
    // Multi-tab support: look up session by tabId first
    let sessionId = this.activeSessionsByTab.get(tabId);

    // Fallback to currentSessionId if tab-specific lookup fails
    if (!sessionId) {
      sessionId = this.currentSessionId;
    }

    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (session && session.tabId === tabId) {
      session.actions.push(...message.actions);
      Logger.log('💾 Multiple actions stored in session:', {
        newActions: message.actions.length,
        totalSessionActions: session.actions.length,
        sessionId: sessionId
      });
    }
  }

  async generateScript(framework, actions, options = {}) {
    Logger.log('🎭 Script generation started:', {
      framework,
      actionCount: actions?.length || 0,
      aiEnabled: this.settings.enableAI,
      hasApiKey: !!this.settings.apiKey,
      useAI: options.useAI !== false
    });

    let result;

    // Try AI enhancement if enabled and configured
    if (this.settings.enableAI && this.settings.apiKey && options.useAI !== false) {
      try {
        Logger.log('🤖 ATTEMPTING LLM GENERATION - Using direct AI service...');
        const enhancedScript = await this.callAIProvider(framework, actions, options);
        if (enhancedScript && this.validateAIOutput(enhancedScript, framework)) {
          Logger.log('✅ SUCCESS: Script generated using LLM (AI-Enhanced)');
          const finalScript = this.ensureInitialNavigation(enhancedScript, framework, actions);
          result = { script: finalScript, aiUsed: true };
        } else if (enhancedScript) {
          Logger.warn('⚠️ AI output failed validation — falling back to template');
          result = this.generateTemplateScript(framework, actions, 'validation_failed', options);
        } else {
          result = this.generateTemplateScript(framework, actions, 'not_configured', options);
        }
      } catch (error) {
        Logger.warn('❌ LLM GENERATION FAILED - Falling back to template:', error.message);
        result = this.generateTemplateScript(framework, actions, 'api_error', options);
      }
    } else {
      Logger.log('⚠️ AI generation skipped - AI disabled or no API key');
      result = this.generateTemplateScript(framework, actions, 'not_configured', options);
    }

    // Generate Page Object Models if requested
    if (options.generatePageObjects && this.pageObjectGenerator) {
      try {
        const pomResult = await this.pageObjectGenerator.generatePageObjects(actions, framework, options);
        result.pomFiles = pomResult.pageObjects.map(po => ({
          filename: po.filename,
          code: po.code
        }));
        Logger.log(`✅ POM generation complete: ${result.pomFiles.length} page object(s)`);
      } catch (err) {
        Logger.warn('⚠️ POM generation failed:', err.message);
      }
    }

    return result;
  }

  validateAIOutput(code, framework) {
    if (!code || typeof code !== 'string' || code.length < 100) return false;
    const signatures = {
      playwright: [/test\(|it\(|describe\(/],
      cypress:    [/describe\(|it\(|cy\./],
      selenium:   [/def test_|@Test|testRecordedFlow/],
      puppeteer:  [/puppeteer|browser\.|page\./]
    };
    const checks = signatures[framework] || [/.+/];
    return checks.some(re => re.test(code));
  }

  generateTemplateScript(framework, actions, fallbackReason = 'not_configured', options = {}) {
    Logger.log('📝 FALLBACK: Using template generation (Non-AI)');
    const generators = {
      playwright: this.generatePlaywrightScript,
      selenium: this.generateSeleniumScript,
      cypress: this.generateCypressScript,
      puppeteer: this.generatePuppeteerScript
    };

    const generator = generators[framework];
    if (!generator) {
      throw new Error(`Unsupported framework: ${framework}`);
    }

    let templateScript = generator.call(this, actions, options);
    Logger.log('✅ SUCCESS: Script generated using TEMPLATE (Non-AI)');
    templateScript = this.appendNetworkStubs(templateScript, framework);
    Logger.log('🎯 Template Script Preview:', templateScript.substring(0, 200) + '...');
    return { script: templateScript, aiUsed: false, fallbackReason };
  }

  appendNetworkStubs(script, framework) {
    if (!this.networkRecorder) return script;

    const currentSession = this.sessions.get(this.currentSessionId) ||
      [...this.sessions.values()].find(s => s.status === 'completed' && s.networkRequests?.length > 0);
    const networkRequests = currentSession?.networkRequests || [];
    if (networkRequests.length === 0) return script;

    // Temporarily set network data on recorder for assertion generation
    const saved = this.networkRecorder.networkRequests;
    this.networkRecorder.networkRequests = networkRequests;
    const assertions = this.networkRecorder.generateNetworkAssertions(framework);
    this.networkRecorder.networkRequests = saved;

    if (assertions.length === 0) return script;

    return script + '\n\n// ===== Network Request Stubs (add inside test body) =====\n' +
      assertions.join('\n');
  }

  async requestAIEnhancement(framework, actions, options = {}) {
    // Request AI enhancement from popup context via message passing
    return new Promise((resolve, reject) => {
      // Try to find an active popup window or create a communication channel
      chrome.runtime.sendMessage({
        type: 'REQUEST_AI_ENHANCEMENT',
        data: {
          framework,
          actions,
          options: {
            includeAssertions: options.includeAssertions ?? this.settings.includeAssertions,
            includeScreenshots: options.includeScreenshots ?? this.settings.includeScreenshots,
            addComments: options.addComments ?? this.settings.addComments,
            ...options
          },
          settings: {
            enableAI: this.settings.enableAI,
            aiProvider: this.settings.aiProvider,
            aiModel: this.settings.aiModel,
            apiKey: this.settings.apiKey
          }
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          // No popup context available, fallback to template
          Logger.log('No popup context available for AI enhancement');
          resolve(null);
        } else if (response && response.success) {
          resolve(response.enhancedScript);
        } else {
          reject(new Error(response?.error || 'AI enhancement failed'));
        }
      });
    });
  }

  async updateSettings(newSettings) {
    try {
      // Merge new settings with existing ones
      this.settings = { ...this.settings, ...newSettings };

      // Create a copy for storage with encrypted API key (AES-GCM)
      const settingsToStore = { ...this.settings };
      if (settingsToStore.apiKey) {
        settingsToStore.apiKey = await this.encryptApiKey(settingsToStore.apiKey);
      }

      // Save to chrome storage with encrypted key
      await chrome.storage.local.set({ flowScribeSettings: settingsToStore });

      // Update AI service with the new settings (plain text in memory)
      if (this.aiService) {
        await this.aiService.updateSettings({
          provider: newSettings.aiProvider || this.settings.aiProvider,
          model: newSettings.aiModel || this.settings.aiModel,
          apiKey: newSettings.apiKey || this.settings.apiKey,
          enableAI: newSettings.enableAI !== undefined ? newSettings.enableAI : this.settings.enableAI
        });
      }

      Logger.log('⚙️ Settings updated and saved to storage');
    } catch (error) {
      Logger.error('Failed to update settings:', error);
      throw error;
    }
  }

  async deleteSession(sessionId) {
    // Remove from current sessions
    this.sessions.delete(sessionId);
    
    // Remove from history
    this.sessionHistory = this.sessionHistory.filter(session => session.id !== sessionId);
    await this.saveSessionHistory();
  }

  async captureScreenshot(tabId, options = {}) {
    try {
      const screenshot = await chrome.tabs.captureVisibleTab(null, {
        format: options.format || 'png',
        quality: options.quality || 90
      });
      
      return {
        dataUrl: screenshot,
        timestamp: Date.now(),
        tabId: tabId
      };
    } catch (error) {
      throw new Error(`Screenshot capture failed: ${error.message}`);
    }
  }

  async exportSession(sessionId, format = 'json') {
    const session = this.sessions.get(sessionId) || 
                   this.sessionHistory.find(s => s.id === sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    switch (format) {
      case 'json':
        return {
          format: 'json',
          filename: `flowscribe-session-${sessionId}.json`,
          content: JSON.stringify(session, null, 2),
          mimeType: 'application/json'
        };
        
      case 'csv':
        const csvContent = this.sessionToCSV(session);
        return {
          format: 'csv',
          filename: `flowscribe-actions-${sessionId}.csv`,
          content: csvContent,
          mimeType: 'text/csv'
        };
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  sessionToCSV(session) {
    const headers = ['Step', 'Type', 'Element', 'Value', 'Timestamp', 'URL'];
    const rows = [headers];
    
    session.actions.forEach((action, index) => {
      rows.push([
        index + 1,
        action.type,
        this.getElementDescription(action.element),
        action.value || '',
        new Date(action.timestamp).toISOString(),
        action.url || ''
      ]);
    });
    
    return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  getElementDescription(element) {
    if (!element) return 'Unknown';
    if (element.id) return `#${element.id}`;
    if (element.name) return `[name="${element.name}"]`;
    if (element.className) return `.${element.className.split(' ')[0]}`;
    return element.tagName?.toLowerCase() || 'element';
  }

  generateWaitCodeForAction(action, previousAction, framework) {
    if (!this.waitStrategyEngine) return [];
    try {
      const normalizedAction = { ...action, target: action.target || action.element || null };
      const normalizedPrev = previousAction
        ? { ...previousAction, target: previousAction.target || previousAction.element || null }
        : null;
      const strategies = this.waitStrategyEngine.determineWaitStrategy(normalizedAction, normalizedPrev, null);
      if (!strategies || strategies.length === 0) return [];

      const waitLines = [];
      for (const strategy of strategies) {
        // Need a selector for element-based strategies
        if (!strategy.selector && normalizedAction.target) {
          strategy.selector = normalizedAction.target.cssSelector
            || normalizedAction.target.selector
            || (normalizedAction.target.id ? `#${normalizedAction.target.id}` : null);
        }
        if (!strategy.selector) continue;

        const strategyMap = {
          element_visible: 'element', element_clickable: 'element',
          element_stable: 'element', element_enabled: 'element',
          network_idle: 'network', animation_complete: 'animation',
          page_load: 'navigation', navigation_complete: 'navigation'
        };
        const engineKey = strategyMap[strategy.type];
        if (engineKey && this.waitStrategyEngine.strategies[engineKey]) {
          const code = this.waitStrategyEngine.strategies[engineKey].generateCode(strategy, framework);
          if (code) waitLines.push(code);
        }
      }
      return waitLines;
    } catch (e) {
      Logger.warn('Wait code generation failed:', e.message);
      return [];
    }
  }

  generatePlaywrightScript(actions, options = {}) {
    const optimizedActions = this.optimizeActionsForScript(actions);
    const testContext = this.analyzeTestContext(optimizedActions);

    const crossOriginAction = optimizedActions.find(a => a.type === 'cross_origin_iframes_detected');
    const crossOriginWarning = crossOriginAction
      ? [`// ⚠️  WARNING: Cross-origin iframes detected (${crossOriginAction.origins.join(', ')}).`,
         `//    Interactions inside those iframes were NOT recorded.`,
         `//    Use page.frameLocator() to interact with cross-origin iframes if needed.`,
         ``]
      : [];

    const lines = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      ...crossOriginWarning,
      `test.describe('${testContext.testName}', () => {`,
      `  test.beforeEach(async ({ page }) => {`,
      `    test.setTimeout(60000);`,
      `  });`,
      ``,
      `  test('recorded user flow', async ({ page }) => {`,
    ];

    let currentUrl = '';
    let stepCounter = 1;
    let frameVarCounter = 0;

    optimizedActions.forEach((action, index) => {
      if (!action || !action.type) return;

      if (action.type === 'cross_origin_iframes_detected') return;

      // Navigation
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        const safeUrl = action.url || 'about:blank';
        lines.push(`    // Step ${stepCounter++}: Navigate to ${safeUrl}`);
        lines.push(`    await page.goto('${safeUrl}');`);
        lines.push(`    await page.waitForLoadState('domcontentloaded');`);
        lines.push(`    await expect(page).toHaveURL(/${this.getUrlPattern(safeUrl)}/);`);
        if (options.includeScreenshots) {
          lines.push(`    await page.screenshot({ path: 'screenshots/step-${stepCounter - 1}.png', fullPage: true });`);
        }
        lines.push(``);
        currentUrl = safeUrl;
      }

      if (action.type !== 'navigation' && !action.element) return;

      // Smart waits
      const waitLines = this.generateWaitCodeForAction(action, optimizedActions[index - 1], 'playwright');
      if (waitLines.length > 0) {
        waitLines.forEach(line => {
          if (line.trim()) lines.push(`    ${line.trim()}`);
        });
      }

      const locator = this.getShadowAwarePlaywrightLocator(action.element);
      const elementDesc = this.getElementDescription(action.element);

      switch (action.type) {
        case 'click':
          lines.push(`    // Step ${stepCounter++}: Click ${elementDesc}`);
          if (action.iframeInfo && action.iframeInfo.origin) {
            const safeOrigin = this.escapeValue(action.iframeInfo.origin);
            const fVar = `frame${++frameVarCounter}`;
            lines.push(`    const ${fVar} = page.frameLocator('iframe[src*="${safeOrigin}"]');`);
            lines.push(`    await ${fVar}.locator('${this.getBestSelector(action.element)}').click();`);
          } else {
            lines.push(`    await expect(${locator}).toBeVisible();`);
            lines.push(`    await ${locator}.click();`);
          }
          if (this.isImportantClick(action)) {
            lines.push(`    await page.waitForLoadState('domcontentloaded');`);
          }
          lines.push(``);
          break;

        case 'input':
        case 'change':
          const value = action.value || '';
          lines.push(`    // Step ${stepCounter++}: Fill "${value}" in ${elementDesc}`);
          if (action.iframeInfo && action.iframeInfo.origin) {
            const safeOrigin = this.escapeValue(action.iframeInfo.origin);
            const fVar = `frame${++frameVarCounter}`;
            lines.push(`    const ${fVar} = page.frameLocator('iframe[src*="${safeOrigin}"]');`);
            lines.push(`    await ${fVar}.locator('${this.getBestSelector(action.element)}').fill('${this.escapeValue(value)}');`);
          } else {
            lines.push(`    await expect(${locator}).toBeVisible();`);
            lines.push(`    await ${locator}.fill('${this.escapeValue(value)}');`);
            if (value && action.element.type !== 'password') {
              lines.push(`    await expect(${locator}).toHaveValue('${this.escapeValue(value)}');`);
            }
          }
          lines.push(``);
          break;

        case 'keydown':
          if (action.key === 'Enter') {
            lines.push(`    // Step ${stepCounter++}: Press Enter`);
            if (action.iframeInfo && action.iframeInfo.origin) {
              const safeOrigin = this.escapeValue(action.iframeInfo.origin);
              const fVar = `frame${++frameVarCounter}`;
              lines.push(`    const ${fVar} = page.frameLocator('iframe[src*="${safeOrigin}"]');`);
              lines.push(`    await ${fVar}.locator('${this.getBestSelector(action.element)}').press('Enter');`);
            } else {
              lines.push(`    await ${locator}.press('Enter');`);
              lines.push(`    await page.waitForLoadState('domcontentloaded');`);
            }
            lines.push(``);
          }
          break;

        case 'submit':
          lines.push(`    // Step ${stepCounter++}: Submit form`);
          if (action.iframeInfo && action.iframeInfo.origin) {
            const safeOrigin = this.escapeValue(action.iframeInfo.origin);
            const fVar = `frame${++frameVarCounter}`;
            lines.push(`    const ${fVar} = page.frameLocator('iframe[src*="${safeOrigin}"]');`);
            lines.push(`    await ${fVar}.locator('${this.getBestSelector(action.element)}').press('Enter');`);
          } else {
            lines.push(`    await ${locator}.click();`);
            lines.push(`    await page.waitForLoadState('domcontentloaded');`);
          }
          lines.push(``);
          break;
      }
    });

    // Final assertions
    const finalUrl = optimizedActions[optimizedActions.length - 1]?.url;
    if (finalUrl) {
      lines.push(`    // Verify final page state`);
      lines.push(`    await expect(page).toHaveURL(/${this.getUrlPattern(finalUrl)}/);`);
    }

    lines.push(`  });`);
    lines.push(`});`);
    return lines.join('\n');
  }

  optimizeActionsForScript(actions) {
    // Pass 1: collapse consecutive input events on the same element to final value only
    const pass1 = [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      if (action.type === 'input' || action.type === 'change') {
        const next = actions[i + 1];
        if (next && (next.type === 'input' || next.type === 'change') &&
            this.isSameElementData(action.element, next.element)) {
          continue; // skip intermediate keystroke — keep only the final value
        }
      }
      pass1.push(action);
    }

    // Pass 2: remove redundant click immediately before/after fill on same element
    const pass2 = [];
    for (let i = 0; i < pass1.length; i++) {
      const action = pass1[i];
      if (action.type === 'click') {
        const prev = pass2[pass2.length - 1];
        const next = pass1[i + 1];
        const prevIsFill = prev && (prev.type === 'input' || prev.type === 'change') && this.isSameElementData(action.element, prev.element);
        const nextIsFill = next && (next.type === 'input' || next.type === 'change') && this.isSameElementData(action.element, next.element);
        if (prevIsFill || nextIsFill) continue;
      }
      pass2.push(action);
    }

    // Pass 3: remove same-type same-element duplicates within 500ms
    const optimized = [];
    let lastAction = null;
    for (const action of pass2) {
      if (lastAction && this.isDuplicateAction(action, lastAction)) continue;
      optimized.push(action);
      lastAction = action;
    }

    return optimized;
  }

  isDuplicateAction(action1, action2) {
    if (action1.type !== action2.type) return false;
    
    // Same element and type within short time
    if (this.isSameElementData(action1.element, action2.element) &&
        Math.abs(action1.timestamp - action2.timestamp) < 500) {
      return true;
    }
    
    return false;
  }

  isSameElementData(el1, el2) {
    if (!el1 || !el2) return false;
    if (el1.id && el1.id === el2.id) return true;
    if (el1.name && el1.name === el2.name && el1.tagName === el2.tagName) return true;
    if (el1.cssSelector && el1.cssSelector === el2.cssSelector) return true;
    // Input fields without id/name: match on type + placeholder
    if (el1.tagName === 'INPUT' && el2.tagName === 'INPUT' &&
        el1.type === el2.type && el1.placeholder && el1.placeholder === el2.placeholder) return true;
    // aria-label match (e.g. email inputs with aria-label="Email")
    const al1 = el1.attributes?.['aria-label'];
    const al2 = el2.attributes?.['aria-label'];
    if (al1 && al1 === al2) return true;
    // data-testid match
    const t1 = el1.attributes?.['data-testid'] || el1.testAttributes?.['data-testid'];
    const t2 = el2.attributes?.['data-testid'] || el2.testAttributes?.['data-testid'];
    if (t1 && t1 === t2) return true;
    return false;
  }

  analyzeTestContext(actions) {
    const urls = [...new Set(actions.map(a => a.url).filter(Boolean))];
    const hasPasswordField = actions.some(a => a.element?.type === 'password');
    const hasSubmit = actions.some(a => a.type === 'submit' || 
      (a.type === 'click' && a.element?.textContent?.toLowerCase().includes('submit')));
    
    return {
      testName: `FlowScribe User Journey - ${new Date().toISOString().slice(0, 10)}`,
      startUrl: urls[0] || 'unknown',
      endUrl: urls[urls.length - 1] || urls[0],
      pageCount: urls.length,
      requiresAuth: hasPasswordField,
      hasFormSubmission: hasSubmit
    };
  }

  getUrlHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  getUrlPattern(url) {
    try {
      const urlObj = new URL(url);
      // Create a regex pattern that's flexible for dynamic parts
      return urlObj.pathname.replace(/\/\d+/g, '/\\d+') + '.*';
    } catch {
      return url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special chars
    }
  }

  isImportantClick(action) {
    const element = action.element;
    const importantPatterns = [
      /submit/i, /login/i, /register/i, /save/i, /confirm/i, /continue/i, /next/i
    ];
    
    const text = element.textContent || element.value || '';
    return importantPatterns.some(pattern => pattern.test(text));
  }

  escapeValue(value) {
    return value.replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  generateSeleniumScript(actions, options = {}) {
    const optimizedActions = this.optimizeActionsForScript(actions);
    const testContext = this.analyzeTestContext(optimizedActions);
    const crossOriginAction = optimizedActions.find(a => a.type === 'cross_origin_iframes_detected');

    const lines = [
      `from selenium import webdriver`,
      `from selenium.webdriver.common.by import By`,
      `from selenium.webdriver.common.keys import Keys`,
      `from selenium.webdriver.support.ui import WebDriverWait`,
      `from selenium.webdriver.support import expected_conditions as EC`,
      `import os`,
      `import unittest`,
      ...(crossOriginAction ? [
        ``,
        `# ⚠️  WARNING: Cross-origin iframes detected (${crossOriginAction.origins.join(', ')}).`,
        `#    Interactions inside those iframes were NOT recorded.`,
        `#    Use driver.switch_to.frame() to interact with cross-origin iframes if needed.`
      ] : []),
      ``,
      `class ${testContext.testName.replace(/[^a-zA-Z0-9]/g, '')}(unittest.TestCase):`,
      `    def setUp(self):`,
      `        self.driver = webdriver.Chrome()`,
      `        self.wait = WebDriverWait(self.driver, 10)`,
      ``,
      `    def tearDown(self):`,
      `        self.driver.quit()`,
      ``,
      `    def test_user_journey(self):`,
      `        driver = self.driver`,
      `        wait = self.wait`,
      ``,
    ];

    let currentUrl = '';
    let stepCounter = 1;

    optimizedActions.forEach((action, index) => {
      if (!action || !action.type) return;
      if (action.type === 'cross_origin_iframes_detected') return;

      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        const safeUrl = action.url || 'about:blank';
        lines.push(`        # Step ${stepCounter++}: Navigate to ${safeUrl}`);
        lines.push(`        driver.get("${safeUrl}")`);
        lines.push(`        self.assertIn("${this.getUrlHostname(safeUrl)}", driver.current_url)`);
        if (options.includeScreenshots) {
          lines.push(`        driver.save_screenshot(os.path.join('screenshots', f'step-${stepCounter - 1}.png'))`);
        }
        currentUrl = safeUrl;
      }

      if (action.type !== 'navigation' && !action.element) return;

      // Inject smart wait
      const waitLines = this.generateWaitCodeForAction(action, optimizedActions[index - 1], 'selenium');
      waitLines.forEach(line => { if (line.trim()) lines.push(`        ${line.trim()}`); });

      const elementDesc = this.getElementDescription(action.element);

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelectorForSelenium(action.element);
          lines.push(`        # Step ${stepCounter++}: Click ${elementDesc}`);
          if (action.element?.shadowPath?.length > 0) {
            const sp = action.element.shadowPath[0];
            lines.push(`        element = driver.execute_script("return document.querySelector('${sp.host}').shadowRoot.querySelector('${sp.inner}')")`);
            lines.push(`        driver.execute_script("arguments[0].click()", element)`);
          } else if (action.iframeInfo) {
            lines.push(`        driver.switch_to.frame(driver.find_element(By.CSS_SELECTOR, "iframe[src*='${action.iframeInfo.origin}']"))`);
            lines.push(`        element = wait.until(EC.element_to_be_clickable((${clickSelector})))`);
            lines.push(`        self.assertTrue(element.is_displayed())`);
            lines.push(`        element.click()`);
            lines.push(`        driver.switch_to.default_content()`);
          } else {
            lines.push(`        element = wait.until(EC.element_to_be_clickable((${clickSelector})))`);
            lines.push(`        self.assertTrue(element.is_displayed())`);
            lines.push(`        element.click()`);
          }
          if (this.isImportantClick(action)) {
            lines.push(`        # Verify click action completed`);
            lines.push(`        wait.until(lambda d: d.execute_script("return document.readyState") == "complete")`);
          }
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelectorForSelenium(action.element);
          const value = action.value || '';
          lines.push(`        # Step ${stepCounter++}: Enter "${value}" in ${elementDesc}`);
          if (action.iframeInfo) {
            lines.push(`        driver.switch_to.frame(driver.find_element(By.CSS_SELECTOR, "iframe[src*='${action.iframeInfo.origin}']"))`);
            lines.push(`        element = wait.until(EC.presence_of_element_located((${inputSelector})))`);
            lines.push(`        element.clear()`);
            lines.push(`        element.send_keys("${value.replace(/"/g, '\\"')}")`);
            lines.push(`        driver.switch_to.default_content()`);
          } else {
            lines.push(`        element = wait.until(EC.presence_of_element_located((${inputSelector})))`);
            lines.push(`        self.assertTrue(element.is_displayed())`);
            lines.push(`        element.clear()`);
            lines.push(`        element.send_keys("${value.replace(/"/g, '\\"')}")`);
            if (value && action.element.type !== 'password') {
              lines.push(`        self.assertEqual(element.get_attribute("value"), "${value.replace(/"/g, '\\"')}")`);
            }
          }
          break;

        case 'keydown':
          if (action.key === 'Enter') {
            const keySelector = this.getBestSelectorForSelenium(action.element);
            lines.push(`        # Step ${stepCounter++}: Press Enter`);
            lines.push(`        element = wait.until(EC.presence_of_element_located((${keySelector})))`);
            lines.push(`        element.send_keys(Keys.ENTER)`);
            lines.push(`        wait.until(lambda d: d.execute_script("return document.readyState") == "complete")`);
          }
          break;
      }
    });

    // Final URL assertion
    const finalUrl = optimizedActions[optimizedActions.length - 1]?.url;
    if (finalUrl && finalUrl !== testContext.startUrl) {
      lines.push(`        # Verify final page state`);
      lines.push(`        self.assertIn("${this.getUrlHostname(finalUrl)}", driver.current_url)`);
    }

    lines.push(``);
    lines.push(`if __name__ == "__main__":`);
    lines.push(`    unittest.main()`);
    return lines.join('\n');
  }

  generateCypressScript(actions, options = {}) {
    const optimizedActions = this.optimizeActionsForScript(actions);
    const testContext = this.analyzeTestContext(optimizedActions);
    const crossOriginAction = optimizedActions.find(a => a.type === 'cross_origin_iframes_detected');

    const lines = [
      ...(crossOriginAction ? [
        `// ⚠️  WARNING: Cross-origin iframes detected (${crossOriginAction.origins.join(', ')}).`,
        `//    Interactions inside those iframes were NOT recorded.`,
        `//    Use cy.origin() to interact with cross-origin iframes if needed.`,
        ``
      ] : []),
      `describe('${testContext.testName}', () => {`,
      `  beforeEach(() => {`,
      `    cy.viewport(1280, 720);`,
      `  });`,
      ``,
      `  it('should complete the recorded user journey', () => {`,
    ];

    let currentUrl = '';
    let stepCounter = 1;

    optimizedActions.forEach((action, index) => {
      if (!action || !action.type) return;
      if (action.type === 'cross_origin_iframes_detected') return;

      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        const safeUrl = action.url || 'about:blank';
        lines.push(`    // Step ${stepCounter++}: Navigate to ${safeUrl}`);
        lines.push(`    cy.visit('${safeUrl}');`);
        lines.push(`    cy.url().should('include', '${this.getUrlHostname(safeUrl)}');`);
        if (options.includeScreenshots) {
          lines.push(`    cy.screenshot('step-${stepCounter - 1}');`);
        }
        currentUrl = safeUrl;
      }

      if (action.type !== 'navigation' && !action.element) return;

      // Inject smart wait
      const waitLines = this.generateWaitCodeForAction(action, optimizedActions[index - 1], 'cypress');
      waitLines.forEach(line => { if (line.trim()) lines.push(`    ${line.trim()}`); });

      const selector = this.getBestSelector(action.element);
      const elementDesc = this.getElementDescription(action.element);

      switch (action.type) {
        case 'click':
          lines.push(`    // Step ${stepCounter++}: Click ${elementDesc}`);
          if (action.element?.shadowPath?.length > 0) {
            const sp = action.element.shadowPath[0];
            lines.push(`    cy.get('${sp.host}').shadow().find('${sp.inner}').click();`);
          } else if (action.iframeInfo) {
            lines.push(`    cy.frameLoaded('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`    cy.iframe().find('${selector}').should('be.visible').click();`);
          } else {
            lines.push(`    cy.get('${selector}').should('be.visible').click();`);
          }
          if (this.isImportantClick(action)) {
            lines.push(`    cy.location('pathname').should('not.be.empty');`);
          }
          break;

        case 'input':
        case 'change':
          const value = action.value || '';
          lines.push(`    // Step ${stepCounter++}: Enter "${value}" in ${elementDesc}`);
          if (action.element?.shadowPath?.length > 0) {
            const sp = action.element.shadowPath[0];
            lines.push(`    cy.get('${sp.host}').shadow().find('${sp.inner}').clear().type('${value.replace(/'/g, "\\'")}');`);
          } else if (action.iframeInfo) {
            lines.push(`    cy.frameLoaded('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`    cy.iframe().find('${selector}').clear().type('${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`    cy.get('${selector}').should('be.visible').clear().type('${value.replace(/'/g, "\\'")}');`);
            if (value && action.element.type !== 'password') {
              lines.push(`    cy.get('${selector}').should('have.value', '${value.replace(/'/g, "\\'")}');`);
            }
          }
          break;

        case 'keydown':
          if (action.key === 'Enter') {
            lines.push(`    // Step ${stepCounter++}: Press Enter`);
            lines.push(`    cy.get('${selector}').type('{enter}');`);
          }
          break;

        case 'submit':
          lines.push(`    // Step ${stepCounter++}: Submit form`);
          lines.push(`    cy.get('${selector}').should('be.visible').click();`);
          break;
      }
    });

    // Final URL assertion
    const finalUrl = optimizedActions[optimizedActions.length - 1]?.url;
    if (finalUrl && finalUrl !== testContext.startUrl) {
      lines.push(`    // Verify final page state`);
      lines.push(`    cy.url().should('include', '${this.getUrlHostname(finalUrl)}');`);
    }

    lines.push(`  });`);
    lines.push(`});`);
    return lines.join('\n');
  }

  generatePuppeteerScript(actions, options = {}) {
    const optimizedActions = this.optimizeActionsForScript(actions);
    const testContext = this.analyzeTestContext(optimizedActions);
    const crossOriginAction = optimizedActions.find(a => a.type === 'cross_origin_iframes_detected');

    const lines = [
      `const puppeteer = require('puppeteer');`,
      `const assert = require('assert');`,
      ...(crossOriginAction ? [
        ``,
        `// ⚠️  WARNING: Cross-origin iframes detected (${crossOriginAction.origins.join(', ')}).`,
        `//    Interactions inside those iframes were NOT recorded.`,
        `//    Use page.frames() to interact with cross-origin iframes if needed.`
      ] : []),
      ``,
      `describe('${testContext.testName}', () => {`,
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
      `  test('should complete the recorded user journey', async () => {`,
    ];

    let currentUrl = '';
    let stepCounter = 1;

    optimizedActions.forEach((action, index) => {
      if (!action || !action.type) return;
      if (action.type === 'cross_origin_iframes_detected') return;

      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        const safeUrl = action.url || 'about:blank';
        lines.push(`    // Step ${stepCounter++}: Navigate to ${safeUrl}`);
        lines.push(`    await page.goto('${safeUrl}', { waitUntil: 'networkidle0' });`);
        lines.push(`    assert(page.url().includes('${this.getUrlHostname(safeUrl)}'), 'URL should include ${this.getUrlHostname(safeUrl)}');`);
        if (options.includeScreenshots) {
          lines.push(`    await page.screenshot({ path: \`screenshots/step-${stepCounter - 1}.png\`, fullPage: true });`);
        }
        currentUrl = safeUrl;
      }

      if (action.type !== 'navigation' && !action.element) return;

      // Inject smart wait
      const waitLines = this.generateWaitCodeForAction(action, optimizedActions[index - 1], 'puppeteer');
      waitLines.forEach(line => { if (line.trim()) lines.push(`    ${line.trim()}`); });

      const selector = this.getBestSelector(action.element);
      const elementDesc = this.getElementDescription(action.element);

      switch (action.type) {
        case 'click':
          lines.push(`    // Step ${stepCounter++}: Click ${elementDesc}`);
          if (action.element?.shadowPath?.length > 0) {
            const sp = action.element.shadowPath[0];
            lines.push(`    await page.evaluate(() => document.querySelector('${sp.host}').shadowRoot.querySelector('${sp.inner}').click());`);
          } else if (action.iframeInfo) {
            lines.push(`    const frame = page.frames().find(f => f.url().includes('${action.iframeInfo.origin}'));`);
            lines.push(`    await frame.waitForSelector('${selector}', { visible: true });`);
            lines.push(`    await frame.click('${selector}');`);
          } else {
            lines.push(`    await page.waitForSelector('${selector}', { visible: true });`);
            lines.push(`    await page.click('${selector}');`);
          }
          if (this.isImportantClick(action)) {
            lines.push(`    // Verify click action completed`);
            lines.push(`    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});`);
          }
          break;

        case 'input':
        case 'change':
          const value = action.value || '';
          lines.push(`    // Step ${stepCounter++}: Enter "${value}" in ${elementDesc}`);
          if (action.iframeInfo) {
            lines.push(`    const frame = page.frames().find(f => f.url().includes('${action.iframeInfo.origin}'));`);
            lines.push(`    await frame.waitForSelector('${selector}');`);
            lines.push(`    await frame.evaluate(sel => document.querySelector(sel).value = '', '${selector}');`);
            lines.push(`    await frame.type('${selector}', '${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`    await page.waitForSelector('${selector}', { visible: true });`);
            lines.push(`    await page.evaluate(sel => document.querySelector(sel).value = '', '${selector}');`);
            lines.push(`    await page.type('${selector}', '${value.replace(/'/g, "\\'")}');`);
            if (value && action.element.type !== 'password') {
              lines.push(`    const val = await page.$eval('${selector}', el => el.value);`);
              lines.push(`    assert.strictEqual(val, '${value.replace(/'/g, "\\'")}');`);
            }
          }
          break;

        case 'keydown':
          if (action.key === 'Enter') {
            lines.push(`    // Step ${stepCounter++}: Press Enter`);
            lines.push(`    await page.keyboard.press('Enter');`);
            lines.push(`    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});`);
          }
          break;

        case 'submit':
          lines.push(`    // Step ${stepCounter++}: Submit form`);
          lines.push(`    await page.waitForSelector('${selector}', { visible: true });`);
          lines.push(`    await page.click('${selector}');`);
          lines.push(`    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});`);
          break;
      }
    });

    // Final URL assertion
    const finalUrl = optimizedActions[optimizedActions.length - 1]?.url;
    if (finalUrl && finalUrl !== testContext.startUrl) {
      lines.push(`    // Verify final page state`);
      lines.push(`    assert(page.url().includes('${this.getUrlHostname(finalUrl)}'), 'Should be on final page');`);
    }

    lines.push(`  });`);
    lines.push(`});`);
    return lines.join('\n');
  }

  getBestSelector(element) {
    if (!element) return 'unknown';
    
    // Priority 1: ID (if not dynamic-looking)
    if (element.id && !this.isDynamicValue(element.id)) {
      return `#${element.id}`;
    }
    
    // Priority 2: Test attributes from enhanced action data
    if (element.testAttributes && Object.keys(element.testAttributes).length > 0) {
      const firstTestAttr = Object.entries(element.testAttributes)[0];
      return `[${firstTestAttr[0]}="${firstTestAttr[1]}"]`;
    }
    
    // Priority 3: Test attributes from regular attributes
    const testAttributes = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-automation'];
    if (element.attributes) {
      for (const attr of testAttributes) {
        const value = element.attributes[attr];
        if (value && !this.isDynamicValue(value)) {
          return `[${attr}="${value}"]`;
        }
      }
    }
    
    // Priority 4: Name attribute for form elements
    if (element.name && element.tagName && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(element.tagName)) {
      return `[name="${element.name}"]`;
    }
    
    // Priority 5: Type + placeholder for inputs
    if (element.tagName === 'INPUT' && element.type && element.placeholder) {
      return `input[type="${element.type}"][placeholder="${element.placeholder}"]`;
    }
    
    // Priority 6: aria-label for accessibility
    if (element.attributes && element.attributes['aria-label'] && !this.isDynamicValue(element.attributes['aria-label'])) {
      return `[aria-label="${element.attributes['aria-label']}"]`;
    }
    
    // Priority 7: Stable classes from enhanced data
    if (element.semanticAttributes && element.semanticAttributes.stableClasses?.length > 0) {
      const stableClasses = element.semanticAttributes.stableClasses.slice(0, 2); // Max 2 classes
      return `${element.tagName.toLowerCase()}.${stableClasses.join('.')}`;
    }
    
    // Priority 8: Use improved CSS selector if available
    if (element.cssSelector && !element.cssSelector.includes('nth-child')) {
      return element.cssSelector;
    }
    
    // Priority 9: Text content for buttons/links (if short and stable)
    if (['BUTTON', 'A'].includes(element.tagName) && element.textContent && 
        element.textContent.length < 30 && !this.isDynamicValue(element.textContent)) {
      return `${element.tagName.toLowerCase()}:has-text("${element.textContent.trim()}")`;
    }
    
    // Fallback: only use XPath if it's a semantic/attribute-based one (not positional)
    if (element.xpath && !this.isFragileXPath(element.xpath)) {
      return element.xpath;
    }

    // Last resort: tag name only — never emit absolute positional XPath
    return element.tagName?.toLowerCase() || 'unknown';
  }

  isFragileXPath(xpath) {
    if (!xpath || typeof xpath !== 'string') return true;
    // Absolute paths from root are always fragile
    if (xpath.startsWith('/html/') || xpath.startsWith('/HTML/')) return true;
    // More than 2 positional indices = fragile
    const positional = xpath.split('/').filter(s => /\[\d+\]/.test(s)).length;
    return positional > 2;
  }

  isDynamicValue(value) {
    if (!value || typeof value !== 'string') return true;
    
    // Check if value looks dynamically generated
    const dynamicPatterns = [
      /^[0-9a-f]{8,}$/i,           // Long hex strings
      /^\d{10,}$/,                 // Long numbers (timestamps)
      /^[a-z0-9]{20,}$/i,          // Long random strings
      /^uuid-/i,                   // UUID patterns
      /^temp-/i,                   // Temporary IDs
      /^generated-/i,              // Generated IDs
      /-([\d]+)$/,                 // Ending with numbers
      /^css-[a-z0-9]+$/i,          // CSS-in-JS classes
      /^sc-[a-z0-9]+$/i,           // Styled components
    ];
    
    return dynamicPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Generate modern Playwright locator expression (getByRole, getByLabel, etc.)
   * Returns full locator like: page.getByRole('button', { name: 'Submit' })
   */
  getPlaywrightLocator(element) {
    if (!element) return `page.locator('body')`;

    const esc = (s) => s ? s.replace(/'/g, "\\'") : '';

    // 1. getByTestId (highest stability)
    if (element.attributes?.['data-testid']) {
      return `page.getByTestId('${esc(element.attributes['data-testid'])}')`;
    }
    if (element.testAttributes) {
      const testAttr = Object.values(element.testAttributes)[0];
      if (testAttr) return `page.getByTestId('${esc(testAttr)}')`;
    }

    // 2. getByRole with name (most semantic)
    if (element.attributes?.role) {
      const name = element.attributes?.['aria-label'] || element.textContent?.trim();
      if (name && name.length < 50) {
        return `page.getByRole('${element.attributes.role}', { name: '${esc(name)}' })`;
      }
      return `page.getByRole('${element.attributes.role}')`;
    }

    // Infer role from semantic HTML tags
    const tagRoleMap = {
      'BUTTON': 'button', 'A': 'link', 'INPUT': null, 'SELECT': 'combobox',
      'TEXTAREA': 'textbox', 'H1': 'heading', 'H2': 'heading', 'H3': 'heading',
      'NAV': 'navigation', 'MAIN': 'main', 'IMG': 'img'
    };
    const inferredRole = tagRoleMap[element.tagName];
    if (inferredRole && element.textContent?.trim() && element.textContent.trim().length < 50) {
      const name = esc(element.textContent.trim());
      return `page.getByRole('${inferredRole}', { name: '${name}' })`;
    }
    if (element.tagName === 'INPUT' && element.type) {
      const inputRoles = { checkbox: 'checkbox', radio: 'radio', button: 'button', submit: 'button' };
      const role = inputRoles[element.type];
      if (role) {
        const name = element.attributes?.['aria-label'] || element.name || '';
        return name
          ? `page.getByRole('${role}', { name: '${esc(name)}' })`
          : `page.getByRole('${role}')`;
      }
    }

    // 3. getByLabel (form fields with aria-label)
    if (element.attributes?.['aria-label']) {
      return `page.getByLabel('${esc(element.attributes['aria-label'])}')`;
    }

    // 4. getByPlaceholder (input fields)
    if (element.placeholder) {
      return `page.getByPlaceholder('${esc(element.placeholder)}')`;
    }

    // 5. getByText (short, unique text)
    if (element.textContent?.trim() && element.textContent.trim().length < 30 &&
        !['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
      return `page.getByText('${esc(element.textContent.trim())}', { exact: true })`;
    }

    // 6. getByAltText (images)
    if (element.tagName === 'IMG' && element.attributes?.alt) {
      return `page.getByAltText('${esc(element.attributes.alt)}')`;
    }

    // 7. Fallback to locator() with best CSS/XPath selector
    const selector = this.getBestSelector(element);
    // XPath must be prefixed for Playwright to interpret correctly
    if (selector.startsWith('/') || selector.startsWith('xpath=')) {
      const xpathVal = selector.startsWith('xpath=') ? selector : `xpath=${selector}`;
      return `page.locator('${xpathVal}')`;
    }
    return `page.locator('${selector}')`;
  }

  getShadowAwarePlaywrightLocator(element) {
    if (!element) return `page.locator('body')`;
    if (element.shadowPath && element.shadowPath.length > 0) {
      const esc = (s) => s ? s.replace(/'/g, "\\'") : '';
      const first = element.shadowPath[0];
      let chain = `page.locator('${esc(first.host)}')`;
      for (let i = 0; i < element.shadowPath.length; i++) {
        chain += `.locator('${esc(element.shadowPath[i].inner)}')`;
      }
      return chain;
    }
    return this.getPlaywrightLocator(element);
  }

  getBestSelectorForSelenium(element) {
    if (element.id) {
      return `By.ID, "${element.id}"`;
    }
    
    if (element.name && element.tagName && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
      return `By.NAME, "${element.name}"`;
    }
    
    if (element.cssSelector) {
      return `By.CSS_SELECTOR, "${element.cssSelector}"`;
    }
    
    if (element.xpath && !this.isFragileXPath(element.xpath)) {
      return `By.XPATH, "${element.xpath}"`;
    }

    return `By.TAG_NAME, "${element.tagName.toLowerCase()}"`;
  }


  clearSessions() {
    this.sessions.clear();
    this.activeSessionsByTab.clear();
    this.currentSessionId = null;
  }
}

// Initialize the background service
const flowScribeBackground = new FlowScribeBackground();