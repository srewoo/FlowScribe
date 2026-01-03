/**
 * Browser API Abstraction Layer
 * Provides unified API for Chrome, Firefox, and Edge
 */

const BrowserAPI = (() => {
  // Detect browser type
  const getBrowserType = () => {
    if (typeof browser !== 'undefined' && browser.runtime) {
      return 'firefox';
    }
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Edge also uses chrome namespace but has different user agent
      if (navigator.userAgent.includes('Edg/')) {
        return 'edge';
      }
      return 'chrome';
    }
    return 'unknown';
  };

  const browserType = getBrowserType();

  // Get the appropriate API object
  const api = typeof browser !== 'undefined' ? browser : chrome;

  // Promisify Chrome callback-based APIs for consistency
  const promisify = (fn, context) => {
    return (...args) => {
      return new Promise((resolve, reject) => {
        fn.call(context, ...args, (result) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    };
  };

  // Storage API wrapper
  const storage = {
    local: {
      get: async (keys) => {
        if (browserType === 'firefox') {
          return api.storage.local.get(keys);
        }
        return new Promise((resolve, reject) => {
          api.storage.local.get(keys, (result) => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        });
      },
      set: async (items) => {
        if (browserType === 'firefox') {
          return api.storage.local.set(items);
        }
        return new Promise((resolve, reject) => {
          api.storage.local.set(items, () => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
      remove: async (keys) => {
        if (browserType === 'firefox') {
          return api.storage.local.remove(keys);
        }
        return new Promise((resolve, reject) => {
          api.storage.local.remove(keys, () => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      },
      clear: async () => {
        if (browserType === 'firefox') {
          return api.storage.local.clear();
        }
        return new Promise((resolve, reject) => {
          api.storage.local.clear(() => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      }
    },
    sync: {
      get: async (keys) => {
        if (browserType === 'firefox') {
          return api.storage.sync.get(keys);
        }
        return new Promise((resolve, reject) => {
          api.storage.sync.get(keys, (result) => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        });
      },
      set: async (items) => {
        if (browserType === 'firefox') {
          return api.storage.sync.set(items);
        }
        return new Promise((resolve, reject) => {
          api.storage.sync.set(items, () => {
            if (api.runtime.lastError) {
              reject(new Error(api.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
      }
    }
  };

  // Tabs API wrapper
  const tabs = {
    query: async (queryInfo) => {
      if (browserType === 'firefox') {
        return api.tabs.query(queryInfo);
      }
      return new Promise((resolve, reject) => {
        api.tabs.query(queryInfo, (tabs) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(tabs);
          }
        });
      });
    },
    sendMessage: async (tabId, message) => {
      if (browserType === 'firefox') {
        return api.tabs.sendMessage(tabId, message);
      }
      return new Promise((resolve, reject) => {
        api.tabs.sendMessage(tabId, message, (response) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },
    create: async (createProperties) => {
      if (browserType === 'firefox') {
        return api.tabs.create(createProperties);
      }
      return new Promise((resolve, reject) => {
        api.tabs.create(createProperties, (tab) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });
    },
    get: async (tabId) => {
      if (browserType === 'firefox') {
        return api.tabs.get(tabId);
      }
      return new Promise((resolve, reject) => {
        api.tabs.get(tabId, (tab) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });
    },
    onUpdated: api.tabs.onUpdated,
    onRemoved: api.tabs.onRemoved,
    onActivated: api.tabs.onActivated
  };

  // Runtime API wrapper
  const runtime = {
    sendMessage: async (message) => {
      if (browserType === 'firefox') {
        return api.runtime.sendMessage(message);
      }
      return new Promise((resolve, reject) => {
        api.runtime.sendMessage(message, (response) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },
    onMessage: api.runtime.onMessage,
    getURL: (path) => api.runtime.getURL(path),
    getManifest: () => api.runtime.getManifest(),
    id: api.runtime.id,
    lastError: api.runtime.lastError
  };

  // Scripting API wrapper (MV3)
  const scripting = {
    executeScript: async (injection) => {
      if (browserType === 'firefox') {
        return api.scripting.executeScript(injection);
      }
      return new Promise((resolve, reject) => {
        api.scripting.executeScript(injection, (results) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(results);
          }
        });
      });
    },
    insertCSS: async (injection) => {
      if (browserType === 'firefox') {
        return api.scripting.insertCSS(injection);
      }
      return new Promise((resolve, reject) => {
        api.scripting.insertCSS(injection, () => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    }
  };

  // Action API wrapper (MV3) - replaces browserAction
  const action = {
    setBadgeText: async (details) => {
      const actionApi = api.action || api.browserAction;
      if (browserType === 'firefox') {
        return actionApi.setBadgeText(details);
      }
      return new Promise((resolve) => {
        actionApi.setBadgeText(details, resolve);
      });
    },
    setBadgeBackgroundColor: async (details) => {
      const actionApi = api.action || api.browserAction;
      if (browserType === 'firefox') {
        return actionApi.setBadgeBackgroundColor(details);
      }
      return new Promise((resolve) => {
        actionApi.setBadgeBackgroundColor(details, resolve);
      });
    },
    setIcon: async (details) => {
      const actionApi = api.action || api.browserAction;
      if (browserType === 'firefox') {
        return actionApi.setIcon(details);
      }
      return new Promise((resolve) => {
        actionApi.setIcon(details, resolve);
      });
    },
    setTitle: async (details) => {
      const actionApi = api.action || api.browserAction;
      if (browserType === 'firefox') {
        return actionApi.setTitle(details);
      }
      return new Promise((resolve) => {
        actionApi.setTitle(details, resolve);
      });
    }
  };

  // WebRequest API (limited in MV3)
  const webRequest = api.webRequest ? {
    onBeforeRequest: api.webRequest.onBeforeRequest,
    onCompleted: api.webRequest.onCompleted,
    onErrorOccurred: api.webRequest.onErrorOccurred
  } : null;

  // Notifications API
  const notifications = api.notifications ? {
    create: async (notificationId, options) => {
      if (browserType === 'firefox') {
        return api.notifications.create(notificationId, options);
      }
      return new Promise((resolve, reject) => {
        api.notifications.create(notificationId, options, (id) => {
          if (api.runtime.lastError) {
            reject(new Error(api.runtime.lastError.message));
          } else {
            resolve(id);
          }
        });
      });
    },
    clear: async (notificationId) => {
      if (browserType === 'firefox') {
        return api.notifications.clear(notificationId);
      }
      return new Promise((resolve) => {
        api.notifications.clear(notificationId, resolve);
      });
    }
  } : null;

  // Get browser-specific features info
  const getFeatureSupport = () => {
    return {
      browserType,
      manifestVersion: api.runtime.getManifest().manifest_version,
      hasScripting: !!api.scripting,
      hasAction: !!api.action,
      hasBrowserAction: !!api.browserAction,
      hasWebRequest: !!api.webRequest,
      hasNotifications: !!api.notifications,
      supportsPromises: browserType === 'firefox'
    };
  };

  return {
    browserType,
    api,
    storage,
    tabs,
    runtime,
    scripting,
    action,
    webRequest,
    notifications,
    getFeatureSupport,

    // Utility to check if running in background/service worker
    isBackground: () => {
      return typeof window === 'undefined' ||
             (typeof ServiceWorkerGlobalScope !== 'undefined' &&
              self instanceof ServiceWorkerGlobalScope);
    },

    // Utility to check if running in content script
    isContentScript: () => {
      return typeof window !== 'undefined' &&
             window.location.protocol !== 'chrome-extension:' &&
             window.location.protocol !== 'moz-extension:';
    }
  };
})();

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserAPI;
}

if (typeof window !== 'undefined') {
  window.BrowserAPI = BrowserAPI;
}

// For ES modules
if (typeof globalThis !== 'undefined') {
  globalThis.BrowserAPI = BrowserAPI;
}
