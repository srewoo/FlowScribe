// FlowScribe Iframe Recorder - CSP Compliant Version
(function() {
  'use strict';

  let isRecording = false;
  let eventListeners = [];
  let parentOrigin = null; // Store validated parent origin for secure messaging

  // Initialize when script loads
  console.log('FlowScribe iframe recorder initialized');

  /**
   * Validate if the message origin is from the parent window
   * This prevents accepting messages from untrusted sources
   */
  function isValidParentOrigin(origin) {
    // If we already have a validated parent origin, check against it
    if (parentOrigin && origin === parentOrigin) {
      return true;
    }

    // Get the parent's origin for first-time validation
    try {
      // Try to access parent origin directly (same-origin)
      if (window.parent && window.parent.location && window.parent.location.origin) {
        const expectedOrigin = window.parent.location.origin;
        if (origin === expectedOrigin) {
          parentOrigin = origin; // Cache the validated origin
          return true;
        }
      }
    } catch (e) {
      // Cross-origin - can't access parent.location
      // Accept the origin from the first FLOWSCRIBE message and validate subsequent ones
      if (!parentOrigin && origin && origin !== 'null') {
        // First message - store the origin for future validation
        parentOrigin = origin;
        return true;
      }
    }

    // Also accept chrome-extension:// origins
    if (origin && origin.startsWith('chrome-extension://')) {
      parentOrigin = origin;
      return true;
    }

    return false;
  }

  window.addEventListener('message', (event) => {
    // Security: Validate message origin before processing
    if (!event.data || !event.data.type) return;
    if (!event.data.type.startsWith('FLOWSCRIBE_')) return;

    // Validate origin for FlowScribe messages
    if (!isValidParentOrigin(event.origin)) {
      console.warn('FlowScribe: Rejected message from untrusted origin:', event.origin);
      return;
    }

    if (event.data.type === 'FLOWSCRIBE_IFRAME_START_RECORDING') {
      isRecording = true;
      setupEventListeners();
      console.log('FlowScribe iframe recording started');
    } else if (event.data.type === 'FLOWSCRIBE_IFRAME_STOP_RECORDING') {
      isRecording = false;
      removeEventListeners();
      console.log('FlowScribe iframe recording stopped');
    }
  });

  function setupEventListeners() {
    removeEventListeners(); // Clean up any existing listeners
    
    const events = ['click', 'input', 'change', 'focus', 'blur', 'keydown'];
    
    events.forEach(eventType => {
      const listener = (event) => {
        if (!isRecording) return;
        
        const target = event.target;
        if (!target) return;

        const rect = target.getBoundingClientRect();
        const iframeRect = window.frameElement ? window.frameElement.getBoundingClientRect() : { left: 0, top: 0 };

        const action = {
          id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          type: eventType,
          timestamp: Date.now(),
          target: {
            tagName: target.tagName,
            id: target.id,
            className: target.className,
            name: target.name,
            type: target.type,
            value: target.type === 'password' ? '***' : target.value,
            textContent: target.textContent ? target.textContent.substring(0, 100) : '',
            attributes: getElementAttributes(target)
          },
          position: {
            x: rect.left + iframeRect.left,
            y: rect.top + iframeRect.top,
            width: rect.width,
            height: rect.height
          },
          selector: generateSelector(target),
          iframe: {
            id: window.frameElement ? window.frameElement.id : null,
            src: window.location.href,
            title: document.title
          }
        };

        // Add event-specific data
        if (eventType === 'keydown') {
          action.key = event.key;
          action.keyCode = event.keyCode;
          action.ctrlKey = event.ctrlKey;
          action.shiftKey = event.shiftKey;
          action.altKey = event.altKey;
        }

        // Send to parent window using validated origin (not wildcard)
        try {
          const targetOrigin = parentOrigin || '*'; // Use validated origin, fallback to * only if not yet established
          window.parent.postMessage({
            type: 'FLOWSCRIBE_IFRAME_ACTION',
            action: action
          }, targetOrigin);
        } catch (error) {
          console.warn('Failed to send iframe action to parent:', error);
        }
      };
      
      document.addEventListener(eventType, listener, true);
      eventListeners.push({ eventType, listener });
    });
  }

  function removeEventListeners() {
    eventListeners.forEach(({ eventType, listener }) => {
      document.removeEventListener(eventType, listener, true);
    });
    eventListeners = [];
  }

  function getElementAttributes(element) {
    const attrs = {};
    if (element.attributes) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }

  function generateSelector(element) {
    if (!element || element === document) return '';
    
    // Try ID first
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Try name attribute
    if (element.name) {
      return `[name="${element.name}"]`;
    }
    
    // Try class combinations
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(/\s+/).filter(cls => cls);
      if (classes.length > 0) {
        const classSelector = '.' + classes.join('.');
        const elements = document.querySelectorAll(classSelector);
        if (elements.length === 1) {
          return classSelector;
        }
      }
    }
    
    // Try data attributes
    const dataAttrs = Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .map(attr => `[${attr.name}="${attr.value}"]`);
    
    if (dataAttrs.length > 0) {
      const dataSelector = element.tagName.toLowerCase() + dataAttrs[0];
      const elements = document.querySelectorAll(dataSelector);
      if (elements.length === 1) {
        return dataSelector;
      }
    }
    
    // Fallback to nth-child
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(child => child.tagName === element.tagName);
      const index = siblings.indexOf(element);
      if (index >= 0) {
        const parentSelector = generateSelector(parent);
        return `${parentSelector} > ${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
      }
    }
    
    return element.tagName.toLowerCase();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    removeEventListeners();
  });

})();
