/**
 * FlowScribe Unified Background Script
 * Consolidated implementation with all features from background, background-enhanced, and extension/background
 */
class FlowScribeBackground {
  constructor() {
    this.sessions = new Map();
    this.activeSessionsByTab = new Map(); // tabId -> sessionId mapping for multi-tab support
    this.currentSessionId = null; // Keep for backwards compatibility
    this.aiService = null;
    this.selfHealingEngine = null;
    this.networkRecorder = null;
    this.cicdManager = null;
    this.pomGenerator = null;
    this.settings = {};
    this.sessionHistory = [];
    this.encryptionKey = 'flowscribe-v1'; // Simple obfuscation key
    this.init();
  }

  // Simple XOR-based obfuscation for API keys (not cryptographically secure, but better than plain text)
  obfuscateKey(key) {
    if (!key) return '';
    return btoa(key.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length))
    ).join(''));
  }

  deobfuscateKey(obfuscated) {
    if (!obfuscated) return '';
    try {
      return atob(obfuscated).split('').map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length))
      ).join('');
    } catch {
      return obfuscated; // Return as-is if not obfuscated (backward compatibility)
    }
  }

  async init() {
    await this.loadSettings();
    await this.loadSessionHistory();
    await this.initializeAI();
    this.setupMessageHandlers();
    this.setupTabHandlers();
    console.log('FlowScribe background service worker loaded');
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
        aiModel: 'gpt-4o',
        apiKey: '',
        includeScreenshots: true,
        includeAssertions: true,
        addComments: true,
        theme: 'light',
        enableSelfHealing: true,
        enableNetworkRecording: true,
        enablePOMGeneration: true,
        cicdPlatform: 'github-actions'
      };

      // Deobfuscate API key if it exists
      if (this.settings.apiKey) {
        this.settings.apiKey = this.deobfuscateKey(this.settings.apiKey);
      }

      console.log('✅ Settings loaded successfully');
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = {
        selectedFramework: 'playwright',
        enableAI: false,
        aiProvider: 'openai',
        aiModel: 'gpt-4o',
        apiKey: '',
        includeScreenshots: true,
        includeAssertions: true,
        addComments: true,
        theme: 'light',
        enableSelfHealing: true,
        enableNetworkRecording: true,
        enablePOMGeneration: true,
        cicdPlatform: 'github-actions'
      };
    }
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set({ flowScribeSettings: this.settings });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  }

  async loadSessionHistory() {
    try {
      const result = await chrome.storage.local.get(['sessionHistory']);
      this.sessionHistory = result.sessionHistory || [];
    } catch (error) {
      console.error('Failed to load session history:', error);
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
      console.error('Failed to save session history:', error);
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

    console.log('🤖 AI service initialized (service worker compatible)');
  }

  /**
   * Call AI provider directly using fetch (service worker compatible)
   * Automatically handles chunking for large action sets
   */
  async callAIProvider(framework, actions, options = {}) {
    if (!this.settings.enableAI || !this.settings.apiKey) {
      console.log('⚠️ AI not configured - using template generation');
      return null;
    }

    const provider = this.settings.aiProvider || 'openai';
    const model = this.settings.aiModel || 'gpt-4o';

    try {
      console.log(`🤖 Calling ${provider} (${model}) for script enhancement...`);
      console.log(`📊 Processing ${actions.length} actions`);

      // Check if we need batched processing for large recordings (>100 actions)
      if (actions.length > 100) {
        console.log('📊 Large recording detected - using chunked batch processing');
        const batchedResult = await this.processActionsInBatches(framework, actions, options);
        if (batchedResult) {
          console.log('✅ Batched AI enhancement successful');
          return batchedResult;
        }
      }

      // Single call for smaller recordings
      const prompt = this.buildAIPrompt(framework, actions, options);
      const estimatedTokens = this.estimateTokens(prompt);
      console.log(`📊 Estimated prompt tokens: ~${estimatedTokens}`);

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
          console.warn(`Unknown AI provider: ${provider}`);
          return null;
      }

      if (response) {
        console.log('✅ AI enhancement successful');
        return response;
      }
    } catch (error) {
      console.error('❌ AI enhancement failed:', error.message);
    }

    return null;
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
    // Keep only essential fields for AI processing
    const compressed = {
      type: action.type,
      timestamp: action.timestamp
    };

    if (action.url) compressed.url = action.url;
    if (action.value) compressed.value = action.value;
    if (action.key) compressed.key = action.key;

    // Compress element data - keep only useful selector info
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
      // Include test attributes if available
      if (action.element.testAttributes && Object.keys(action.element.testAttributes).length > 0) {
        compressed.element.testAttrs = action.element.testAttributes;
      }
      // Include best selector
      if (action.element.cssSelector) {
        compressed.element.selector = action.element.cssSelector;
      }
    }

    return compressed;
  }

  /**
   * Chunk actions into batches that fit within token limits
   */
  chunkActions(actions, maxTokensPerChunk = 3000) {
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
    // Compress actions to reduce token usage
    const compressedActions = actions.map(a => this.compressAction(a));
    const actionsJson = JSON.stringify(compressedActions, null, 2);

    // Get the starting URL from first navigation or action
    const startUrl = actions.find(a => a.url)?.url || 'https://example.com';

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

    // Framework-specific templates
    const frameworkTemplates = this.getFrameworkTemplate(framework);

    return `You are an expert ${framework} test automation engineer. Generate a COMPLETE, READY-TO-RUN test script.

## Framework: ${framework}
## Starting URL: ${startUrl}
## Total Actions: ${actions.length}${chunkContext}

## CRITICAL REQUIREMENTS:
1. Generate a COMPLETE script that runs without any modifications
2. Include ALL necessary imports at the top of the file
3. Convert EVERY action into corresponding test code - do not skip any action
4. Use proper async/await syntax throughout
5. Add explicit waits before interactions (waitForSelector, waitForLoadState, etc.)
6. Include meaningful assertions after important actions (form submissions, navigation, clicks)

## Selector Priority (use in this order):
1. data-testid, data-test, data-cy, data-qa attributes
2. id attribute (if not dynamic)
3. name attribute (for form elements)
4. aria-label or role attributes
5. Stable CSS selectors (avoid nth-child when possible)
6. Text content for buttons/links

## ${framework.toUpperCase()} TEMPLATE TO FOLLOW:
${frameworkTemplates}

## Recorded Actions (convert ALL of these):
${actionsJson}

## Action Type Mapping:
- "navigation" → goto() or visit()
- "click" → click() with waitForSelector
- "input" or "change" → fill() or type() with clear() first
- "keydown" with Enter → press('Enter')
- "submit" → click submit button or press Enter
- "focus"/"blur" → typically skip unless needed for validation

## OUTPUT RULES:
- Output ONLY valid ${framework} code
- NO markdown code blocks, NO explanations
- NO placeholder comments like "// Add more steps here"
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
    const MAX_ACTIONS_FOR_SINGLE_CALL = 100;
    const MAX_TOKENS_PER_CHUNK = 10000;

    // For small action sets, process in single call
    if (actions.length <= MAX_ACTIONS_FOR_SINGLE_CALL) {
      const prompt = this.buildAIPrompt(framework, actions, options);
      const estimatedTokens = this.estimateTokens(prompt);
      console.log(`📊 Single batch: ${actions.length} actions, ~${estimatedTokens} tokens`);
      return null; // Let caller use single call
    }

    // For larger sets, chunk and batch process
    console.log(`📊 Large recording: ${actions.length} actions - using chunked processing`);
    const chunks = this.chunkActions(actions, MAX_TOKENS_PER_CHUNK);
    console.log(`📊 Split into ${chunks.length} chunks`);

    const scriptParts = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkInfo = { current: i + 1, total: chunks.length };

      console.log(`🔄 Processing chunk ${i + 1}/${chunks.length} (${chunk.length} actions)`);

      const prompt = this.buildAIPrompt(framework, chunk, options, chunkInfo);

      let result;
      const provider = this.settings.aiProvider || 'openai';
      const model = this.settings.aiModel || 'gpt-4o';

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

      // Add small delay between API calls to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Merge script parts
    if (scriptParts.length > 0) {
      return this.mergeScriptParts(framework, scriptParts);
    }

    return null;
  }

  /**
   * Merge multiple script parts into a single coherent script
   */
  mergeScriptParts(framework, parts) {
    if (parts.length === 1) return parts[0];

    // Extract test body from each part and merge
    const mergedSteps = [];
    let imports = '';
    let setup = '';
    let cleanup = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      // For first part, extract imports and setup
      if (i === 0) {
        const lines = part.split('\n');
        for (const line of lines) {
          if (line.startsWith('import ') || line.startsWith('const ') || line.startsWith('from ')) {
            imports += line + '\n';
          }
        }
      }

      // Extract step comments and code
      mergedSteps.push(`  // --- Chunk ${i + 1} ---`);

      // Simple extraction: take lines that look like test steps
      const lines = part.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        // Skip import/setup/cleanup lines for middle parts
        if (i > 0 && (trimmed.startsWith('import ') || trimmed.startsWith('describe(') || trimmed.startsWith('test('))) {
          continue;
        }
        if (i < parts.length - 1 && (trimmed.startsWith('});') || trimmed.includes('browser.close'))) {
          continue;
        }
        if (trimmed && !trimmed.startsWith('import ')) {
          mergedSteps.push(line);
        }
      }
    }

    return mergedSteps.join('\n');
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
            content: 'You are a test automation expert. Generate clean, production-ready test scripts.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 4000,
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
        model: model || 'claude-3-sonnet-20240229',
        max_tokens: 4000,
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
    const geminiModel = model || 'gemini-pro';
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
          maxOutputTokens: 4000
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
            console.log('📤 Sending', sessionForActions.actions.length, 'actions to content script for restoration');
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
            console.warn('❌ No actions found for script generation');
            sendResponse({ success: false, error: 'No actions found to generate script' });
            return;
          }
          
          console.log('🎬 Generating script with actions:', {
            actionCount: actions.length,
            actionTypes: actions.map(a => a.type),
            hasElementData: actions.some(a => a.element && Object.keys(a.element).length > 0),
            framework
          });
          
          this.generateScript(framework, actions, options)
            .then(script => sendResponse({ success: true, script }))
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
                console.log('✅ Export session successful:', exportData);
                sendResponse({ success: true, data: exportData });
              })
              .catch(error => {
                console.error('❌ Export session failed:', error);
                sendResponse({ success: false, error: error.message });
              });
          } catch (error) {
            console.error('❌ Export session error:', error);
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
            console.log('📍 Navigation recorded:', changeInfo.url);
          }

          // Auto-restore recording after page loads
          if (changeInfo.status === 'complete' && session.status === 'recording') {
            console.log('🔄 Page loaded, restoring recording on:', tab.url);

            // Wait for content script to initialize, then restore recording
            setTimeout(async () => {
              try {
                await chrome.tabs.sendMessage(tabId, {
                  type: 'START_RECORDING',
                  sessionId: sessionId,
                  settings: this.settings,
                  isRestore: true
                });
                console.log('✅ Recording restored after navigation');
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
                    console.log('✅ Recording restored after retry');
                  } catch (retryError) {
                    console.warn('Failed to restore recording after retry:', retryError.message);
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
        console.warn(`Tab ${tabId} already has active session ${existingSessionId}`);
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
      console.warn('Content script may already be injected:', error);
    }

    // Start recording in content script
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING' });
    } catch (error) {
      console.error('Failed to start recording in content script:', error);
      // Cleanup the session if we can't start recording
      this.sessions.delete(sessionId);
      this.currentSessionId = null;
      throw new Error('Failed to start recording. Please refresh the page and try again.');
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
      console.warn('Could not get final actions from content script:', error);
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
      console.warn('Could not hide recording indicator:', error);
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
      console.warn('Could not pause content script recording:', error);
    }

    console.log('🔄 Recording session paused');
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
      console.warn('Could not resume content script recording:', error);
    }

    console.log('▶️ Recording session resumed');
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
      console.log('💾 Action stored in session:', {
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
      console.log('💾 Multiple actions stored in session:', {
        newActions: message.actions.length,
        totalSessionActions: session.actions.length,
        sessionId: sessionId
      });
    }
  }

  async generateScript(framework, actions, options = {}) {
    console.log('🎭 Script generation started:', {
      framework,
      actionCount: actions?.length || 0,
      aiEnabled: this.settings.enableAI,
      hasApiKey: !!this.settings.apiKey,
      useAI: options.useAI !== false
    });

    // Try AI enhancement if enabled and configured
    if (this.settings.enableAI && this.settings.apiKey && options.useAI !== false) {
      try {
        console.log('🤖 ATTEMPTING LLM GENERATION - Using direct AI service...');
        // Use the service worker-compatible AI service directly
        const enhancedScript = await this.callAIProvider(framework, actions, options);
        if (enhancedScript) {
          console.log('✅ SUCCESS: Script generated using LLM (AI-Enhanced)');
          console.log('🎯 LLM Script Preview:', enhancedScript.substring(0, 200) + '...');
          return enhancedScript;
        }
      } catch (error) {
        console.warn('❌ LLM GENERATION FAILED - Falling back to template:', error.message);
      }
    } else {
      console.log('⚠️ AI generation skipped - AI disabled or no API key');
    }

    // Fallback to template generation
    console.log('📝 FALLBACK: Using template generation (Non-AI)');
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

    const templateScript = generator.call(this, actions);
    console.log('✅ SUCCESS: Script generated using TEMPLATE (Non-AI)');
    console.log('🎯 Template Script Preview:', templateScript.substring(0, 200) + '...');
    return templateScript;
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
          console.log('No popup context available for AI enhancement');
          resolve(null);
        } else if (response && response.success) {
          resolve(response.enhancedScript);
        } else {
          reject(new Error(response?.error || 'AI enhancement failed'));
        }
      });
    });
  }

  async enhanceScript(framework, actions, options = {}) {
    // Deprecated: Use requestAIEnhancement instead
    throw new Error('AI service moved to popup context - use requestAIEnhancement');
  }

  async updateSettings(newSettings) {
    try {
      // Merge new settings with existing ones
      this.settings = { ...this.settings, ...newSettings };

      // Create a copy for storage with obfuscated API key
      const settingsToStore = { ...this.settings };
      if (settingsToStore.apiKey) {
        settingsToStore.apiKey = this.obfuscateKey(settingsToStore.apiKey);
      }

      // Save to chrome storage with obfuscated key
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

      console.log('⚙️ Settings updated and saved to storage');
    } catch (error) {
      console.error('Failed to update settings:', error);
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

  generatePlaywrightScript(actions) {
    // Pre-process actions to optimize and add context
    const optimizedActions = this.optimizeActionsForScript(actions);
    const testContext = this.analyzeTestContext(optimizedActions);
    
    const lines = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test('${testContext.testName}', async ({ page }) => {`,
    ];

    // Add page setup if needed
    if (testContext.requiresAuth) {
      lines.push(`  // Setup: Configure authentication if needed`);
    }
    
    let currentUrl = '';
    let stepCounter = 1;

    optimizedActions.forEach((action, index) => {
      // Validate action has required data
      if (!action || !action.type) {
        console.warn('Skipping invalid action:', action);
        return;
      }

      // Navigation handling with assertions
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        const safeUrl = action.url || 'about:blank';
        lines.push(`  // Step ${stepCounter++}: Navigate to ${safeUrl}`);
        lines.push(`  await page.goto('${safeUrl}');`);
        lines.push(`  await expect(page).toHaveURL(/${this.getUrlPattern(safeUrl)}/);`);
        currentUrl = safeUrl;
      }

      // Validate element data exists for non-navigation actions
      if (action.type !== 'navigation' && !action.element) {
        console.warn('Skipping action without element data:', action.type);
        return;
      }

      const selector = this.getBestSelector(action.element);
      const elementDesc = this.getElementDescription(action.element);
      
      switch (action.type) {
        case 'click':
          lines.push(`  // Step ${stepCounter++}: Click ${elementDesc}`);
          if (action.iframeInfo && action.iframeInfo.origin) {
            const safeOrigin = this.escapeValue(action.iframeInfo.origin);
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${safeOrigin}"]');`);
            lines.push(`  await frame.locator('${selector}').click();`);
          } else if (action.iframeInfo) {
            // Fallback if iframe info is incomplete
            lines.push(`  // Note: Iframe origin not available, using main page`);
            lines.push(`  await expect(page.locator('${selector}')).toBeVisible();`);
            lines.push(`  await page.locator('${selector}').click();`);
          } else {
            lines.push(`  await expect(page.locator('${selector}')).toBeVisible();`);
            lines.push(`  await page.locator('${selector}').click();`);
          }
          
          // Add post-click assertions for important elements
          if (this.isImportantClick(action)) {
            lines.push(`  // Verify click action was successful`);
            if (action.element.textContent?.toLowerCase().includes('submit')) {
              lines.push(`  await page.waitForLoadState('networkidle');`);
            }
          }
          break;

        case 'input':
        case 'change':
          const value = action.value || '';
          lines.push(`  // Step ${stepCounter++}: Enter "${value}" in ${elementDesc}`);

          if (action.iframeInfo && action.iframeInfo.origin) {
            const safeOrigin = this.escapeValue(action.iframeInfo.origin);
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${safeOrigin}"]');`);
            lines.push(`  await frame.locator('${selector}').fill('${this.escapeValue(value)}');`);
          } else {
            lines.push(`  await expect(page.locator('${selector}')).toBeVisible();`);
            lines.push(`  await page.locator('${selector}').clear();`);
            lines.push(`  await page.locator('${selector}').fill('${this.escapeValue(value)}');`);
            
            // Add validation for important inputs
            if (value && action.element.type !== 'password') {
              lines.push(`  await expect(page.locator('${selector}')).toHaveValue('${this.escapeValue(value)}');`);
            }
          }
          break;

        case 'keydown':
          if (action.key === 'Enter') {
            lines.push(`  // Step ${stepCounter++}: Press Enter`);
            if (action.iframeInfo && action.iframeInfo.origin) {
              const safeOrigin = this.escapeValue(action.iframeInfo.origin);
              lines.push(`  const frame = await page.frameLocator('iframe[src*="${safeOrigin}"]');`);
              lines.push(`  await frame.locator('${selector}').press('Enter');`);
            } else {
              lines.push(`  await page.locator('${selector}').press('Enter');`);
              lines.push(`  await page.waitForLoadState('networkidle');`);
            }
          }
          break;

        case 'submit':
          lines.push(`  // Step ${stepCounter++}: Submit form`);
          if (action.iframeInfo && action.iframeInfo.origin) {
            const safeOrigin = this.escapeValue(action.iframeInfo.origin);
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${safeOrigin}"]');`);
            lines.push(`  await frame.locator('${selector}').press('Enter');`);
          } else {
            lines.push(`  await page.locator('${selector}').click();`);
            lines.push(`  await page.waitForLoadState('networkidle');`);
          }
          break;
      }
    });

    // Add final assertions
    const finalUrl = optimizedActions[optimizedActions.length - 1]?.url;
    if (finalUrl && finalUrl !== testContext.startUrl) {
      lines.push(`  // Verify final page state`);
      lines.push(`  await expect(page).toHaveURL(/${this.getUrlPattern(finalUrl)}/);`);
    }

    lines.push(`});`);
    return lines.join('\n');
  }

  optimizeActionsForScript(actions) {
    const optimized = [];
    let lastAction = null;
    
    for (const action of actions) {
      // Skip duplicate actions that were already filtered
      if (lastAction && this.isDuplicateAction(action, lastAction)) {
        continue;
      }
      
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
    return el1.id === el2.id || 
           (el1.name === el2.name && el1.tagName === el2.tagName) ||
           el1.cssSelector === el2.cssSelector;
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

  generateSeleniumScript(actions) {
    const lines = [
      `from selenium import webdriver`,
      `from selenium.webdriver.common.by import By`,
      `from selenium.webdriver.support.ui import WebDriverWait`,
      `from selenium.webdriver.support import expected_conditions as EC`,
      ``,
      `driver = webdriver.Chrome()`,
      `wait = WebDriverWait(driver, 10)`,
      ``,
    ];

    let currentUrl = '';

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`driver.get("${action.url}")`);
        currentUrl = action.url;
      }

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelectorForSelenium(action.element);
          if (action.iframeInfo) {
            lines.push(`driver.switch_to.frame(driver.find_element(By.CSS_SELECTOR, "iframe[src*='${action.iframeInfo.origin}']"))`);
            lines.push(`wait.until(EC.element_to_be_clickable((${clickSelector}))).click()`);
            lines.push(`driver.switch_to.default_content()`);
          } else {
            lines.push(`wait.until(EC.element_to_be_clickable((${clickSelector}))).click()`);
          }
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelectorForSelenium(action.element);
          const value = action.value || '';
          if (action.iframeInfo) {
            lines.push(`driver.switch_to.frame(driver.find_element(By.CSS_SELECTOR, "iframe[src*='${action.iframeInfo.origin}']"))`);
            lines.push(`element = wait.until(EC.presence_of_element_located((${inputSelector})))`);
            lines.push(`element.clear()`);
            lines.push(`element.send_keys("${value.replace(/"/g, '\\"')}")`);
            lines.push(`driver.switch_to.default_content()`);
          } else {
            lines.push(`element = wait.until(EC.presence_of_element_located((${inputSelector})))`);
            lines.push(`element.clear()`);
            lines.push(`element.send_keys("${value.replace(/"/g, '\\"')}")`);
          }
          break;
      }
    });

    lines.push(`driver.quit()`);
    return lines.join('\n');
  }

  generateCypressScript(actions) {
    const lines = [
      `describe('FlowScribe recorded test', () => {`,
      `  it('should complete the recorded flow', () => {`,
    ];

    let currentUrl = '';

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`    cy.visit('${action.url}');`);
        currentUrl = action.url;
      }

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelector(action.element);
          if (action.iframeInfo) {
            lines.push(`    cy.frameLoaded('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`    cy.iframe().find('${clickSelector}').click();`);
          } else {
            lines.push(`    cy.get('${clickSelector}').click();`);
          }
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelector(action.element);
          const value = action.value || '';
          if (action.iframeInfo) {
            lines.push(`    cy.frameLoaded('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`    cy.iframe().find('${inputSelector}').type('${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`    cy.get('${inputSelector}').type('${value.replace(/'/g, "\\'")}');`);
          }
          break;
      }
    });

    lines.push(`  });`);
    lines.push(`});`);
    return lines.join('\n');
  }

  generatePuppeteerScript(actions) {
    const lines = [
      `const puppeteer = require('puppeteer');`,
      ``,
      `(async () => {`,
      `  const browser = await puppeteer.launch({ headless: false });`,
      `  const page = await browser.newPage();`,
      ``,
    ];

    let currentUrl = '';

    actions.forEach(action => {
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`  await page.goto('${action.url}');`);
        currentUrl = action.url;
      }

      switch (action.type) {
        case 'click':
          const clickSelector = this.getBestSelector(action.element);
          if (action.iframeInfo) {
            lines.push(`  const frame = await page.frames().find(frame => frame.url().includes('${action.iframeInfo.origin}'));`);
            lines.push(`  await frame.click('${clickSelector}');`);
          } else {
            lines.push(`  await page.click('${clickSelector}');`);
          }
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelector(action.element);
          const value = action.value || '';
          if (action.iframeInfo) {
            lines.push(`  const frame = await page.frames().find(frame => frame.url().includes('${action.iframeInfo.origin}'));`);
            lines.push(`  await frame.type('${inputSelector}', '${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`  await page.type('${inputSelector}', '${value.replace(/'/g, "\\'")}');`);
          }
          break;
      }
    });

    lines.push(`  await browser.close();`);
    lines.push(`})();`);
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
    
    // Fallback: Use XPath if CSS selector is too brittle
    if (element.xpath) {
      return element.xpath;
    }
    
    // Last resort
    return element.tagName?.toLowerCase() || 'unknown';
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
    
    if (element.xpath) {
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