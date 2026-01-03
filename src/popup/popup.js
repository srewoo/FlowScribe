// Debug mode - set to false for production
const DEBUG_MODE = false;
const Logger = {
  log: (...args) => DEBUG_MODE && console.log("[FlowScribe]", ...args),
  warn: (...args) => DEBUG_MODE && console.warn("[FlowScribe]", ...args),
  error: (...args) => console.error("[FlowScribe]", ...args),
  debug: (...args) => DEBUG_MODE && console.debug("[FlowScribe]", ...args)
};

/**
 * FlowScribe Unified UI Controller v2.1
 * Complete implementation with tabs, assertions, history, and all UI features
 */
class FlowScribeUI {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.currentSession = null;
    this.actions = [];
    this.assertions = [];
    this.selectedFramework = 'playwright';
    this.generatedScriptContent = null;
    this.settings = {};
    this.recordingStartTime = null;
    this.history = [];
    this.currentTab = 'record';
    this.isPickerActive = false;
    this.selectedAssertionType = 'visible';

    // Model options for different providers
    this.modelOptions = {
      openai: [
        { value: 'gpt-4o', label: 'GPT-4o (Latest)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' }
      ],
      anthropic: [
        { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Latest)' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Fast)' }
      ],
      google: [
        { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
        { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Fast)' },
        { value: 'gemini-pro', label: 'Gemini Pro' }
      ]
    };
    this.durationTimer = null;

    this.init();
  }

  async init() {
    this.detectBrowser();
    this.bindElements();
    this.setupEventListeners();
    await this.loadSettings();
    await this.loadCurrentState();
    await this.loadHistory();
    await this.loadAssertions();
    await this.checkForPickedElement();
    this.updateUI();
  }

  /**
   * Check if there's a picked element from element picker
   * This handles the case where popup was closed during element selection
   */
  async checkForPickedElement() {
    try {
      const result = await chrome.storage.local.get(['pickedElement', 'pickedElementTimestamp']);

      if (result.pickedElement && result.pickedElementTimestamp) {
        // Only use if picked within last 30 seconds
        const age = Date.now() - result.pickedElementTimestamp;
        if (age < 30000) {
          Logger.log('Found recently picked element:', result.pickedElement);

          // Switch to assertions tab and populate form
          this.switchTab('assertions');
          this.handleElementPicked(result.pickedElement);

          // Clear the stored element
          await chrome.storage.local.remove(['pickedElement', 'pickedElementTimestamp']);

          this.showToast('Element loaded! Configure your assertion.', 'success');
        } else {
          // Clear old data
          await chrome.storage.local.remove(['pickedElement', 'pickedElementTimestamp']);
        }
      }
    } catch (error) {
      Logger.error('Failed to check for picked element:', error);
    }
  }

  // ===== Browser Detection =====
  detectBrowser() {
    const browserBadge = document.getElementById('browserBadge');
    if (!browserBadge) return;

    let browserName = 'Chrome';
    const ua = navigator.userAgent;

    if (typeof browser !== 'undefined' && browser.runtime) {
      browserName = 'Firefox';
    } else if (ua.includes('Edg/')) {
      browserName = 'Edge';
    } else if (ua.includes('Chrome')) {
      browserName = 'Chrome';
    }

    browserBadge.textContent = browserName;
  }

  bindElements() {
    // Status elements
    this.statusDot = document.getElementById('statusDot');
    this.statusText = document.getElementById('statusText');
    this.actionCount = document.getElementById('actionCount');
    this.assertionCountEl = document.getElementById('assertionCount');
    this.duration = document.getElementById('duration');

    // Session info
    this.sessionCard = document.getElementById('sessionCard');
    this.sessionTitle = document.getElementById('sessionTitle');
    this.sessionUrl = document.getElementById('sessionUrl');

    // Framework selection
    this.frameworkSelect = document.getElementById('frameworkSelect');
    this.frameworkBtns = document.querySelectorAll('.framework-btn');

    // Control buttons
    this.startRecordingBtn = document.getElementById('startRecordingBtn');
    this.pauseRecordingBtn = document.getElementById('pauseRecordingBtn');
    this.stopRecordingBtn = document.getElementById('stopRecordingBtn');
    this.generateScriptBtn = document.getElementById('generateScriptBtn');

    // Quick assertion
    this.quickAssertion = document.getElementById('quickAssertion');
    this.addAssertionBtn = document.getElementById('addAssertionBtn');

    // Tab navigation
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');

    // Assertion Builder elements
    this.pickElementBtn = document.getElementById('pickElementBtn');
    this.manualAssertionBtn = document.getElementById('manualAssertionBtn');
    this.pickerStatus = document.getElementById('pickerStatus');
    this.cancelPickerBtn = document.getElementById('cancelPickerBtn');
    this.assertionForm = document.getElementById('assertionForm');
    this.selectorType = document.getElementById('selectorType');
    this.elementSelector = document.getElementById('elementSelector');
    this.assertionTypeBtns = document.querySelectorAll('.assertion-type-btn');
    this.assertionValueGroup = document.getElementById('assertionValueGroup');
    this.assertionValueLabel = document.getElementById('assertionValueLabel');
    this.assertionValue = document.getElementById('assertionValue');
    this.attributeNameGroup = document.getElementById('attributeNameGroup');
    this.attributeName = document.getElementById('attributeName');
    this.comparisonGroup = document.getElementById('comparisonGroup');
    this.comparisonType = document.getElementById('comparisonType');
    this.addAssertionFormBtn = document.getElementById('addAssertionFormBtn');
    this.clearAssertionFormBtn = document.getElementById('clearAssertionFormBtn');
    this.assertionsList = document.getElementById('assertionsList');
    this.assertionsEmpty = document.getElementById('assertionsEmpty');
    this.assertionListCount = document.getElementById('assertionListCount');

    // History elements
    this.historyList = document.getElementById('historyList');
    this.historyEmpty = document.getElementById('historyEmpty');
    this.clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // Modals
    this.settingsModal = document.getElementById('settingsModal');
    this.scriptModal = document.getElementById('scriptModal');
    this.scriptContent = document.getElementById('scriptContent');

    // Settings elements
    this.settingsBtn = document.getElementById('settingsBtn');
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    this.resetSettingsBtn = document.getElementById('resetSettingsBtn');

    // Enhanced settings
    this.enableSelfHealing = document.getElementById('enableSelfHealing');
    this.enableNetworkRecording = document.getElementById('enableNetworkRecording');
    this.enablePOMGeneration = document.getElementById('enablePOMGeneration');
    this.enableAIToggle = document.getElementById('enableAIToggle');
    this.aiConfig = document.getElementById('aiConfig');
    this.aiProvider = document.getElementById('aiProvider');
    this.aiModel = document.getElementById('aiModel');
    this.apiKey = document.getElementById('apiKey');
    this.toggleApiKeyBtn = document.getElementById('toggleApiKeyBtn');
    this.cicdPlatform = document.getElementById('cicdPlatform');

    // Script modal elements
    this.closeScriptBtn = document.getElementById('closeScriptBtn');
    this.copyScriptBtn = document.getElementById('copyScriptBtn');
    this.exportOptionsBtn = document.getElementById('exportOptionsBtn');
    this.exportOptions = document.getElementById('exportOptions');

    // Actions list elements
    this.actionsPanel = document.getElementById('actionsPanel');
    this.actionsList = document.getElementById('actionsList');
    this.actionsEmpty = document.getElementById('actionsEmpty');
    this.actionListCount = document.getElementById('actionListCount');
    this.actionsBody = document.getElementById('actionsBody');
    this.toggleActionsBtn = document.getElementById('toggleActionsBtn');
    this.clearActionsBtn = document.getElementById('clearActionsBtn');

    // UI elements
    this.toast = document.getElementById('toast');
    this.toastMessage = document.getElementById('toastMessage');
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.loadingMessage = document.getElementById('loadingMessage');

    // Footer links
    this.helpLink = document.getElementById('helpLink');
    this.privacyLink = document.getElementById('privacyLink');
  }

  setupEventListeners() {
    // Tab navigation
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Framework grid buttons
    this.frameworkBtns.forEach(btn => {
      btn.addEventListener('click', () => this.selectFramework(btn.dataset.framework));
    });

    // Control buttons
    this.startRecordingBtn.addEventListener('click', () => this.startRecording());
    this.pauseRecordingBtn.addEventListener('click', () => this.pauseRecording());
    this.stopRecordingBtn.addEventListener('click', () => this.stopRecording());
    this.generateScriptBtn.addEventListener('click', () => this.generateScript());

    // Quick assertion button
    if (this.addAssertionBtn) {
      this.addAssertionBtn.addEventListener('click', () => this.startQuickAssertion());
    }

    // Assertion Builder - Mode toggle
    if (this.pickElementBtn) {
      this.pickElementBtn.addEventListener('click', () => this.startElementPicker());
    }
    if (this.manualAssertionBtn) {
      this.manualAssertionBtn.addEventListener('click', () => this.switchToManualMode());
    }
    if (this.cancelPickerBtn) {
      this.cancelPickerBtn.addEventListener('click', () => this.cancelElementPicker());
    }

    // Assertion type buttons
    this.assertionTypeBtns.forEach(btn => {
      btn.addEventListener('click', () => this.selectAssertionType(btn.dataset.type));
    });

    // Assertion form buttons
    if (this.addAssertionFormBtn) {
      this.addAssertionFormBtn.addEventListener('click', () => this.addAssertion());
    }
    if (this.clearAssertionFormBtn) {
      this.clearAssertionFormBtn.addEventListener('click', () => this.clearAssertionForm());
    }

    // History
    if (this.clearHistoryBtn) {
      this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    }

    // Settings modal
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());

    // AI toggle
    this.enableAIToggle.addEventListener('change', () => this.toggleAIConfig());
    this.aiProvider.addEventListener('change', () => this.updateModelOptions());
    this.aiModel.addEventListener('change', () => this.saveModelPreference());

    // API key visibility toggle
    if (this.toggleApiKeyBtn) {
      this.toggleApiKeyBtn.addEventListener('click', () => this.toggleApiKeyVisibility());
    }

    // Script modal
    this.closeScriptBtn.addEventListener('click', () => this.closeScriptModal());
    this.copyScriptBtn.addEventListener('click', () => this.copyScript());
    this.exportOptionsBtn.addEventListener('click', () => this.toggleExportOptions());

    // Export options
    document.querySelectorAll('[data-export]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const exportType = e.target.getAttribute('data-export');
        this.exportScript(exportType);
      });
    });

    // Actions list events
    this.toggleActionsBtn.addEventListener('click', () => this.toggleActionsList());
    this.clearActionsBtn.addEventListener('click', () => this.clearActionsList());

    // Footer links
    this.helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
    });

    this.privacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
    });

    // Modal overlay clicks
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettings();
    });

    this.scriptModal.addEventListener('click', (e) => {
      if (e.target === this.scriptModal) this.closeScriptModal();
    });

    // Listen for updates from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'RECORDING_STATUS_CHANGED') {
        this.handleRecordingStatusChange(message);
      } else if (message.type === 'ACTIONS_UPDATED') {
        this.handleActionsUpdate(message);
      } else if (message.type === 'ELEMENT_PICKED') {
        this.handleElementPicked(message.data);
      } else if (message.type === 'REQUEST_AI_ENHANCEMENT') {
        this.handleAIEnhancementRequest(message.data, sendResponse);
        return true;
      }
    });
  }

  // ===== Tab Navigation =====
  switchTab(tabId) {
    // Update tab buttons
    this.tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update tab contents
    this.tabContents.forEach(content => {
      const contentId = content.id.replace('tab-', '');
      content.classList.toggle('active', contentId === tabId);
    });

    this.currentTab = tabId;

    // Refresh content based on tab
    if (tabId === 'history') {
      this.renderHistory();
    } else if (tabId === 'assertions') {
      this.renderAssertionsList();
    }
  }

  // ===== Framework Selection =====
  selectFramework(framework) {
    this.selectedFramework = framework;
    this.frameworkSelect.value = framework;

    // Update button states
    this.frameworkBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.framework === framework);
    });

    this.saveFrameworkPreference();
  }

  // ===== Assertion Builder =====
  async startElementPicker() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        this.showToast('No active tab found', 'error');
        return;
      }

      // Send message to content script to start picker
      await chrome.tabs.sendMessage(tab.id, { type: 'START_ELEMENT_PICKER' });

      this.isPickerActive = true;
      this.updatePickerUI();
      this.showToast('Click any element on the page to select it', 'info');

    } catch (error) {
      Logger.error('Failed to start element picker:', error);
      this.showToast('Failed to start element picker', 'error');
    }
  }

  switchToManualMode() {
    this.pickElementBtn.classList.remove('active');
    this.manualAssertionBtn.classList.add('active');
    this.cancelElementPicker();
  }

  async cancelElementPicker() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, { type: 'STOP_ELEMENT_PICKER' }).catch(() => {});
      }
    } catch (e) {
      // Ignore errors when stopping picker
    }

    this.isPickerActive = false;
    this.updatePickerUI();
  }

  updatePickerUI() {
    if (this.pickerStatus) {
      this.pickerStatus.style.display = this.isPickerActive ? 'flex' : 'none';
    }
    if (this.pickElementBtn) {
      this.pickElementBtn.classList.toggle('active', this.isPickerActive);
    }
  }

  handleElementPicked(elementData) {
    this.isPickerActive = false;
    this.updatePickerUI();

    // Populate form with picked element data
    if (elementData) {
      // Set selector based on priority
      if (elementData.testId) {
        this.selectorType.value = 'testid';
        this.elementSelector.value = elementData.testId;
      } else if (elementData.id) {
        this.selectorType.value = 'css';
        this.elementSelector.value = `#${elementData.id}`;
      } else if (elementData.cssSelector) {
        this.selectorType.value = 'css';
        this.elementSelector.value = elementData.cssSelector;
      } else if (elementData.xpath) {
        this.selectorType.value = 'xpath';
        this.elementSelector.value = elementData.xpath;
      }

      // Pre-fill value if element has text content
      if (elementData.textContent && this.selectedAssertionType === 'text') {
        this.assertionValue.value = elementData.textContent.trim().substring(0, 100);
      }

      // Pre-fill value for input elements
      if (elementData.value && this.selectedAssertionType === 'value') {
        this.assertionValue.value = elementData.value;
      }

      this.showToast('Element selected! Configure your assertion.', 'success');
    }
  }

  selectAssertionType(type) {
    this.selectedAssertionType = type;

    // Update button states
    this.assertionTypeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    // Show/hide relevant input fields
    this.updateAssertionFormFields(type);
  }

  updateAssertionFormFields(type) {
    // Hide all optional fields first
    this.assertionValueGroup.style.display = 'none';
    this.attributeNameGroup.style.display = 'none';
    this.comparisonGroup.style.display = 'none';

    // Show relevant fields based on type
    switch (type) {
      case 'text':
        this.assertionValueGroup.style.display = 'block';
        this.assertionValueLabel.textContent = 'Expected Text';
        this.assertionValue.placeholder = 'Enter expected text';
        this.comparisonGroup.style.display = 'block';
        break;
      case 'value':
        this.assertionValueGroup.style.display = 'block';
        this.assertionValueLabel.textContent = 'Expected Value';
        this.assertionValue.placeholder = 'Enter expected input value';
        this.comparisonGroup.style.display = 'block';
        break;
      case 'attribute':
        this.attributeNameGroup.style.display = 'block';
        this.assertionValueGroup.style.display = 'block';
        this.assertionValueLabel.textContent = 'Expected Attribute Value';
        this.assertionValue.placeholder = 'Enter expected attribute value';
        this.comparisonGroup.style.display = 'block';
        break;
      case 'count':
        this.assertionValueGroup.style.display = 'block';
        this.assertionValueLabel.textContent = 'Expected Count';
        this.assertionValue.placeholder = 'Enter expected number of elements';
        break;
      // visible, hidden, enabled, disabled don't need extra fields
    }
  }

  addAssertion() {
    const selector = this.elementSelector.value.trim();
    if (!selector) {
      this.showToast('Please enter an element selector', 'error');
      return;
    }

    const assertion = {
      id: Date.now(),
      selectorType: this.selectorType.value,
      selector: selector,
      type: this.selectedAssertionType,
      value: this.assertionValue?.value?.trim() || null,
      attributeName: this.attributeName?.value?.trim() || null,
      comparison: this.comparisonType?.value || 'equals',
      timestamp: new Date().toISOString()
    };

    this.assertions.push(assertion);
    this.saveAssertions();
    this.renderAssertionsList();
    this.updateAssertionCount();
    this.clearAssertionForm();
    this.showToast('Assertion added!', 'success');
  }

  clearAssertionForm() {
    this.elementSelector.value = '';
    this.assertionValue.value = '';
    if (this.attributeName) this.attributeName.value = '';
    if (this.comparisonType) this.comparisonType.value = 'equals';
  }

  deleteAssertion(id) {
    this.assertions = this.assertions.filter(a => a.id !== id);
    this.saveAssertions();
    this.renderAssertionsList();
    this.updateAssertionCount();
    this.showToast('Assertion deleted', 'success');
  }

  renderAssertionsList() {
    if (!this.assertionsList) return;

    if (this.assertions.length === 0) {
      this.assertionsList.style.display = 'none';
      if (this.assertionsEmpty) this.assertionsEmpty.style.display = 'block';
      if (this.assertionListCount) this.assertionListCount.textContent = '0';
      return;
    }

    this.assertionsList.style.display = 'block';
    if (this.assertionsEmpty) this.assertionsEmpty.style.display = 'none';
    if (this.assertionListCount) this.assertionListCount.textContent = this.assertions.length;

    this.assertionsList.innerHTML = this.assertions.map(assertion => `
      <li data-id="${assertion.id}">
        <div class="assertion-info">
          <span class="assertion-type-badge">${assertion.type}</span>
          <span class="assertion-selector">${assertion.selector}</span>
          ${assertion.value ? `<span class="assertion-value">= "${assertion.value.substring(0, 20)}${assertion.value.length > 20 ? '...' : ''}"</span>` : ''}
        </div>
        <div class="assertion-actions">
          <button class="btn-icon-only delete-assertion" data-id="${assertion.id}" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </li>
    `).join('');

    // Add delete event listeners
    this.assertionsList.querySelectorAll('.delete-assertion').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        this.deleteAssertion(id);
      });
    });
  }

  async saveAssertions() {
    try {
      await chrome.storage.local.set({ assertions: this.assertions });
    } catch (error) {
      Logger.error('Failed to save assertions:', error);
    }
  }

  async loadAssertions() {
    try {
      const result = await chrome.storage.local.get('assertions');
      this.assertions = result.assertions || [];
      this.renderAssertionsList();
      this.updateAssertionCount();
    } catch (error) {
      Logger.error('Failed to load assertions:', error);
      this.assertions = [];
    }
  }

  updateAssertionCount() {
    if (this.assertionCountEl) {
      this.assertionCountEl.textContent = this.assertions.length;
    }
  }

  // ===== Quick Assertion During Recording =====
  startQuickAssertion() {
    this.switchTab('assertions');
    this.startElementPicker();
  }

  updateQuickAssertionVisibility() {
    if (this.quickAssertion) {
      this.quickAssertion.style.display = this.isRecording ? 'flex' : 'none';
    }
  }

  // ===== History Management =====
  async loadHistory() {
    try {
      const result = await chrome.storage.local.get('recordingHistory');
      this.history = result.recordingHistory || [];
      this.renderHistory();
    } catch (error) {
      Logger.error('Failed to load history:', error);
      this.history = [];
    }
  }

  renderHistory() {
    if (!this.historyList) return;

    if (this.history.length === 0) {
      this.historyList.style.display = 'none';
      if (this.historyEmpty) this.historyEmpty.style.display = 'block';
      return;
    }

    this.historyList.style.display = 'block';
    if (this.historyEmpty) this.historyEmpty.style.display = 'none';

    this.historyList.innerHTML = this.history.slice(0, 20).map(session => {
      const date = new Date(session.timestamp || session.startTime);
      const formattedDate = date.toLocaleDateString();
      const formattedTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const actionCount = session.actions?.length || session.actionCount || 0;

      return `
        <li data-session-id="${session.id}">
          <div class="history-info">
            <div class="history-url">${this.formatUrlForDisplay(session.url)}</div>
            <div class="history-meta">
              <span>${formattedDate} ${formattedTime}</span>
              <span>${actionCount} actions</span>
            </div>
          </div>
          <div class="history-actions">
            <button class="btn-icon-only load-session" data-id="${session.id}" title="Load">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </button>
            <button class="btn-icon-only delete-session" data-id="${session.id}" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </li>
      `;
    }).join('');

    // Add event listeners
    this.historyList.querySelectorAll('.load-session').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.loadSession(btn.dataset.id);
      });
    });

    this.historyList.querySelectorAll('.delete-session').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSession(btn.dataset.id);
      });
    });

    // Click on row to load session
    this.historyList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        this.loadSession(li.dataset.sessionId);
      });
    });
  }

  formatUrlForDisplay(url) {
    if (!url) return 'Unknown URL';
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname === '/' ? '' : urlObj.pathname;
      return `${urlObj.hostname}${path}`.substring(0, 50);
    } catch {
      return url.substring(0, 50);
    }
  }

  async loadSession(sessionId) {
    const session = this.history.find(s => s.id === sessionId);
    if (!session) {
      this.showToast('Session not found', 'error');
      return;
    }

    this.currentSession = session;
    this.actions = session.actions || [];
    this.switchTab('record');
    this.updateUI();
    this.showToast(`Loaded session with ${this.actions.length} actions`, 'success');
  }

  async deleteSession(sessionId) {
    if (!confirm('Delete this recording session?')) return;

    this.history = this.history.filter(s => s.id !== sessionId);
    await chrome.storage.local.set({ recordingHistory: this.history });
    this.renderHistory();
    this.showToast('Session deleted', 'success');
  }

  async clearHistory() {
    if (!confirm('Clear all recording history? This cannot be undone.')) return;

    this.history = [];
    await chrome.storage.local.set({ recordingHistory: [] });
    this.renderHistory();
    this.showToast('History cleared', 'success');
  }

  // ===== API Key Visibility Toggle =====
  toggleApiKeyVisibility() {
    const isPassword = this.apiKey.type === 'password';
    this.apiKey.type = isPassword ? 'text' : 'password';

    // Update icon
    const icon = this.toggleApiKeyBtn.querySelector('svg');
    if (icon) {
      if (isPassword) {
        // Show "hidden" icon
        icon.innerHTML = `
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
          <line x1="1" y1="1" x2="23" y2="23"></line>
        `;
      } else {
        // Show "visible" icon
        icon.innerHTML = `
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        `;
      }
    }
  }

  // ===== Settings Management =====
  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response && response.success && response.settings) {
        this.settings = response.settings;
        this.applySettings();
      } else {
        this.settings = this.getDefaultSettings();
      }
    } catch (error) {
      Logger.error('Failed to load settings:', error);
      this.settings = this.getDefaultSettings();
    }
  }

  getDefaultSettings() {
    return {
      selectedFramework: 'playwright',
      enableAI: false,
      aiProvider: 'openai',
      aiModel: 'gpt-4o',
      apiKey: '',
      enableSelfHealing: true,
      enableNetworkRecording: true,
      enablePOMGeneration: true,
      cicdPlatform: 'github-actions'
    };
  }

  applySettings() {
    // Apply framework setting
    this.selectedFramework = this.settings.selectedFramework || 'playwright';
    this.frameworkSelect.value = this.selectedFramework;
    this.frameworkBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.framework === this.selectedFramework);
    });

    // Apply enhanced settings
    if (this.enableSelfHealing) this.enableSelfHealing.checked = this.settings.enableSelfHealing !== false;
    if (this.enableNetworkRecording) this.enableNetworkRecording.checked = this.settings.enableNetworkRecording !== false;
    if (this.enablePOMGeneration) this.enablePOMGeneration.checked = this.settings.enablePOMGeneration !== false;

    // Apply AI settings
    if (this.enableAIToggle) this.enableAIToggle.checked = this.settings.enableAI || false;
    if (this.aiProvider) this.aiProvider.value = this.settings.aiProvider || 'openai';
    if (this.apiKey) this.apiKey.value = this.settings.apiKey || '';
    if (this.cicdPlatform) this.cicdPlatform.value = this.settings.cicdPlatform || 'github-actions';

    // Update model options and set selected model
    this.updateModelOptions();
    if (this.aiModel && this.settings.aiModel) {
      this.aiModel.value = this.settings.aiModel;
    }

    // Toggle AI config visibility
    this.toggleAIConfig();
  }

  async loadCurrentState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_SESSION' });

      if (response && response.success && response.session) {
        this.currentSession = response.session;
        this.isRecording = response.session.status === 'recording';
        this.isPaused = response.session.status === 'paused';
        this.actions = response.session.actions || [];

        if (this.isRecording) {
          this.recordingStartTime = response.session.startTime;
          this.startDurationTimer();
        }
      }
    } catch (error) {
      Logger.error('Failed to load current state:', error);
    }
  }

  updateUI() {
    this.updateStatus();
    this.updateStats();
    this.updateButtons();
    this.updateSessionCard();
    this.updateActionsList();
    this.updateQuickAssertionVisibility();
    this.updateAssertionCount();
  }

  updateStatus() {
    this.statusDot.className = 'status-dot';

    if (this.isRecording && !this.isPaused) {
      this.statusDot.classList.add('recording');
      this.statusText.textContent = 'Recording...';
    } else if (this.isPaused) {
      this.statusDot.classList.add('paused');
      this.statusText.textContent = 'Paused';
    } else if (this.actions.length > 0) {
      this.statusText.textContent = 'Recording complete';
    } else {
      this.statusText.textContent = 'Ready to record';
    }
  }

  updateStats() {
    this.actionCount.textContent = this.actions.length.toString();
  }

  updateButtons() {
    this.startRecordingBtn.disabled = this.isRecording;
    this.pauseRecordingBtn.disabled = !this.isRecording;
    this.stopRecordingBtn.disabled = !this.isRecording && !this.isPaused;
    this.generateScriptBtn.disabled = this.actions.length === 0;

    // Update pause button text
    if (this.pauseRecordingBtn) {
      const svg = this.pauseRecordingBtn.querySelector('svg');
      const text = this.isPaused ? 'Resume' : 'Pause';
      this.pauseRecordingBtn.innerHTML = '';
      if (svg) this.pauseRecordingBtn.appendChild(svg);
      this.pauseRecordingBtn.appendChild(document.createTextNode(text));
    }
  }

  updateSessionCard() {
    if (this.currentSession && this.currentSession.url) {
      try {
        const url = new URL(this.currentSession.url);
        this.sessionTitle.textContent = this.generateSessionTitle(url);
        this.sessionUrl.textContent = this.currentSession.url;
        this.sessionCard.style.display = 'block';
      } catch (error) {
        this.sessionCard.style.display = 'none';
      }
    } else {
      this.sessionCard.style.display = 'none';
    }
  }

  generateSessionTitle(url) {
    const hostname = url.hostname.replace('www.', '');
    const path = url.pathname;

    if (path && path !== '/') {
      const pathParts = path.split('/').filter(part => part);
      if (pathParts.length > 0) {
        return pathParts[pathParts.length - 1].replace(/[-_]/g, ' ');
      }
    }

    return hostname.split('.')[0];
  }

  startDurationTimer() {
    if (this.durationTimer) clearInterval(this.durationTimer);

    this.durationTimer = setInterval(() => {
      if (this.recordingStartTime && this.isRecording && !this.isPaused) {
        const elapsed = Date.now() - this.recordingStartTime;
        this.duration.textContent = this.formatDuration(elapsed);
      }
    }, 1000);
  }

  stopDurationTimer() {
    if (this.durationTimer) {
      clearInterval(this.durationTimer);
      this.durationTimer = null;
    }
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // ===== Recording Controls =====
  async startRecording() {
    try {
      this.showLoading('Starting recording...');

      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!currentTab) {
        throw new Error('No active tab found');
      }

      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING_SESSION',
        data: {
          framework: this.selectedFramework,
          tabId: currentTab.id,
          url: currentTab.url,
          title: currentTab.title
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to start recording');
      }

      this.isRecording = true;
      this.isPaused = false;
      this.currentSession = { id: response.sessionId, status: 'recording', url: currentTab.url };
      this.actions = [];
      this.recordingStartTime = Date.now();

      this.updateUI();
      this.startDurationTimer();
      this.hideLoading();
      this.showToast('Recording started! Interact with the page.', 'success');

    } catch (error) {
      this.hideLoading();
      this.showToast(`Error: ${error.message}`, 'error');
      Logger.error('Failed to start recording:', error);
    }
  }

  async pauseRecording() {
    try {
      const messageType = this.isPaused ? 'RESUME_RECORDING' : 'PAUSE_RECORDING';

      const response = await chrome.runtime.sendMessage({ type: messageType });

      if (!response.success) {
        throw new Error(response.error || `Failed to ${this.isPaused ? 'resume' : 'pause'} recording`);
      }

      this.isPaused = !this.isPaused;
      this.updateUI();

      const action = this.isPaused ? 'paused' : 'resumed';
      this.showToast(`Recording ${action}`, 'info');

    } catch (error) {
      this.showToast(`Error: ${error.message}`, 'error');
      Logger.error('Failed to pause recording:', error);
    }
  }

  async stopRecording() {
    try {
      this.showLoading('Stopping recording...');

      const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING_SESSION' });

      if (!response.success) {
        throw new Error(response.error || 'Failed to stop recording');
      }

      this.isRecording = false;
      this.isPaused = false;
      this.currentSession = response.session;
      this.actions = response.session.actions || [];

      // Add to history
      await this.addToHistory(response.session);

      this.updateUI();
      this.stopDurationTimer();
      this.hideLoading();
      this.showToast(`Recording complete! ${this.actions.length} actions captured.`, 'success');

    } catch (error) {
      this.hideLoading();
      this.showToast(`Error: ${error.message}`, 'error');
      Logger.error('Failed to stop recording:', error);
    }
  }

  async addToHistory(session) {
    const historyEntry = {
      id: session.id || Date.now().toString(),
      url: session.url,
      title: session.title,
      timestamp: session.startTime || Date.now(),
      actionCount: session.actions?.length || 0,
      actions: session.actions
    };

    this.history.unshift(historyEntry);
    this.history = this.history.slice(0, 50); // Keep last 50

    await chrome.storage.local.set({ recordingHistory: this.history });
  }

  // ===== Script Generation =====
  async generateScript() {
    if (this.actions.length === 0) {
      this.showToast('No actions to generate script from', 'error');
      return;
    }

    if (this.settings.enableAI && this.settings.apiKey) {
      const confirmed = await this.confirmAIUsage();
      if (!confirmed) return;
    }

    try {
      this.showLoading('Generating script...');

      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_SCRIPT',
        data: {
          framework: this.selectedFramework,
          actions: this.actions,
          assertions: this.assertions,
          options: {
            includeAssertions: this.assertions.length > 0,
            includeNetworkAssertions: this.settings.enableNetworkRecording,
            applySelfHealing: this.settings.enableSelfHealing,
            generatePageObjects: this.settings.enablePOMGeneration,
            addComments: true,
            testName: this.currentSession?.title || 'FlowScribe Test'
          }
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate script');
      }

      this.displayScript(response.script);
      this.hideLoading();

      const enhancementText = this.settings.enableAI ? 'AI-enhanced ' : '';
      this.showToast(`${enhancementText}Script generated!`, 'success');

    } catch (error) {
      this.hideLoading();
      this.showToast(`Error: ${error.message}`, 'error');
      Logger.error('Failed to generate script:', error);
    }
  }

  displayScript(script) {
    this.generatedScriptContent = script;
    const language = this.getLanguageForFramework(this.selectedFramework);

    this.scriptContent.textContent = script;
    this.scriptContent.className = `language-${language}`;
    this.scriptContent.parentElement.className = `script-content line-numbers language-${language}`;

    if (window.Prism) {
      Prism.highlightElement(this.scriptContent);
    }

    this.scriptModal.style.display = 'flex';
  }

  getLanguageForFramework(framework) {
    const languageMap = {
      playwright: 'javascript',
      selenium: 'python',
      cypress: 'javascript',
      puppeteer: 'javascript'
    };
    return languageMap[framework] || 'javascript';
  }

  async copyScript() {
    try {
      await navigator.clipboard.writeText(this.scriptContent.textContent);
      this.showToast('Script copied to clipboard!', 'success');
    } catch (error) {
      const textArea = document.createElement('textarea');
      textArea.value = this.scriptContent.textContent;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.showToast('Script copied to clipboard!', 'success');
    }
  }

  async exportScript(exportType) {
    try {
      this.showLoading('Preparing export...');

      if (exportType === 'script' && this.generatedScriptContent) {
        const filename = `flowscribe-${this.selectedFramework}-script.${this.getFileExtension(this.selectedFramework)}`;
        this.downloadFile(this.generatedScriptContent, filename, 'text/plain');
        this.hideLoading();
        this.showToast('Script exported!', 'success');
        this.toggleExportOptions();
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_SCRIPT',
        data: {
          framework: this.selectedFramework,
          actions: this.actions,
          assertions: this.assertions,
          options: {
            includePOM: exportType === 'pom' || exportType === 'full',
            includeCICD: exportType === 'cicd' || exportType === 'full',
            cicdPlatform: this.settings.cicdPlatform
          }
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to export');
      }

      const filename = `flowscribe-${this.selectedFramework}-script.${this.getFileExtension(this.selectedFramework)}`;
      this.downloadFile(response.script, filename, 'text/plain');

      this.hideLoading();
      this.showToast(`${exportType} package exported!`, 'success');
      this.toggleExportOptions();

    } catch (error) {
      this.hideLoading();
      this.showToast(`Export failed: ${error.message}`, 'error');
      Logger.error('Export failed:', error);
    }
  }

  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  getFileExtension(framework) {
    const extensions = {
      playwright: 'js',
      selenium: 'py',
      cypress: 'js',
      puppeteer: 'js'
    };
    return extensions[framework] || 'txt';
  }

  toggleExportOptions() {
    const isVisible = this.exportOptions.style.display !== 'none';
    this.exportOptions.style.display = isVisible ? 'none' : 'flex';
  }

  async confirmAIUsage() {
    const providerName = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google AI'
    }[this.settings.aiProvider] || this.settings.aiProvider;

    const message = `This will send your recorded actions to ${providerName} for AI-enhanced script generation. API charges may apply. Continue?`;
    return confirm(message);
  }

  // ===== Settings Modal =====
  openSettings() {
    this.settingsModal.style.display = 'flex';
  }

  closeSettings() {
    this.settingsModal.style.display = 'none';
  }

  closeScriptModal() {
    this.scriptModal.style.display = 'none';
    this.exportOptions.style.display = 'none';
  }

  toggleAIConfig() {
    const isEnabled = this.enableAIToggle.checked;
    this.aiConfig.style.display = isEnabled ? 'block' : 'none';

    const aiWarning = document.getElementById('aiWarning');
    if (aiWarning) {
      aiWarning.style.display = isEnabled ? 'flex' : 'none';
    }

    if (isEnabled && this.aiModel.options.length <= 1) {
      this.updateModelOptions();
    }
  }

  updateModelOptions() {
    const provider = this.aiProvider.value;
    const models = this.modelOptions[provider] || [];

    while (this.aiModel.firstChild) {
      this.aiModel.removeChild(this.aiModel.firstChild);
    }

    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      this.aiModel.appendChild(option);
    });

    if (models.length > 0 && !this.settings.aiModel) {
      this.aiModel.value = models[0].value;
    } else if (this.settings.aiModel) {
      this.aiModel.value = this.settings.aiModel;
    }
  }

  saveModelPreference() {
    this.settings.aiModel = this.aiModel.value;
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { aiModel: this.aiModel.value }
    });
  }

  async saveSettings() {
    try {
      const settings = {
        selectedFramework: this.selectedFramework,
        enableAI: this.enableAIToggle.checked,
        aiProvider: this.aiProvider.value,
        aiModel: this.aiModel.value,
        apiKey: this.apiKey.value,
        enableSelfHealing: this.enableSelfHealing.checked,
        enableNetworkRecording: this.enableNetworkRecording.checked,
        enablePOMGeneration: this.enablePOMGeneration.checked,
        cicdPlatform: this.cicdPlatform.value
      };

      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings
      });

      if (response.success) {
        this.settings = { ...this.settings, ...settings };
        this.showToast('Settings saved!', 'success');
        this.closeSettings();
      } else {
        throw new Error(response.error || 'Failed to save settings');
      }
    } catch (error) {
      this.showToast(`Failed to save settings: ${error.message}`, 'error');
    }
  }

  async resetSettings() {
    if (!confirm('Reset all settings to defaults?')) return;

    try {
      const defaultSettings = this.getDefaultSettings();
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: defaultSettings
      });

      if (response.success) {
        this.settings = defaultSettings;
        this.applySettings();
        this.showToast('Settings reset to defaults', 'success');
      }
    } catch (error) {
      this.showToast(`Failed to reset settings: ${error.message}`, 'error');
    }
  }

  async saveFrameworkPreference() {
    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: { selectedFramework: this.selectedFramework }
      });
    } catch (error) {
      Logger.error('Failed to save framework preference:', error);
    }
  }

  // ===== Event Handlers =====
  handleRecordingStatusChange(message) {
    this.isRecording = message.isRecording;
    this.isPaused = message.isPaused || false;
    this.updateUI();
  }

  handleActionsUpdate(message) {
    this.actions = message.actions || [];
    this.updateUI();
  }

  async handleAIEnhancementRequest(data, sendResponse) {
    try {
      Logger.log('Processing AI enhancement request...');

      const AIServiceModule = await import('../utils/ai-service.js');
      const AIService = AIServiceModule.default || AIServiceModule.AIService;

      const aiService = new AIService(true);

      await aiService.updateSettings({
        provider: data.settings.aiProvider,
        model: data.settings.aiModel,
        apiKey: data.settings.apiKey,
        enableAI: data.settings.enableAI
      });

      if (!aiService.isConfigured()) {
        throw new Error('AI service not properly configured');
      }

      const enhancedScript = await aiService.enhanceScript(
        data.actions,
        data.framework,
        data.options
      );

      sendResponse({ success: true, enhancedScript });

    } catch (error) {
      Logger.error('AI enhancement failed:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // ===== Actions List Management =====
  updateActionsList() {
    if (this.actions.length > 0) {
      this.actionsPanel.style.display = 'block';
      this.actionsEmpty.style.display = 'none';
      this.actionsList.style.display = 'block';
    } else {
      this.actionsPanel.style.display = 'none';
      return;
    }

    this.actionListCount.textContent = this.actions.length;
    this.renderActionItems();
  }

  renderActionItems() {
    this.actionsList.innerHTML = '';

    this.actions.forEach((action, index) => {
      const li = document.createElement('li');
      li.className = 'action-item';
      li.setAttribute('data-index', index);

      const description = this.getActionDescription(action);

      li.innerHTML = `
        <span class="action-number">${index + 1}</span>
        <span class="action-type-badge">${action.type}</span>
        <span class="action-description">${description}</span>
        <button class="btn-icon-only delete-action" data-index="${index}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      li.querySelector('.delete-action').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteAction(index);
      });

      this.actionsList.appendChild(li);
    });
  }

  getActionDescription(action) {
    const element = action.element || action.target;
    const elementDesc = this.getElementDescription(element);

    switch (action.type) {
      case 'click': return `Click on ${elementDesc}`;
      case 'input': return `Type into ${elementDesc}`;
      case 'change': return `Change ${elementDesc}`;
      case 'navigate': return `Navigate to ${this.formatUrlForDisplay(action.url)}`;
      case 'scroll': return `Scroll on page`;
      case 'hover': return `Hover over ${elementDesc}`;
      case 'submit': return `Submit form`;
      default: return `${action.type} action`;
    }
  }

  getElementDescription(element) {
    if (!element) return 'element';
    if (element.textContent?.trim()) return `"${element.textContent.trim().substring(0, 20)}..."`;
    if (element.placeholder) return `[${element.placeholder}]`;
    if (element.id) return `#${element.id}`;
    if (element.tagName) return element.tagName.toLowerCase();
    return 'element';
  }

  toggleActionsList() {
    this.actionsBody.classList.toggle('collapsed');
    const isCollapsed = this.actionsBody.classList.contains('collapsed');
    this.toggleActionsBtn.innerHTML = isCollapsed ?
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>' :
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  }

  clearActionsList() {
    if (!confirm('Clear all recorded actions?')) return;

    this.actions = [];
    chrome.runtime.sendMessage({ type: 'CLEAR_ACTIONS' });
    this.updateUI();
    this.showToast('All actions cleared', 'success');
  }

  deleteAction(index) {
    this.actions.splice(index, 1);
    chrome.runtime.sendMessage({
      type: 'UPDATE_ACTIONS',
      actions: this.actions
    });
    this.updateUI();
    this.showToast('Action deleted', 'success');
  }

  // ===== UI Helpers =====
  showLoading(message = 'Loading...') {
    this.loadingMessage.textContent = message;
    this.loadingOverlay.style.display = 'flex';
  }

  hideLoading() {
    this.loadingOverlay.style.display = 'none';
  }

  showToast(message, type = 'info') {
    this.toastMessage.textContent = message;
    this.toast.className = `toast ${type}`;
    this.toast.style.display = 'flex';

    setTimeout(() => {
      this.toast.style.display = 'none';
    }, 3000);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.flowScribeUI = new FlowScribeUI();
});
