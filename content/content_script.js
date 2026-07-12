/**
 * Remapad — Content Script
 * Compatible with Chrome and Firefox MV3.
 * Runs on streaming sites. Polls Gamepad API, translates inputs to page actions,
 * and manages the injected bottom HUD mapping overlay.
 */

;(function () {
  'use strict';

  if (window.__remapadInjected) return;
  window.__remapadInjected = true;

  const api = typeof chrome !== 'undefined' ? chrome : browser;

  // ─── Constants & Settings ──────────────────────────────────────────────────

  const POLL_INTERVAL_MS = 50;
  const DEADZONE = 0.3;
  const AXIS_REPEAT_DELAY_MS = 150;

  const DEFAULT_PROFILE = {
    "0": "click",          // A / Cross
    "1": "back",           // B / Circle
    "2": "fullscreen",     // X / Square
    "3": "search",         // Y / Triangle
    "4": "seek_backward",  // L1
    "5": "seek_forward",   // R1
    "6": "volume_down",    // L2
    "7": "volume_up",      // R2
    "8": "toggle_play",    // Select
    "9": "quick_map",      // Start
    "12": "scroll_up",     // D-Pad Up
    "13": "scroll_down",   // D-Pad Down
    "14": "scroll_left",   // D-Pad Left
    "15": "scroll_right"   // D-Pad Right
  };

  const GLYPHS = {
    playstation: {
      "0": "✕", "1": "○", "2": "□", "3": "△",
      "4": "L1", "5": "R1", "6": "L2", "7": "R2",
      "8": "Share", "9": "☰", "10": "L3", "11": "R3", "12": "↑", "13": "↓", "14": "←", "15": "→"
    },
    xbox: {
      "0": "A", "1": "B", "2": "X", "3": "Y",
      "4": "LB", "5": "RB", "6": "LT", "7": "RT",
      "8": "View", "9": "☰", "10": "L3", "11": "R3", "12": "↑", "13": "↓", "14": "←", "15": "→"
    },
    nintendo: {
      "0": "B", "1": "A", "2": "Y", "3": "X",
      "4": "L", "5": "R", "6": "ZL", "7": "ZR",
      "8": "Minus", "9": "Plus", "10": "L3", "11": "R3", "12": "↑", "13": "↓", "14": "←", "15": "→"
    }
  };

  const ACTION_LABELS = {
    click: "Select",
    back: "Back",
    search: "Search",
    fullscreen: "Fullscreen",
    toggle_play: "Play/Pause",
    scroll_up: "Scroll Up",
    scroll_down: "Scroll Down",
    scroll_left: "Scroll Left",
    scroll_right: "Scroll Right",
    volume_up: "Volume Up",
    volume_down: "Volume Down",
    seek_forward: "Forward",
    seek_backward: "Rewind",
    open_options: "Options",
    next_tab: "Next Tab",
    prev_tab: "Prev Tab",
    close_tab: "Close Tab",
    focus_next: "Focus Next",
    focus_prev: "Focus Previous",
    quick_map: "Quick Map",
    toggle_hud: "Toggle Navigation Guide",
    dom_action: "DOM Action"
  };

  const DOM_ACTION_OPERATIONS = new Set([
    'click',
    'focus',
    'scroll',
    'set-value',
    'toggle-attribute',
    'toggle-media'
  ]);
  const MAX_DOM_ACTION_PAYLOAD_LENGTH = 12000;
  const TOGGLEABLE_DOM_ATTRIBUTES = new Set([
    'hidden',
    'disabled',
    'open',
    'checked',
    'selected',
    'muted',
    'controls',
    'loop',
    'autoplay'
  ]);

  const SITE_SEARCH_SELECTORS = {
    'youtube.com': '#search-input input, input#search',
    'netflix.com': '.searchTab, [data-uia="search-tab"], input[type="text"]',
    'primevideo.com': '[data-testid="search-field"], .nav-search-field input',
    'twitch.tv': '[data-a-target="search-input"]',
    'disneyplus.com': '[data-testid="search-icon"], input[type="search"]',
    'hulu.com': '.NavSearch-searchInput, [placeholder*="Search"]',
    'max.com': '[data-testid="search-bar-input"]'
  };

  const FULLSCREEN_CONTROL_SELECTOR = [
    '[data-uia*="fullscreen" i]',
    '[data-testid*="fullscreen" i]',
    '.fullscreen-button',
    '.ytp-fullscreen-button',
    'button.fullscreen',
    '[aria-label*="fullscreen" i]',
    '[title*="fullscreen" i]'
  ].join(', ');

  // ─── State ──────────────────────────────────────────────────────────────────

  const WEBSITE_MAPPINGS_DEFAULT = {
    'netflix.com':    { ...DEFAULT_PROFILE },
    'primevideo.com': { ...DEFAULT_PROFILE }
  };

  let settings = {
    iconStyle: 'playstation',
    websiteMappings: { ...WEBSITE_MAPPINGS_DEFAULT },
    defaultMapping: { ...DEFAULT_PROFILE },
    enabledSites: {}, // hostname -> bool (defaults to true)
    globalEnabled: true
  };

  let activeProfile = { ...DEFAULT_PROFILE };
  let prevButtonStates = [];
  let axisTimers = {};
  let hudElement = null;
  let hudStyleElement = null;
  let hudTimeout = null;
  let hudVisible = false;
  let hudPermanentlyHidden = false;
  let gamepadConnected = false;
  let controllerFocusedElement = null;
  let quickMapElement = null;
  let quickMapState = null;
  let quickMapHighlightedElement = null;
  let quickMapPickerListening = false;
  let quickMapSuppressClick = false;
  let quickMapSuppressPointerUp = false;
  let gamepadEventListenersAttached = false;

  const currentHostname = location.hostname.replace(/^www\./, '');

  // ─── Initialisation ─────────────────────────────────────────────────────────

  async function init() {
    try {
      const data = await api.storage.local.get([
        'iconStyle', 'websiteMappings', 'defaultMapping', 'profiles', 'enabledSites', 'globalEnabled'
      ]);

      if (data.iconStyle) settings.iconStyle = data.iconStyle;
      if (data.enabledSites) settings.enabledSites = data.enabledSites;
      if (data.globalEnabled !== undefined) settings.globalEnabled = data.globalEnabled;

      let isMapped = false;

      // Backward compatible migration fallback
      if (data.profiles && Object.keys(data.profiles).length > 0) {
        const profiles = data.profiles;
        const defaultProfile = profiles['default'] || DEFAULT_PROFILE;
        const mappedVal = data.websiteMappings ? data.websiteMappings[currentHostname] : null;
        isMapped = mappedVal !== undefined && mappedVal !== null;
        if (typeof mappedVal === 'string') {
          activeProfile = profiles[mappedVal] || defaultProfile;
        } else if (mappedVal && typeof mappedVal === 'object') {
          activeProfile = mappedVal;
        } else {
          activeProfile = defaultProfile;
        }
      } else {
        if (data.defaultMapping) {
          settings.defaultMapping = data.defaultMapping;
        } else {
          settings.defaultMapping = { ...DEFAULT_PROFILE };
        }
        if (data.websiteMappings && Object.keys(data.websiteMappings).length > 0) {
          settings.websiteMappings = data.websiteMappings;
        } else {
          settings.websiteMappings = { ...WEBSITE_MAPPINGS_DEFAULT };
        }
        activeProfile = settings.websiteMappings[currentHostname] || settings.defaultMapping || DEFAULT_PROFILE;
        isMapped = settings.websiteMappings[currentHostname] !== undefined;
      }

      const siteEnabled = settings.enabledSites[currentHostname] !== false;
      const quickMapAvailable = settings.globalEnabled && siteEnabled;

      if (quickMapAvailable) {
        setupGamepadPolling();
      }

      if (quickMapAvailable && isMapped) {
        document.documentElement.setAttribute('data-remapad-active', 'true');
        updateHUD();
      } else {
        document.documentElement.removeAttribute('data-remapad-active');
        removeHUD(!quickMapAvailable);
      }
    } catch (e) {
      console.warn('[Remapad CS] Init failed:', e);
    }
  }

  // Listen for settings change
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      init();
    }
  });

  // ─── Polling & Gamepad processing ───────────────────────────────────────────

  let pollInterval = null;

  function setupGamepadPolling() {
    if (pollInterval) clearInterval(pollInterval);

    if (!gamepadEventListenersAttached) {
      window.addEventListener('gamepadconnected', onGamepadConnect);
      window.addEventListener('gamepaddisconnected', onGamepadDisconnect);
      gamepadEventListenersAttached = true;
    }

    pollInterval = setInterval(pollGamepads, POLL_INTERVAL_MS);
    pollGamepads();
  }

  function onGamepadConnect(e) {
    console.log('[Remapad CS] Gamepad connected:', e.gamepad.id);
    gamepadConnected = true;
  }

  function onGamepadDisconnect(e) {
    console.log('[Remapad CS] Gamepad disconnected');
    gamepadConnected = false;
    hideHUD();
  }

  function pollGamepads() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...gamepads].find(g => g && g.connected);

    if (gp) {
      gamepadConnected = true;
      processGamepad(gp);
    } else {
      if (gamepadConnected) {
        gamepadConnected = false;
        hideHUD();
      }
    }
  }

  function processGamepad(gp) {
    // Buttons
    gp.buttons.forEach((btn, idx) => {
      const wasPressed = prevButtonStates[idx] || false;
      const isPressed = btn.pressed || btn.value > 0.5;

      if (isPressed && !wasPressed) {
        onButtonPress(idx);
      } else if (!isPressed && wasPressed) {
        onButtonRelease(idx);
      }
      prevButtonStates[idx] = isPressed;
    });

    // Sticks
    const axLX = gp.axes[0]; // Left stick X
    const axLY = gp.axes[1]; // Left stick Y

    if (Math.abs(axLX) > DEADZONE || Math.abs(axLY) > DEADZONE) {
      const timerKey = 'axis_L';
      if (!axisTimers[timerKey]) {
        onStickMove(axLX, axLY);
        axisTimers[timerKey] = setTimeout(() => {
          delete axisTimers[timerKey];
        }, AXIS_REPEAT_DELAY_MS);
      }
    }

    const axRY = gp.axes[3] || 0; // Right stick Y
    if (Math.abs(axRY) > DEADZONE) {
      const timerKey = 'axis_R';
      if (!axisTimers[timerKey]) {
        onFocusStickMove(axRY);
        axisTimers[timerKey] = setTimeout(() => {
          delete axisTimers[timerKey];
        }, AXIS_REPEAT_DELAY_MS);
      }
    }
  }

  // ─── Action Dispatcher ─────────────────────────────────────────────────────

  function onButtonPress(btnIdx) {
    if (quickMapElement) {
      if (btnIdx === 9) {
        closeQuickMap();
      } else {
        selectQuickMapButton(btnIdx);
      }
      return false;
    }

    const action = activeProfile[btnIdx.toString()];
    if (!action || action === 'none') return false;

    if (btnIdx === 9 && action === 'open_options') {
      openQuickMap();
      return false;
    }

    executeAction(action);
    return action !== 'quick_map';
  }

  function onButtonRelease(btnIdx) {
    if (quickMapElement) return;

    const action = activeProfile[btnIdx.toString()];
    if (!action) return;

    if (action.startsWith('hover_element:')) {
      const selector = action.substring('hover_element:'.length);
      const el = safeQuerySelector(selector);
      if (el) {
        const mouseOutEvent = new MouseEvent('mouseout', { bubbles: true, cancelable: true, view: window });
        const mouseLeaveEvent = new MouseEvent('mouseleave', { bubbles: true, cancelable: true, view: window });
        el.dispatchEvent(mouseOutEvent);
        el.dispatchEvent(mouseLeaveEvent);
        el.classList.remove('remapad-hover');
      }
    }
  }

  function onStickMove(x, y) {
    if (quickMapElement) return;

    if (Math.abs(y) > Math.abs(x)) {
      executeAction(y < -DEADZONE ? 'scroll_up' : 'scroll_down');
    } else {
      executeAction(x < -DEADZONE ? 'scroll_left' : 'scroll_right');
    }
  }

  function executeAction(action) {
    console.log('[Remapad CS] Executing action:', action);

    if (action === 'toggle_hud') {
      toggleHUD();
      return;
    }

    if (action === 'quick_map') {
      openQuickMap();
      return;
    }

    // Complex custom actions
    if (action.startsWith('click_element:')) {
      const selector = action.substring('click_element:'.length);
      const el = safeQuerySelector(selector);
      if (el) {
        el.click();
        el.focus?.();
      } else {
        console.warn('[Remapad CS] Selector not found for click:', selector);
      }
      return;
    }

    if (action.startsWith('hover_element:')) {
      const selector = action.substring('hover_element:'.length);
      const el = safeQuerySelector(selector);
      if (el) {
        const mouseOverEvent = new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window });
        const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true, cancelable: true, view: window });
        el.dispatchEvent(mouseOverEvent);
        el.dispatchEvent(mouseEnterEvent);
        el.classList.add('remapad-hover');
      } else {
        console.warn('[Remapad CS] Selector not found for hover:', selector);
      }
      return;
    }

    if (action.startsWith('dom_action:')) {
      executeDomAction(action.substring('dom_action:'.length));
      return;
    }

    if (action.startsWith('press_key:')) {
      const fullKey = action.substring('press_key:'.length);
      const parts = fullKey.split('+');
      let key = fullKey.endsWith('+') ? '+' : parts[parts.length - 1];
      if (key === 'Space') key = ' ';
      if (key === 'Plus') key = '+';

      dispatchKeyEvent(document.activeElement || document.body, key, getKeyboardCode(key), {
        ctrlKey: parts.includes('Ctrl'),
        altKey: parts.includes('Alt'),
        shiftKey: parts.includes('Shift'),
        metaKey: parts.includes('Meta')
      });
      return;
    }

    if (action.startsWith('focus_element:')) {
      const selector = action.substring('focus_element:'.length);
      const el = safeQuerySelector(selector);
      if (el) {
        focusElement(el);
      } else {
        console.warn('[Remapad CS] Selector not found for focus:', selector);
      }
      return;
    }

    // Browser-level actions are handled by background worker
    const browserActions = ['next_tab', 'prev_tab', 'close_tab', 'open_options'];
    if (browserActions.includes(action)) {
      api.runtime.sendMessage({ type: 'BROWSER_ACTION', action }).catch(() => {});
      return;
    }

    // Tab-level actions handled directly in DOM
    const video = document.querySelector('video');

    switch (action) {
      case 'click': {
        const el = document.activeElement;
        if (el && el !== document.body) {
          el.click();
        } else {
          // Fallback select element
          dispatchKeyEvent(document.body, 'Enter', 'Enter');
        }
        break;
      }
      case 'back': {
        dispatchKeyEvent(document.activeElement || document.body, 'Escape', 'Escape');
        setTimeout(() => {
          const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true });
          if (!esc.defaultPrevented) {
            history.back();
          }
        }, 100);
        break;
      }
      case 'search': {
        let selector = SITE_SEARCH_SELECTORS[currentHostname];
        let input = selector ? document.querySelector(selector) : null;
        if (!input) {
          input = document.querySelector('input[type="search"], input[placeholder*="Search" i]');
        }
        if (input) {
          input.focus();
          input.select();
        }
        break;
      }
      case 'focus_next': {
        moveFocus(1);
        break;
      }
      case 'focus_prev': {
        moveFocus(-1);
        break;
      }
      case 'toggle_play': {
        if (video) {
          if (video.paused) video.play();
          else video.pause();
        } else {
          dispatchKeyEvent(document.body, ' ', 'Space');
        }
        break;
      }
      case 'fullscreen': {
        toggleFullscreen();
        break;
      }
      case 'scroll_up': {
        getScrollableElement().scrollBy({ top: -150, behavior: 'smooth' });
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowUp', 'ArrowUp');
        break;
      }
      case 'scroll_down': {
        getScrollableElement().scrollBy({ top: 150, behavior: 'smooth' });
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowDown', 'ArrowDown');
        break;
      }
      case 'scroll_left': {
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowLeft', 'ArrowLeft');
        break;
      }
      case 'scroll_right': {
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowRight', 'ArrowRight');
        break;
      }
      case 'volume_up': {
        if (video) video.volume = Math.min(1, video.volume + 0.1);
        break;
      }
      case 'volume_down': {
        if (video) video.volume = Math.max(0, video.volume - 0.1);
        break;
      }
      case 'seek_forward': {
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowRight', 'ArrowRight');
        break;
      }
      case 'seek_backward': {
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowLeft', 'ArrowLeft');
        break;
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getKeyboardCode(key) {
    const punctuationCodes = {
      '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', '$': 'Digit4', '%': 'Digit5', '^': 'Digit6',
      '&': 'Digit7', '*': 'Digit8', '(': 'Digit9', ')': 'Digit0', '-': 'Minus', '_': 'Minus',
      '=': 'Equal', '+': 'Equal', '[': 'BracketLeft', '{': 'BracketLeft', ']': 'BracketRight',
      '}': 'BracketRight', '\\': 'Backslash', '|': 'Backslash', ';': 'Semicolon', ':': 'Semicolon',
      "'": 'Quote', '"': 'Quote', ',': 'Comma', '<': 'Comma', '.': 'Period', '>': 'Period',
      '/': 'Slash', '?': 'Slash', '`': 'Backquote', '~': 'Backquote'
    };

    if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`;
    if (/^[0-9]$/.test(key)) return `Digit${key}`;
    if (key === ' ') return 'Space';
    return punctuationCodes[key] || key;
  }

  function getLegacyKeyCode(key) {
    const namedKeys = {
      ' ': 32,
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
      Enter: 13,
      Escape: 27,
      Tab: 9,
      Backspace: 8,
      Delete: 46,
      Home: 36,
      End: 35,
      PageUp: 33,
      PageDown: 34,
      '!': 49,
      '@': 50,
      '#': 51,
      '$': 52,
      '%': 53,
      '^': 54,
      '&': 55,
      '*': 56,
      '(': 57,
      ')': 48,
      '-': 189,
      '_': 189,
      '=': 187,
      '+': 187,
      '[': 219,
      '{': 219,
      ']': 221,
      '}': 221,
      '\\': 220,
      '|': 220,
      ';': 186,
      ':': 186,
      "'": 222,
      '"': 222,
      ',': 188,
      '<': 188,
      '.': 190,
      '>': 190,
      '/': 191,
      '?': 191,
      '`': 192,
      '~': 192
    };

    if (namedKeys[key] !== undefined) return namedKeys[key];
    if (/^[a-zA-Z]$/.test(key)) return key.toUpperCase().charCodeAt(0);
    if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
    return 0;
  }

  function dispatchKeyEvent(target, key, code = getKeyboardCode(key), modifiers = {}) {
    const keyCode = getLegacyKeyCode(key);
    const opts = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      key,
      code,
      keyCode,
      which: keyCode,
      ...modifiers
    };
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  function executeDomAction(encodedConfig) {
    if (encodedConfig.length > MAX_DOM_ACTION_PAYLOAD_LENGTH) {
      console.warn('[Remapad CS] DOM action configuration is too large.');
      return;
    }

    let config;
    try {
      config = JSON.parse(decodeURIComponent(encodedConfig));
    } catch (error) {
      console.warn('[Remapad CS] Invalid DOM action configuration:', error);
      return;
    }

    if (!isValidDomActionConfig(config)) {
      console.warn('[Remapad CS] Unsupported DOM action configuration:', config);
      return;
    }

    const element = safeQuerySelector(config.selector);
    if (!element) {
      console.warn('[Remapad CS] Selector not found for DOM action:', config.selector);
      return;
    }

    switch (config.operation) {
      case 'click':
        element.click();
        break;
      case 'focus':
        focusElement(element);
        break;
      case 'scroll':
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        break;
      case 'set-value':
        setElementValue(element, config.value);
        break;
      case 'toggle-attribute':
        element.toggleAttribute(config.value);
        break;
      case 'toggle-media':
        toggleMediaElement(element);
        break;
    }
  }

  function isValidDomActionConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
    if (!DOM_ACTION_OPERATIONS.has(config.operation)) return false;
    if (typeof config.selector !== 'string' || !config.selector.trim() || config.selector.length > 2000) return false;

    if (config.operation === 'set-value') {
      return typeof config.value === 'string' && config.value.length <= 2000;
    }

    if (config.operation === 'toggle-attribute') {
      return typeof config.value === 'string' && isToggleableDomAttribute(config.value);
    }

    return true;
  }

  function isToggleableDomAttribute(attribute) {
    return TOGGLEABLE_DOM_ATTRIBUTES.has(attribute) || attribute.startsWith('aria-') || attribute.startsWith('data-');
  }

  function setElementValue(element, value) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      const prototype = Object.getPrototypeOf(element);
      const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (valueSetter) valueSetter.call(element, value);
      else element.value = value;
    } else if (element.isContentEditable) {
      element.textContent = value;
    } else {
      console.warn('[Remapad CS] DOM set-value target must be a form control or contenteditable element:', element);
      return;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function toggleMediaElement(element) {
    if (typeof element.play !== 'function' || typeof element.pause !== 'function') {
      console.warn('[Remapad CS] DOM toggle-media target must be an audio or video element:', element);
      return;
    }

    if (element.paused) {
      try {
        const playResult = element.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(error => {
            console.warn('[Remapad CS] Unable to play media element:', error);
          });
        }
      } catch (error) {
        console.warn('[Remapad CS] Unable to play media element:', error);
      }
    } else {
      element.pause();
    }
  }

  async function toggleFullscreen() {
    if (getFullscreenElement()) {
      try {
        await exitDocumentFullscreen();
      } catch (error) {
        console.warn('[Remapad CS] Unable to exit fullscreen:', error);
      }
      return;
    }

    const video = getPrimaryVideo();
    const target = getFullscreenTarget(video);
    if (target) {
      try {
        await requestElementFullscreen(target);
        return;
      } catch (error) {
        console.warn('[Remapad CS] Direct fullscreen request failed; trying the page control:', error);
      }
    }

    const fullscreenControl = getFullscreenControl();
    if (fullscreenControl) {
      fullscreenControl.click();
      return;
    }

    console.warn('[Remapad CS] No fullscreen target or control found.');
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function getPrimaryVideo() {
    return Array.from(document.querySelectorAll('video'))
      .filter(isVisibleElement)
      .sort((first, second) => getElementArea(second) - getElementArea(first))[0] || null;
  }

  function getFullscreenTarget(video) {
    if (!video) return null;
    return video.closest([
      '[data-uia*="player" i]',
      '[data-testid*="player" i]',
      '.html5-video-player',
      '[class*="player" i]',
      '[id*="player" i]'
    ].join(', ')) || video;
  }

  function getFullscreenControl() {
    return Array.from(document.querySelectorAll(FULLSCREEN_CONTROL_SELECTOR))
      .find(element => isVisibleElement(element) && !element.matches(':disabled')) || null;
  }

  function isVisibleElement(element) {
    return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  }

  function getElementArea(element) {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function requestElementFullscreen(element) {
    const requestFullscreen = element.requestFullscreen || element.webkitRequestFullscreen;
    if (!requestFullscreen) return Promise.reject(new Error('Fullscreen API is unavailable for this element.'));
    return Promise.resolve(requestFullscreen.call(element));
  }

  function exitDocumentFullscreen() {
    const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exitFullscreen) return Promise.reject(new Error('Fullscreen API is unavailable for this document.'));
    return Promise.resolve(exitFullscreen.call(document));
  }

  function getScrollableElement() {
    let el = document.activeElement;
    while (el && el !== document.body) {
      const style = getComputedStyle(el);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }
    return window;
  }

  function getFocusableElements() {
    const selector = [
      'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]', 'video[controls]', 'audio[controls]'
    ].join(',');

    return Array.from(document.querySelectorAll(selector)).filter(el =>
      !el.closest('.remapad-hud-container') &&
      !el.matches(':disabled') &&
      !el.closest('[inert]') &&
      el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
    );
  }

  function moveFocus(direction) {
    const elements = getFocusableElements();
    if (!elements.length) return;

    const currentIndex = elements.indexOf(document.activeElement);
    const startIndex = currentIndex === -1
      ? direction > 0 ? 0 : elements.length - 1
      : (currentIndex + direction + elements.length) % elements.length;
    for (let offset = 0; offset < elements.length; offset += 1) {
      const index = (startIndex + offset * direction + elements.length) % elements.length;
      if (focusElement(elements[index])) return;
    }
  }

  function onFocusStickMove(y) {
    if (quickMapElement) return;

    executeAction(y < -DEADZONE ? 'focus_prev' : 'focus_next');
  }

  function focusElement(el) {
    el.focus({ preventScroll: true });
    if (document.activeElement !== el) return false;

    controllerFocusedElement?.classList.remove('remapad-controller-focus');
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    el.classList.add('remapad-controller-focus');
    controllerFocusedElement = el;
    return true;
  }

  function safeQuerySelector(selector) {
    try {
      return document.querySelector(selector);
    } catch (e) {
      console.warn('[Remapad CS] Invalid selector:', selector);
      return null;
    }
  }

  // ─── Quick Map ──────────────────────────────────────────────────────────────

  function openQuickMap() {
    if (quickMapElement) return;

    injectHUDStyles();
    quickMapState = { phase: 'button', button: null, action: null, selector: null, target: null };
    quickMapElement = document.createElement('section');
    quickMapElement.className = 'remapad-quick-map';
    quickMapElement.setAttribute('role', 'dialog');
    quickMapElement.setAttribute('aria-modal', 'true');
    quickMapElement.setAttribute('aria-labelledby', 'remapad-quick-map-title');
    quickMapElement.tabIndex = -1;
    quickMapElement.addEventListener('click', onQuickMapClick);
    document.addEventListener('keydown', onQuickMapKeyDown, true);
    document.body.appendChild(quickMapElement);
    renderQuickMap();
    quickMapElement.focus({ preventScroll: true });
  }

  function closeQuickMap() {
    stopQuickMapPicker();
    document.removeEventListener('keydown', onQuickMapKeyDown, true);
    quickMapHighlightedElement?.classList.remove('remapad-picker-target');
    quickMapHighlightedElement = null;
    quickMapElement?.remove();
    quickMapElement = null;
    quickMapState = null;
  }

  function selectQuickMapButton(btnIdx) {
    if (!quickMapState) return;

    stopQuickMapPicker();
    quickMapState = {
      phase: 'action',
      button: String(btnIdx),
      action: null,
      selector: null,
      target: null
    };
    renderQuickMap();
  }

  function startQuickMapPicker(action) {
    if (!quickMapState || quickMapState.button === null) return;

    quickMapState = { ...quickMapState, phase: 'pick', action, selector: null, target: null };
    quickMapPickerListening = true;
    quickMapSuppressClick = false;
    quickMapSuppressPointerUp = false;
    document.addEventListener('pointermove', onQuickMapPointerMove, true);
    document.addEventListener('pointerdown', onQuickMapPointerDown, true);
    document.addEventListener('pointerup', onQuickMapPointerUp, true);
    document.addEventListener('click', onQuickMapClickCapture, true);
    renderQuickMap();
  }

  function stopQuickMapPicker() {
    quickMapPickerListening = false;
    quickMapSuppressClick = false;
    quickMapSuppressPointerUp = false;
    document.removeEventListener('pointermove', onQuickMapPointerMove, true);
    document.removeEventListener('pointerdown', onQuickMapPointerDown, true);
    document.removeEventListener('pointerup', onQuickMapPointerUp, true);
    document.removeEventListener('click', onQuickMapClickCapture, true);
  }

  function onQuickMapPointerMove(event) {
    if (!quickMapPickerListening) return;
    highlightQuickMapCandidate(getQuickMapCandidate(event.target));
  }

  function onQuickMapPointerDown(event) {
    if (!quickMapPickerListening || !event.isTrusted) return;

    const target = getQuickMapCandidate(event.target);
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    quickMapSuppressClick = true;
    quickMapSuppressPointerUp = true;

    const selector = getStableSelector(target);
    if (!selector) {
      quickMapState = { ...quickMapState, message: 'That target is not uniquely identifiable. Choose a control with a label or test id.' };
      renderQuickMap();
      return;
    }

    quickMapPickerListening = false;
    document.removeEventListener('pointermove', onQuickMapPointerMove, true);
    document.removeEventListener('pointerdown', onQuickMapPointerDown, true);
    quickMapState = { ...quickMapState, phase: 'review', selector, target, message: null };
    highlightQuickMapCandidate(target);
    renderQuickMap();
  }

  function onQuickMapClickCapture(event) {
    if (!quickMapSuppressClick) return;

    quickMapSuppressClick = false;
    if (isRemapadElement(event.target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onQuickMapPointerUp(event) {
    if (!quickMapSuppressPointerUp) return;

    quickMapSuppressPointerUp = false;
    if (isRemapadElement(event.target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onQuickMapClick(event) {
    if (!event.isTrusted) return;

    event.stopPropagation();

    const actionButton = event.target.closest('[data-remapad-action]');
    if (actionButton) {
      startQuickMapPicker(actionButton.dataset.remapadAction);
      return;
    }

    if (event.target.closest('[data-remapad-save]')) {
      saveQuickMap();
      return;
    }

    if (event.target.closest('[data-remapad-cancel]')) {
      closeQuickMap();
    }
  }

  function onQuickMapKeyDown(event) {
    if (event.key !== 'Escape') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    closeQuickMap();
  }

  function renderQuickMap() {
    if (!quickMapElement || !quickMapState) return;

    const glyphs = GLYPHS[settings.iconStyle] || GLYPHS.playstation;
    const glyph = quickMapState.button === null ? '' : escapeHtml(glyphs[quickMapState.button] || quickMapState.button);
    const selectedButton = quickMapState.button === null
      ? ''
      : `<span class="remapad-quick-map-button">${glyph}</span>`;
    let content = '';

    if (quickMapState.phase === 'button') {
      content = '<p class="remapad-quick-map-instruction">Press the controller button to map. Press Start to cancel.</p>';
    } else if (quickMapState.phase === 'action') {
      content = `
        <p class="remapad-quick-map-instruction">${selectedButton} Choose what the button should do.</p>
        <div class="remapad-quick-map-actions" role="group" aria-label="Choose an action">
          <button type="button" class="remapad-quick-map-action" data-remapad-action="click">Click</button>
          <button type="button" class="remapad-quick-map-action" data-remapad-action="focus">Focus</button>
          <button type="button" class="remapad-quick-map-action" data-remapad-action="hover">Hover</button>
        </div>`;
    } else if (quickMapState.phase === 'pick') {
      content = `
        <p class="remapad-quick-map-instruction">${selectedButton} Move over a page control, then press it. It will not activate.</p>
        <p class="remapad-quick-map-hint">Start cancels. Remapad controls are ignored.</p>`;
    } else {
      content = `
        <p class="remapad-quick-map-instruction">${selectedButton} ${escapeHtml(quickMapState.action)} target ready.</p>
        <code class="remapad-quick-map-selector">${escapeHtml(quickMapState.selector)}</code>`;
    }

    quickMapElement.innerHTML = `
      <header class="remapad-quick-map-header">
        <div>
          <p class="remapad-quick-map-kicker">QUICK MAP · ${escapeHtml(currentHostname)}</p>
          <h2 id="remapad-quick-map-title">Map a page control</h2>
        </div>
        <button type="button" class="remapad-quick-map-close" data-remapad-cancel aria-label="Cancel Quick Map">×</button>
      </header>
      <div class="remapad-quick-map-body">${content}</div>
      <p class="remapad-quick-map-live" role="status" aria-live="polite">${escapeHtml(quickMapState.message || '')}</p>
      <footer class="remapad-quick-map-footer">
        <button type="button" class="remapad-quick-map-cancel" data-remapad-cancel>Cancel</button>
        <button type="button" class="remapad-quick-map-save" data-remapad-save ${quickMapState.phase === 'review' ? '' : 'disabled'}>Save</button>
      </footer>`;
  }

  function getQuickMapCandidate(target) {
    if (!(target instanceof Element) || isRemapadElement(target)) return null;

    let candidate = target;
    for (let depth = 0; candidate && depth < 6; depth += 1, candidate = candidate.parentElement) {
      if (candidate.id || candidate.hasAttribute('data-uia') || candidate.hasAttribute('data-testid') ||
          candidate.hasAttribute('data-test') || candidate.hasAttribute('aria-label')) {
        return candidate;
      }
    }
    return target;
  }

  function highlightQuickMapCandidate(target) {
    if (quickMapHighlightedElement === target) return;
    quickMapHighlightedElement?.classList.remove('remapad-picker-target');
    quickMapHighlightedElement = target;
    quickMapHighlightedElement?.classList.add('remapad-picker-target');
  }

  function isRemapadElement(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('.remapad-quick-map, .remapad-hud-container'));
  }

  function getStableSelector(el) {
    if (!(el instanceof Element) || el === document.body || el === document.documentElement) return null;

    if (el.id) {
      const selector = `#${escapeCssIdentifier(el.id)}`;
      if (isUniqueSelector(selector, el)) return selector;
    }

    for (const attribute of ['data-uia', 'data-testid', 'data-test', 'aria-label']) {
      const value = el.getAttribute(attribute);
      if (!value) continue;
      const selector = `${el.localName}[${attribute}="${escapeCssString(value)}"]`;
      if (isUniqueSelector(selector, el)) return selector;
    }

    return getStructuralSelector(el);
  }

  function getStructuralSelector(el) {
    const parts = [];
    let node = el;

    for (let depth = 0; node && node !== document.body && depth < 6; depth += 1, node = node.parentElement) {
      const tag = node.localName;
      const siblings = Array.from(node.parentElement?.children || []).filter(sibling => sibling.localName === tag);
      const index = siblings.indexOf(node) + 1;
      if (!tag || index < 1) return null;

      parts.unshift(`${tag}:nth-of-type(${index})`);
      const selector = `body > ${parts.join(' > ')}`;
      if (isUniqueSelector(selector, el)) return selector;
    }

    return null;
  }

  function isUniqueSelector(selector, el) {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === el;
    } catch (_) {
      return false;
    }
  }

  function escapeCssIdentifier(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, char => `\\${char.codePointAt(0).toString(16)} `);
  }

  function escapeCssString(value) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ');
  }

  async function saveQuickMap() {
    if (!quickMapState?.selector || quickMapState.button === null || !quickMapState.action) return;

    const { action, button, selector } = quickMapState;
    if (!['click', 'focus', 'hover'].includes(action)) return;
    const actionValue = `${action}_element:${selector}`;
    try {
      const data = await api.storage.local.get(['websiteMappings']);
      const websiteMappings = {
        ...(data.websiteMappings && typeof data.websiteMappings === 'object'
          ? data.websiteMappings
          : settings.websiteMappings)
      };
      const storedProfile = websiteMappings[currentHostname];
      const baseProfile = storedProfile && typeof storedProfile === 'object'
        ? storedProfile
        : activeProfile || settings.defaultMapping || DEFAULT_PROFILE;
      const updatedProfile = { ...baseProfile, [button]: actionValue };

      websiteMappings[currentHostname] = updatedProfile;
      await api.storage.local.set({ websiteMappings });
      settings.websiteMappings = websiteMappings;
      activeProfile = updatedProfile;
      updateHUD();
      closeQuickMap();
    } catch (error) {
      console.warn('[Remapad CS] Quick Map save failed:', error);
      quickMapState = { ...quickMapState, message: 'Unable to save this mapping. Please try again.' };
      renderQuickMap();
    }
  }

  // ─── HUD Rendering ──────────────────────────────────────────────────────────

  function injectHUDStyles() {
    if (hudStyleElement) return;

    hudStyleElement = document.createElement('style');
    hudStyleElement.textContent = `
       .remapad-hud-container {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(120px);
        z-index: 2147483647;
        background: rgba(19, 19, 19, 0.85) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 9999px !important;
         width: calc(100vw - 32px) !important;
         box-sizing: border-box !important;
         padding: 12px 16px !important;
         display: grid !important;
         grid-template-columns: minmax(0, 1fr) auto auto !important;
         align-items: center !important;
         gap: 16px !important;
         max-width: calc(100vw - 32px) !important;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7) !important;
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease !important;
        opacity: 0;
        pointer-events: none;
        user-select: none !important;
        font-family: 'Geist', 'Inter', -apple-system, sans-serif !important;
      }
      .remapad-hud-container.visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
        pointer-events: auto;
      }
       .remapad-hud-item {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        color: #e5e2e1 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        letter-spacing: 0.03em !important;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
       }
       .remapad-hud-row {
         display: flex !important;
         align-items: center !important;
         gap: 16px !important;
         overflow-x: auto !important;
          flex: 1 1 auto !important;
          max-width: none !important;
          min-width: 0 !important;
          width: 100% !important;
         scrollbar-width: none !important;
       }
       .remapad-hud-row::-webkit-scrollbar { display: none !important; }
       .remapad-hud-item--unmapped { opacity: 0.4 !important; }
      .remapad-hud-glyph {
        width: 20px !important;
        height: 20px !important;
        border-radius: 50% !important;
        background: #393939 !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        color: #fff !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 10px !important;
        font-weight: 800 !important;
      }
      .remapad-hud-label {
        font-size: 12px !important;
        font-weight: 600 !important;
        color: #e9bcb6 !important;
      }
      .remapad-hud-close {
        cursor: pointer !important;
        color: rgba(255, 255, 255, 0.4) !important;
        font-size: 16px !important;
        font-weight: bold !important;
        padding-left: 8px !important;
        border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
         transition: color 0.2s !important;
         pointer-events: auto !important;
          background: transparent !important;
          border: 0 !important;
          flex: 0 0 auto !important;
      }
      .remapad-hud-close:hover {
        color: #ffb4ab !important;
      }
       .remapad-hover {
        outline: 3px solid #00a8e1 !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 12px rgba(0, 168, 225, 0.7) !important;
        transition: outline 0.15s ease, box-shadow 0.15s ease !important;
       }
       .remapad-controller-focus {
         outline: 3px solid #00a8e1 !important;
         outline-offset: 3px !important;
         box-shadow: 0 0 12px rgba(0, 168, 225, 0.7) !important;
       }
       .remapad-hud-edit {
         border: 0 !important;
         border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
         background: transparent !important;
         color: #00a8e1 !important;
         cursor: pointer !important;
         font: inherit !important;
         font-size: 12px !important;
          font-weight: 700 !important;
          padding: 4px 0 4px 16px !important;
           flex: 0 0 auto !important;
        }
       .remapad-quick-map {
         --remapad-surface: rgba(30, 30, 30, 0.88);
         --remapad-surface-high: #353534;
         --remapad-on-surface: #e5e2e1;
         --remapad-on-surface-variant: #e9bcb6;
         --remapad-primary: #e50914;
         --remapad-secondary: #00a7df;
         position: fixed !important;
         right: 24px !important;
         bottom: 24px !important;
         z-index: 2147483647 !important;
         width: min(360px, calc(100vw - 32px)) !important;
         box-sizing: border-box !important;
         padding: 24px !important;
         background: var(--remapad-surface) !important;
         color: var(--remapad-on-surface) !important;
         backdrop-filter: blur(16px) !important;
         -webkit-backdrop-filter: blur(16px) !important;
         border: 1px solid rgba(255, 255, 255, 0.08) !important;
         border-radius: 16px !important;
         box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7) !important;
         font-family: 'Geist', 'Inter', -apple-system, sans-serif !important;
       }
       .remapad-quick-map *, .remapad-quick-map *::before, .remapad-quick-map *::after {
         box-sizing: border-box !important;
       }
       .remapad-quick-map-header, .remapad-quick-map-footer {
         display: flex !important;
         align-items: center !important;
         justify-content: space-between !important;
         gap: 12px !important;
       }
       .remapad-quick-map-header { align-items: flex-start !important; }
       .remapad-quick-map-kicker {
         margin: 0 0 4px !important;
         color: var(--remapad-on-surface-variant) !important;
         font-family: 'Geist', Consolas, monospace !important;
         font-size: 10px !important;
         font-weight: 700 !important;
         letter-spacing: 0.08em !important;
       }
       .remapad-quick-map h2 {
         margin: 0 !important;
         color: var(--remapad-on-surface) !important;
         font-size: 18px !important;
         font-weight: 700 !important;
         line-height: 24px !important;
       }
       .remapad-quick-map-close {
         width: 32px !important;
         height: 32px !important;
         padding: 0 !important;
         border: 0 !important;
         border-radius: 9999px !important;
         background: transparent !important;
         color: var(--remapad-on-surface-variant) !important;
         cursor: pointer !important;
         font: 24px/1 sans-serif !important;
       }
       .remapad-quick-map-close:hover, .remapad-quick-map-close:focus-visible {
         background: var(--remapad-surface-high) !important;
         color: var(--remapad-on-surface) !important;
       }
       .remapad-quick-map-body {
         min-height: 84px !important;
         padding: 24px 0 !important;
       }
       .remapad-quick-map-instruction, .remapad-quick-map-hint, .remapad-quick-map-live {
         margin: 0 !important;
         line-height: 20px !important;
       }
       .remapad-quick-map-instruction {
         color: var(--remapad-on-surface) !important;
         font-size: 14px !important;
       }
       .remapad-quick-map-hint, .remapad-quick-map-live {
         margin-top: 8px !important;
         color: var(--remapad-on-surface-variant) !important;
         font-size: 12px !important;
       }
       .remapad-quick-map-button {
         display: inline-flex !important;
         align-items: center !important;
         justify-content: center !important;
         min-width: 24px !important;
         height: 24px !important;
         margin-right: 4px !important;
         padding: 0 4px !important;
         border: 1px solid rgba(255, 255, 255, 0.15) !important;
         border-radius: 9999px !important;
         background: var(--remapad-surface-high) !important;
         color: #fff !important;
         font-family: 'Geist', Consolas, monospace !important;
         font-size: 11px !important;
         font-weight: 800 !important;
         vertical-align: middle !important;
       }
       .remapad-quick-map-actions {
         display: grid !important;
         grid-template-columns: repeat(3, 1fr) !important;
         gap: 8px !important;
       }
       .remapad-quick-map-action, .remapad-quick-map-cancel, .remapad-quick-map-save {
         min-height: 36px !important;
         border-radius: 8px !important;
         font-family: 'Geist', Consolas, monospace !important;
         font-size: 12px !important;
         font-weight: 700 !important;
         cursor: pointer !important;
       }
       .remapad-quick-map-action, .remapad-quick-map-cancel {
         border: 1px solid rgba(255, 255, 255, 0.1) !important;
         background: var(--remapad-surface-high) !important;
         color: var(--remapad-on-surface) !important;
       }
       .remapad-quick-map-action:hover, .remapad-quick-map-action:focus-visible,
       .remapad-quick-map-cancel:hover, .remapad-quick-map-cancel:focus-visible {
         border-color: var(--remapad-secondary) !important;
         box-shadow: 0 0 12px rgba(0, 167, 223, 0.35) !important;
       }
       .remapad-quick-map-selector {
         display: block !important;
         max-height: 60px !important;
         overflow: auto !important;
         padding: 8px !important;
         border: 1px solid rgba(255, 255, 255, 0.08) !important;
         border-radius: 4px !important;
         background: rgba(14, 14, 14, 0.9) !important;
         color: var(--remapad-on-surface-variant) !important;
         font: 11px/16px 'Geist', Consolas, monospace !important;
         white-space: pre-wrap !important;
         word-break: break-all !important;
       }
       .remapad-quick-map-footer {
         padding-top: 12px !important;
         border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
       }
       .remapad-quick-map-save {
         min-width: 84px !important;
         border: 0 !important;
         background: var(--remapad-primary) !important;
         color: #fff7f6 !important;
       }
       .remapad-quick-map-save:hover, .remapad-quick-map-save:focus-visible { filter: brightness(1.12) !important; }
       .remapad-quick-map-save:disabled {
         cursor: not-allowed !important;
         opacity: 0.45 !important;
       }
        .remapad-picker-target {
          outline: 3px solid #00a8e1 !important;
         outline-offset: 3px !important;
         box-shadow: 0 0 12px rgba(0, 167, 223, 0.7) !important;
       }
    `;
    document.head.appendChild(hudStyleElement);
  }

  function updateHUD() {
    if (hudPermanentlyHidden) return;

    injectHUDStyles();

    if (!hudElement) {
      hudElement = document.createElement('div');
      hudElement.className = 'remapad-hud-container';
      hudElement.setAttribute('role', 'navigation');
      hudElement.setAttribute('aria-label', 'Remapad controller mappings');
      document.body.appendChild(hudElement);
    }

    const currentGlyphs = GLYPHS[settings.iconStyle] || GLYPHS.playstation;

    const standardButtons = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
    const items = standardButtons.map(btnIdx => {
      const action = activeProfile[btnIdx];
      const glyph = escapeHtml(currentGlyphs[btnIdx] || btnIdx);
      const label = escapeHtml(formatActionLabel(action, btnIdx));
      const unmapped = !action || action === 'none';
      return `
        <div class="remapad-hud-item${unmapped ? ' remapad-hud-item--unmapped' : ''}">
          <span class="remapad-hud-glyph">${glyph}</span>
          <span class="remapad-hud-label">${label}</span>
        </div>
      `;
    }).join('');

    const stickItems = `
      <div class="remapad-hud-item">
        <span class="remapad-hud-glyph">LS</span>
        <span class="remapad-hud-label">Scroll</span>
      </div>
      <div class="remapad-hud-item">
        <span class="remapad-hud-glyph">RS↑↓</span>
        <span class="remapad-hud-label">Focus</span>
      </div>
    `;
    let innerHtml = `<div class="remapad-hud-row">${items}${stickItems}</div>`;

    // Add close button
    innerHtml += `<button class="remapad-hud-edit" id="remapad-hud-edit-btn" type="button">Edit</button>`;
    innerHtml += `<button class="remapad-hud-close" id="remapad-hud-close-btn" type="button" title="Hide this guide" aria-label="Hide controller guide">✕</button>`;

    hudElement.innerHTML = innerHtml;

    hudElement.querySelector('#remapad-hud-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hudPermanentlyHidden = true;
      hideHUD();
    });

    hudElement.querySelector('#remapad-hud-edit-btn')?.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      api.runtime.sendMessage({ type: 'OPEN_SITE_MAPPING' }).catch(() => {});
    });

  }

  function toggleHUD() {
    if (!hudElement) return;
    clearTimeout(hudTimeout);

    if (hudVisible) {
      hideHUD();
      return;
    }

    hudPermanentlyHidden = false;
    hudElement.classList.add('visible');
    hudVisible = true;
  }

  function hideHUD() {
    if (hudElement && hudVisible) {
      hudElement.classList.remove('visible');
      hudVisible = false;
    }
  }

  function removeHUD(stopPolling = true) {
    closeQuickMap();
    document.documentElement.removeAttribute('data-remapad-active');
    if (hudElement) {
      hudElement.remove();
      hudElement = null;
    }
    if (hudStyleElement) {
      hudStyleElement.remove();
      hudStyleElement = null;
    }
    if (stopPolling && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    clearTimeout(hudTimeout);
    controllerFocusedElement?.classList.remove('remapad-controller-focus');
    controllerFocusedElement = null;
  }

  function formatActionLabel(action, btnIdx = null) {
    if (!action || action === 'none') return 'Unmapped';
    if (btnIdx === '9' && action === 'open_options') return 'Quick Map';
    if (action.startsWith('click_element:')) return 'Click element';
    if (action.startsWith('hover_element:')) return 'Hover element';
    if (action.startsWith('dom_action:')) return formatDomActionLabel(action.substring('dom_action:'.length));
    if (action.startsWith('press_key:')) return `Key: ${action.substring('press_key:'.length)}`;
    if (action.startsWith('focus_element:')) return 'Focus element';
    return ACTION_LABELS[action] || action;
  }

  function formatDomActionLabel(encodedConfig) {
    try {
      const config = JSON.parse(decodeURIComponent(encodedConfig));
      const labels = {
        click: 'Click element',
        focus: 'Focus element',
        scroll: 'Scroll to element',
        'set-value': 'Set form value',
        'toggle-attribute': 'Toggle attribute',
        'toggle-media': 'Play/Pause media'
      };
      return labels[config.operation] || ACTION_LABELS.dom_action;
    } catch (_) {
      return ACTION_LABELS.dom_action;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  // ─── Boot ───────────────────────────────────────────────────────────────────

  window.addEventListener('pagehide', closeQuickMap);
  init();
})();
