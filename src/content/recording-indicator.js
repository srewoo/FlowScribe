/**
 * Draggable Floating Recording Indicator
 * Shows a pill-shaped indicator when recording is active
 */

class RecordingIndicator {
  constructor() {
    this.indicator = null;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.position = this.loadPosition();
  }

  /**
   * Create and inject the floating indicator
   */
  create() {
    if (this.indicator) return;

    // Create indicator container
    this.indicator = document.createElement('div');
    this.indicator.id = 'flowscribe-recording-indicator';
    this.indicator.className = 'flowscribe-floating-indicator';

    // Create content
    this.indicator.innerHTML = `
      <div class="flowscribe-indicator-content">
        <div class="flowscribe-pulse-dot"></div>
        <span class="flowscribe-indicator-text">FlowScribe Recording</span>
        <span class="flowscribe-action-count">0 actions</span>
      </div>
    `;

    // Inject styles
    this.injectStyles();

    // Set initial position
    this.indicator.style.left = this.position.x + 'px';
    this.indicator.style.top = this.position.y + 'px';

    // Add event listeners
    this.setupEventListeners();

    // Add to page
    document.body.appendChild(this.indicator);

    // Animate in
    setTimeout(() => {
      this.indicator.classList.add('flowscribe-visible');
    }, 100);
  }

  /**
   * Inject CSS styles for the indicator
   */
  injectStyles() {
    if (document.getElementById('flowscribe-indicator-styles')) return;

    const style = document.createElement('style');
    style.id = 'flowscribe-indicator-styles';
    style.textContent = `
      .flowscribe-floating-indicator {
        position: fixed;
        z-index: 2147483647;
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        padding: 10px 16px;
        border-radius: 9999px;
        box-shadow: 0 10px 25px -5px rgba(239, 68, 68, 0.3),
                    0 8px 10px -6px rgba(239, 68, 68, 0.2);
        cursor: move;
        user-select: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        backdrop-filter: blur(10px);
        border: 2px solid rgba(255, 255, 255, 0.2);
        transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.3s ease;
        opacity: 0;
        transform: translateY(-10px);
      }

      .flowscribe-floating-indicator.flowscribe-visible {
        opacity: 1;
        transform: translateY(0);
      }

      .flowscribe-floating-indicator:hover {
        transform: scale(1.05);
        box-shadow: 0 20px 35px -5px rgba(239, 68, 68, 0.4),
                    0 10px 15px -6px rgba(239, 68, 68, 0.3);
      }

      .flowscribe-floating-indicator.flowscribe-dragging {
        cursor: grabbing;
        box-shadow: 0 25px 50px -12px rgba(239, 68, 68, 0.5);
        transform: scale(1.05);
      }

      .flowscribe-indicator-content {
        display: flex;
        align-items: center;
        gap: 10px;
        white-space: nowrap;
      }

      .flowscribe-pulse-dot {
        width: 10px;
        height: 10px;
        background: white;
        border-radius: 50%;
        animation: flowscribe-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        flex-shrink: 0;
      }

      @keyframes flowscribe-pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.6;
          transform: scale(1.2);
        }
      }

      .flowscribe-indicator-text {
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.2px;
      }

      .flowscribe-action-count {
        font-size: 13px;
        font-weight: 500;
        background: rgba(255, 255, 255, 0.2);
        padding: 2px 8px;
        border-radius: 9999px;
        backdrop-filter: blur(10px);
      }

      /* Paused state */
      .flowscribe-floating-indicator.flowscribe-paused {
        background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      }

      .flowscribe-floating-indicator.flowscribe-paused .flowscribe-pulse-dot {
        animation: none;
        opacity: 1;
      }

      /* Mobile responsive */
      @media (max-width: 640px) {
        .flowscribe-floating-indicator {
          padding: 8px 12px;
        }

        .flowscribe-indicator-text {
          font-size: 12px;
        }

        .flowscribe-action-count {
          font-size: 11px;
          padding: 2px 6px;
        }

        .flowscribe-pulse-dot {
          width: 8px;
          height: 8px;
        }
      }

      /* Smooth drag animation */
      .flowscribe-floating-indicator.flowscribe-smooth-drag {
        transition: left 0.1s ease, top 0.1s ease;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Setup drag and click event listeners
   */
  setupEventListeners() {
    let clickStartTime = 0;
    let clickStartPos = { x: 0, y: 0 };

    // Mouse events
    this.indicator.addEventListener('mousedown', (e) => {
      e.preventDefault();
      clickStartTime = Date.now();
      clickStartPos = { x: e.clientX, y: e.clientY };
      this.startDrag(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        e.preventDefault();
        this.drag(e.clientX, e.clientY);
      }
    });

    document.addEventListener('mouseup', (e) => {
      if (this.isDragging) {
        this.stopDrag();

        // Check if it was a click (not a drag)
        const timeDiff = Date.now() - clickStartTime;
        const distance = Math.sqrt(
          Math.pow(e.clientX - clickStartPos.x, 2) +
          Math.pow(e.clientY - clickStartPos.y, 2)
        );

        if (timeDiff < 300 && distance < 10) {
          this.handleClick();
        }
      }
    });

    // Touch events for mobile
    this.indicator.addEventListener('touchstart', (e) => {
      e.preventDefault();
      clickStartTime = Date.now();
      const touch = e.touches[0];
      clickStartPos = { x: touch.clientX, y: touch.clientY };
      this.startDrag(touch.clientX, touch.clientY);
    });

    document.addEventListener('touchmove', (e) => {
      if (this.isDragging && e.touches.length > 0) {
        e.preventDefault();
        const touch = e.touches[0];
        this.drag(touch.clientX, touch.clientY);
      }
    });

    document.addEventListener('touchend', (e) => {
      if (this.isDragging) {
        this.stopDrag();

        // Check if it was a tap
        const timeDiff = Date.now() - clickStartTime;
        const touch = e.changedTouches[0];
        const distance = Math.sqrt(
          Math.pow(touch.clientX - clickStartPos.x, 2) +
          Math.pow(touch.clientY - clickStartPos.y, 2)
        );

        if (timeDiff < 300 && distance < 10) {
          this.handleClick();
        }
      }
    });
  }

  /**
   * Start dragging
   */
  startDrag(clientX, clientY) {
    this.isDragging = true;
    this.indicator.classList.add('flowscribe-dragging');
    this.indicator.classList.remove('flowscribe-smooth-drag');

    const rect = this.indicator.getBoundingClientRect();
    this.dragOffset = {
      x: clientX - rect.left,
      y: clientY - rect.top
    };

    document.body.style.cursor = 'grabbing';
  }

  /**
   * Handle dragging movement
   */
  drag(clientX, clientY) {
    if (!this.isDragging) return;

    let x = clientX - this.dragOffset.x;
    let y = clientY - this.dragOffset.y;

    // Keep within viewport bounds
    const rect = this.indicator.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;

    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));

    this.indicator.style.left = x + 'px';
    this.indicator.style.top = y + 'px';

    this.position = { x, y };
  }

  /**
   * Stop dragging
   */
  stopDrag() {
    this.isDragging = false;
    this.indicator.classList.remove('flowscribe-dragging');
    this.indicator.classList.add('flowscribe-smooth-drag');
    document.body.style.cursor = '';

    // Save position
    this.savePosition();

    // Snap to edge if close
    this.snapToEdge();
  }

  /**
   * Snap to edge if within threshold
   */
  snapToEdge() {
    const rect = this.indicator.getBoundingClientRect();
    const threshold = 20;
    const snapDuration = 200;

    let x = this.position.x;
    let y = this.position.y;

    // Snap to left edge
    if (x < threshold) {
      x = 10;
    }

    // Snap to right edge
    if (x > window.innerWidth - rect.width - threshold) {
      x = window.innerWidth - rect.width - 10;
    }

    // Snap to top edge
    if (y < threshold) {
      y = 10;
    }

    // Snap to bottom edge
    if (y > window.innerHeight - rect.height - threshold) {
      y = window.innerHeight - rect.height - 10;
    }

    if (x !== this.position.x || y !== this.position.y) {
      this.indicator.style.transition = `left ${snapDuration}ms ease, top ${snapDuration}ms ease`;
      this.indicator.style.left = x + 'px';
      this.indicator.style.top = y + 'px';
      this.position = { x, y };

      setTimeout(() => {
        this.indicator.style.transition = '';
      }, snapDuration);

      this.savePosition();
    }
  }

  /**
   * Handle click on indicator
   */
  handleClick() {
    // Open popup or show quick actions
    console.log('FlowScribe indicator clicked');
    // You can add custom behavior here, like opening the extension popup
    // or showing a quick action menu
  }

  /**
   * Update action count
   */
  updateActionCount(count) {
    if (!this.indicator) return;
    const countElement = this.indicator.querySelector('.flowscribe-action-count');
    if (countElement) {
      countElement.textContent = `${count} action${count !== 1 ? 's' : ''}`;
    }
  }

  /**
   * Set paused state
   */
  setPaused(paused) {
    if (!this.indicator) return;
    if (paused) {
      this.indicator.classList.add('flowscribe-paused');
      const textElement = this.indicator.querySelector('.flowscribe-indicator-text');
      if (textElement) {
        textElement.textContent = 'FlowScribe Paused';
      }
    } else {
      this.indicator.classList.remove('flowscribe-paused');
      const textElement = this.indicator.querySelector('.flowscribe-indicator-text');
      if (textElement) {
        textElement.textContent = 'FlowScribe Recording';
      }
    }
  }

  /**
   * Remove the indicator
   */
  remove() {
    if (this.indicator) {
      this.indicator.classList.remove('flowscribe-visible');
      setTimeout(() => {
        if (this.indicator && this.indicator.parentNode) {
          this.indicator.parentNode.removeChild(this.indicator);
        }
        this.indicator = null;
      }, 300);
    }
  }

  /**
   * Load saved position from localStorage
   */
  loadPosition() {
    try {
      const saved = localStorage.getItem('flowscribe-indicator-position');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load indicator position:', e);
    }

    // Default position (top-right)
    return {
      x: window.innerWidth - 250,
      y: 20
    };
  }

  /**
   * Save position to localStorage
   */
  savePosition() {
    try {
      localStorage.setItem('flowscribe-indicator-position', JSON.stringify(this.position));
    } catch (e) {
      console.warn('Failed to save indicator position:', e);
    }
  }

  /**
   * Update position on window resize
   */
  handleResize() {
    if (!this.indicator) return;

    const rect = this.indicator.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;

    let x = Math.min(this.position.x, maxX);
    let y = Math.min(this.position.y, maxY);

    x = Math.max(0, x);
    y = Math.max(0, y);

    if (x !== this.position.x || y !== this.position.y) {
      this.indicator.style.left = x + 'px';
      this.indicator.style.top = y + 'px';
      this.position = { x, y };
      this.savePosition();
    }
  }
}

// Export for use in content script
if (typeof window !== 'undefined') {
  window.RecordingIndicator = RecordingIndicator;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RecordingIndicator;
}
