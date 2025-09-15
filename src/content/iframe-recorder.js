// FlowScribe Iframe Recorder - CSP Compliant Version
(function() {
  'use strict';
  
  let isRecording = false;
  let eventListeners = [];
  
  // Initialize when script loads
  console.log('FlowScribe iframe recorder initialized');
  
  window.addEventListener('message', (event) => {
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

        // Send to parent window
        try {
          window.parent.postMessage({
            type: 'FLOWSCRIBE_IFRAME_ACTION',
            action: action
          }, '*');
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
