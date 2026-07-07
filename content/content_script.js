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

  // Inject Main World blocker script immediately
  (function injectGamepadBlocker() {
    try {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          const nativeGetGamepads = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;
          const nativeAddEventListener = window.addEventListener;
          const nativeRemoveEventListener = window.removeEventListener;

          if (nativeGetGamepads) {
            navigator.getGamepads = function() {
              if (document.documentElement.getAttribute('data-remapad-active') === 'true') {
                return [null, null, null, null];
              }
              return nativeGetGamepads();
            };
          }

          window.addEventListener = function(type, listener, options) {
            if (type === 'gamepadconnected' || type === 'gamepaddisconnected') {
              const wrappedListener = function(event) {
                if (document.documentElement.getAttribute('data-remapad-active') === 'true') {
                  event.stopImmediatePropagation();
                  return;
                }
                return listener.call(this, event);
              };
              if (listener) {
                listener.__remapadWrapped = wrappedListener;
              }
              return nativeAddEventListener.call(window, type, wrappedListener, options);
            }
            return nativeAddEventListener.call(window, type, listener, options);
          };

          window.removeEventListener = function(type, listener, options) {
            if (type === 'gamepadconnected' || type === 'gamepaddisconnected') {
              const targetListener = (listener && listener.__remapadWrapped) || listener;
              return nativeRemoveEventListener.call(window, type, targetListener, options);
            }
            return nativeRemoveEventListener.call(window, type, listener, options);
          };
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    } catch (e) {
      console.warn('[Remapad CS] Injection failed:', e);
    }
  })();

  const api = typeof chrome !== 'undefined' ? chrome : browser;

  // ─── Constants & Settings ──────────────────────────────────────────────────

  const POLL_INTERVAL_MS = 50;
  const HUD_AUTO_HIDE_MS = 4000;
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
    "9": "open_options",   // Start
    "12": "scroll_up",     // D-Pad Up
    "13": "scroll_down",   // D-Pad Down
    "14": "scroll_left",   // D-Pad Left
    "15": "scroll_right"   // D-Pad Right
  };

  const GLYPHS = {
    playstation: {
      "0": "✕", "1": "○", "2": "□", "3": "△",
      "4": "L1", "5": "R1", "6": "L2", "7": "R2",
      "8": "Share", "9": "☰", "12": "↑", "13": "↓", "14": "←", "15": "→"
    },
    xbox: {
      "0": "A", "1": "B", "2": "X", "3": "Y",
      "4": "LB", "5": "RB", "6": "LT", "7": "RT",
      "8": "View", "9": "☰", "12": "↑", "13": "↓", "14": "←", "15": "→"
    },
    nintendo: {
      "0": "B", "1": "A", "2": "Y", "3": "X",
      "4": "L", "5": "R", "6": "ZL", "7": "ZR",
      "8": "Minus", "9": "Plus", "12": "↑", "13": "↓", "14": "←", "15": "→"
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
    close_tab: "Close Tab"
  };

  const SITE_SEARCH_SELECTORS = {
    'youtube.com': '#search-input input, input#search',
    'netflix.com': '.searchTab, [data-uia="search-tab"], input[type="text"]',
    'primevideo.com': '[data-testid="search-field"], .nav-search-field input',
    'twitch.tv': '[data-a-target="search-input"]',
    'disneyplus.com': '[data-testid="search-icon"], input[type="search"]',
    'hulu.com': '.NavSearch-searchInput, [placeholder*="Search"]',
    'max.com': '[data-testid="search-bar-input"]'
  };

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

  const currentHostname = location.hostname.replace('www.', '');

  // ─── Initialisation ─────────────────────────────────────────────────────────

  async function init() {
    try {
      const data = await api.storage.local.get([
        'iconStyle', 'websiteMappings', 'defaultMapping', 'profiles', 'enabledSites', 'globalEnabled'
      ]);

      if (data.iconStyle) settings.iconStyle = data.iconStyle;
      if (data.enabledSites) settings.enabledSites = data.enabledSites;
      if (data.globalEnabled !== undefined) settings.globalEnabled = data.globalEnabled;

      // Backward compatible migration fallback
      if (data.profiles && Object.keys(data.profiles).length > 0) {
        const profiles = data.profiles;
        const defaultProfile = profiles['default'] || DEFAULT_PROFILE;
        const mappedVal = data.websiteMappings ? data.websiteMappings[currentHostname] : null;
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
      }

      const isMapped = settings.websiteMappings[currentHostname] !== undefined;
      const siteEnabled = settings.enabledSites[currentHostname] !== false;

      if (settings.globalEnabled && isMapped && siteEnabled) {
        document.documentElement.setAttribute('data-remapad-active', 'true');
        setupGamepadPolling();
        updateHUD();
      } else {
        document.documentElement.removeAttribute('data-remapad-active');
        removeHUD();
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

    window.addEventListener('gamepadconnected', onGamepadConnect);
    window.addEventListener('gamepaddisconnected', onGamepadDisconnect);

    pollInterval = setInterval(pollGamepads, POLL_INTERVAL_MS);
    pollGamepads();
  }

  function onGamepadConnect(e) {
    console.log('[Remapad CS] Gamepad connected:', e.gamepad.id);
    gamepadConnected = true;
    showHUDTemporarily();
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
        showHUDTemporarily();
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
        showHUDTemporarily();
        axisTimers[timerKey] = setTimeout(() => {
          delete axisTimers[timerKey];
        }, AXIS_REPEAT_DELAY_MS);
      }
    }
  }

  // ─── Action Dispatcher ─────────────────────────────────────────────────────

  function onButtonPress(btnIdx) {
    const action = activeProfile[btnIdx.toString()];
    if (!action) return;

    executeAction(action);
  }

  function onButtonRelease(btnIdx) {
    const action = activeProfile[btnIdx.toString()];
    if (!action) return;

    if (action.startsWith('hover_element:')) {
      const selector = action.substring('hover_element:'.length);
      const el = document.querySelector(selector);
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
    if (Math.abs(y) > Math.abs(x)) {
      executeAction(y < -DEADZONE ? 'scroll_up' : 'scroll_down');
    } else {
      executeAction(x < -DEADZONE ? 'scroll_left' : 'scroll_right');
    }
  }

  function executeAction(action) {
    console.log('[Remapad CS] Executing action:', action);

    // Complex custom actions
    if (action.startsWith('click_element:')) {
      const selector = action.substring('click_element:'.length);
      const el = document.querySelector(selector);
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
      const el = document.querySelector(selector);
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

    if (action.startsWith('press_key:')) {
      const fullKey = action.substring('press_key:'.length);
      const parts = fullKey.split('+');
      let key = parts[parts.length - 1];
      if (key === 'Space') key = ' ';

      const ctrlKey = parts.includes('Ctrl');
      const altKey = parts.includes('Alt');
      const shiftKey = parts.includes('Shift');
      const metaKey = parts.includes('Meta');

      const target = document.activeElement || document.body;

      const eventDown = new KeyboardEvent('keydown', {
        key,
        code: key,
        ctrlKey,
        altKey,
        shiftKey,
        metaKey,
        bubbles: true,
        cancelable: true
      });
      const eventUp = new KeyboardEvent('keyup', {
        key,
        code: key,
        ctrlKey,
        altKey,
        shiftKey,
        metaKey,
        bubbles: true,
        cancelable: true
      });
      target.dispatchEvent(eventDown);
      target.dispatchEvent(eventUp);
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
        if (video) {
          if (!document.fullscreenElement) {
            video.requestFullscreen?.() || video.webkitRequestFullscreen?.();
          } else {
            document.exitFullscreen?.() || document.webkitExitFullscreen?.();
          }
        } else {
          dispatchKeyEvent(document.body, 'f', 'KeyF');
        }
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
        if (video) video.currentTime = Math.min(video.duration, video.currentTime + 10);
        break;
      }
      case 'seek_backward': {
        if (video) video.currentTime = Math.max(0, video.currentTime - 10);
        break;
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function dispatchKeyEvent(target, key, code) {
    const opts = { bubbles: true, cancelable: true, key, code };
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
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
        padding: 12px 32px !important;
        display: flex !important;
        align-items: center !important;
        gap: 24px !important;
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
    `;
    document.head.appendChild(hudStyleElement);
  }

  function updateHUD() {
    if (hudPermanentlyHidden) return;

    injectHUDStyles();

    if (!hudElement) {
      hudElement = document.createElement('div');
      hudElement.className = 'remapad-hud-container';
      document.body.appendChild(hudElement);
    }

    const currentGlyphs = GLYPHS[settings.iconStyle] || GLYPHS.playstation;

    // We show key bindings of interest: click, back, search, open_options
    const keyActions = ['click', 'back', 'search', 'open_options'];
    let innerHtml = '';

    keyActions.forEach(action => {
      // Find button index mapped to this action
      const btnIdx = Object.keys(activeProfile).find(k => activeProfile[k] === action);
      if (btnIdx !== undefined) {
        const glyph = currentGlyphs[btnIdx] || btnIdx;
        const label = ACTION_LABELS[action] || action;
        innerHtml += `
          <div class="remapad-hud-item">
            <span class="remapad-hud-glyph">${glyph}</span>
            <span class="remapad-hud-label">${label}</span>
          </div>
        `;
      }
    });

    if (!innerHtml) {
      // If none of those are mapped, just list first few bindings
      Object.keys(activeProfile).slice(0, 4).forEach(btnIdx => {
        const action = activeProfile[btnIdx];
        const glyph = currentGlyphs[btnIdx] || btnIdx;
        const label = ACTION_LABELS[action] || action;
        innerHtml += `
          <div class="remapad-hud-item">
            <span class="remapad-hud-glyph">${glyph}</span>
            <span class="remapad-hud-label">${label}</span>
          </div>
        `;
      });
    }

    // Add close button
    innerHtml += `<div class="remapad-hud-close" id="remapad-hud-close-btn" title="Hide (Hold L3+R3 to restore)">✕</div>`;

    hudElement.innerHTML = innerHtml;

    document.getElementById('remapad-hud-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hudPermanentlyHidden = true;
      hideHUD();
    });

    if (gamepadConnected) {
      showHUDTemporarily();
    }
  }

  function showHUDTemporarily() {
    if (hudPermanentlyHidden || !hudElement) return;

    hudElement.classList.add('visible');
    hudVisible = true;

    clearTimeout(hudTimeout);
    hudTimeout = setTimeout(() => {
      hideHUD();
    }, HUD_AUTO_HIDE_MS);
  }

  function hideHUD() {
    if (hudElement && hudVisible) {
      hudElement.classList.remove('visible');
      hudVisible = false;
    }
  }

  function removeHUD() {
    document.documentElement.removeAttribute('data-remapad-active');
    if (hudElement) {
      hudElement.remove();
      hudElement = null;
    }
    if (hudStyleElement) {
      hudStyleElement.remove();
      hudStyleElement = null;
    }
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // ─── Boot ───────────────────────────────────────────────────────────────────

  init();
})();
