/**
 * FlowScribe Unified Background Script
 * Consolidated implementation with all features from background, background-enhanced, and extension/background
 */
class FlowScribeBackground {
  constructor() {
    this.sessions = new Map();
    this.currentSessionId = null;
    this.aiService = null;
    this.selfHealingEngine = null;
    this.networkRecorder = null;
    this.cicdManager = null;
    this.pomGenerator = null;
    this.settings = {};
    this.sessionHistory = [];
    this.init();
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
    try {
      // Dynamically import AI service
      const AIServiceModule = await import('../utils/ai-service.js');
      const AIService = AIServiceModule.default || AIServiceModule.AIService;
      this.aiService = new AIService();
    } catch (error) {
      console.warn('AI service not available:', error);
      this.aiService = null;
    }
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
          this.stopRecordingSession()
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
          const isRecording = this.currentSessionId && 
            this.sessions.has(this.currentSessionId) &&
            this.sessions.get(this.currentSessionId).status === 'recording';
          sendResponse({ 
            success: true, 
            isRecording,
            sessionId: this.currentSessionId,
            settings: this.settings
          });
          break;

        case 'ACTIONS_RECORDED':
          this.handleActionsRecorded(message, sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'GENERATE_SCRIPT':
          const framework = message.data?.framework || message.framework;
          const actions = message.data?.actions || message.actions;
          const options = message.data?.options || message.options || {};
          
          if (!framework) {
            sendResponse({ success: false, error: 'Framework not specified' });
            return;
          }
          
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

        case 'UPDATE_SETTINGS':
          this.updateSettings(message.settings)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'GET_SESSION_HISTORY':
          sendResponse({ success: true, history: this.sessionHistory });
          break;

        case 'DELETE_SESSION':
          this.deleteSession(message.sessionId)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'ENHANCE_SCRIPT':
          this.enhanceScript(message.framework, message.actions, message.options)
            .then(script => sendResponse({ success: true, script }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'CAPTURE_SCREENSHOT':
          this.captureScreenshot(sender.tab.id, message.options)
            .then(screenshot => sendResponse({ success: true, screenshot }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;

        case 'EXPORT_SESSION':
          this.exportSession(message.sessionId, message.format)
            .then(exportData => sendResponse({ success: true, data: exportData }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;
      }
    });
  }

  setupTabHandlers() {
    // Handle tab updates to track navigation and restore recording
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (this.currentSessionId) {
        const session = this.sessions.get(this.currentSessionId);
        if (session && session.tabId === tabId) {
          
          // Track navigation
          if (changeInfo.url) {
            session.actions.push({
              id: Date.now(),
              type: 'navigation',
              timestamp: Date.now(),
              url: changeInfo.url,
              title: tab.title || ''
            });
          }
          
          // Auto-restore recording after page loads
          if (changeInfo.status === 'complete' && session.status === 'recording') {
            console.log('🔄 Page loaded, restoring recording on:', tab.url);
            
            // Wait for content script to initialize, then restore recording
            setTimeout(async () => {
              try {
                await chrome.tabs.sendMessage(tabId, {
                  type: 'START_RECORDING',
                  sessionId: this.currentSessionId,
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
                      sessionId: this.currentSessionId,
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

    // Handle tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      if (this.currentSessionId) {
        const session = this.sessions.get(this.currentSessionId);
        if (session && session.tabId === tabId) {
          this.stopRecordingSession();
        }
      }
    });
  }

  async startRecordingSession(tabId, sessionData = {}) {
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
    this.currentSessionId = sessionId;

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
    await chrome.tabs.sendMessage(tabId, { type: 'START_RECORDING' });

    return sessionId;
  }

  async stopRecordingSession() {
    if (!this.currentSessionId) {
      throw new Error('No active recording session');
    }

    const session = this.sessions.get(this.currentSessionId);
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
    this.currentSessionId = null;

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

  handleActionsRecorded(message, tabId) {
    if (!this.currentSessionId) return;

    const session = this.sessions.get(this.currentSessionId);
    if (session && session.tabId === tabId) {
      session.actions.push(...message.actions);
    }
  }

  async generateScript(framework, actions, options = {}) {
    // Use AI enhancement if available and enabled
    if (this.settings.enableAI && this.aiService && this.aiService.isConfigured()) {
      try {
        return await this.aiService.enhanceScript(actions, framework, {
          includeAssertions: options.includeAssertions ?? this.settings.includeAssertions,
          includeScreenshots: options.includeScreenshots ?? this.settings.includeScreenshots,
          addComments: options.addComments ?? this.settings.addComments,
          ...options
        });
      } catch (error) {
        console.warn('AI enhancement failed, falling back to template:', error);
      }
    }

    // Fallback to template generation
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

    return generator.call(this, actions);
  }

  async enhanceScript(framework, actions, options = {}) {
    if (!this.aiService) {
      throw new Error('AI service not available');
    }

    return await this.aiService.enhanceScript(actions, framework, {
      ...options,
      includeAssertions: options.includeAssertions ?? this.settings.includeAssertions,
      includeScreenshots: options.includeScreenshots ?? this.settings.includeScreenshots,
      addComments: options.addComments ?? this.settings.addComments
    });
  }

  async updateSettings(newSettings) {
    try {
      // Merge new settings with existing ones
      this.settings = { ...this.settings, ...newSettings };
      
      // Save to chrome storage
      await chrome.storage.local.set({ flowScribeSettings: this.settings });
      
      // Update AI service with the new settings
      if (this.aiService) {
        await this.aiService.updateSettings({
          provider: newSettings.aiProvider || this.settings.aiProvider,
          model: newSettings.aiModel || this.settings.aiModel,
          apiKey: newSettings.apiKey || this.settings.apiKey,
          enableAI: newSettings.enableAI !== undefined ? newSettings.enableAI : this.settings.enableAI
        });
      }
      
      console.log('⚙️ Settings updated and saved to storage:', this.settings);
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
      // Navigation handling with assertions
      if (action.type === 'navigation' || (action.url && action.url !== currentUrl)) {
        lines.push(`  // Step ${stepCounter++}: Navigate to ${action.url}`);
        lines.push(`  await page.goto('${action.url}');`);
        lines.push(`  await expect(page).toHaveURL(/${this.getUrlPattern(action.url)}/);`);
        currentUrl = action.url;
      }

      const selector = this.getBestSelector(action.element);
      const elementDesc = this.getElementDescription(action.element);
      
      switch (action.type) {
        case 'click':
          lines.push(`  // Step ${stepCounter++}: Click ${elementDesc}`);
          if (action.iframeInfo) {
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`  await frame.locator('${selector}').click();`);
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
          
          if (action.iframeInfo) {
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
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
            if (action.iframeInfo) {
              lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
              lines.push(`  await frame.locator('${selector}').press('Enter');`);
            } else {
              lines.push(`  await page.locator('${selector}').press('Enter');`);
              lines.push(`  await page.waitForLoadState('networkidle');`);
            }
          }
          break;

        case 'submit':
          lines.push(`  // Step ${stepCounter++}: Submit form`);
          if (action.iframeInfo) {
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
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
    this.currentSessionId = null;
  }
}

// Initialize the background service
const flowScribeBackground = new FlowScribeBackground();