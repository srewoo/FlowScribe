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
        includeScreenshots: true,
        includeAssertions: true,
        addComments: true,
        theme: 'light'
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.settings = {
        selectedFramework: 'playwright',
        enableAI: false,
        aiProvider: 'openai',
        includeScreenshots: true,
        includeAssertions: true,
        addComments: true,
        theme: 'light'
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
    this.settings = { ...this.settings, ...newSettings };
    await this.saveSettings();
    
    // Update AI service if settings changed
    if (this.aiService && (newSettings.aiProvider || newSettings.enableAI)) {
      await this.aiService.saveSettings(this.settings);
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
    const lines = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test('FlowScribe recorded test', async ({ page }) => {`,
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
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`  await frame.locator('${clickSelector}').click();`);
          } else {
            lines.push(`  await page.locator('${clickSelector}').click();`);
          }
          break;

        case 'input':
        case 'change':
          const inputSelector = this.getBestSelector(action.element);
          const value = action.value || '';
          if (action.iframeInfo) {
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`  await frame.locator('${inputSelector}').fill('${value.replace(/'/g, "\\'")}');`);
          } else {
            lines.push(`  await page.locator('${inputSelector}').fill('${value.replace(/'/g, "\\'")}');`);
          }
          break;

        case 'keydown':
          if (action.key === 'Enter') {
            const enterSelector = this.getBestSelector(action.element);
            if (action.iframeInfo) {
              lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
              lines.push(`  await frame.locator('${enterSelector}').press('Enter');`);
            } else {
              lines.push(`  await page.locator('${enterSelector}').press('Enter');`);
            }
          }
          break;

        case 'submit':
          const formSelector = this.getBestSelector(action.element);
          if (action.iframeInfo) {
            lines.push(`  const frame = await page.frameLocator('iframe[src*="${action.iframeInfo.origin}"]');`);
            lines.push(`  await frame.locator('${formSelector}').press('Enter');`);
          } else {
            lines.push(`  await page.locator('${formSelector}').press('Enter');`);
          }
          break;
      }
    });

    lines.push(`});`);
    return lines.join('\n');
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
    // Priority: id > data-testid > name > specific class > CSS selector > xpath
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Check for common test attributes
    const testAttributes = ['data-testid', 'data-test', 'data-cy'];
    for (const attr of testAttributes) {
      // This is a simplified check - in real implementation, we'd need the actual attribute values
      if (element.className && element.className.includes('test')) {
        break;
      }
    }
    
    if (element.name && element.tagName && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
      return `[name="${element.name}"]`;
    }
    
    if (element.cssSelector) {
      return element.cssSelector;
    }
    
    if (element.xpath) {
      return element.xpath;
    }
    
    return element.tagName.toLowerCase();
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

  async updateSettings(newSettings) {
    try {
      // Merge new settings with existing ones
      this.settings = { ...this.settings, ...newSettings };
      
      // Save to chrome storage
      await chrome.storage.local.set({ flowScribeSettings: this.settings });
      
      console.log('⚙️ Settings updated and saved to storage');
    } catch (error) {
      console.error('Failed to update settings:', error);
      throw error;
    }
  }

  clearSessions() {
    this.sessions.clear();
    this.currentSessionId = null;
  }
}

// Initialize the background service
const flowScribeBackground = new FlowScribeBackground();