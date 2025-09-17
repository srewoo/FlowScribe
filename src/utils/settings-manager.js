// FlowScribe Settings Manager
class SettingsManager {
  constructor() {
    this.STORAGE_KEYS = { SETTINGS: 'flowScribeSettings' };
    this.DEFAULT_SETTINGS = {
      selectedFramework: 'playwright', 
      enableAI: false, 
      aiProvider: 'openai',
      aiModel: 'gpt-4o-mini', 
      apiKey: '', 
      includeScreenshots: true,
      includeAssertions: true, 
      addComments: true, 
      theme: 'light',
      enableSelfHealing: true, 
      enableNetworkRecording: true,
      selfHealingConfidence: 0.7, 
      cicdPlatform: 'github-actions'
    };
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get([this.STORAGE_KEYS.SETTINGS]);
      return { ...this.DEFAULT_SETTINGS, ...(result[this.STORAGE_KEYS.SETTINGS] || {}) };
    } catch (error) { 
      return this.DEFAULT_SETTINGS; 
    }
  }

  async saveSettings(settings) {
    await chrome.storage.local.set({ [this.STORAGE_KEYS.SETTINGS]: settings });
  }

  async migrateSettings() {
    const oldKeys = ['flowScribeSettings', 'aiSettings', 'selectedFramework'];
    const oldData = await chrome.storage.local.get(oldKeys);
    let newSettings = { ...this.DEFAULT_SETTINGS };
    
    if (oldData.flowScribeSettings) Object.assign(newSettings, oldData.flowScribeSettings);
    if (oldData.aiSettings) {
      newSettings.enableAI = oldData.aiSettings.enableAI || false;
      newSettings.apiKey = oldData.aiSettings.apiKey || '';
    }
    if (oldData.selectedFramework) newSettings.selectedFramework = oldData.selectedFramework;
    
    await this.saveSettings(newSettings);
    return newSettings;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = SettingsManager;
else if (typeof window !== 'undefined') window.SettingsManager = SettingsManager;
else self.SettingsManager = SettingsManager;
