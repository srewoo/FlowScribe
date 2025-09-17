class FlowScribeRecorder {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.actions = [];
    this.iframes = new Map();
    this.actionId = 0;
    this.recordingIndicator = null;
    this.screenshots = new Map();
    this.init();
  }

  init() {
    this.setupMessageListener();
    this.setupIframeMonitoring();
    console.log('FlowScribe content script loaded');
    
    // Check if we should be recording (e.g., after page navigation)
    this.checkRecordingState();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'START_RECORDING':
          this.startRecording(message.isRestore);
          sendResponse({ success: true });
          break;
        case 'STOP_RECORDING':
          this.stopRecording();
          sendResponse({ success: true, actions: this.actions });
          break;
        case 'PAUSE_RECORDING':
          this.pauseRecording();
          sendResponse({ success: true });
          break;
        case 'RESUME_RECORDING':
          this.resumeRecording();
          sendResponse({ success: true });
          break;
        case 'GET_ACTIONS':
          sendResponse({ actions: this.actions });
          break;
        case 'CLEAR_ACTIONS':
          this.actions = [];
          sendResponse({ success: true });
          break;
        case 'SHOW_RECORDING_INDICATOR':
          this.showRecordingIndicator();
          sendResponse({ success: true });
          break;
        case 'HIDE_RECORDING_INDICATOR':
          this.hideRecordingIndicator();
          sendResponse({ success: true });
          break;
        case 'CAPTURE_SCREENSHOT':
          this.captureScreenshot()
            .then(screenshot => sendResponse({ success: true, screenshot }))
            .catch(error => sendResponse({ success: false, error: error.message }));
          return true;
      }
    });

    // Listen for messages from iframes
    window.addEventListener('message', (event) => {
      if (event.data.type === 'FLOWSCRIBE_IFRAME_ACTION' && this.isRecording) {
        this.recordIframeAction(event.data);
      }
    });
  }

  async checkRecordingState() {
    try {
      // Small delay to ensure background script is ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_RECORDING_STATE'
      });
      
      if (response && response.isRecording) {
        console.log('🔄 Restoring recording state after navigation');
        this.startRecording(true);
      }
    } catch (error) {
      // Background script not ready yet, retry once
      setTimeout(async () => {
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'CHECK_RECORDING_STATE'
          });
          
          if (response && response.isRecording) {
            console.log('🔄 Restoring recording state after retry');
            this.startRecording(true);
          }
        } catch (retryError) {
          // Extension context invalidated or not ready
          console.log('Recording state check failed:', retryError.message);
        }
      }, 500);
    }
  }

  setupIframeMonitoring() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const iframes = node.querySelectorAll ? node.querySelectorAll('iframe') : [];
            iframes.forEach((iframe) => this.handleNewIframe(iframe));
            if (node.tagName === 'IFRAME') {
              this.handleNewIframe(node);
            }
          }
        });
      });
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    // Handle existing iframes
    document.querySelectorAll('iframe').forEach((iframe) => {
      this.handleNewIframe(iframe);
    });
  }

  handleNewIframe(iframe) {
    const iframeId = `iframe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.iframes.set(iframeId, {
      element: iframe,
      src: iframe.src,
      id: iframe.id,
      accessible: false
    });

    // Try to inject recorder into iframe
    this.injectIframeRecorder(iframe, iframeId);
  }

  async injectIframeRecorder(iframe, iframeId) {
    try {
      // Wait for iframe to load
      if (iframe.contentDocument === null) {
        iframe.addEventListener('load', () => {
          this.injectIframeRecorder(iframe, iframeId);
        }, { once: true });
        return;
      }

      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc) return;

      // Mark as accessible
      const iframeInfo = this.iframes.get(iframeId);
      if (iframeInfo) {
        iframeInfo.accessible = true;
      }

      // Inject recorder script (CSP compliant - using external file)
      const script = iframeDoc.createElement('script');
      script.src = chrome.runtime.getURL('iframe-recorder.js');
      script.type = 'text/javascript';
      script.async = true;
      
      // Add error handling for script loading
      script.onerror = () => {
        console.warn('Failed to load iframe-recorder.js, trying alternative approach');
        this.setupDirectEventListeners(iframe, iframeId);
      };
      
      script.onload = () => {
        console.log('FlowScribe iframe recorder loaded successfully');
      };
      
      (iframeDoc.head || iframeDoc.documentElement).appendChild(script);

    } catch (error) {
      console.warn('Cannot access iframe content (likely cross-origin):', error);
    }
  }

  // Fallback method for direct event listener setup (when external script fails)
  setupDirectEventListeners(iframe, iframeId) {
    try {
      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc) return;

      const events = ['click', 'input', 'change', 'focus', 'blur', 'keydown'];
      
      events.forEach(eventType => {
        iframeDoc.addEventListener(eventType, (event) => {
          if (!this.isRecording) return;
          
          const target = event.target;
          if (!target) return;

          // Create action object
          const action = this.createActionFromEvent(event, target, iframe);
          action.iframe = {
            id: iframeId,
            src: iframe.src,
            title: iframeDoc.title
          };

          // Send to background script
          this.sendAction(action);
        }, true);
      });

      console.log('FlowScribe direct event listeners setup for iframe:', iframeId);
    } catch (error) {
      console.warn('Failed to setup direct event listeners:', error);
    }
  }

  // DEPRECATED: Kept for compatibility but should not be used due to CSP violations
  createIframeRecorderScript(iframeId) {
    return `
      (function() {
        let isRecording = false;
        
        window.addEventListener('message', (event) => {
          if (event.data.type === 'FLOWSCRIBE_IFRAME_START_RECORDING') {
            isRecording = true;
            setupEventListeners();
          } else if (event.data.type === 'FLOWSCRIBE_IFRAME_STOP_RECORDING') {
            isRecording = false;
          }
        });

        function setupEventListeners() {
          const events = ['click', 'input', 'change', 'focus', 'blur', 'keydown'];
          
          events.forEach(eventType => {
            document.addEventListener(eventType, (event) => {
              if (!isRecording) return;
              
              const target = event.target;
              if (!target) return;

              const rect = target.getBoundingClientRect();
              const iframeRect = window.frameElement ? window.frameElement.getBoundingClientRect() : { left: 0, top: 0 };

              const action = {
                id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                type: eventType,
                timestamp: Date.now(),
                url: window.location.href,
                element: {
                  tagName: target.tagName,
                  id: target.id || '',
                  className: target.className || '',
                  name: target.name || '',
                  type: target.type || '',
                  textContent: target.textContent ? target.textContent.substring(0, 100) : '',
                  value: target.value || '',
                  placeholder: target.placeholder || '',
                  xpath: generateXPath(target),
                  cssSelector: generateCSSSelector(target),
                  rect: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                  }
                },
                coordinates: {
                  x: event.clientX || 0,
                  y: event.clientY || 0
                },
                absoluteCoordinates: {
                  x: (event.clientX || 0) + iframeRect.left,
                  y: (event.clientY || 0) + iframeRect.top
                },
                iframeInfo: {
                  id: '${iframeId}',
                  src: window.location.href,
                  origin: window.location.origin
                }
              };

              // Add specific data based on event type
              if (eventType === 'input' || eventType === 'change') {
                action.value = target.value;
              }
              if (eventType === 'keydown') {
                action.key = event.key;
                action.keyCode = event.keyCode;
              }

              // Send to parent
              parent.postMessage({
                type: 'FLOWSCRIBE_IFRAME_ACTION',
                action: action
              }, '*');
            }, true);
          });
        }

        function generateXPath(element) {
          if (!element) return '';
          
          if (element.id) {
            return '//*[@id="' + element.id + '"]';
          }
          
          let path = '';
          for (; element && element.nodeType === 1; element = element.parentNode) {
            let index = 1;
            for (let sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
              if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                index++;
              }
            }
            const tagName = element.tagName.toLowerCase();
            path = '/' + tagName + '[' + index + ']' + path;
          }
          return path;
        }

        function generateCSSSelector(element) {
          if (!element) return '';
          
          if (element.id) {
            return '#' + element.id;
          }
          
          let path = '';
          for (; element && element.nodeType === 1; element = element.parentNode) {
            let selector = element.tagName.toLowerCase();
            if (element.className) {
              selector += '.' + element.className.trim().split(/\\s+/).join('.');
            }
            path = path ? selector + ' > ' + path : selector;
            if (element.id) {
              path = '#' + element.id + ' > ' + path;
              break;
            }
          }
          return path;
        }
      })();
    `;
  }

  startRecording(isRestore = false) {
    this.isRecording = true;
    
    // Only reset actions if this is a new recording, not a restore
    if (!isRestore) {
      this.actions = [];
      this.actionId = 0;
    }
    this.setupEventListeners();
    this.showRecordingIndicator();
    
    // Show notification if this is a restore
    if (isRestore) {
      this.showRestoreNotification();
    }
    
    // Notify iframes to start recording
    this.iframes.forEach((iframeInfo, iframeId) => {
      if (iframeInfo.accessible && iframeInfo.element.contentWindow) {
        iframeInfo.element.contentWindow.postMessage({
          type: 'FLOWSCRIBE_IFRAME_START_RECORDING'
        }, '*');
      }
    });
    
    console.log(`FlowScribe recording ${isRestore ? 'restored' : 'started'}`);
  }

  stopRecording() {
    this.isRecording = false;
    this.removeEventListeners();
    this.hideRecordingIndicator();
    
    // Notify iframes to stop recording
    this.iframes.forEach((iframeInfo, iframeId) => {
      if (iframeInfo.accessible && iframeInfo.element.contentWindow) {
        iframeInfo.element.contentWindow.postMessage({
          type: 'FLOWSCRIBE_IFRAME_STOP_RECORDING'
        }, '*');
      }
    });

    console.log('FlowScribe recording stopped. Actions recorded:', this.actions.length);
    
    // Send actions to background script
    chrome.runtime.sendMessage({
      type: 'ACTIONS_RECORDED',
      actions: this.actions,
      url: window.location.href
    });
  }

  async startRecording(isRestore = false) {
    if (this.isRecording) return;
    
    // If this is a restore after page reload, get existing actions from background
    if (isRestore) {
      try {
        console.log('🔄 Restoring recording state and existing actions...');
        const response = await chrome.runtime.sendMessage({ type: 'GET_SESSION_ACTIONS' });
        if (response && response.success && response.actions) {
          this.actions = response.actions;
          console.log(`✅ Restored ${this.actions.length} existing actions from session`);
        }
      } catch (error) {
        console.warn('Failed to restore actions:', error);
      }
    }
    
    this.isRecording = true;
    this.isPaused = false;
    console.log(`🎬 FlowScribe recording started${isRestore ? ' (restored)' : ''} - Total actions: ${this.actions.length}`);
    
    this.setupEventListeners();
    this.showRecordingIndicator();
    
    // Send initial status to background
    chrome.runtime.sendMessage({ 
      type: 'RECORDING_STARTED', 
      isRestore,
      timestamp: Date.now(),
      url: window.location.href,
      existingActionCount: this.actions.length
    });
  }

  stopRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    this.isPaused = false;
    this.removeEventListeners();
    this.hideRecordingIndicator();
    
    console.log(`🛑 FlowScribe recording stopped - Total actions recorded: ${this.actions.length}`);
    
    // Send stop status to background
    chrome.runtime.sendMessage({ 
      type: 'RECORDING_STOPPED', 
      timestamp: Date.now(),
      totalActions: this.actions.length
    });
  }

  pauseRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    this.isPaused = true;
    this.removeEventListeners();
    
    // Update recording indicator
    if (this.recordingIndicator) {
      const titleSpan = this.recordingIndicator.querySelector('span');
      if (titleSpan) {
        titleSpan.textContent = 'FlowScribe Paused';
      }
      this.recordingIndicator.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
    }
    
    console.log('FlowScribe recording paused');
  }

  resumeRecording() {
    if (!this.isPaused) return;
    
    this.isRecording = true;
    this.isPaused = false;
    this.setupEventListeners();
    
    // Update recording indicator
    if (this.recordingIndicator) {
      const titleSpan = this.recordingIndicator.querySelector('span');
      if (titleSpan) {
        titleSpan.textContent = 'FlowScribe Recording';
      }
      this.recordingIndicator.style.background = 'linear-gradient(135deg, #ff4757, #ff6b7a)';
    }
    
    console.log('FlowScribe recording resumed');
  }

  setupEventListeners() {
    const events = ['click', 'input', 'change', 'focus', 'blur', 'keydown', 'submit'];
    
    this.eventListeners = {};
    
    events.forEach(eventType => {
      this.eventListeners[eventType] = (event) => this.recordAction(event);
      document.addEventListener(eventType, this.eventListeners[eventType], true);
    });
  }

  removeEventListeners() {
    if (!this.eventListeners) return;
    
    Object.keys(this.eventListeners).forEach(eventType => {
      document.removeEventListener(eventType, this.eventListeners[eventType], true);
    });
    
    this.eventListeners = null;
  }

  recordAction(event) {
    if (!this.isRecording) return;

    const target = event.target;
    if (!target) return;

    // Skip recording for certain elements
    if (this.shouldSkipElement(target)) return;

    const action = this.createAction(event, target);
    const enhancedAction = this.enhanceActionDetection(action, target, event);
    
    // Apply action deduplication and optimization
    const optimizedAction = this.optimizeAction(enhancedAction);
    if (!optimizedAction) return; // Action was filtered out
    
    this.actions.push(optimizedAction);

    console.log('✅ Action recorded with DOM data:', {
      type: optimizedAction.type,
      element: optimizedAction.element,
      hasAttributes: !!optimizedAction.element?.attributes,
      hasTestAttributes: !!optimizedAction.element?.testAttributes,
      totalActionsRecorded: this.actions.length
    });

    // Send individual action to background script immediately
    chrome.runtime.sendMessage({
      type: 'ACTION_RECORDED',
      action: optimizedAction,
      sessionActions: this.actions.length,
      url: window.location.href
    });
  }

  optimizeAction(action) {
    // Deduplication and optimization logic
    const lastAction = this.actions[this.actions.length - 1];
    
    // Skip rapid duplicate clicks
    if (action.type === 'click' && lastAction?.type === 'click' && 
        this.isSameElement(action.element, lastAction.element) &&
        (action.timestamp - lastAction.timestamp) < 300) {
      return null; // Skip this duplicate click
    }
    
    // Optimize input actions - replace multiple fills with final value
    if ((action.type === 'input' || action.type === 'change') && 
        lastAction && (lastAction.type === 'input' || lastAction.type === 'change') &&
        this.isSameElement(action.element, lastAction.element)) {
      
      // Replace the last action instead of adding a new one
      this.actions[this.actions.length - 1] = {
        ...lastAction,
        value: action.value,
        timestamp: action.timestamp
      };
      return null; // Don't add new action
    }
    
    // Skip redundant focus/blur events if they don't add value
    if ((action.type === 'focus' || action.type === 'blur') && 
        lastAction && this.isSameElement(action.element, lastAction.element)) {
      return null;
    }
    
    return action;
  }

  isSameElement(element1, element2) {
    if (!element1 || !element2) return false;
    
    // Compare by best available identifier
    if (element1.id && element2.id) {
      return element1.id === element2.id;
    }
    
    if (element1.name && element2.name && element1.tagName === element2.tagName) {
      return element1.name === element2.name;
    }
    
    // Fallback to CSS selector comparison
    return element1.cssSelector === element2.cssSelector;
  }

  recordIframeAction(data) {
    if (!this.isRecording) return;
    
    this.actions.push(data.action);
    console.log('Iframe action recorded:', data.action);
  }

  shouldSkipElement(element) {
    const skipTags = ['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'];
    const skipClasses = ['flowscribe-ignore'];
    
    if (skipTags.includes(element.tagName)) return true;
    if (skipClasses.some(cls => element.classList.contains(cls))) return true;
    
    return false;
  }

  createAction(event, target) {
    const rect = target.getBoundingClientRect();
    
    const action = {
      id: ++this.actionId,
      type: event.type,
      timestamp: Date.now(),
      url: window.location.href,
      element: {
        tagName: target.tagName,
        id: target.id || '',
        className: target.className || '',
        name: target.name || '',
        type: target.type || '',
        textContent: target.textContent ? target.textContent.substring(0, 100) : '',
        value: target.value || '',
        placeholder: target.placeholder || '',
        xpath: this.generateXPath(target),
        cssSelector: this.generateCSSSelector(target),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        }
      },
      coordinates: {
        x: event.clientX || 0,
        y: event.clientY || 0
      }
    };

    // Add specific data based on event type
    if (event.type === 'input' || event.type === 'change') {
      action.value = target.value;
    }
    if (event.type === 'keydown') {
      action.key = event.key;
      action.keyCode = event.keyCode;
    }
    if (event.type === 'click') {
      action.clickType = event.detail === 2 ? 'double' : 'single';
    }

    return action;
  }

  generateXPath(element) {
    if (!element) return '';
    
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    
    let path = '';
    for (; element && element.nodeType === 1; element = element.parentNode) {
      let index = 1;
      for (let sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
        if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
          index++;
        }
      }
      const tagName = element.tagName.toLowerCase();
      path = `/${tagName}[${index}]${path}`;
    }
    return path;
  }

  generateCSSSelector(element) {
    if (!element) return '';
    
    // Try to find the most stable selector
    const bestSelector = this.generateBestSelector(element);
    if (bestSelector) return bestSelector;
    
    // Fallback to smart CSS path generation (shorter and more stable)
    return this.generateSmartCSSPath(element);
  }

  generateBestSelector(element) {
    // Priority 1: ID (if not dynamic)
    if (element.id && !this.isDynamicValue(element.id)) {
      return `#${element.id}`;
    }

    // Priority 2: Test attributes
    const testAttributes = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-automation'];
    for (const attr of testAttributes) {
      const value = element.getAttribute(attr);
      if (value && !this.isDynamicValue(value)) {
        return `[${attr}="${value}"]`;
      }
    }

    // Priority 3: Name attribute for form elements
    if (element.name && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(element.tagName)) {
      return `[name="${element.name}"]`;
    }

    // Priority 4: Type + placeholder for inputs
    if (element.tagName === 'INPUT' && element.type && element.placeholder) {
      return `input[type="${element.type}"][placeholder="${element.placeholder}"]`;
    }

    // Priority 5: Role + accessible name
    const role = element.getAttribute('role') || this.getImplicitRole(element);
    const accessibleName = this.getAccessibleName(element);
    if (role && accessibleName && !this.isDynamicValue(accessibleName)) {
      return `[role="${role}"][aria-label="${accessibleName}"]`;
    }

    // Priority 6: Stable class names (avoid generated ones)
    const stableClasses = this.getStableClasses(element);
    if (stableClasses.length > 0) {
      return `${element.tagName.toLowerCase()}.${stableClasses.join('.')}`;
    }

    return null; // No good selector found, use fallback
  }

  generateSmartCSSPath(element) {
    const path = [];
    let current = element;
    
    while (current && current.nodeType === 1) {
      let selector = current.tagName.toLowerCase();
      
      // Add stable attributes to make selector more unique
      if (current.id && !this.isDynamicValue(current.id)) {
        return `#${current.id}` + (path.length > 0 ? ` ${path.join(' ')}` : '');
      }
      
      // Add stable classes
      const stableClasses = this.getStableClasses(current);
      if (stableClasses.length > 0) {
        selector += `.${stableClasses.slice(0, 2).join('.')}`; // Limit to 2 classes max
      }
      
      // Add nth-child only if necessary for uniqueness
      const siblings = Array.from(current.parentNode?.children || [])
        .filter(el => el.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
      
      path.unshift(selector);
      
      // Stop traversing up if we have a unique enough selector
      if (path.length >= 3) break;
      
      current = current.parentNode;
    }
    
    return path.join(' > ');
  }

  isDynamicValue(value) {
    // Check if value looks dynamically generated
    const dynamicPatterns = [
      /^[0-9a-f]{8,}$/i,           // Long hex strings
      /^\d{10,}$/,                 // Long numbers (timestamps)
      /^[a-z0-9]{20,}$/i,          // Long random strings
      /^uuid-/i,                   // UUID patterns
      /^temp-/i,                   // Temporary IDs
      /^generated-/i,              // Generated IDs
      /-([\d]+)$/,                 // Ending with numbers
    ];
    
    return dynamicPatterns.some(pattern => pattern.test(value));
  }

  getStableClasses(element) {
    if (!element.className) return [];
    
    const classes = element.className.trim().split(/\s+/).filter(cls => cls);
    const unstablePatterns = [
      /^[a-z0-9]{6,}$/i,          // Generated class names (CSS modules)
      /^style__/i,                // Styled components
      /^css-[a-z0-9]+$/i,         // CSS-in-JS
      /^sc-[a-z0-9]+$/i,          // Styled components
      /^ant-\d/,                  // Ant Design with numbers
      /makeStyles/i,              // Material-UI
    ];
    
    return classes.filter(cls => 
      !unstablePatterns.some(pattern => pattern.test(cls)) &&
      cls.length < 50 // Avoid very long class names
    );
  }

  getImplicitRole(element) {
    const tagRoleMap = {
      'BUTTON': 'button',
      'A': 'link',
      'INPUT': element.type === 'button' || element.type === 'submit' ? 'button' : 'textbox',
      'TEXTAREA': 'textbox',
      'SELECT': 'combobox',
      'H1': 'heading',
      'H2': 'heading',
      'H3': 'heading',
      'H4': 'heading',
      'H5': 'heading',
      'H6': 'heading'
    };
    
    return tagRoleMap[element.tagName] || null;
  }

  getAccessibleName(element) {
    // Try different ways to get accessible name
    return element.getAttribute('aria-label') ||
           element.getAttribute('aria-labelledby') ||
           element.getAttribute('title') ||
           element.getAttribute('alt') ||
           (element.textContent && element.textContent.trim().substring(0, 50)) ||
           element.getAttribute('placeholder');
  }

  showRecordingIndicator() {
    if (this.recordingIndicator) return;

    // Create recording indicator
    this.recordingIndicator = document.createElement('div');
    this.recordingIndicator.id = 'flowscribe-recording-indicator';
    // Create inner elements safely without innerHTML
    const indicatorContainer = document.createElement('div');
    indicatorContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ff4757, #ff6b7a);
      color: white;
      padding: 12px 16px;
      border-radius: 25px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(255, 71, 87, 0.3);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: flowscribe-pulse 2s infinite;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    const blinkDot = document.createElement('div');
    blinkDot.style.cssText = `
      width: 12px;
      height: 12px;
      background: white;
      border-radius: 50%;
      animation: flowscribe-blink 1s infinite;
    `;
    
    const titleSpan = document.createElement('span');
    titleSpan.textContent = 'FlowScribe Recording';
    
    const actionCounter = document.createElement('div');
    actionCounter.id = 'flowscribe-action-counter';
    actionCounter.style.cssText = `
      background: rgba(255, 255, 255, 0.2);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
    `;
    actionCounter.textContent = '0 actions';
    
    indicatorContainer.appendChild(blinkDot);
    indicatorContainer.appendChild(titleSpan);
    indicatorContainer.appendChild(actionCounter);
    this.recordingIndicator.appendChild(indicatorContainer);

    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes flowscribe-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.02); }
      }
      @keyframes flowscribe-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      #flowscribe-recording-indicator {
        user-select: none;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this.recordingIndicator);

    // Update action counter periodically
    this.actionCounterInterval = setInterval(() => {
      const counter = document.getElementById('flowscribe-action-counter');
      if (counter) {
        const count = this.actions.length;
        counter.textContent = `${count} action${count !== 1 ? 's' : ''}`;
      }
    }, 500);
  }

  hideRecordingIndicator() {
    if (this.recordingIndicator) {
      this.recordingIndicator.remove();
      this.recordingIndicator = null;
    }
    
    if (this.actionCounterInterval) {
      clearInterval(this.actionCounterInterval);
      this.actionCounterInterval = null;
    }
  }

  showRestoreNotification() {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: linear-gradient(135deg, #4CAF50, #66BB6A);
      color: white;
      padding: 12px 20px;
      border-radius: 25px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 4px 20px rgba(76, 175, 80, 0.3);
      z-index: 10001;
      display: flex;
      align-items: center;
      gap: 8px;
      animation: flowscribe-slide-in 0.3s ease-out;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    const checkIcon = document.createElement('svg');
    checkIcon.setAttribute('width', '16');
    checkIcon.setAttribute('height', '16');
    checkIcon.setAttribute('viewBox', '0 0 16 16');
    checkIcon.setAttribute('fill', 'white');
    checkIcon.innerHTML = '<path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>';
    
    const text = document.createElement('span');
    text.textContent = 'Recording Resumed';
    
    notification.appendChild(checkIcon);
    notification.appendChild(text);
    document.body.appendChild(notification);
    
    // Add animation styles if not already present
    if (!document.getElementById('flowscribe-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'flowscribe-notification-styles';
      style.textContent = `
        @keyframes flowscribe-slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes flowscribe-slide-out {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Remove notification after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'flowscribe-slide-out 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  async captureScreenshot() {
    try {
      // Request screenshot from background script
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'CAPTURE_SCREENSHOT',
          options: { format: 'png', quality: 90 }
        }, (response) => {
          if (response.success) {
            resolve(response.screenshot);
          } else {
            reject(new Error(response.error));
          }
        });
      });
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      throw error;
    }
  }

  recordActionWithScreenshot(action) {
    // Capture screenshot for important actions
    const importantActions = ['click', 'submit', 'navigation'];
    
    if (importantActions.includes(action.type)) {
      this.captureScreenshot()
        .then(screenshot => {
          action.screenshot = screenshot;
          this.screenshots.set(action.id, screenshot);
        })
        .catch(error => {
          console.warn('Failed to capture screenshot for action:', error);
        });
    }

    this.actions.push(action);
    return action;
  }

  enhanceActionDetection(action, target, event) {
    // Enhanced action detection with comprehensive context for AI locator generation
    const enhanced = { ...action };

    // Comprehensive element attributes for intelligent locator generation
    if (target.hasAttributes()) {
      enhanced.element.attributes = {};
      for (let attr of target.attributes) {
        enhanced.element.attributes[attr.name] = attr.value;
      }
      
      // Identify test-specific attributes for highest priority locators
      enhanced.element.testAttributes = this.extractTestAttributes(target);
      enhanced.element.semanticAttributes = this.extractSemanticAttributes(target);
    }

    // Enhanced form context for comprehensive form testing
    if (target.form) {
      enhanced.formContext = {
        id: target.form.id,
        name: target.form.name,
        action: target.form.action,
        method: target.form.method,
        enctype: target.form.enctype,
        fieldCount: target.form.elements.length,
        formFields: this.analyzeFormFields(target.form)
      };
    }

    // Enhanced parent context for intelligent relative locators
    enhanced.parentContext = this.buildParentContext(target);

    // Comprehensive accessibility information
    enhanced.accessibility = this.extractAccessibilityInfo(target);

    // Sibling context for better uniqueness
    enhanced.siblingContext = this.analyzeSiblingElements(target);

    // Element visibility and interaction state
    enhanced.elementState = {
      isVisible: this.isElementVisible(target),
      isEnabled: !target.disabled,
      isRequired: target.required || false,
      isReadOnly: target.readOnly || false,
      computedRole: this.getComputedRole(target),
      interactable: this.isElementInteractable(target)
    };

    // Page context for better test generation
    enhanced.pageContext = {
      title: document.title,
      url: window.location.href,
      pathname: window.location.pathname,
      hasFrames: window.frames.length > 0,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };

    // Locator suggestions based on element analysis
    enhanced.suggestedLocators = this.generateLocatorSuggestions(target);

    return enhanced;
  }

  /**
   * Extract test-specific attributes (highest priority for locators)
   */
  extractTestAttributes(element) {
    const testAttributes = {};
    const testAttrNames = ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-automation', 'data-test-id'];
    
    testAttrNames.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        testAttributes[attr] = value;
      }
    });
    
    return testAttributes;
  }

  /**
   * Extract semantic attributes useful for locators
   */
  extractSemanticAttributes(element) {
    const semanticAttrs = {};
    const semanticAttrNames = [
      'id', 'name', 'class', 'role', 'type', 'aria-label', 'aria-labelledby', 
      'aria-describedby', 'title', 'alt', 'placeholder', 'href', 'value'
    ];
    
    semanticAttrNames.forEach(attr => {
      const value = element.getAttribute(attr);
      if (value) {
        semanticAttrs[attr] = value;
      }
    });
    
    return semanticAttrs;
  }

  /**
   * Analyze form fields for comprehensive form testing
   */
  analyzeFormFields(form) {
    const fields = [];
    const formElements = form.elements;
    
    for (let i = 0; i < formElements.length; i++) {
      const field = formElements[i];
      fields.push({
        name: field.name,
        type: field.type,
        tagName: field.tagName,
        required: field.required,
        disabled: field.disabled,
        id: field.id,
        placeholder: field.placeholder,
        value: field.type === 'password' ? '[HIDDEN]' : field.value
      });
    }
    
    return fields;
  }

  /**
   * Build comprehensive parent context
   */
  buildParentContext(element) {
    const parents = [];
    let current = element.parentElement;
    let depth = 0;
    
    // Traverse up to 3 levels of parents
    while (current && depth < 3) {
      parents.push({
        tagName: current.tagName,
        id: current.id,
        className: current.className,
        role: current.getAttribute('role'),
        depth: depth + 1
      });
      current = current.parentElement;
      depth++;
    }
    
    return {
      immediate: parents[0] || null,
      hierarchy: parents,
      hasSemanticParent: parents.some(p => 
        ['FORM', 'NAV', 'HEADER', 'FOOTER', 'MAIN', 'SECTION', 'ARTICLE'].includes(p.tagName)
      )
    };
  }

  /**
   * Extract comprehensive accessibility information
   */
  extractAccessibilityInfo(element) {
    return {
      label: element.getAttribute('aria-label'),
      labelledBy: element.getAttribute('aria-labelledby'),
      describedBy: element.getAttribute('aria-describedby'),
      role: element.getAttribute('role'),
      computedRole: this.getComputedRole(element),
      expanded: element.getAttribute('aria-expanded'),
      selected: element.getAttribute('aria-selected'),
      checked: element.getAttribute('aria-checked'),
      disabled: element.getAttribute('aria-disabled'),
      hidden: element.getAttribute('aria-hidden'),
      live: element.getAttribute('aria-live'),
      owns: element.getAttribute('aria-owns'),
      controls: element.getAttribute('aria-controls'),
      hasPopup: element.getAttribute('aria-haspopup')
    };
  }

  /**
   * Analyze sibling elements for context
   */
  analyzeSiblingElements(element) {
    const siblings = Array.from(element.parentElement?.children || []);
    const elementIndex = siblings.indexOf(element);
    
    return {
      totalSiblings: siblings.length,
      position: elementIndex + 1,
      isFirst: elementIndex === 0,
      isLast: elementIndex === siblings.length - 1,
      sameTagSiblings: siblings.filter(s => s.tagName === element.tagName).length,
      positionAmongSameTag: siblings.filter((s, i) => 
        s.tagName === element.tagName && i <= elementIndex).length
    };
  }

  /**
   * Check if element is visible
   */
  isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    
    return rect.width > 0 && 
           rect.height > 0 && 
           style.visibility !== 'hidden' && 
           style.display !== 'none' &&
           parseFloat(style.opacity) > 0;
  }

  /**
   * Get computed ARIA role
   */
  getComputedRole(element) {
    // Return explicit role or implicit role based on element type
    const explicitRole = element.getAttribute('role');
    if (explicitRole) return explicitRole;
    
    const tagName = element.tagName.toLowerCase();
    const type = element.type?.toLowerCase();
    
    // Common implicit roles
    const implicitRoles = {
      'button': 'button',
      'a': element.href ? 'link' : null,
      'input': {
        'button': 'button',
        'submit': 'button',
        'reset': 'button',
        'checkbox': 'checkbox',
        'radio': 'radio',
        'text': 'textbox',
        'email': 'textbox',
        'password': 'textbox',
        'search': 'searchbox'
      }[type] || 'textbox',
      'textarea': 'textbox',
      'select': 'combobox',
      'nav': 'navigation',
      'main': 'main',
      'header': 'banner',
      'footer': 'contentinfo',
      'section': 'region',
      'article': 'article',
      'form': 'form',
      'table': 'table',
      'ul': 'list',
      'ol': 'list',
      'li': 'listitem'
    };
    
    return implicitRoles[tagName] || null;
  }

  /**
   * Check if element is interactable
   */
  isElementInteractable(element) {
    return !element.disabled && 
           this.isElementVisible(element) &&
           element.offsetParent !== null;
  }

  /**
   * Generate intelligent locator suggestions based on element analysis
   */
  generateLocatorSuggestions(element) {
    const suggestions = [];
    
    // Priority 1: Test attributes
    const testAttrs = this.extractTestAttributes(element);
    Object.entries(testAttrs).forEach(([attr, value]) => {
      suggestions.push({
        type: 'test-attribute',
        selector: `[${attr}="${value}"]`,
        priority: 100,
        stability: 95,
        reasoning: `Test attribute ${attr} provides highest stability`
      });
    });
    
    // Priority 2: Unique ID (if semantic)
    if (element.id && !element.id.match(/^(generated|auto|temp|uid|[0-9]+)/i)) {
      suggestions.push({
        type: 'unique-id',
        selector: `#${element.id}`,
        priority: 90,
        stability: 90,
        reasoning: 'Semantic ID provides good stability'
      });
    }
    
    // Priority 3: ARIA label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      suggestions.push({
        type: 'aria-label',
        selector: `[aria-label="${ariaLabel}"]`,
        priority: 85,
        stability: 85,
        reasoning: 'ARIA label provides semantic meaning and stability'
      });
    }
    
    // Priority 4: Name attribute for form elements
    if (element.name && ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
      suggestions.push({
        type: 'name-attribute',
        selector: `[name="${element.name}"]`,
        priority: 80,
        stability: 80,
        reasoning: 'Name attribute is stable for form elements'
      });
    }
    
    // Priority 5: Text content for clickable elements
    if (element.textContent && 
        ['BUTTON', 'A', 'SPAN', 'DIV'].includes(element.tagName) &&
        element.textContent.trim().length > 0 && 
        element.textContent.trim().length < 50) {
      const text = element.textContent.trim();
      suggestions.push({
        type: 'text-content',
        selector: `text="${text}"`,
        priority: 70,
        stability: 65,
        reasoning: 'Text content provides user-visible identification'
      });
    }
    
    // Priority 6: Attribute combination for uniqueness
    const stableAttrs = Object.entries(element.attributes || {})
      .filter(([key, value]) => 
        !key.includes('class') && 
        !key.includes('style') && 
        value && 
        value.length < 50)
      .slice(0, 2);
    
    if (stableAttrs.length > 1) {
      const selector = stableAttrs.map(([key, value]) => `[${key}="${value}"]`).join('');
      suggestions.push({
        type: 'attribute-combination',
        selector: selector,
        priority: 75,
        stability: 70,
        reasoning: 'Multiple stable attributes increase uniqueness'
      });
    }
    
    return suggestions.sort((a, b) => b.priority - a.priority).slice(0, 5);
  }
}

// Initialize the recorder
if (typeof window !== 'undefined') {
  window.flowScribeRecorder = new FlowScribeRecorder();
}