/**
 * Enhanced FlowScribe Recorder
 * Comprehensive interaction capture with intelligent assertion generation
 */

class EnhancedRecorder {
  constructor() {
    this.isRecording = false;
    this.actions = [];
    this.assertions = [];
    this.pageStates = [];
    this.networkRequests = [];
    this.consoleErrors = [];
    this.mutationObserver = null;
    this.intersectionObserver = null;
    this.performanceObserver = null;
    this.dialogObserver = null;
    this.startTime = null;
    this.lastActionTime = null;
    this.elementCache = new WeakMap();
    this.shadowRoots = new Set();
    this.actionId = 0;
    this.sessionId = this.generateSessionId();

    // Gesture tracking state
    this.touchState = {
      startTouches: [],
      startTime: null,
      lastTapTime: null,
      lastTapTarget: null,
      initialPinchDistance: null
    };

    // Auto-fill detection state
    this.inputInitialValues = new WeakMap();

    // Keyboard input tracking
    this.keyboardInputBuffer = new Map();

    // Slider/range tracking
    this.sliderState = new WeakMap();

    // Dialog/modal tracking
    this.openDialogs = new Set();
  }

  startRecording() {
    if (this.isRecording) return;

    this.isRecording = true;
    this.startTime = Date.now();
    this.captureInitialState();
    this.setupEventListeners();
    this.setupObservers();
    this.setupNetworkInterception();
    this.injectRecordingIndicator();

    console.log('🎬 Enhanced recording started');
  }

  captureInitialState() {
    this.pageStates.push({
      timestamp: Date.now(),
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      cookies: document.cookie,
      localStorage: {...localStorage},
      sessionStorage: {...sessionStorage},
      documentReadyState: document.readyState,
      userAgent: navigator.userAgent
    });

    // Capture initial DOM snapshot
    this.captureDOMSnapshot('initial');
  }

  setupEventListeners() {
    // Comprehensive event capture
    const events = {
      // Mouse events
      'click': this.handleClick.bind(this),
      'dblclick': this.handleDoubleClick.bind(this),
      'contextmenu': this.handleRightClick.bind(this),
      'mousedown': this.handleMouseDown.bind(this),
      'mouseup': this.handleMouseUp.bind(this),
      'mouseover': this.handleMouseOver.bind(this),
      'mouseout': this.handleMouseOut.bind(this),
      'mousemove': this.throttle(this.handleMouseMove.bind(this), 100),

      // Keyboard events
      'keydown': this.handleKeyDown.bind(this),
      'keyup': this.handleKeyUp.bind(this),
      'keypress': this.handleKeyPress.bind(this),

      // Form events
      'input': this.handleInput.bind(this),
      'change': this.handleChange.bind(this),
      'focus': this.handleFocus.bind(this),
      'blur': this.handleBlur.bind(this),
      'submit': this.handleSubmit.bind(this),
      'reset': this.handleReset.bind(this),
      'invalid': this.handleInvalid.bind(this),

      // Scroll events
      'scroll': this.throttle(this.handleScroll.bind(this), 200),
      'wheel': this.throttle(this.handleWheel.bind(this), 200),

      // Window events
      'resize': this.throttle(this.handleResize.bind(this), 500),
      'orientationchange': this.handleOrientationChange.bind(this),

      // Drag events
      'dragstart': this.handleDragStart.bind(this),
      'dragend': this.handleDragEnd.bind(this),
      'drop': this.handleDrop.bind(this),
      'dragover': this.handleDragOver.bind(this),

      // Touch events (for mobile testing)
      'touchstart': this.handleTouchStart.bind(this),
      'touchend': this.handleTouchEnd.bind(this),
      'touchmove': this.throttle(this.handleTouchMove.bind(this), 100),

      // Media events
      'play': this.handleMediaPlay.bind(this),
      'pause': this.handleMediaPause.bind(this),
      'ended': this.handleMediaEnded.bind(this),

      // Clipboard events
      'copy': this.handleCopy.bind(this),
      'cut': this.handleCut.bind(this),
      'paste': this.handlePaste.bind(this),

      // Page events
      'popstate': this.handlePopState.bind(this),
      'hashchange': this.handleHashChange.bind(this),
      'pageshow': this.handlePageShow.bind(this),
      'pagehide': this.handlePageHide.bind(this),

      // Text selection event
      'selectionchange': this.debounce(this.handleSelectionChange.bind(this), 300),

      // Animation events for auto-fill detection
      'animationstart': this.handleAnimationStart.bind(this)
    };

    // Add listeners with capture to catch events before they bubble
    Object.entries(events).forEach(([event, handler]) => {
      document.addEventListener(event, handler, true);
      this[`${event}Handler`] = handler; // Store for cleanup
    });

    // Window-level events
    window.addEventListener('focus', this.handleWindowFocus.bind(this));
    window.addEventListener('blur', this.handleWindowBlur.bind(this));

    // Special handling for file inputs
    this.setupFileInputListeners();

    // Shadow DOM support
    this.setupShadowDOMListeners();

    // Setup dialog/modal tracking
    this.setupDialogTracking();

    // Setup auto-fill detection
    this.setupAutoFillDetection();

    // Setup slider/range tracking
    this.setupSliderTracking();

    // Setup contenteditable tracking
    this.setupContentEditableTracking();

    // Setup autocomplete tracking
    this.setupAutocompleteTracking();

    // Setup console error capture
    this.setupConsoleErrorCapture();

    // Setup date/time picker tracking
    this.setupDateTimePickerTracking();
  }

  setupObservers() {
    // Mutation Observer for DOM changes
    this.mutationObserver = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      attributes: true,
      characterData: true,
      subtree: true,
      attributeOldValue: true,
      characterDataOldValue: true
    });

    // Intersection Observer for lazy-loaded content
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.handleIntersections(entries);
    }, {
      threshold: [0, 0.25, 0.5, 0.75, 1]
    });

    // Observe all images and iframes for lazy loading
    document.querySelectorAll('img[loading="lazy"], iframe').forEach(el => {
      this.intersectionObserver.observe(el);
    });

    // Performance Observer for resource timing
    if (window.PerformanceObserver) {
      this.performanceObserver = new PerformanceObserver((list) => {
        this.handlePerformanceEntries(list.getEntries());
      });

      this.performanceObserver.observe({
        entryTypes: ['navigation', 'resource', 'paint', 'largest-contentful-paint']
      });
    }
  }

  setupNetworkInterception() {
    // Store reference to recorder instance for use in interceptors
    const recorder = this;

    // Intercept fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const requestId = recorder.generateRequestId();
      const startTime = performance.now();

      const [resource, config] = args;
      const request = {
        id: requestId,
        timestamp: Date.now(),
        url: resource.toString(),
        method: config?.method || 'GET',
        headers: config?.headers || {},
        body: config?.body
      };

      recorder.networkRequests.push({
        type: 'request',
        ...request
      });

      try {
        const response = await originalFetch(...args);
        const responseClone = response.clone();

        recorder.networkRequests.push({
          type: 'response',
          id: requestId,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          duration: performance.now() - startTime
        });

        // Capture response body if it's JSON or text
        if (response.headers.get('content-type')?.includes('json')) {
          responseClone.json().then(data => {
            recorder.networkRequests.push({
              type: 'response-body',
              id: requestId,
              data
            });
          }).catch(() => {});
        }

        return response;
      } catch (error) {
        recorder.networkRequests.push({
          type: 'error',
          id: requestId,
          error: error.message,
          duration: performance.now() - startTime
        });
        throw error;
      }
    };

    // Intercept XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._requestId = recorder.generateRequestId();
      this._method = method;
      this._url = url;
      return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;
      const requestId = this._requestId;
      const startTime = performance.now();

      this.addEventListener('load', () => {
        recorder.networkRequests.push({
          type: 'xhr-response',
          id: requestId,
          status: xhr.status,
          statusText: xhr.statusText,
          response: xhr.responseText,
          duration: performance.now() - startTime
        });
      });

      recorder.networkRequests.push({
        type: 'xhr-request',
        id: requestId,
        method: this._method,
        url: this._url,
        body
      });

      return originalXHRSend.apply(this, [body]);
    };
  }

  // Enhanced event handlers
  handleClick(event) {
    const element = event.target;
    const action = {
      id: this.generateActionId(),
      type: 'click',
      timestamp: Date.now(),
      target: this.getElementInfo(element),
      position: {
        x: event.pageX,
        y: event.pageY,
        clientX: event.clientX,
        clientY: event.clientY
      },
      modifiers: {
        ctrl: event.ctrlKey,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey
      },
      button: event.button
    };

    // Capture before and after states for assertions
    const beforeState = this.captureElementState(element);

    setTimeout(() => {
      const afterState = this.captureElementState(element);
      action.stateChange = this.compareStates(beforeState, afterState);

      // Generate assertions
      action.assertions = this.generateAssertions(action, element);
    }, 100);

    this.recordAction(action);

    // Check if click triggers navigation
    if (element.tagName === 'A' || element.type === 'submit') {
      this.captureNavigationIntent(element);
    }
  }

  handleInput(event) {
    const element = event.target;

    // Debounce input events
    if (this.inputDebounceTimer) {
      clearTimeout(this.inputDebounceTimer);
    }

    this.inputDebounceTimer = setTimeout(() => {
      const action = {
        id: this.generateActionId(),
        type: 'input',
        timestamp: Date.now(),
        target: this.getElementInfo(element),
        value: element.value,
        inputType: event.inputType,
        data: event.data,
        isComposing: event.isComposing
      };

      // Special handling for different input types
      if (element.type === 'file') {
        action.files = Array.from(element.files || []).map(f => ({
          name: f.name,
          size: f.size,
          type: f.type
        }));
      }

      if (element.type === 'password') {
        action.value = '***MASKED***';
        action.actualLength = element.value.length;
      }

      // Generate input validation assertions
      action.assertions = this.generateInputAssertions(element);

      this.recordAction(action);
    }, 300);
  }

  handleScroll(event) {
    const action = {
      id: this.generateActionId(),
      type: 'scroll',
      timestamp: Date.now(),
      target: event.target === document ? 'document' : this.getElementInfo(event.target),
      position: {
        x: window.scrollX || document.documentElement.scrollLeft,
        y: window.scrollY || document.documentElement.scrollTop
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };

    // Check for infinite scroll or lazy loading
    if (this.isNearBottom()) {
      action.nearBottom = true;
      action.assertions = [{
        type: 'lazy_load',
        message: 'Check for lazy-loaded content'
      }];
    }

    this.recordAction(action);
  }

  handleDragStart(event) {
    const element = event.target;
    this.dragStartInfo = {
      element: this.getElementInfo(element),
      position: {
        x: event.pageX,
        y: event.pageY
      },
      dataTransfer: event.dataTransfer ? {
        types: [...event.dataTransfer.types],
        effectAllowed: event.dataTransfer.effectAllowed
      } : null
    };
  }

  handleDrop(event) {
    event.preventDefault();
    const action = {
      id: this.generateActionId(),
      type: 'drag-drop',
      timestamp: Date.now(),
      source: this.dragStartInfo,
      target: this.getElementInfo(event.target),
      dropPosition: {
        x: event.pageX,
        y: event.pageY
      }
    };

    action.assertions = this.generateDragDropAssertions(action);
    this.recordAction(action);
  }

  // Helper methods
  getElementInfo(element) {
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(element);

    const info = {
      tagName: element.tagName.toLowerCase(),
      id: element.id,
      className: element.className,
      attributes: {},
      text: this.getElementText(element),
      value: element.value,
      selector: this.generateOptimalSelector(element),
      xpath: this.generateXPath(element),
      position: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      },
      styles: {
        display: computedStyle.display,
        visibility: computedStyle.visibility,
        opacity: computedStyle.opacity,
        zIndex: computedStyle.zIndex
      },
      inViewport: this.isInViewport(element),
      isVisible: this.isVisible(element)
    };

    // Capture important attributes
    ['data-testid', 'data-test', 'data-cy', 'aria-label', 'role', 'name', 'type', 'href', 'src', 'alt', 'title', 'placeholder'].forEach(attr => {
      if (element.hasAttribute(attr)) {
        info.attributes[attr] = element.getAttribute(attr);
      }
    });

    // Cache element info for performance
    this.elementCache.set(element, info);

    return info;
  }

  generateOptimalSelector(element) {
    // Priority order for selector generation
    const strategies = [
      // 1. Test IDs (most stable)
      () => {
        const testId = element.getAttribute('data-testid') ||
                      element.getAttribute('data-test') ||
                      element.getAttribute('data-cy');
        return testId ? `[data-testid="${testId}"], [data-test="${testId}"], [data-cy="${testId}"]` : null;
      },

      // 2. ID (if unique)
      () => element.id && this.isUnique(`#${element.id}`) ? `#${element.id}` : null,

      // 3. Unique attributes
      () => {
        const uniqueAttrs = ['name', 'aria-label', 'role'];
        for (const attr of uniqueAttrs) {
          const value = element.getAttribute(attr);
          if (value) {
            const selector = `[${attr}="${value}"]`;
            if (this.isUnique(selector)) return selector;
          }
        }
        return null;
      },

      // 4. Text content for buttons/links
      () => {
        if (['button', 'a'].includes(element.tagName.toLowerCase())) {
          const text = this.getElementText(element);
          if (text) {
            const selector = `${element.tagName.toLowerCase()}:contains("${text}")`;
            if (this.isUnique(selector)) return selector;
          }
        }
        return null;
      },

      // 5. CSS path with optimizations
      () => this.generateCssPath(element)
    ];

    for (const strategy of strategies) {
      const selector = strategy();
      if (selector) return selector;
    }

    return this.generateCssPath(element);
  }

  generateCssPath(element) {
    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      // Add ID if available
      if (current.id) {
        path.unshift(`#${current.id}`);
        break;
      }

      // Add classes (excluding dynamic ones)
      if (current.className && typeof current.className === 'string') {
        const classes = current.className
          .split(' ')
          .filter(c => c && !c.match(/^(is-|has-|ng-|v-|active|selected|hover|focus)/))
          .slice(0, 2); // Limit to 2 classes to avoid over-specificity

        if (classes.length) {
          selector += `.${classes.join('.')}`;
        }
      }

      // Add nth-child if necessary
      const siblings = current.parentNode ? [...current.parentNode.children] : [];
      const sameTagSiblings = siblings.filter(s => s.tagName === current.tagName);

      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  generateXPath(element) {
    if (!element) return '';

    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 0;
      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = current.nodeName.toLowerCase();
      const xpathIndex = index > 0 ? `[${index + 1}]` : '[1]';
      parts.unshift(`${tagName}${xpathIndex}`);

      current = current.parentNode;
      if (current === document.body) break;
    }

    return parts.length ? `//${parts.join('/')}` : '';
  }

  isUnique(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch {
      return false;
    }
  }

  isVisible(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return !!(
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      this.isInViewport(element)
    );
  }

  isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  }

  getElementText(element) {
    // Get visible text content
    const text = element.innerText || element.textContent || '';
    return text.trim().substring(0, 100); // Limit length
  }

  captureElementState(element) {
    if (!element) return null;

    return {
      attributes: [...element.attributes].reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
      value: element.value,
      checked: element.checked,
      selected: element.selected,
      text: this.getElementText(element),
      classList: [...element.classList],
      computedStyle: this.getImportantStyles(element)
    };
  }

  getImportantStyles(element) {
    const computed = window.getComputedStyle(element);
    const important = ['display', 'visibility', 'opacity', 'color', 'backgroundColor', 'width', 'height'];

    return important.reduce((acc, prop) => {
      acc[prop] = computed[prop];
      return acc;
    }, {});
  }

  compareStates(before, after) {
    if (!before || !after) return null;

    const changes = {};

    // Check attribute changes
    Object.keys(after.attributes).forEach(key => {
      if (before.attributes[key] !== after.attributes[key]) {
        changes.attributes = changes.attributes || {};
        changes.attributes[key] = {
          before: before.attributes[key],
          after: after.attributes[key]
        };
      }
    });

    // Check value changes
    if (before.value !== after.value) {
      changes.value = {
        before: before.value,
        after: after.value
      };
    }

    // Check class changes
    const addedClasses = after.classList.filter(c => !before.classList.includes(c));
    const removedClasses = before.classList.filter(c => !after.classList.includes(c));

    if (addedClasses.length || removedClasses.length) {
      changes.classes = {
        added: addedClasses,
        removed: removedClasses
      };
    }

    // Check style changes
    Object.keys(after.computedStyle).forEach(prop => {
      if (before.computedStyle[prop] !== after.computedStyle[prop]) {
        changes.styles = changes.styles || {};
        changes.styles[prop] = {
          before: before.computedStyle[prop],
          after: after.computedStyle[prop]
        };
      }
    });

    return Object.keys(changes).length ? changes : null;
  }

  generateAssertions(action, element) {
    const assertions = [];

    // Element visibility assertion
    assertions.push({
      type: 'visible',
      selector: action.target.selector,
      message: 'Element should be visible'
    });

    // State change assertions
    if (action.stateChange) {
      if (action.stateChange.classes?.added?.length) {
        assertions.push({
          type: 'has_class',
          selector: action.target.selector,
          classes: action.stateChange.classes.added,
          message: `Element should have classes: ${action.stateChange.classes.added.join(', ')}`
        });
      }

      if (action.stateChange.attributes) {
        Object.entries(action.stateChange.attributes).forEach(([attr, change]) => {
          assertions.push({
            type: 'attribute',
            selector: action.target.selector,
            attribute: attr,
            value: change.after,
            message: `Attribute ${attr} should be ${change.after}`
          });
        });
      }
    }

    return assertions;
  }

  generateInputAssertions(element) {
    const assertions = [];

    // Value assertion
    assertions.push({
      type: 'value',
      selector: this.generateOptimalSelector(element),
      value: element.value,
      message: `Input should have value: ${element.value}`
    });

    // Validation assertions
    if (element.validity && !element.validity.valid) {
      assertions.push({
        type: 'invalid',
        selector: this.generateOptimalSelector(element),
        validationMessage: element.validationMessage,
        message: 'Input should show validation error'
      });
    }

    return assertions;
  }

  generateDragDropAssertions(action) {
    return [
      {
        type: 'element_moved',
        sourceSelector: action.source.element.selector,
        targetSelector: action.target.selector,
        message: 'Element should be moved to target'
      }
    ];
  }

  recordAction(action) {
    // Add timing information
    if (this.lastActionTime) {
      action.timeSinceLastAction = action.timestamp - this.lastActionTime;
    }
    this.lastActionTime = action.timestamp;

    // Add session context
    action.sessionId = this.sessionId;
    action.url = window.location.href;
    action.pageTitle = document.title;

    // Store action
    this.actions.push(action);

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'ACTION_RECORDED',
      action
    });

    // Update UI
    this.updateRecordingIndicator(this.actions.length);
  }

  captureDOMSnapshot(label = 'snapshot') {
    const snapshot = {
      label,
      timestamp: Date.now(),
      html: document.documentElement.outerHTML,
      url: window.location.href,
      title: document.title
    };

    chrome.runtime.sendMessage({
      type: 'DOM_SNAPSHOT',
      snapshot
    });
  }

  captureNavigationIntent(element) {
    const intent = {
      timestamp: Date.now(),
      element: this.getElementInfo(element),
      expectedUrl: element.href || element.action,
      currentUrl: window.location.href
    };

    chrome.runtime.sendMessage({
      type: 'NAVIGATION_INTENT',
      intent
    });
  }

  isNearBottom() {
    const threshold = 200;
    return (window.innerHeight + window.scrollY) >= document.body.offsetHeight - threshold;
  }

  setupFileInputListeners() {
    document.querySelectorAll('input[type="file"]').forEach(input => {
      input.addEventListener('change', (event) => {
        const files = Array.from(event.target.files || []);
        const action = {
          id: this.generateActionId(),
          type: 'file_upload',
          timestamp: Date.now(),
          target: this.getElementInfo(event.target),
          files: files.map(f => ({
            name: f.name,
            size: f.size,
            type: f.type,
            lastModified: f.lastModified
          }))
        };

        this.recordAction(action);
      }, true);
    });
  }

  setupShadowDOMListeners() {
    // Find all shadow roots
    const findShadowRoots = (root) => {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            return node.shadowRoot ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
          }
        }
      );

      let node;
      while (node = walker.nextNode()) {
        if (node.shadowRoot && !this.shadowRoots.has(node.shadowRoot)) {
          this.shadowRoots.add(node.shadowRoot);
          this.attachShadowListeners(node.shadowRoot);
          findShadowRoots(node.shadowRoot); // Recursive for nested shadows
        }
      }
    };

    findShadowRoots(document.body);
  }

  attachShadowListeners(shadowRoot) {
    // Attach same event listeners to shadow DOM
    ['click', 'input', 'change', 'focus', 'blur'].forEach(eventType => {
      shadowRoot.addEventListener(eventType, this[`${eventType}Handler`], true);
    });
  }

  handleMutations(mutations) {
    const significantMutations = mutations.filter(m => {
      // Filter out insignificant mutations
      if (m.type === 'attributes' && ['class', 'style'].includes(m.attributeName)) {
        return false; // Too noisy
      }
      return true;
    });

    if (significantMutations.length > 0) {
      const mutationSummary = {
        timestamp: Date.now(),
        count: significantMutations.length,
        types: [...new Set(significantMutations.map(m => m.type))],
        targets: significantMutations.slice(0, 5).map(m => this.getElementInfo(m.target))
      };

      chrome.runtime.sendMessage({
        type: 'DOM_MUTATION',
        mutation: mutationSummary
      });
    }
  }

  handleIntersections(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        const action = {
          id: this.generateActionId(),
          type: 'element_visible',
          timestamp: Date.now(),
          target: this.getElementInfo(entry.target),
          intersectionRatio: entry.intersectionRatio
        };

        this.recordAction(action);
      }
    });
  }

  handlePerformanceEntries(entries) {
    const relevantEntries = entries.filter(e =>
      e.entryType === 'resource' &&
      (e.name.includes('/api/') || e.name.includes('/graphql'))
    );

    relevantEntries.forEach(entry => {
      this.networkRequests.push({
        type: 'performance',
        name: entry.name,
        duration: entry.duration,
        transferSize: entry.transferSize,
        timestamp: Date.now()
      });
    });
  }

  injectRecordingIndicator() {
    if (document.getElementById('flowscribe-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'flowscribe-indicator';
    indicator.innerHTML = `
      <style>
        #flowscribe-indicator {
          position: fixed;
          top: 10px;
          right: 10px;
          background: linear-gradient(45deg, #ff6b6b, #ff3838);
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
          box-shadow: 0 2px 10px rgba(255, 56, 56, 0.3);
          z-index: 999999;
          display: flex;
          align-items: center;
          gap: 8px;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        #flowscribe-indicator .dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          animation: blink 1.5s infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        #flowscribe-indicator .count {
          font-weight: bold;
        }
      </style>
      <div class="dot"></div>
      <span>Recording</span>
      <span class="count">0</span>
    `;

    document.body.appendChild(indicator);
  }

  updateRecordingIndicator(count) {
    const indicator = document.getElementById('flowscribe-indicator');
    if (indicator) {
      indicator.querySelector('.count').textContent = count;
    }
  }

  throttle(func, delay) {
    let timeoutId;
    let lastExecTime = 0;

    return function(...args) {
      const currentTime = Date.now();

      if (currentTime - lastExecTime > delay) {
        func.apply(this, args);
        lastExecTime = currentTime;
      } else {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          func.apply(this, args);
          lastExecTime = Date.now();
        }, delay - (currentTime - lastExecTime));
      }
    };
  }

  generateActionId() {
    return `action_${this.sessionId}_${++this.actionId}`;
  }

  generateRequestId() {
    return `req_${this.sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Additional event handlers
  handleDoubleClick(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'double_click',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      position: { x: event.pageX, y: event.pageY }
    });
  }

  handleMouseDown(event) {
    this.mouseDownTime = Date.now();
    this.mouseDownTarget = event.target;
  }

  handleMouseUp(event) {
    if (this.mouseDownTime && Date.now() - this.mouseDownTime > 500) {
      // Long press (mouse version)
      this.recordAction({
        id: this.generateActionId(),
        type: 'long_press',
        timestamp: Date.now(),
        target: this.getElementInfo(event.target),
        duration: Date.now() - this.mouseDownTime,
        inputType: 'mouse'
      });
    }
  }

  handleMouseOut(event) {
    // Track mouse leaving important elements
    if (event.target.getAttribute('role') === 'menu' || event.target.classList.contains('dropdown')) {
      this.recordAction({
        id: this.generateActionId(),
        type: 'mouse_leave',
        timestamp: Date.now(),
        target: this.getElementInfo(event.target)
      });
    }
  }

  handleMouseMove(event) {
    // Only track significant mouse movements (e.g., drawing, dragging)
    if (event.buttons > 0) {
      this.recordAction({
        id: this.generateActionId(),
        type: 'mouse_move',
        timestamp: Date.now(),
        position: { x: event.pageX, y: event.pageY },
        buttons: event.buttons
      });
    }
  }

  handleKeyUp(event) {
    // Track key releases for special keys
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
      this.recordAction({
        id: this.generateActionId(),
        type: 'key_up',
        timestamp: Date.now(),
        key: event.key,
        code: event.code
      });
    }
  }

  handleKeyPress(event) {
    // Track character input
    if (event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
      this.recordAction({
        id: this.generateActionId(),
        type: 'key_press',
        timestamp: Date.now(),
        key: event.key,
        target: this.getElementInfo(event.target)
      });
    }
  }

  handleChange(event) {
    const element = event.target;
    const action = {
      id: this.generateActionId(),
      type: 'change',
      timestamp: Date.now(),
      target: this.getElementInfo(element)
    };

    if (element.tagName === 'SELECT') {
      action.value = element.value;
      action.selectedText = element.options[element.selectedIndex]?.text;
    } else if (element.type === 'checkbox' || element.type === 'radio') {
      action.checked = element.checked;
      action.value = element.value;
    } else {
      action.value = element.value;
    }

    this.recordAction(action);
  }

  handleFocus(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'focus',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target)
    });
  }

  handleBlur(event) {
    // Important for form validation
    this.recordAction({
      id: this.generateActionId(),
      type: 'blur',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target)
    });
  }

  handleSubmit(event) {
    const form = event.target;
    const formData = new FormData(form);

    this.recordAction({
      id: this.generateActionId(),
      type: 'submit',
      timestamp: Date.now(),
      target: this.getElementInfo(form),
      formData: Object.fromEntries(formData.entries()),
      action: form.action,
      method: form.method
    });
  }

  handleReset(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'reset',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target)
    });
  }

  handleWheel(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'wheel',
      timestamp: Date.now(),
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      target: this.getElementInfo(event.target)
    });
  }

  handleResize(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'resize',
      timestamp: Date.now(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });
  }

  handleOrientationChange(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'orientation_change',
      timestamp: Date.now(),
      orientation: screen.orientation?.type || window.orientation
    });
  }

  handleDragOver(event) {
    event.preventDefault(); // Allow drop
  }

  handleDragEnd(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'drag_end',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target)
    });
  }

  // Media events
  handleMediaPlay(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'media_play',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      currentTime: event.target.currentTime
    });
  }

  handleMediaPause(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'media_pause',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      currentTime: event.target.currentTime
    });
  }

  handleMediaEnded(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'media_ended',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target)
    });
  }

  // Navigation events
  handlePopState(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'browser_back',
      timestamp: Date.now(),
      url: window.location.href
    });
  }

  handleHashChange(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'hash_change',
      timestamp: Date.now(),
      oldHash: new URL(event.oldURL).hash,
      newHash: new URL(event.newURL).hash
    });
  }

  handlePageShow(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'page_show',
      timestamp: Date.now(),
      persisted: event.persisted
    });
  }

  handlePageHide(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'page_hide',
      timestamp: Date.now(),
      persisted: event.persisted
    });
  }

  // ============================================
  // HIGH PRIORITY: Text Selection Tracking
  // ============================================
  handleSelectionChange(event) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      return; // No text selected
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length === 0 || selectedText.length > 1000) {
      return; // Ignore empty or very long selections
    }

    // Get the anchor node's parent element for context
    let targetElement = selection.anchorNode;
    if (targetElement && targetElement.nodeType === Node.TEXT_NODE) {
      targetElement = targetElement.parentElement;
    }

    this.recordAction({
      id: this.generateActionId(),
      type: 'text_selection',
      timestamp: Date.now(),
      selectedText: selectedText.substring(0, 200), // Limit length
      selectionLength: selectedText.length,
      target: targetElement ? this.getElementInfo(targetElement) : null,
      range: {
        startOffset: selection.anchorOffset,
        endOffset: selection.focusOffset
      }
    });
  }

  // ============================================
  // HIGH PRIORITY: Enhanced Hover Tracking
  // ============================================
  handleMouseOver(event) {
    const element = event.target;

    // Track hover on interactive elements
    const isInteractive = this.isInteractiveElement(element);
    const hasTooltip = element.title || element.getAttribute('data-tooltip') ||
                       element.getAttribute('data-tip') || element.getAttribute('aria-describedby');
    const hasDropdown = element.classList.contains('dropdown') ||
                        element.getAttribute('aria-haspopup') === 'true' ||
                        element.getAttribute('role') === 'menuitem';

    if (isInteractive || hasTooltip || hasDropdown) {
      // Debounce hover events on same element
      if (this.lastHoverElement === element &&
          Date.now() - this.lastHoverTime < 500) {
        return;
      }

      this.lastHoverElement = element;
      this.lastHoverTime = Date.now();

      this.recordAction({
        id: this.generateActionId(),
        type: 'hover',
        timestamp: Date.now(),
        target: this.getElementInfo(element),
        hasTooltip: !!hasTooltip,
        tooltipText: element.title || element.getAttribute('data-tooltip') || '',
        isDropdownTrigger: hasDropdown,
        elementType: this.getInteractiveElementType(element)
      });
    }
  }

  isInteractiveElement(element) {
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
    const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'option', 'checkbox', 'radio'];

    return interactiveTags.includes(element.tagName) ||
           interactiveRoles.includes(element.getAttribute('role')) ||
           element.onclick !== null ||
           element.hasAttribute('onclick') ||
           element.tabIndex >= 0 ||
           element.classList.contains('btn') ||
           element.classList.contains('button') ||
           window.getComputedStyle(element).cursor === 'pointer';
  }

  getInteractiveElementType(element) {
    if (element.tagName === 'A') return 'link';
    if (element.tagName === 'BUTTON' || element.getAttribute('role') === 'button') return 'button';
    if (element.tagName === 'INPUT') return `input-${element.type || 'text'}`;
    if (element.tagName === 'SELECT') return 'dropdown';
    if (element.getAttribute('role') === 'menuitem') return 'menu-item';
    if (element.getAttribute('role') === 'tab') return 'tab';
    return 'interactive';
  }

  // ============================================
  // HIGH PRIORITY: Modal/Dialog State Tracking
  // ============================================
  setupDialogTracking() {
    // Track native HTML5 dialog elements
    this.dialogObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'open') {
          const dialog = mutation.target;
          if (dialog.tagName === 'DIALOG') {
            const isOpen = dialog.hasAttribute('open');
            this.recordDialogStateChange(dialog, isOpen);
          }
        }

        // Track added/removed modal elements
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.checkForModalOpen(node);
          }
        });

        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.checkForModalClose(node);
          }
        });
      });
    });

    this.dialogObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'aria-hidden', 'class', 'style']
    });

    // Track existing dialogs
    document.querySelectorAll('dialog[open]').forEach((dialog) => {
      this.openDialogs.add(dialog);
    });
  }

  checkForModalOpen(element) {
    const isModal = this.isModalElement(element);
    if (isModal && !this.openDialogs.has(element)) {
      this.openDialogs.add(element);
      this.recordDialogStateChange(element, true);
    }
  }

  checkForModalClose(element) {
    if (this.openDialogs.has(element)) {
      this.openDialogs.delete(element);
      this.recordDialogStateChange(element, false);
    }
  }

  isModalElement(element) {
    if (element.tagName === 'DIALOG') return true;

    const role = element.getAttribute('role');
    if (role === 'dialog' || role === 'alertdialog') return true;

    const classList = element.className || '';
    const modalClasses = ['modal', 'dialog', 'popup', 'overlay', 'lightbox', 'drawer'];
    if (modalClasses.some(cls => classList.toLowerCase().includes(cls))) return true;

    // Check for modal styling
    const style = window.getComputedStyle(element);
    if (style.position === 'fixed' &&
        (style.zIndex > 1000 || element.style.zIndex > 1000)) {
      return true;
    }

    return false;
  }

  recordDialogStateChange(element, isOpen) {
    this.recordAction({
      id: this.generateActionId(),
      type: isOpen ? 'dialog_open' : 'dialog_close',
      timestamp: Date.now(),
      target: this.getElementInfo(element),
      dialogType: element.tagName === 'DIALOG' ? 'native' : 'custom',
      role: element.getAttribute('role') || 'dialog',
      ariaLabel: element.getAttribute('aria-label') ||
                 element.getAttribute('aria-labelledby') || ''
    });
  }

  // ============================================
  // HIGH PRIORITY: Form Validation Tracking
  // ============================================
  handleInvalid(event) {
    const element = event.target;

    this.recordAction({
      id: this.generateActionId(),
      type: 'validation_error',
      timestamp: Date.now(),
      target: this.getElementInfo(element),
      validationMessage: element.validationMessage,
      validity: {
        valueMissing: element.validity.valueMissing,
        typeMismatch: element.validity.typeMismatch,
        patternMismatch: element.validity.patternMismatch,
        tooLong: element.validity.tooLong,
        tooShort: element.validity.tooShort,
        rangeUnderflow: element.validity.rangeUnderflow,
        rangeOverflow: element.validity.rangeOverflow,
        stepMismatch: element.validity.stepMismatch,
        badInput: element.validity.badInput,
        customError: element.validity.customError
      },
      inputType: element.type,
      inputName: element.name,
      currentValue: element.type === 'password' ? '[MASKED]' : element.value
    });
  }

  // ============================================
  // HIGH PRIORITY: Auto-fill Detection
  // ============================================
  setupAutoFillDetection() {
    // Method 1: Track animation for webkit autofill
    const style = document.createElement('style');
    style.textContent = `
      @keyframes flowscribe-autofill-detect {
        from { opacity: 1; }
        to { opacity: 1; }
      }
      input:-webkit-autofill {
        animation-name: flowscribe-autofill-detect !important;
      }
    `;
    document.head.appendChild(style);

    // Method 2: Store initial values to compare later
    document.querySelectorAll('input, select, textarea').forEach((input) => {
      this.inputInitialValues.set(input, input.value);
    });

    // Method 3: Periodic check for autofill (fallback)
    this.autoFillCheckInterval = setInterval(() => {
      this.checkForAutoFill();
    }, 1000);
  }

  handleAnimationStart(event) {
    if (event.animationName === 'flowscribe-autofill-detect') {
      const element = event.target;
      this.recordAutoFill(element);
    }
  }

  checkForAutoFill() {
    document.querySelectorAll('input, select, textarea').forEach((input) => {
      const initialValue = this.inputInitialValues.get(input);
      const currentValue = input.value;

      // Check if value changed without user interaction
      if (initialValue !== currentValue &&
          !this.recentlyFocusedElements?.has(input)) {
        // Check for autofill pseudo-class
        try {
          if (input.matches(':-webkit-autofill') ||
              input.matches(':autofill')) {
            this.recordAutoFill(input);
            this.inputInitialValues.set(input, currentValue);
          }
        } catch (e) {
          // Selector not supported
        }
      }
    });
  }

  recordAutoFill(element) {
    // Avoid duplicate autofill records
    if (this.lastAutoFilledElement === element &&
        Date.now() - this.lastAutoFillTime < 1000) {
      return;
    }

    this.lastAutoFilledElement = element;
    this.lastAutoFillTime = Date.now();

    this.recordAction({
      id: this.generateActionId(),
      type: 'autofill',
      timestamp: Date.now(),
      target: this.getElementInfo(element),
      fieldName: element.name || element.id,
      fieldType: element.type,
      autofilledValue: element.type === 'password' ? '[MASKED]' : element.value
    });
  }

  // ============================================
  // HIGH PRIORITY: Full Keyboard Input Capture
  // ============================================
  handleKeyDown(event) {
    const element = event.target;
    const isTypingElement = ['INPUT', 'TEXTAREA'].includes(element.tagName) ||
                            element.isContentEditable;

    // Always track special keys and shortcuts
    if (event.ctrlKey || event.metaKey || event.altKey ||
        ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
         'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      this.recordAction({
        id: this.generateActionId(),
        type: 'key_down',
        timestamp: Date.now(),
        key: event.key,
        code: event.code,
        modifiers: {
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          alt: event.altKey,
          meta: event.metaKey
        },
        target: this.getElementInfo(element),
        isShortcut: event.ctrlKey || event.metaKey || event.altKey
      });
    }

    // Track typed characters for typing pattern
    if (isTypingElement && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      this.trackKeyboardInput(element, event.key);
    }
  }

  trackKeyboardInput(element, key) {
    const elementId = element.id || element.name || this.generateOptimalSelector(element);

    if (!this.keyboardInputBuffer.has(elementId)) {
      this.keyboardInputBuffer.set(elementId, {
        element: element,
        chars: [],
        startTime: Date.now()
      });
    }

    const buffer = this.keyboardInputBuffer.get(elementId);
    buffer.chars.push(key);
    buffer.lastTime = Date.now();

    // Flush buffer after 500ms of inactivity
    clearTimeout(buffer.flushTimeout);
    buffer.flushTimeout = setTimeout(() => {
      this.flushKeyboardBuffer(elementId);
    }, 500);
  }

  flushKeyboardBuffer(elementId) {
    const buffer = this.keyboardInputBuffer.get(elementId);
    if (!buffer || buffer.chars.length === 0) return;

    const typedText = buffer.chars.join('');

    this.recordAction({
      id: this.generateActionId(),
      type: 'keyboard_input',
      timestamp: buffer.startTime,
      target: this.getElementInfo(buffer.element),
      typedText: buffer.element.type === 'password' ? '[MASKED]' : typedText,
      charCount: typedText.length,
      duration: buffer.lastTime - buffer.startTime,
      typingSpeed: typedText.length / ((buffer.lastTime - buffer.startTime) / 1000) // chars per second
    });

    this.keyboardInputBuffer.delete(elementId);
  }

  // ============================================
  // MEDIUM PRIORITY: Gesture Detection
  // ============================================
  handleTouchStart(event) {
    this.touchState.startTime = Date.now();
    this.touchState.startTouches = Array.from(event.touches).map(t => ({
      x: t.pageX,
      y: t.pageY,
      identifier: t.identifier
    }));

    // Detect pinch start (2 fingers)
    if (event.touches.length === 2) {
      this.touchState.initialPinchDistance = this.getPinchDistance(event.touches);
    }

    // Detect double-tap
    if (this.touchState.lastTapTime &&
        Date.now() - this.touchState.lastTapTime < 300 &&
        this.touchState.lastTapTarget === event.target) {
      this.recordAction({
        id: this.generateActionId(),
        type: 'double_tap',
        timestamp: Date.now(),
        target: this.getElementInfo(event.target),
        position: { x: event.touches[0].pageX, y: event.touches[0].pageY }
      });
      this.touchState.lastTapTime = null;
      return;
    }

    this.recordAction({
      id: this.generateActionId(),
      type: 'touch_start',
      timestamp: Date.now(),
      touches: this.touchState.startTouches,
      target: this.getElementInfo(event.target),
      touchCount: event.touches.length
    });
  }

  handleTouchEnd(event) {
    const duration = Date.now() - this.touchState.startTime;
    const startTouch = this.touchState.startTouches[0];
    const endTouch = event.changedTouches[0];

    if (!startTouch) return;

    const deltaX = endTouch.pageX - startTouch.x;
    const deltaY = endTouch.pageY - startTouch.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Detect swipe gesture
    if (distance > 50 && duration < 500) {
      const direction = this.getSwipeDirection(deltaX, deltaY);
      this.recordAction({
        id: this.generateActionId(),
        type: 'swipe',
        timestamp: Date.now(),
        direction: direction,
        distance: Math.round(distance),
        velocity: distance / duration,
        startPosition: { x: startTouch.x, y: startTouch.y },
        endPosition: { x: endTouch.pageX, y: endTouch.pageY },
        target: this.getElementInfo(event.target)
      });
    }
    // Detect long press
    else if (duration > 500 && distance < 20) {
      this.recordAction({
        id: this.generateActionId(),
        type: 'long_press',
        timestamp: Date.now(),
        duration: duration,
        target: this.getElementInfo(event.target),
        position: { x: endTouch.pageX, y: endTouch.pageY }
      });
    }
    // Regular tap
    else if (distance < 20 && duration < 300) {
      this.touchState.lastTapTime = Date.now();
      this.touchState.lastTapTarget = event.target;

      this.recordAction({
        id: this.generateActionId(),
        type: 'tap',
        timestamp: Date.now(),
        target: this.getElementInfo(event.target),
        position: { x: endTouch.pageX, y: endTouch.pageY }
      });
    }

    // Reset pinch state
    this.touchState.initialPinchDistance = null;
  }

  handleTouchMove(event) {
    // Detect pinch/zoom gesture
    if (event.touches.length === 2 && this.touchState.initialPinchDistance) {
      const currentDistance = this.getPinchDistance(event.touches);
      const scale = currentDistance / this.touchState.initialPinchDistance;

      if (Math.abs(scale - 1) > 0.1) {
        this.recordAction({
          id: this.generateActionId(),
          type: 'pinch_zoom',
          timestamp: Date.now(),
          scale: scale.toFixed(2),
          direction: scale > 1 ? 'zoom_in' : 'zoom_out',
          center: this.getPinchCenter(event.touches),
          target: this.getElementInfo(event.target)
        });

        // Update initial distance for continuous pinch
        this.touchState.initialPinchDistance = currentDistance;
      }
    } else {
      // Regular touch move
      this.recordAction({
        id: this.generateActionId(),
        type: 'touch_move',
        timestamp: Date.now(),
        touches: Array.from(event.touches).map(t => ({
          x: t.pageX,
          y: t.pageY
        })),
        target: this.getElementInfo(event.target)
      });
    }
  }

  getPinchDistance(touches) {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getPinchCenter(touches) {
    return {
      x: (touches[0].pageX + touches[1].pageX) / 2,
      y: (touches[0].pageY + touches[1].pageY) / 2
    };
  }

  getSwipeDirection(deltaX, deltaY) {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (absX > absY) {
      return deltaX > 0 ? 'right' : 'left';
    } else {
      return deltaY > 0 ? 'down' : 'up';
    }
  }

  // ============================================
  // MEDIUM PRIORITY: Contenteditable Support
  // ============================================
  setupContentEditableTracking() {
    // Find all contenteditable elements
    const contentEditables = document.querySelectorAll('[contenteditable="true"]');

    contentEditables.forEach((element) => {
      this.attachContentEditableListeners(element);
    });

    // Watch for new contenteditable elements
    this.contentEditableObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.getAttribute('contenteditable') === 'true') {
              this.attachContentEditableListeners(node);
            }
            node.querySelectorAll?.('[contenteditable="true"]').forEach((el) => {
              this.attachContentEditableListeners(el);
            });
          }
        });
      });
    });

    this.contentEditableObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  attachContentEditableListeners(element) {
    if (element._flowscribeContentEditableTracked) return;
    element._flowscribeContentEditableTracked = true;

    let initialContent = element.innerHTML;
    let inputTimeout;

    element.addEventListener('input', () => {
      clearTimeout(inputTimeout);
      inputTimeout = setTimeout(() => {
        const newContent = element.innerHTML;
        if (newContent !== initialContent) {
          this.recordAction({
            id: this.generateActionId(),
            type: 'contenteditable_change',
            timestamp: Date.now(),
            target: this.getElementInfo(element),
            textContent: element.textContent.substring(0, 500),
            htmlLength: newContent.length,
            hasFormatting: newContent !== element.textContent
          });
          initialContent = newContent;
        }
      }, 500);
    });

    // Track formatting commands
    element.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) &&
          ['b', 'i', 'u', 'z', 'y'].includes(event.key.toLowerCase())) {
        this.recordAction({
          id: this.generateActionId(),
          type: 'rich_text_format',
          timestamp: Date.now(),
          target: this.getElementInfo(element),
          command: this.getFormatCommand(event.key.toLowerCase()),
          modifiers: { ctrl: event.ctrlKey, meta: event.metaKey }
        });
      }
    });
  }

  getFormatCommand(key) {
    const commands = {
      'b': 'bold',
      'i': 'italic',
      'u': 'underline',
      'z': 'undo',
      'y': 'redo'
    };
    return commands[key] || key;
  }

  // ============================================
  // MEDIUM PRIORITY: Autocomplete Selection
  // ============================================
  setupAutocompleteTracking() {
    // Track datalist selections
    document.querySelectorAll('input[list]').forEach((input) => {
      this.attachDatalistListener(input);
    });

    // Watch for custom autocomplete dropdowns
    this.autocompleteObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for common autocomplete patterns
            if (this.isAutocompleteDropdown(node)) {
              this.attachAutocompleteDropdownListener(node);
            }
          }
        });
      });
    });

    this.autocompleteObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  attachDatalistListener(input) {
    if (input._flowscribeDatalistTracked) return;
    input._flowscribeDatalistTracked = true;

    let previousValue = input.value;

    input.addEventListener('change', () => {
      const datalist = document.getElementById(input.getAttribute('list'));
      if (datalist) {
        const selectedOption = Array.from(datalist.options).find(
          opt => opt.value === input.value
        );

        if (selectedOption && input.value !== previousValue) {
          this.recordAction({
            id: this.generateActionId(),
            type: 'autocomplete_select',
            timestamp: Date.now(),
            target: this.getElementInfo(input),
            selectedValue: input.value,
            selectedLabel: selectedOption.label || selectedOption.value,
            source: 'datalist'
          });
          previousValue = input.value;
        }
      }
    });
  }

  isAutocompleteDropdown(element) {
    const classList = element.className || '';
    const autocompletePatterns = [
      'autocomplete', 'suggestions', 'typeahead', 'dropdown-menu',
      'search-results', 'options-list', 'combobox-list'
    ];

    return autocompletePatterns.some(pattern =>
      classList.toLowerCase().includes(pattern)) ||
      element.getAttribute('role') === 'listbox';
  }

  attachAutocompleteDropdownListener(dropdown) {
    dropdown.addEventListener('click', (event) => {
      const option = event.target.closest('[role="option"], li, .option, .suggestion');
      if (option) {
        this.recordAction({
          id: this.generateActionId(),
          type: 'autocomplete_select',
          timestamp: Date.now(),
          target: this.getElementInfo(option),
          selectedValue: option.textContent.trim(),
          selectedIndex: Array.from(dropdown.children).indexOf(option),
          source: 'custom'
        });
      }
    }, true);
  }

  // ============================================
  // MEDIUM PRIORITY: Slider/Range Tracking
  // ============================================
  setupSliderTracking() {
    document.querySelectorAll('input[type="range"]').forEach((slider) => {
      this.attachSliderListeners(slider);
    });

    // Watch for new sliders
    this.sliderObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches('input[type="range"]')) {
              this.attachSliderListeners(node);
            }
            node.querySelectorAll?.('input[type="range"]').forEach((slider) => {
              this.attachSliderListeners(slider);
            });
          }
        });
      });
    });

    this.sliderObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  attachSliderListeners(slider) {
    if (slider._flowscribeSliderTracked) return;
    slider._flowscribeSliderTracked = true;

    slider.addEventListener('mousedown', () => {
      this.sliderState.set(slider, {
        startValue: slider.value,
        startTime: Date.now(),
        isDragging: true
      });
    });

    slider.addEventListener('touchstart', () => {
      this.sliderState.set(slider, {
        startValue: slider.value,
        startTime: Date.now(),
        isDragging: true
      });
    });

    const recordSliderChange = () => {
      const state = this.sliderState.get(slider);
      if (state && state.isDragging) {
        this.recordAction({
          id: this.generateActionId(),
          type: 'slider_change',
          timestamp: Date.now(),
          target: this.getElementInfo(slider),
          startValue: parseFloat(state.startValue),
          endValue: parseFloat(slider.value),
          min: parseFloat(slider.min) || 0,
          max: parseFloat(slider.max) || 100,
          step: parseFloat(slider.step) || 1,
          duration: Date.now() - state.startTime,
          percentChange: ((slider.value - state.startValue) / (slider.max - slider.min)) * 100
        });
        state.isDragging = false;
      }
    };

    slider.addEventListener('mouseup', recordSliderChange);
    slider.addEventListener('touchend', recordSliderChange);
    slider.addEventListener('change', recordSliderChange);
  }

  // ============================================
  // MEDIUM PRIORITY: Date/Time Picker Tracking
  // ============================================
  setupDateTimePickerTracking() {
    const dateTimeTypes = ['date', 'time', 'datetime-local', 'month', 'week'];

    dateTimeTypes.forEach((type) => {
      document.querySelectorAll(`input[type="${type}"]`).forEach((input) => {
        this.attachDateTimeListener(input);
      });
    });

    // Watch for new date/time inputs
    this.dateTimeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            dateTimeTypes.forEach((type) => {
              if (node.matches?.(`input[type="${type}"]`)) {
                this.attachDateTimeListener(node);
              }
              node.querySelectorAll?.(`input[type="${type}"]`).forEach((input) => {
                this.attachDateTimeListener(input);
              });
            });
          }
        });
      });
    });

    this.dateTimeObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  attachDateTimeListener(input) {
    if (input._flowscribeDateTimeTracked) return;
    input._flowscribeDateTimeTracked = true;

    let previousValue = input.value;

    input.addEventListener('change', () => {
      if (input.value !== previousValue) {
        this.recordAction({
          id: this.generateActionId(),
          type: 'datetime_select',
          timestamp: Date.now(),
          target: this.getElementInfo(input),
          inputType: input.type,
          previousValue: previousValue,
          newValue: input.value,
          formattedValue: this.formatDateTimeValue(input.type, input.value)
        });
        previousValue = input.value;
      }
    });
  }

  formatDateTimeValue(type, value) {
    if (!value) return '';

    try {
      switch (type) {
        case 'date':
          return new Date(value).toLocaleDateString();
        case 'time':
          return value;
        case 'datetime-local':
          return new Date(value).toLocaleString();
        case 'month':
          const [year, month] = value.split('-');
          return `${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`;
        case 'week':
          return value;
        default:
          return value;
      }
    } catch (e) {
      return value;
    }
  }

  // ============================================
  // LOW PRIORITY: Console Error Capture
  // ============================================
  setupConsoleErrorCapture() {
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      this.captureConsoleMessage('error', args);
      originalError.apply(console, args);
    };

    console.warn = (...args) => {
      this.captureConsoleMessage('warning', args);
      originalWarn.apply(console, args);
    };

    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.recordAction({
        id: this.generateActionId(),
        type: 'javascript_error',
        timestamp: Date.now(),
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.recordAction({
        id: this.generateActionId(),
        type: 'unhandled_promise_rejection',
        timestamp: Date.now(),
        reason: String(event.reason),
        stack: event.reason?.stack
      });
    });
  }

  captureConsoleMessage(level, args) {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    this.consoleErrors.push({
      id: this.generateActionId(),
      type: `console_${level}`,
      timestamp: Date.now(),
      message: message.substring(0, 500),
      url: window.location.href
    });

    // Also record as action for significant errors
    if (level === 'error') {
      this.recordAction({
        id: this.generateActionId(),
        type: 'console_error',
        timestamp: Date.now(),
        message: message.substring(0, 500)
      });
    }
  }

  // ============================================
  // LOW PRIORITY: Clipboard Content Capture
  // ============================================
  handleCopy(event) {
    const selection = window.getSelection();
    const copiedText = selection ? selection.toString() : '';

    this.recordAction({
      id: this.generateActionId(),
      type: 'copy',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      copiedText: copiedText.substring(0, 200), // Limit for privacy
      textLength: copiedText.length
    });
  }

  handleCut(event) {
    const selection = window.getSelection();
    const cutText = selection ? selection.toString() : '';

    this.recordAction({
      id: this.generateActionId(),
      type: 'cut',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      cutText: cutText.substring(0, 200),
      textLength: cutText.length
    });
  }

  handlePaste(event) {
    let pastedText = '';

    // Try to get pasted content from clipboard data
    if (event.clipboardData) {
      pastedText = event.clipboardData.getData('text/plain');
    }

    this.recordAction({
      id: this.generateActionId(),
      type: 'paste',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      pastedText: pastedText.substring(0, 200), // Limit for privacy
      textLength: pastedText.length,
      hasHtml: event.clipboardData?.types?.includes('text/html'),
      hasFiles: event.clipboardData?.files?.length > 0
    });
  }

  // ============================================
  // LOW PRIORITY: Window Focus/Blur Tracking
  // ============================================
  handleWindowFocus(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'window_focus',
      timestamp: Date.now(),
      url: window.location.href,
      title: document.title,
      wasHidden: document.hidden
    });
  }

  handleWindowBlur(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'window_blur',
      timestamp: Date.now(),
      url: window.location.href,
      activeElement: document.activeElement ?
        this.getElementInfo(document.activeElement) : null
    });
  }

  // ============================================
  // LOW PRIORITY: Context Menu Selection
  // ============================================
  handleRightClick(event) {
    this.recordAction({
      id: this.generateActionId(),
      type: 'right_click',
      timestamp: Date.now(),
      target: this.getElementInfo(event.target),
      position: { x: event.pageX, y: event.pageY },
      selectedText: window.getSelection()?.toString() || ''
    });

    // Track when context menu closes and user might have selected an option
    // This is limited because we can't capture native context menu selections
    this.contextMenuOpenTime = Date.now();
    this.contextMenuTarget = event.target;
  }

  // ============================================
  // Utility: Debounce function
  // ============================================
  debounce(func, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  stopRecording() {
    this.isRecording = false;

    // Clean up event listeners
    Object.keys(this).forEach(key => {
      if (key.endsWith('Handler')) {
        document.removeEventListener(key.replace('Handler', ''), this[key], true);
      }
    });

    // Clean up window event listeners
    window.removeEventListener('focus', this.handleWindowFocus);
    window.removeEventListener('blur', this.handleWindowBlur);

    // Clean up observers
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    if (this.dialogObserver) {
      this.dialogObserver.disconnect();
    }
    if (this.contentEditableObserver) {
      this.contentEditableObserver.disconnect();
    }
    if (this.autocompleteObserver) {
      this.autocompleteObserver.disconnect();
    }
    if (this.sliderObserver) {
      this.sliderObserver.disconnect();
    }
    if (this.dateTimeObserver) {
      this.dateTimeObserver.disconnect();
    }

    // Clean up intervals
    if (this.autoFillCheckInterval) {
      clearInterval(this.autoFillCheckInterval);
    }

    // Flush any pending keyboard input buffers
    this.keyboardInputBuffer.forEach((buffer, elementId) => {
      this.flushKeyboardBuffer(elementId);
    });

    // Remove recording indicator
    const indicator = document.getElementById('flowscribe-indicator');
    if (indicator) {
      indicator.remove();
    }

    // Send final data
    chrome.runtime.sendMessage({
      type: 'RECORDING_STOPPED',
      data: {
        actions: this.actions,
        assertions: this.assertions,
        networkRequests: this.networkRequests,
        pageStates: this.pageStates,
        consoleErrors: this.consoleErrors,
        duration: Date.now() - this.startTime
      }
    });

    console.log('🛑 Enhanced recording stopped');
  }
}

// Initialize recorder
const enhancedRecorder = new EnhancedRecorder();

// Listen for messages from extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_ENHANCED_RECORDING':
      enhancedRecorder.startRecording();
      sendResponse({ success: true });
      break;
    case 'STOP_ENHANCED_RECORDING':
      enhancedRecorder.stopRecording();
      sendResponse({ success: true, data: enhancedRecorder.actions });
      break;
  }
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnhancedRecorder;
}