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
        { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
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
    this.scriptContent.textContent = script;
    this.scriptModal.style.display = 'flex';
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

      const response = await chrome.runtime.sendMessage({
        type: 'GENERATE_SCRIPT',
        data: {
          sessionId: this.currentSession?.id,
          format: 'json',
          options
        }
      });

      if (!response.success) {
        throw new Error(response.error || 'Failed to export');
      }

      // Create download
      const blob = new Blob([JSON.stringify(response.exportData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flowscribe-${exportType}-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.hideLoading();
      this.showToast(`💾 ${exportType} package exported!`, 'success');
      this.toggleExportOptions(); // Hide options

    } catch (error) {
      this.hideLoading();
      this.showToast(`Export failed: ${error.message}`, 'error');
      console.error('Export failed:', error);
    }
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
    
    // Clear existing options
    this.aiModel.innerHTML = '';
    
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

  async saveSettings() {
    const newSettings = {
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

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        settings: newSettings
      });

      if (response.success) {
        this.settings = { ...this.settings, ...newSettings };
        this.showToast('⚙️ Settings saved successfully!', 'success');
        this.closeSettings();
      }
    } catch (error) {
      this.showToast(`Failed to save settings: ${error.message}`, 'error');
    }
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
}

// Initialize the unified UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.flowScribeUI = new FlowScribeUI();
});