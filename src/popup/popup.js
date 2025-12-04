/**
 * FlowScribe Unified UI Controller
 * Consolidated implementation with all features from popup, popup-enhanced, and popup-modern
 */
class FlowScribeUI {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.currentSession = null;
    this.actions = [];
    this.selectedFramework = 'playwright';
    this.generatedScriptContent = null; // Store generated script for export
    this.settings = {};
    this.recordingStartTime = null;
    
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
    this.currentTab = 'recording';
    this.history = [];
    
    this.init();
  }

  async init() {
    this.bindElements();
    this.setupEventListeners();
    await this.loadSettings();
    await this.loadCurrentState();
    this.updateUI();
  }

  bindElements() {
    // Status elements
    this.statusDot = document.getElementById('statusDot');
    this.statusText = document.getElementById('statusText');
    this.actionCount = document.getElementById('actionCount');
    this.duration = document.getElementById('duration');

    // Session info
    this.sessionCard = document.getElementById('sessionCard');
    this.sessionTitle = document.getElementById('sessionTitle');
    this.sessionUrl = document.getElementById('sessionUrl');

    // Framework selection
    this.frameworkSelect = document.getElementById('frameworkSelect');

    // Control buttons
    this.startRecordingBtn = document.getElementById('startRecordingBtn');
    this.pauseRecordingBtn = document.getElementById('pauseRecordingBtn');
    this.stopRecordingBtn = document.getElementById('stopRecordingBtn');
    this.generateScriptBtn = document.getElementById('generateScriptBtn');

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
    // Control buttons
    this.startRecordingBtn.addEventListener('click', () => this.startRecording());
    this.pauseRecordingBtn.addEventListener('click', () => this.pauseRecording());
    this.stopRecordingBtn.addEventListener('click', () => this.stopRecording());
    this.generateScriptBtn.addEventListener('click', () => this.generateScript());

    // Framework selection
    this.frameworkSelect.addEventListener('change', (e) => {
      this.selectedFramework = e.target.value;
      this.saveFrameworkPreference();
    });

    // Settings modal
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    this.closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());

    // AI toggle
    this.enableAIToggle.addEventListener('change', () => this.toggleAIConfig());
    
    // AI provider change - update model options
    this.aiProvider.addEventListener('change', () => this.updateModelOptions());
    
    // AI model change - save preference
    this.aiModel.addEventListener('change', () => this.saveModelPreference());

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
      } else if (message.type === 'REQUEST_AI_ENHANCEMENT') {
        // Handle AI enhancement request from background script
        this.handleAIEnhancementRequest(message.data, sendResponse);
        return true; // Keep channel open for async response
      }
    });
  }

  async loadSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (response && response.success && response.settings) {
        this.settings = response.settings;
        this.applySettings();
      } else {
        console.error('Failed to load settings:', response?.error || 'Unknown error');
        this.settings = this.getDefaultSettings();
      }

      // Apply settings to UI elements
      if (this.enableAIToggle) {
        this.enableAIToggle.checked = this.settings.enableAI || false;
      }
      if (this.aiProvider) {
        this.aiProvider.value = this.settings.aiProvider || 'openai';
        this.updateModelOptions();
      }
      if (this.aiModel) {
        this.aiModel.value = this.settings.aiModel || 'gpt-4o';
      }
      if (this.apiKey) {
        this.apiKey.value = this.settings.apiKey || '';
      }
      if (this.enableSelfHealing) {
        this.enableSelfHealing.checked = this.settings.enableSelfHealing !== false;
      }
      if (this.enableNetworkRecording) {
        this.enableNetworkRecording.checked = this.settings.enableNetworkRecording !== false;
      }
      if (this.enablePOMGeneration) {
        this.enablePOMGeneration.checked = this.settings.enablePOMGeneration !== false;
      }
      if (this.cicdPlatform) {
        this.cicdPlatform.value = this.settings.cicdPlatform || 'github-actions';
      }

      this.selectedFramework = this.settings.selectedFramework || 'playwright';

      console.log('✅ Popup settings loaded');
    } catch (error) {
      console.error('Failed to load settings:', error);
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

    // Apply enhanced settings
    if (this.enableSelfHealing) this.enableSelfHealing.checked = this.settings.enableSelfHealing !== false;
    if (this.enableNetworkRecording) this.enableNetworkRecording.checked = this.settings.enableNetworkRecording !== false;
    if (this.enablePOMGeneration) this.enablePOMGeneration.checked = this.settings.enablePOMGeneration !== false;

    // Apply AI settings
    if (this.enableAIToggle) this.enableAIToggle.checked = this.settings.enableAI || false;
    if (this.aiProvider) this.aiProvider.value = this.settings.aiProvider || 'openai';
    if (this.apiKey) this.apiKey.value = this.settings.apiKey || ''; // FIX: Set API key field
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
        this.actions = response.session.actions || [];
        
        if (this.isRecording) {
          this.recordingStartTime = response.session.startTime;
          this.startDurationTimer();
        }
      } else if (response && !response.success) {
        console.error('Failed to get current session:', response.error);
      }
    } catch (error) {
      console.error('Failed to load current state:', error);
    }
  }

  updateUI() {
    this.updateStatus();
    this.updateStats();
    this.updateButtons();
    this.updateSessionCard();
    this.updateActionsList();
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
    
    // Generate a meaningful title from hostname and path
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
      this.showToast('🎬 Recording started! Interact with the page to capture actions.', 'success');

    } catch (error) {
      this.hideLoading();
      this.showToast(`Error: ${error.message}`, 'error');
      console.error('Failed to start recording:', error);
    }
  }

  async pauseRecording() {
    try {
      const messageType = this.isPaused ? 'RESUME_RECORDING' : 'PAUSE_RECORDING';
      
      const response = await chrome.runtime.sendMessage({
        type: messageType
      });

      if (!response.success) {
        throw new Error(response.error || `Failed to ${this.isPaused ? 'resume' : 'pause'} recording`);
      }

      this.isPaused = !this.isPaused;
      
      // Update UI
      this.updateUI();
      
      const action = this.isPaused ? 'paused' : 'resumed';
      this.showToast(`📀 Recording ${action}`, 'info');

    } catch (error) {
      this.showToast(`Error: ${error.message}`, 'error');
      console.error('Failed to pause recording:', error);
    }
  }

  async stopRecording() {
    try {
      this.showLoading('Stopping recording...');

      const response = await chrome.runtime.sendMessage({
        type: 'STOP_RECORDING_SESSION'
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to stop recording');
      }

      this.isRecording = false;
      this.isPaused = false;
      this.currentSession = response.session;
      this.actions = response.session.actions || [];

      this.updateUI();
      this.stopDurationTimer();
      this.hideLoading();
      this.showToast(`✅ Recording complete! ${this.actions.length} actions captured.`, 'success');

    } catch (error) {
      this.hideLoading();
      this.showToast(`Error: ${error.message}`, 'error');
      console.error('Failed to stop recording:', error);
    }
  }

  async generateScript() {
    if (this.actions.length === 0) {
      this.showToast('No actions to generate script from', 'error');
      return;
    }

    try {
      this.showLoading('Generating enhanced script...');

      // Use enhanced script generation with comprehensive AI features
      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_SCRIPT',
        data: {
          framework: this.selectedFramework,
          actions: this.actions,
          options: {
            // Core assertion settings
            includeAssertions: true,
            includeNetworkAssertions: this.settings.enableNetworkRecording,
            applySelfHealing: this.settings.enableSelfHealing,
            addComments: true,
            
            // Enhanced AI features
            includeScreenshots: this.settings.includeScreenshots !== false,
            includeA11yChecks: true, // Enable accessibility checks
            includePerformanceChecks: false, // Can be enabled for performance testing
            useIntelligentLocators: true, // Use AI-enhanced locator generation
            generateMultipleFallbacks: true, // Generate fallback locator strategies
            
            // Test configuration
            testName: this.currentSession?.title || `FlowScribe Complete User Journey - ${new Date().toISOString().slice(0, 10)}`,
            environment: 'staging', // Can be configurable
            
            // Comprehensive coverage options
            validatePageTransitions: true, // Assert URL changes and page loads
            validateFormSubmissions: true, // Assert form submission results
            validateLoadingStates: true, // Wait for dynamic content
            includeErrorHandling: true, // Add try-catch blocks and retries
            generatePageObjects: this.settings.enablePOMGeneration, // Generate POM classes
            
            // Journey completeness
            ensureCompleteJourney: true, // Ensure every action is represented
            addWaitStrategies: true, // Intelligent waits for dynamic content
            validateUserFeedback: true, // Check for success/error messages
            
            // Advanced features
            crossBrowserCompatibility: true, // Generate cross-browser compatible code
            mobileResponsive: false, // Can be enabled for mobile testing
            dataValidation: true // Validate data integrity throughout the journey
          }
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to generate script');
      }

      this.displayScript(response.script);
      this.hideLoading();
      
      const enhancementText = this.settings.enableAI ? 'AI-enhanced ' : '';
      this.showToast(`✨ ${enhancementText}script generated successfully!`, 'success');

    } catch (error) {
      this.hideLoading();
      this.showToast(`Error: ${error.message}`, 'error');
      console.error('Failed to generate script:', error);
    }
  }

  displayScript(script) {
    // Store the generated script for export
    this.generatedScriptContent = script;

    // Detect language based on framework
    const language = this.getLanguageForFramework(this.selectedFramework);

    // Set the script content
    this.scriptContent.textContent = script;

    // Update language class for Prism.js
    this.scriptContent.className = `language-${language}`;
    this.scriptContent.parentElement.className = `script-content line-numbers language-${language}`;

    // Apply syntax highlighting
    if (window.Prism) {
      Prism.highlightElement(this.scriptContent);
    }

    // Show modal
    this.scriptModal.style.display = 'flex';
  }

  getLanguageForFramework(framework) {
    // Map framework to programming language for syntax highlighting
    const languageMap = {
      playwright: 'javascript',
      selenium: 'java', // Default Selenium to Java
      cypress: 'javascript',
      puppeteer: 'javascript'
    };

    // Check if user has selected a specific language in settings
    // (For Selenium which supports multiple languages)
    if (framework === 'selenium' && this.settings.seleniumLanguage) {
      const langMap = {
        java: 'java',
        python: 'python',
        javascript: 'javascript',
        csharp: 'csharp'
      };
      return langMap[this.settings.seleniumLanguage] || 'java';
    }

    return languageMap[framework] || 'javascript';
  }

  async copyScript() {
    try {
      const script = this.scriptContent.textContent;
      await navigator.clipboard.writeText(script);
      this.showToast('📋 Script copied to clipboard!', 'success');
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = this.scriptContent.textContent;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      this.showToast('📋 Script copied to clipboard!', 'success');
    }
  }

  async exportScript(exportType) {
    try {
      this.showLoading('Preparing export...');

      // Validate framework is selected
      if (!this.selectedFramework) {
        throw new Error('No framework selected. Please select a framework first.');
      }

      // Use the already generated script if available (for "Script Only")
      if (exportType === 'script' && this.generatedScriptContent) {
        const filename = `flowscribe-${this.selectedFramework}-script.${this.getFileExtension(this.selectedFramework)}`;
        this.downloadFile(this.generatedScriptContent, filename, 'text/plain');
        this.hideLoading();
        this.showToast(`💾 Script exported!`, 'success');
        this.toggleExportOptions();
        return;
      }

      // Check if we have actions to export
      if (!this.actions || this.actions.length === 0) {
        // Try to get script content from the modal if displayed
        if (this.generatedScriptContent) {
          const filename = `flowscribe-${this.selectedFramework}-script.${this.getFileExtension(this.selectedFramework)}`;
          this.downloadFile(this.generatedScriptContent, filename, 'text/plain');
          this.hideLoading();
          this.showToast(`💾 Script exported!`, 'success');
          this.toggleExportOptions();
          return;
        }
        throw new Error('No actions recorded. Please record some actions first.');
      }

      const options = {
        includePOM: exportType === 'pom' || exportType === 'full',
        includeCICD: exportType === 'cicd' || exportType === 'full',
        framework: this.selectedFramework,
        cicdPlatform: this.settings.cicdPlatform,
        pomOptions: {},
        cicdOptions: {
          browsers: ['chromium', 'firefox', 'webkit'],
          nodeVersion: '18',
          parallel: true
        }
      };

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'GENERATE_SCRIPT',
          data: {
            sessionId: this.currentSession?.id,
            framework: this.selectedFramework,
            actions: this.actions, // Include actions directly
            format: 'json',
            options
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Connection failed: ${chrome.runtime.lastError.message}`));
          } else if (!response) {
            reject(new Error('No response from background script'));
          } else {
            resolve(response);
          }
        });
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to export');
      }

      // Handle different response formats
      let content, filename, mimeType;

      if (response.script) {
        // Script generation response
        content = response.script;
        filename = `flowscribe-${this.selectedFramework}-script.${this.getFileExtension(this.selectedFramework)}`;
        mimeType = 'text/plain';
      } else if (response.data || response.exportData) {
        // Session export response
        const exportData = response.data || response.exportData;
        content = JSON.stringify(exportData, null, 2);
        filename = `flowscribe-export-${Date.now()}.json`;
        mimeType = 'application/json';
      } else {
        throw new Error('No export data received from background script');
      }

      this.downloadFile(content, filename, mimeType);
      this.hideLoading();
      this.showToast(`💾 ${exportType} package exported!`, 'success');
      this.toggleExportOptions(); // Hide options

    } catch (error) {
      this.hideLoading();
      this.showToast(`Export failed: ${error.message}`, 'error');
      console.error('Export failed:', error);
    }
  }

  /**
   * Helper function to download a file
   */
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

  toggleExportOptions() {
    const isVisible = this.exportOptions.style.display !== 'none';
    this.exportOptions.style.display = isVisible ? 'none' : 'flex';
  }

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
    
    // Initialize model options when AI is first enabled
    if (isEnabled && this.aiModel.options.length <= 1) {
      this.updateModelOptions();
    }
  }

  updateModelOptions() {
    const provider = this.aiProvider.value;
    const models = this.modelOptions[provider] || [];

    // Clear existing options safely
    while (this.aiModel.firstChild) {
      this.aiModel.removeChild(this.aiModel.firstChild);
    }

    // Add new options
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      this.aiModel.appendChild(option);
    });
    
    // Set default model if none selected
    if (models.length > 0 && !this.settings.aiModel) {
      this.aiModel.value = models[0].value;
    } else if (this.settings.aiModel) {
      this.aiModel.value = this.settings.aiModel;
    }
  }

  saveModelPreference() {
    // Save the model preference immediately when changed
    this.settings.aiModel = this.aiModel.value;
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: { aiModel: this.aiModel.value }
    });
  }

  async resetSettings() {
    if (!confirm('Reset all settings to defaults?')) return;
    
    const defaultSettings = this.getDefaultSettings();

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: defaultSettings
      });

      if (response.success) {
        this.settings = defaultSettings;
        this.applySettings();
        this.showToast('🔄 Settings reset to defaults', 'success');
      }
    } catch (error) {
      this.showToast(`Failed to reset settings: ${error.message}`, 'error');
    }
  }

  async saveFrameworkPreference() {
    try {
      await chrome.storage.local.set({ selectedFramework: this.selectedFramework });
    } catch (error) {
      console.error('Failed to save framework preference:', error);
    }
  }

  handleRecordingStatusChange(message) {
    this.isRecording = message.isRecording;
    this.updateUI();
  }

  handleActionsUpdate(message) {
    this.actions = message.actions || [];
    this.updateUI();
  }

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
    this.toast.style.display = 'block';

    setTimeout(() => {
      this.toast.style.display = 'none';
    }, 3000);
  }

  async saveFrameworkPreference() {
    try {
      const settings = { selectedFramework: this.selectedFramework };
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings
      });
      
      if (response.success) {
        console.log('Framework preference saved:', this.selectedFramework);
      }
    } catch (error) {
      console.error('Failed to save framework preference:', error);
    }
  }

  async saveSettings() {
    try {
      const settings = {
        selectedFramework: this.selectedFramework,
        enableAI: this.enableAIToggle.checked,
        aiProvider: this.aiProvider.value,
        aiModel: this.aiModel.value, // FIX: Added missing aiModel field
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
        this.showToast('⚙️ Settings saved successfully!', 'success');
        this.closeSettings();
      } else {
        throw new Error(response.error || 'Failed to save settings');
      }
    } catch (error) {
      this.showToast(`Failed to save settings: ${error.message}`, 'error');
    }
  }

  async resetSettings() {
    if (!confirm('Reset all settings to defaults?')) {
      return;
    }

    try {
      const defaultSettings = this.getDefaultSettings();
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: defaultSettings
      });

      if (response.success) {
        this.settings = defaultSettings;
        this.applySettings();
        this.showToast('🔄 Settings reset to defaults', 'success');
      } else {
        throw new Error(response.error || 'Failed to reset settings');
      }
    } catch (error) {
      this.showToast(`Failed to reset settings: ${error.message}`, 'error');
    }
  }

  async handleAIEnhancementRequest(data, sendResponse) {
    try {
      console.log('🤖 POPUP: Processing AI enhancement request in popup context...');
      console.log('📊 POPUP: AI Request Data:', {
        framework: data.framework,
        actionCount: data.actions?.length || 0,
        provider: data.settings?.aiProvider,
        model: data.settings?.aiModel,
        hasApiKey: !!data.settings?.apiKey
      });
      
      // Import AI service dynamically (safe in popup context)
      const AIServiceModule = await import('../utils/ai-service.js');
      const AIService = AIServiceModule.default || AIServiceModule.AIService;
      
      // Create AI service instance with skipAutoLoad to prevent storage conflicts
      const aiService = new AIService(true);
      
      // Update settings with the provided configuration
      await aiService.updateSettings({
        provider: data.settings.aiProvider,
        model: data.settings.aiModel,
        apiKey: data.settings.apiKey,
        enableAI: data.settings.enableAI
      });
      
      // Check if AI is configured
      if (!aiService.isConfigured()) {
        throw new Error('AI service not properly configured');
      }
      
      console.log('🚀 POPUP: Starting LLM processing with', data.actions?.length || 0, 'actions...');
      
      // Generate enhanced script
      const enhancedScript = await aiService.enhanceScript(
        data.actions, 
        data.framework, 
        data.options
      );
      
      console.log('✅ POPUP: LLM enhancement completed successfully');
      console.log('📏 POPUP: Enhanced script length:', enhancedScript?.length || 0, 'characters');
      sendResponse({ success: true, enhancedScript });
      
    } catch (error) {
      console.error('❌ AI enhancement failed:', error);
      sendResponse({ success: false, error: error.message });
    }
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

  // ===== Actions List Management =====

  updateActionsList() {
    // Show/hide panel based on actions
    if (this.actions.length > 0) {
      this.actionsPanel.style.display = 'block';
      this.actionsEmpty.style.display = 'none';
      this.actionsList.style.display = 'block';
    } else {
      this.actionsPanel.style.display = 'none';
      this.actionsEmpty.style.display = 'block';
      this.actionsList.style.display = 'none';
    }

    // Update count
    this.actionListCount.textContent = this.actions.length;

    // Render action items
    this.renderActionItems();
  }

  renderActionItems() {
    this.actionsList.innerHTML = '';

    this.actions.forEach((action, index) => {
      const li = document.createElement('li');
      li.className = 'action-item';
      li.setAttribute('data-index', index);
      li.setAttribute('data-type', action.type);
      li.draggable = true;

      const description = this.getActionDescription(action);
      const value = action.value ? `Value: ${action.value.substring(0, 30)}${action.value.length > 30 ? '...' : ''}` : '';

      li.innerHTML = `
        <div class="action-number">${index + 1}</div>
        <div class="action-icon"></div>
        <div class="action-details">
          <div class="action-type">${action.type}</div>
          <div class="action-description">${description}</div>
          ${value ? `<div class="action-value">${value}</div>` : ''}
        </div>
        <div class="action-controls">
          <button class="action-btn delete" data-index="${index}" title="Delete">🗑️</button>
        </div>
      `;

      // Add event listeners
      li.querySelector('.action-btn.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteAction(index);
      });

      // Drag and drop listeners
      li.addEventListener('dragstart', (e) => this.handleDragStart(e, index));
      li.addEventListener('dragover', (e) => this.handleDragOver(e));
      li.addEventListener('drop', (e) => this.handleDrop(e, index));
      li.addEventListener('dragend', (e) => this.handleDragEnd(e));

      this.actionsList.appendChild(li);
    });
  }

  getActionDescription(action) {
    const element = action.element || action.target;
    const elementDesc = this.getElementDescription(element);

    switch (action.type) {
      case 'click':
        return `Click on ${elementDesc}`;
      case 'input':
        return `Type into ${elementDesc}`;
      case 'change':
        return `Select option in ${elementDesc}`;
      case 'navigate':
        return `Navigate to ${this.formatUrl(action.url)}`;
      case 'scroll':
        return `Scroll on page`;
      case 'hover':
        return `Hover over ${elementDesc}`;
      case 'submit':
        return `Submit form`;
      case 'select':
        return `Select ${elementDesc}`;
      default:
        return `${action.type} action`;
    }
  }

  getElementDescription(element) {
    if (!element) return 'element';

    if (element.textContent && element.textContent.trim()) {
      return `"${element.textContent.trim().substring(0, 25)}${element.textContent.length > 25 ? '...' : ''}"`;
    }
    if (element.placeholder) {
      return `[${element.placeholder}]`;
    }
    if (element.id) {
      return `#${element.id}`;
    }
    if (element.tagName) {
      return element.tagName.toLowerCase();
    }
    return 'element';
  }

  formatUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname === '/' ? urlObj.hostname : `${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  toggleActionsList() {
    this.actionsBody.classList.toggle('collapsed');
    this.toggleActionsBtn.textContent = this.actionsBody.classList.contains('collapsed') ? '▶' : '▼';
  }

  clearActionsList() {
    if (confirm('Are you sure you want to clear all recorded actions?')) {
      this.actions = [];
      chrome.runtime.sendMessage({ type: 'CLEAR_ACTIONS' });
      this.updateUI();
      this.showToast('All actions cleared', 'success');
    }
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

  // Drag and drop handlers
  handleDragStart(e, index) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', index);
    e.target.classList.add('dragging');
  }

  handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  handleDrop(e, targetIndex) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }

    const sourceIndex = parseInt(e.dataTransfer.getData('text/html'));

    if (sourceIndex !== targetIndex) {
      // Reorder actions array
      const [removed] = this.actions.splice(sourceIndex, 1);
      this.actions.splice(targetIndex, 0, removed);

      // Update backend
      chrome.runtime.sendMessage({
        type: 'UPDATE_ACTIONS',
        actions: this.actions
      });

      this.updateUI();
      this.showToast('Actions reordered', 'success');
    }

    return false;
  }

  handleDragEnd(e) {
    e.target.classList.remove('dragging');
  }
}

// Initialize the unified UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.flowScribeUI = new FlowScribeUI();
});