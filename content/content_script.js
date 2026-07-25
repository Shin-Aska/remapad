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

  const CS = window.RemapadCS || {};

  const {
    POLL_INTERVAL_MS,
    DEADZONE,
    AXIS_REPEAT_DELAY_MS,
    CURSOR_SPEED_PX_PER_SEC,
    MAX_DOM_ACTION_PAYLOAD_LENGTH,
    DEFAULT_NAV_SETTINGS,
    DEFAULT_PROFILE,
    GLYPHS,
    ACTION_LABELS,
    DOM_ACTION_OPERATIONS,
    TOGGLEABLE_DOM_ATTRIBUTES,
    SITE_SEARCH_SELECTORS,
    FULLSCREEN_CONTROL_SELECTOR,
    WEBSITE_MAPPINGS_DEFAULT,
    SITE_COLLECTIONS_DEFAULT,
    CONTROLLER_STYLE_PATTERNS
  } = CS.Constants || {};

  const {
    clamp,
    clampIndex,
    escapeHtml,
    escapeCssIdentifier,
    escapeCssString,
    hexToRgba,
    isVisibleElement,
    getElementArea,
    safeQuerySelector,
    isRemapadElement,
    getKeyboardCode,
    getLegacyKeyCode,
    dispatchKeyEvent,
    rectCenter,
    centerDistance,
    isDirectionalMove,
    isInBeam,
    primaryEdgeDistance,
    orthogonalEdgeDistance,
    anchorDistance,
    createWavProbeDataUrl
  } = CS.Utils || {};

  const messagingClient = CS.MessagingClient?.create(api);
  const controllerStyle = CS.ControllerStyle?.create(CONTROLLER_STYLE_PATTERNS);
  const currentHostname = location.hostname.replace(/^www\./, '');
  const settingsStore = CS.SettingsStore?.create({ api, constants: CS.Constants, hostname: currentHostname });
  const sitePolicy = CS.SitePolicy?.create({ constants: CS.Constants, hostname: currentHostname });
  const domSimulator = CS.DomSimulator?.create({ utils: CS.Utils, constants: CS.Constants, messagingClient });

  // ─── State ──────────────────────────────────────────────────────────────────

  let settings = settingsStore.getSettings();
  let activeProfile = settingsStore.getActiveProfile();

  // ─── Collection Navigation State ─────────────────────────────────────────────
  let activeCollectionIndex = -1;
  let activeItemIndex = -1;
  let activeCollectionEl = null;
  let preferredInlineX = null;

  let activeProfile = { ...DEFAULT_PROFILE };
  let prevButtonStates = [];
  let axisTimers = {};
  let axisRepeatCounts = { left: 0, right: 0 };
  let axisLastDirections = { left: null, right: null };
  let hudElement = null;
  let hudStyleElement = null;
  let hudTimeout = null;
  let hudVisible = false;
  let hudHighlightedIndex = -1;
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
  let keyboardOpenTarget = null;
  let keyboardFocusSetupDone = false;
  let keyboardIgnoreFocusTarget = null;
  let keyboardIgnoreFocusUntil = 0;
  let siteMappingActive = false;
  const cursors = {
    left:  { element: null, target: null, x: 0, y: 0, visible: false },
    right: { element: null, target: null, x: 0, y: 0, visible: false }
  };
  let cursorStyleElement = null;
  let cnavHudElement = null;
  let cnavHudTimeout = null;
  let modalFocusObserver = null;
  let modalFocusTimeout = null;
  let modalFocusAnimationFrame = null;
  let modalFocusGeneration = 0;
  const modalOpeners = new WeakMap();

  function resolveIconStyle() {
    return controllerStyle.resolve(settings.iconStyle);
  }

  // ─── Initialisation ─────────────────────────────────────────────────────────

  async function init() {
    try {
      const { isMapped } = await settingsStore.load();

      settings = settingsStore.getSettings();
      activeProfile = settingsStore.getActiveProfile();
      siteMappingActive = isMapped;

      setupKeyboardFocusTrigger();

      const quickMapAvailable = settingsStore.isQuickMapAvailable();

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

      showAutoplayWarningIfBlocked();
    } catch (e) {
      console.warn('[Remapad CS] Init failed:', e);
    }
  }

  async function showAutoplayWarningIfBlocked() {
    if (!settings.globalEnabled || settings.enabledSites[currentHostname] === false) return;
    if (!settingsStore.isMapped()) return;
    const status = await checkAutoplayPolicy();
    if (status.mediaelement !== 'allowed' && !autoplayWarningShown) {
      autoplayWarningShown = true;
      showAutoplayWarning(formatAutoplayWarning(status));
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
    const previous = controllerStyle.getDetected();
    controllerStyle.update(gp.id);
    if (controllerStyle.getDetected() !== previous && settings.iconStyle === 'auto') {
      if (hudVisible) updateHUD();
      if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) {
        const glyphs = GLYPHS[resolveIconStyle()] || GLYPHS.playstation;
        RemapadKeyboard.setShortcutGlyphs({
          confirm: glyphs['2'],
          cancel: glyphs['1'],
          backspace: glyphs['3']
        });
      }
    }

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

    const nav = settings.navSettings;

    if (nav?.enabled && siteMappingActive) {
      const leftMode = nav.leftStick?.mode;
      const rightMode = nav.rightStick?.mode;

      if (leftMode === 'cursor') {
        updateCursor('left', gp.axes[0] || 0, gp.axes[1] || 0);
      } else {
        hideCursor('left');
        handleStick(gp.axes[0], gp.axes[1], 'left', nav);
      }

      if (rightMode === 'cursor') {
        updateCursor('right', gp.axes[2] || 0, gp.axes[3] || 0);
      } else {
        hideCursor('right');
        handleStick(gp.axes[2], gp.axes[3], 'right', nav);
      }
    } else {
      hideCursor('left');
      hideCursor('right');
    }
  }

  function handleStick(x, y, stickId, nav) {
    if (quickMapElement) return;
    const stickConfig = stickId === 'left' ? nav.leftStick : nav.rightStick;
    if (!stickConfig?.enabled) return;

    const mode = stickConfig.mode;
    if (mode === 'disabled') return;

    const deadzone = stickConfig.deadzone ?? DEADZONE;
    x = x || 0;
    y = y || 0;
    if (Math.hypot(x, y) <= deadzone) {
      const timerKey = `axis_${stickId}`;
      if (axisTimers[timerKey]) {
        clearTimeout(axisTimers[timerKey]);
        delete axisTimers[timerKey];
      }
      if (axisLastDirections[stickId] !== null) {
        axisLastDirections[stickId] = null;
        axisRepeatCounts[stickId] = 0;
      }
      return;
    }

    // HUD mode: keep legacy D-pad/left-stick navigation behaviour while visible
    if (hudVisible && stickId === 'left') {
      const timerKey = `axis_${stickId}`;
      if (!axisTimers[timerKey]) {
        onStickMove(x, y);
        axisTimers[timerKey] = setTimeout(() => delete axisTimers[timerKey], AXIS_REPEAT_DELAY_MS);
      }
      return;
    }

    // Virtual keyboard mode: route stick axes to keyboard focus navigation
    if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) {
      const timerKey = `axis_${stickId}`;
      if (!axisTimers[timerKey]) {
        if (stickId === 'left') {
          onStickMove(x, y);
        } else {
          onFocusStickMove(y);
        }
        axisTimers[timerKey] = setTimeout(() => delete axisTimers[timerKey], AXIS_REPEAT_DELAY_MS);
      }
      return;
    }

    const direction = resolveStickDirection(x, y, stickConfig.directionMode);
    let action = nav.axisMap?.[direction]?.action;
    const axisBelongsToStick = nav.axisMap?.[direction]?.stick === stickId;

    if (!axisBelongsToStick || !action || action === 'none') {
      action = getDefaultStickAction(direction, mode);
      if (!action || action === 'none') return;
    }

    const timerKey = `axis_${stickId}`;
    if (axisTimers[timerKey]) return;

    if (mode === 'navigate' || (mode === 'scroll' && action.startsWith('nav_'))) {
      executeAction(action);
    } else if (mode === 'scroll') {
      executeScrollAction(action, nav.leftStick.scrollAmountPx ?? 150);
    }

    axisLastDirections[stickId] = direction;
    axisRepeatCounts[stickId] += 1;

    const baseDelay = stickConfig.repeatDelayMs ?? AXIS_REPEAT_DELAY_MS;
    const accel = stickConfig.repeatAcceleration;
    const repeats = axisRepeatCounts[stickId];
    let delay = baseDelay;
    if (accel && repeats > 0) {
      delay = Math.max(80, baseDelay - Math.min(repeats, 5) * ((baseDelay - 80) / 5));
    }

    axisTimers[timerKey] = setTimeout(() => {
      delete axisTimers[timerKey];
    }, delay);
  }

  function getDefaultStickAction(direction, mode) {
    if (mode === 'scroll') {
      return `scroll_${direction}`;
    }
    if (mode === 'navigate') {
      return `nav_${direction}`;
    }
    return 'none';
  }

  function resolveStickDirection(x, y, directionMode) {
    if (directionMode === '8-way') {
      const angle = Math.atan2(-y, x);
      const octant = Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
      return ['left', 'up-left', 'up', 'up-right', 'right', 'down-right', 'down', 'down-left'][octant];
    }
    // dominant-axis (default)
    if (Math.abs(y) >= Math.abs(x)) {
      return y < 0 ? 'up' : 'down';
    }
    return x < 0 ? 'left' : 'right';
  }

  function executeScrollAction(action, scrollAmountPx) {
    const scrollBy = (el, top, left) => el.scrollBy({ top, left, behavior: 'smooth' });
    switch (action) {
      case 'scroll_up':
        scrollBy(domSimulator.getScrollableElement(), -scrollAmountPx, 0);
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowUp', 'ArrowUp');
        break;
      case 'scroll_down':
        scrollBy(domSimulator.getScrollableElement(), scrollAmountPx, 0);
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowDown', 'ArrowDown');
        break;
      case 'scroll_left':
        scrollBy(domSimulator.getScrollableElement(), 0, -scrollAmountPx);
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowLeft', 'ArrowLeft');
        break;
      case 'scroll_right':
        scrollBy(domSimulator.getScrollableElement(), 0, scrollAmountPx);
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowRight', 'ArrowRight');
        break;
      case 'nav_up':
        scrollBy(domSimulator.getScrollableElement(), -scrollAmountPx, 0);
        break;
      case 'nav_down':
        scrollBy(domSimulator.getScrollableElement(), scrollAmountPx, 0);
        break;
      case 'nav_left':
        scrollBy(domSimulator.getScrollableElement(), 0, -scrollAmountPx);
        break;
      case 'nav_right':
        scrollBy(domSimulator.getScrollableElement(), 0, scrollAmountPx);
        break;
    }
  }

  // ─── Action Dispatcher ─────────────────────────────────────────────────────

  function onButtonPress(btnIdx) {
    const keyboardOpen = typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen();
    if (keyboardOpen) {
      if (btnIdx === 12) { RemapadKeyboard.moveFocus('up'); return false; }
      if (btnIdx === 13) { RemapadKeyboard.moveFocus('down'); return false; }
      if (btnIdx === 14) { RemapadKeyboard.moveFocus('left'); return false; }
      if (btnIdx === 15) { RemapadKeyboard.moveFocus('right'); return false; }
      if (btnIdx === 0) { RemapadKeyboard.activateFocus(); return false; }
      if (btnIdx === 1) { RemapadKeyboard.close(false); return false; }
      if (btnIdx === 2) { RemapadKeyboard.close(true); return false; }
      if (btnIdx === 3) { RemapadKeyboard.pressBackspace(); return false; }
    }

    if (quickMapElement) {
      if (btnIdx === 9) {
        closeQuickMap();
      } else {
        selectQuickMapButton(btnIdx);
      }
      return false;
    }

    if (hudVisible) {
      const hudItems = [
        '0', '1', '2', '3', '4', '5', '6', '7',
        '8', '9', '10', '11', '12', '13', '14', '15',
        'ls', 'rs', 'edit'
      ];
      const hudItemCount = hudItems.length;

      // Initialize highlight if user navigates using D-pad
      if (hudHighlightedIndex === -1 && (btnIdx === 12 || btnIdx === 13 || btnIdx === 14 || btnIdx === 15)) {
        hudHighlightedIndex = 0;
        updateHUDHighlight();
        return false; // consume button press
      }

      if (hudHighlightedIndex >= 0) {
        if (btnIdx === 0) { // Cross / A: execute selected action
          const target = hudItems[hudHighlightedIndex];
          if (target === 'edit') {
            messagingClient.openSiteMapping();
            hideHUD();
          } else if (target !== 'ls' && target !== 'rs') {
            const action = activeProfile[target];
            if (action && action !== 'none') {
              executeAction(action);
              hideHUD();
            }
          }
          return false; // consume button press
        }
        if (btnIdx === 1) { // Circle / B: cancel highlight / hide HUD
          hudHighlightedIndex = -1;
          updateHUDHighlight();
          hideHUD();
          return false; // consume button press
        }
        if (btnIdx === 14) { // D-pad Left
          hudHighlightedIndex = (hudHighlightedIndex - 1 + hudItemCount) % hudItemCount;
          updateHUDHighlight();
          return false; // consume
        }
        if (btnIdx === 15) { // D-pad Right
          hudHighlightedIndex = (hudHighlightedIndex + 1) % hudItemCount;
          updateHUDHighlight();
          return false; // consume
        }
        if (btnIdx === 12 || btnIdx === 13) {
          // Consume D-pad up/down to prevent page scrolling while HUD is highlighted
          return false; 
        }
      }
    }

    const action = activeProfile[btnIdx.toString()];
    if (!action || action === 'none') return false;

    if (btnIdx === 9 && action === 'open_options') {
      openQuickMap();
      return false;
    }

    if (!siteMappingActive) return false;

    executeAction(action);
    return true;
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

    if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) {
      if (Math.abs(y) > DEADZONE || Math.abs(x) > DEADZONE) {
        if (Math.abs(y) > Math.abs(x)) {
          RemapadKeyboard.moveFocus(y < 0 ? 'up' : 'down');
        } else {
          RemapadKeyboard.moveFocus(x < 0 ? 'left' : 'right');
        }
      }
      return;
    }

    if (hudVisible) {
      const hudItemCount = 19;
      if (Math.abs(x) > DEADZONE) {
        if (hudHighlightedIndex === -1) {
          hudHighlightedIndex = 0;
          updateHUDHighlight();
        } else {
          const direction = x > 0 ? 1 : -1;
          hudHighlightedIndex = (hudHighlightedIndex + direction + hudItemCount) % hudItemCount;
          updateHUDHighlight();
        }
      }
      return; // consume input
    }

    if (Math.abs(y) > Math.abs(x)) {
      executeAction(y < -DEADZONE ? 'scroll_up' : 'scroll_down');
    } else {
      executeAction(x < -DEADZONE ? 'scroll_left' : 'scroll_right');
    }
  }

  function onFocusStickMove(y) {
    if (quickMapElement) return;

    if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) {
      if (Math.abs(y) > DEADZONE) {
        RemapadKeyboard.moveFocus(y < 0 ? 'up' : 'down');
      }
      return;
    }

    executeAction(y < -DEADZONE ? 'focus_prev' : 'focus_next');
  }

  function executeAction(action) {
    console.log('[Remapad CS] Executing action:', action);

    if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) {
      switch (action) {
        case 'scroll_up':
        case 'nav_up':
        case 'focus_up':
          RemapadKeyboard.moveFocus('up');
          return;
        case 'scroll_down':
        case 'nav_down':
        case 'focus_down':
          RemapadKeyboard.moveFocus('down');
          return;
        case 'scroll_left':
        case 'nav_left':
        case 'focus_left':
          RemapadKeyboard.moveFocus('left');
          return;
        case 'scroll_right':
        case 'nav_right':
        case 'focus_right':
          RemapadKeyboard.moveFocus('right');
          return;
        case 'click':
        case 'select':
          RemapadKeyboard.activateFocus();
          return;
        case 'back':
        case 'backspace':
          RemapadKeyboard.close(false);
          return;
      }
    }

    if (action === 'toggle_hud') {
      toggleHUD();
      return;
    }

    // Collection navigation actions
    if (action === 'nav_next_collection' || action === 'nav_prev_collection' ||
        action === 'nav_next_item' || action === 'nav_prev_item') {
      executeCollectionNav(action);
      return;
    }

    // Spatial navigation directions
    if (action === 'nav_up' || action === 'nav_down' ||
        action === 'nav_left' || action === 'nav_right') {
      const direction = action.substring('nav_'.length);
      executeSpatialNav(direction);
      return;
    }

    // Complex custom actions
    if (action.startsWith('click_element:')) {
      const selector = action.substring('click_element:'.length);
      const el = safeQuerySelector(selector);
      if (el) {
        const modalFocusState = beginModalFocusTracking();
        el.click();
        el.focus?.();
        focusNewModalAfterClick(modalFocusState);
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
      domSimulator.executeDomAction(action.substring('dom_action:'.length), {
        beginModalFocusTracking,
        focusNewModalAfterClick,
        focusElement
      });
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
      messagingClient.browserAction(action);
      return;
    }

    // Tab-level actions handled directly in DOM
    const video = document.querySelector('video');

    switch (action) {
      case 'click': {
        if ((cursors.right.visible && cursors.right.target) || (cursors.left.visible && cursors.left.target)) {
          executeCursorClick();
          break;
        }
        const el = document.activeElement;
        if (el && el !== document.body) {
          const modalFocusState = beginModalFocusTracking();
          el.click();
          focusNewModalAfterClick(modalFocusState);
        } else {
          dispatchKeyEvent(document.body, 'Enter', 'Enter');
        }
        break;
      }
      case 'back': {
        performBackAction();
        break;
      }
      case 'search': {
        const input = sitePolicy.findSearchTarget();
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
        domSimulator.toggleFullscreen();
        break;
      }
      case 'scroll_up': {
        domSimulator.getScrollableElement().scrollBy({ top: -150, behavior: 'smooth' });
        dispatchKeyEvent(document.activeElement || document.body, 'ArrowUp', 'ArrowUp');
        break;
      }
      case 'scroll_down': {
        domSimulator.getScrollableElement().scrollBy({ top: 150, behavior: 'smooth' });
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

  // ─── Collection Navigation ───────────────────────────────────────────────────

  function getCollectionConfig() {
    return sitePolicy.getCollectionConfig(settings);
  }

  function getCollectionContainers() {
    const config = getCollectionConfig();
    if (!config?.containerSelector) return [];
    try {
      return Array.from(document.querySelectorAll(config.containerSelector)).filter(
        el => !el.closest('.remapad-hud-container, .remapad-quick-map') && isVisibleElement(el)
      );
    } catch (e) {
      console.warn('[Remapad CS] Invalid containerSelector:', config.containerSelector, e);
      return [];
    }
  }

  function getCollectionItems(containerEl) {
    const config = getCollectionConfig();
    if (!config?.itemSelector || !containerEl) return [];
    try {
      return Array.from(containerEl.querySelectorAll(config.itemSelector)).filter(
        el => isVisibleElement(el)
      );
    } catch (e) {
      console.warn('[Remapad CS] Invalid itemSelector:', config.itemSelector, e);
      return [];
    }
  }

  function setActiveCollectionEl(el) {
    if (activeCollectionEl === el) return;
    activeCollectionEl?.classList.remove('remapad-active-collection');
    activeCollectionEl = el;
    activeCollectionEl?.classList.add('remapad-active-collection');
  }

  function executeCollectionNav(action) {
    const nav = settings.navSettings;
    const config = getCollectionConfig();
    const useCollection = nav.strategy === 'collection' || (nav.strategy === 'auto' && config);

    if (!useCollection) {
      // Fall back to DOM-order for the old row/item actions
      if (action === 'nav_next_collection' || action === 'nav_next_item') {
        moveFocus(1);
      } else {
        moveFocus(-1);
      }
      return;
    }

    if (!config) {
      console.warn('[Remapad CS] No collection config for:', currentHostname);
      return;
    }

    if (action === 'nav_next_collection' || action === 'nav_prev_collection') {
      const containers = getCollectionContainers();
      if (!containers.length) return;

      const direction = action === 'nav_next_collection' ? 1 : -1;

      if (activeCollectionIndex === -1) {
        activeCollectionIndex = findClosestCollectionIndex(containers);
      } else {
        activeCollectionIndex = clampIndex(activeCollectionIndex + direction, 0, containers.length - 1);
      }

      activeItemIndex = -1;

      const activeContainer = containers[activeCollectionIndex];
      setActiveCollectionEl(activeContainer);
      activeContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

      showCNavHUD(
        activeCollectionIndex,
        containers.length,
        -1,
        getCollectionItems(activeContainer).length,
        getCollectionLabel(activeContainer)
      );
      return;
    }

    if (action === 'nav_next_item' || action === 'nav_prev_item') {
      if (activeCollectionIndex === -1 || !isActiveCollectionValid()) {
        executeCollectionNav('nav_next_collection');
        if (activeCollectionIndex === -1) return;
      }

      const containers = getCollectionContainers();
      const container = containers[activeCollectionIndex];
      if (!container) return;

      const items = getCollectionItems(container);
      if (!items.length) return;

      const direction = action === 'nav_next_item' ? 1 : -1;

      if (activeItemIndex === -1) {
        activeItemIndex = direction > 0 ? 0 : items.length - 1;
      } else {
        activeItemIndex = clampIndex(activeItemIndex + direction, 0, items.length - 1);
      }

      activateCollectionItem(container, items, activeItemIndex);
      return;
    }
  }

  function executeSpatialNav(direction) {
    const nav = settings.navSettings;
    const config = getCollectionConfig();
    const useCollection = nav.strategy === 'collection' ||
      (nav.strategy === 'auto' && config) ||
      (nav.strategy === 'collection' && config);

    if (useCollection && config) {
      executeCollectionSpatialNav(direction);
    } else if (nav.strategy === 'dom-order') {
      moveFocus(direction === 'down' || direction === 'right' ? 1 : -1);
    } else {
      executeDomSpatialNav(direction);
    }
  }

  function executeCollectionSpatialNav(direction) {
    const nav = settings.navSettings;
    const config = getCollectionConfig();
    if (!config) return;

    let containers = getCollectionContainers();
    if (!containers.length) return;

    if (activeCollectionIndex === -1 || !isActiveCollectionValid()) {
      activeCollectionIndex = findClosestCollectionIndex(containers);
      activeItemIndex = -1;
    }

    const container = containers[activeCollectionIndex];
    const items = container ? getCollectionItems(container) : [];

    if (activeItemIndex === -1 || !items[activeItemIndex]) {
      if (!items.length) return;
      activeItemIndex = pickInitialItemIndex(items, direction);
      activateCollectionItem(container, items, activeItemIndex, false);
      return;
    }

    const currentItem = items[activeItemIndex];
    const currentRect = currentItem.getBoundingClientRect();

    if (direction === 'left' || direction === 'right') {
      const nextIndex = computeNextItemIndex(items, activeItemIndex, direction, nav.collectionGrid.wrapItems);
      if (nextIndex !== activeItemIndex) {
        activeItemIndex = nextIndex;
        activateCollectionItem(container, items, activeItemIndex);
      }
      return;
    }

    if (direction === 'up' || direction === 'down') {
      const rowDelta = direction === 'down' ? 1 : -1;
      let targetIndex = activeCollectionIndex + rowDelta;
      if (nav.collectionGrid.wrapRows) {
        targetIndex = (targetIndex + containers.length) % containers.length;
      }
      if (targetIndex < 0 || targetIndex >= containers.length) return;

      const targetContainer = containers[targetIndex];
      const targetItems = getCollectionItems(targetContainer);
      if (!targetItems.length) return;

      const inlineX = preferredInlineX ?? (currentRect.left + currentRect.width / 2);
      const nextItemIndex = findNearestItemInRow(targetItems, currentRect, inlineX);
      activeCollectionIndex = targetIndex;
      activeItemIndex = nextItemIndex;
      setActiveCollectionEl(targetContainer);
      activateCollectionItem(targetContainer, targetItems, activeItemIndex);
    }
  }

  function pickInitialItemIndex(items, direction) {
    if (direction === 'left' || direction === 'up') {
      return items.length - 1;
    }
    if (direction === 'right' || direction === 'down') {
      return 0;
    }
    return 0;
  }

  function executeDomSpatialNav(direction) {
    const source = controllerFocusedElement || document.activeElement || document.body;
    const sourceIsBody = source === document.body || source === document.documentElement;
    const sourceRect = source.getBoundingClientRect();
    const candidates = getSpatialCandidates(source);
    if (!candidates.length) return;

    let best;
    if (sourceIsBody) {
      best = pickInitialCandidate(sourceRect, candidates, direction);
    } else {
      best = pickBestCandidate(sourceRect, candidates, direction, null);
    }
    if (!best) return;

    const focusTarget = best.matches('a,button,[tabindex]')
      ? best
      : best.querySelector('a,button,[tabindex]:not([tabindex="-1"])');
    if (focusTarget) {
      focusElement(focusTarget);
    } else {
      controllerFocusedElement?.classList.remove('remapad-controller-focus');
      domSimulator.dispatchHoverEvents(controllerFocusedElement, false);
      domSimulator.dispatchHoverEvents(best, true);
      best.classList.add('remapad-controller-focus');
      best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      controllerFocusedElement = best;
    }
  }

  function pickInitialCandidate(sourceRect, candidates, direction) {
    const viewportMidX = window.innerWidth / 2;
    const viewportMidY = window.innerHeight / 2;
    let best = null;
    let bestScore = Infinity;

    candidates.forEach(candidate => {
      const rect = candidate.getBoundingClientRect();
      const center = rectCenter(rect);
      const dx = center.x - viewportMidX;
      const dy = center.y - viewportMidY;

      const inRequestedHalf =
        (direction === 'up' && dy < 0) ||
        (direction === 'down' && dy > 0) ||
        (direction === 'left' && dx < 0) ||
        (direction === 'right' && dx > 0);

      let score = Math.hypot(dx, dy);
      if (inRequestedHalf) score -= 200;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    return best;
  }

  function getSpatialCandidates(scopeSource) {
    const focusables = getFocusableElements();
    const mediaCards = Array.from(document.querySelectorAll(
      '[data-testid="card"], [data-testid*="title" i], .title-card, .title-card-container'
    )).filter(el => isVisibleElement(el) && !el.closest('.remapad-hud-container, .remapad-quick-map'));

    const modal = getOpenModals()[0];
    let all = [...focusables, ...mediaCards];
    if (modal) {
      all = all.filter(el => modal.contains(el) || el === modal);
    }

    const seen = new Set();
    const candidates = [];
    for (const el of all) {
      if (seen.has(el) || el === scopeSource) continue;
      seen.add(el);
      candidates.push(el);
    }
    return candidates;
  }

  function pickBestCandidate(sourceRect, candidates, direction, preferredInline) {
    const nav = settings.navSettings;
    const penalty = nav.collectionGrid.lateralPenalty ?? 3;
    const orthogonalWeight = 2;
    let best = null;
    let bestScore = Infinity;

    candidates.forEach(candidate => {
      const rect = candidate.getBoundingClientRect();
      if (!isDirectionalMove(direction, sourceRect, rect)) return;

      const inBeam = isInBeam(direction, sourceRect, rect);
      const primaryGap = primaryEdgeDistance(direction, sourceRect, rect);
      const orthogonalGap = orthogonalEdgeDistance(direction, sourceRect, rect);
      const anchorOffset = preferredInline !== null && preferredInline !== undefined
        ? anchorDistance(direction, rect, preferredInline)
        : 0;
      const centerDist = centerDistance(sourceRect, rect);

      let score;
      if (inBeam) {
        score = primaryGap * 1000 + anchorOffset * 100 + centerDist;
      } else {
        score = (primaryGap + orthogonalWeight * orthogonalGap) * 1000 + centerDist;
      }
      score += penalty * orthogonalGap;

      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    });

    return best;
  }

  function findClosestCollectionIndex(containers) {
    const viewportMid = window.innerHeight / 2;
    let closestIdx = 0;
    let closestDist = Infinity;
    containers.forEach((c, i) => {
      const rect = c.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - viewportMid);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });
    return closestIdx;
  }

  function isActiveCollectionValid() {
    if (!activeCollectionEl) return false;
    const containers = getCollectionContainers();
    const idx = containers.indexOf(activeCollectionEl);
    if (idx === -1) return false;
    activeCollectionIndex = idx;
    return true;
  }

  function computeNextItemIndex(items, currentIndex, direction, wrap) {
    const next = direction === 'right' ? currentIndex + 1 : currentIndex - 1;
    if (wrap) {
      return (next + items.length) % items.length;
    }
    return clampIndex(next, 0, items.length - 1);
  }

  function findNearestItemInRow(targetItems, sourceRect, preferredInlineX) {
    let bestIndex = 0;
    let bestScore = Infinity;

    targetItems.forEach((item, idx) => {
      const rect = item.getBoundingClientRect();
      const center = rectCenter(rect);
      const score = Math.abs(center.x - preferredInlineX);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    });

    return bestIndex;
  }

  function activateCollectionItem(container, items, index, showHud = true) {
    const item = items[index];
    if (!item) return;

    const rect = item.getBoundingClientRect();
    preferredInlineX = rect.left + rect.width / 2;

    clearPrevCollectionHover(items);
    item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

    const focusTarget = item.matches('a,button,[tabindex]') ? item
      : item.querySelector('a,button,[tabindex]:not([tabindex="-1"])');
    if (focusTarget) {
      focusElement(focusTarget);
    } else {
      domSimulator.dispatchHoverEvents(item, true);
      item.classList.add('remapad-hover');
    }

    if (showHud) {
      const allContainers = getCollectionContainers();
      showCNavHUD(
        activeCollectionIndex,
        allContainers.length,
        activeItemIndex,
        items.length,
        getCollectionLabel(container)
      );
    }
  }

  function clearPrevCollectionHover(items) {
    items.forEach(item => {
      item.classList.remove('remapad-hover');
      domSimulator.dispatchHoverEvents(item, false);
    });
  }

  function resetCollectionNavState() {
    const config = getCollectionConfig();
    if (config && activeCollectionEl) {
      const items = getCollectionItems(activeCollectionEl);
      clearPrevCollectionHover(items);
    }
    setActiveCollectionEl(null);
    activeCollectionIndex = -1;
    activeItemIndex = -1;
    preferredInlineX = null;
    hideCNavHUD(true);
  }

  // ─── Collection Nav HUD ──────────────────────────────────────────────────────

  function getCollectionLabel(containerEl) {
    if (!containerEl) return '';
    // Try common heading/label attributes within the container
    const labelEl = containerEl.querySelector(
      '[aria-label], h2, h3, h4, [data-title], .row-header, .lolomoRowHeader, .title'
    );
    const text = (labelEl?.getAttribute('aria-label') || labelEl?.textContent || '').trim();
    return text.length > 40 ? text.slice(0, 40) + '…' : text;
  }

  function showCNavHUD(collectionIndex, collectionCount, itemIndex, itemCount, collectionLabel) {
    injectHUDStyles();

    if (!cnavHudElement) {
      cnavHudElement = document.createElement('div');
      cnavHudElement.className = 'remapad-cnav-hud';
      cnavHudElement.setAttribute('role', 'status');
      cnavHudElement.setAttribute('aria-live', 'polite');
      document.body.appendChild(cnavHudElement);
      // Trigger entrance animation on next frame
      requestAnimationFrame(() => cnavHudElement?.classList.add('visible'));
    }

    // Build dot-progress for items
    const MAX_DOTS = 12;
    let dotsHtml = '';
    if (itemCount > 0 && itemIndex >= 0) {
      const dotCount = Math.min(itemCount, MAX_DOTS);
      const dotActive = itemCount <= MAX_DOTS
        ? itemIndex
        : Math.round((itemIndex / (itemCount - 1)) * (MAX_DOTS - 1));
      for (let i = 0; i < dotCount; i++) {
        dotsHtml += `<span class="remapad-cnav-dot${i === dotActive ? ' active' : ''}"></span>`;
      }
    }

    const rowLabel = collectionLabel ? `<span class="remapad-cnav-label">${escapeHtml(collectionLabel)}</span>` : '';
    const rowPos = `<span class="remapad-cnav-pos">Row ${collectionIndex + 1} <span class="remapad-cnav-of">of</span> ${collectionCount}</span>`;
    const itemPos = itemIndex >= 0 && itemCount > 0
      ? `<span class="remapad-cnav-item">Item ${itemIndex + 1} <span class="remapad-cnav-of">of</span> ${itemCount}</span>`
      : (itemCount > 0 ? `<span class="remapad-cnav-item remapad-cnav-item--hint">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>` : '');

    cnavHudElement.innerHTML = `
      <div class="remapad-cnav-left">
        <svg class="remapad-cnav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        ${rowPos}
        ${rowLabel}
      </div>
      <div class="remapad-cnav-right">
        ${dotsHtml ? `<div class="remapad-cnav-dots">${dotsHtml}</div>` : ''}
        ${itemPos}
      </div>
    `;

    // Auto-dismiss after 2.5s of no input
    clearTimeout(cnavHudTimeout);
    cnavHudTimeout = setTimeout(() => hideCNavHUD(), 2500);
  }

  function hideCNavHUD(immediate = false) {
    clearTimeout(cnavHudTimeout);
    cnavHudTimeout = null;
    if (!cnavHudElement) return;
    if (immediate) {
      cnavHudElement.remove();
      cnavHudElement = null;
      return;
    }
    cnavHudElement.classList.remove('visible');
    const el = cnavHudElement;
    cnavHudElement = null;
    // Remove from DOM after transition
    setTimeout(() => el.remove(), 400);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function performBackAction() {
    if (sitePolicy.navigateNetflixHome()) return;

    const modal = getOpenModals()[0];
    if (modal && closeModal(modal)) return;

    resetNavigationState();
    history.back();
  }

  function getOpenModals() {
    const selector = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[data-uia*="modal" i]',
      '[data-testid*="modal" i]',
      '[class*="modal" i]'
    ].join(', ');

    return Array.from(document.querySelectorAll(selector))
      .filter(element => !isRemapadElement(element) && isVisibleElement(element))
      .sort((first, second) => {
        const firstZIndex = Number.parseInt(getComputedStyle(first).zIndex, 10) || 0;
        const secondZIndex = Number.parseInt(getComputedStyle(second).zIndex, 10) || 0;
        if (firstZIndex !== secondZIndex) return secondZIndex - firstZIndex;
        return first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
      });
  }

  function closeModal(modal) {
    const previousFocus = modalOpeners.get(modal) || controllerFocusedElement;
    const closeControl = Array.from(modal.querySelectorAll('button, [role="button"], a[href]')).find(
      element => isVisibleElement(element) && !element.matches(':disabled') && isDismissControl(element)
    );

    if (closeControl) {
      closeControl.click();
      restoreFocusAfterModalClose(previousFocus, modal);
      return true;
    }

    if (typeof modal.close === 'function') {
      modal.close();
      restoreFocusAfterModalClose(previousFocus, modal);
      return true;
    }

    return false;
  }

  function isDismissControl(element) {
    if (element.matches('button.close, button.close-button, [role="button"].close-button, button[class~="close" i], [role="button"][class~="close" i]')) {
      return true;
    }

    const hasDismissIdentifier = value => /(?:^|[-_\s])(?:close|dismiss|cancel)(?:$|[-_\s])/i.test(value || '');
    if (hasDismissIdentifier(element.getAttribute('data-uia')) || hasDismissIdentifier(element.getAttribute('data-testid'))) {
      return true;
    }

    const isDismissLabel = value => /^(?:close|dismiss|cancel)(?:\s+(?:dialog|modal|menu|panel|overlay|player|preview))?$/i.test((value || '').trim());
    return isDismissLabel(element.getAttribute('aria-label')) || isDismissLabel(element.getAttribute('title'));
  }

  function restoreFocusAfterModalClose(previousFocus, modal) {
    stopModalFocusObserver();
    resetNavigationState();
    const generation = modalFocusGeneration;
    const restoreFocus = () => {
      if (generation !== modalFocusGeneration) return true;
      if (modal.isConnected && isVisibleElement(modal)) return false;
      stopModalFocusObserver();
      if (previousFocus?.isConnected && isVisibleElement(previousFocus)) {
        focusElement(previousFocus);
      }
      return true;
    };

    modalFocusAnimationFrame = requestAnimationFrame(() => {
      modalFocusAnimationFrame = null;
      if (generation !== modalFocusGeneration) return;
      if (restoreFocus()) return;
      modalFocusObserver = new MutationObserver(restoreFocus);
      modalFocusObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-hidden', 'class', 'open', 'style']
      });
      modalFocusTimeout = setTimeout(stopModalFocusObserver, 1200);
    });
  }

  function beginModalFocusTracking() {
    stopModalFocusObserver();
    return {
      existingModals: new Set(getOpenModals()),
      opener: controllerFocusedElement,
      initialUrl: location.href,
      generation: modalFocusGeneration
    };
  }

  function focusNewModalAfterClick({ existingModals, opener, initialUrl, generation }) {

    const focusNewModal = () => {
      if (generation !== modalFocusGeneration) return true;
      const modal = getOpenModals().find(element => !existingModals.has(element));
      if (!modal) return false;

      if (opener?.isConnected) modalOpeners.set(modal, opener);
      resetNavigationState();
      const focusTarget = getModalFocusTarget(modal);
      if (focusTarget) focusElement(focusTarget);
      stopModalFocusObserver();
      return true;
    };

    if (focusNewModal()) return;

    modalFocusObserver = new MutationObserver(focusNewModal);
    modalFocusObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-hidden', 'class', 'open', 'style']
    });
    modalFocusTimeout = setTimeout(() => {
      if (generation !== modalFocusGeneration) return;
      if (location.href !== initialUrl) resetNavigationState();
      stopModalFocusObserver();
    }, 1200);
  }

  function stopModalFocusObserver() {
    modalFocusGeneration += 1;
    modalFocusObserver?.disconnect();
    modalFocusObserver = null;
    clearTimeout(modalFocusTimeout);
    modalFocusTimeout = null;
    if (modalFocusAnimationFrame !== null) cancelAnimationFrame(modalFocusAnimationFrame);
    modalFocusAnimationFrame = null;
  }

  function getModalFocusTarget(modal) {
    const selector = [
      '[autofocus]',
      '[data-uia*="close" i]',
      '[data-testid*="close" i]',
      '[aria-label*="close" i]',
      'button:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    return Array.from(modal.querySelectorAll(selector)).find(isVisibleElement) || null;
  }

  function resetNavigationState() {
    controllerFocusedElement?.classList.remove('remapad-controller-focus');
    controllerFocusedElement = null;
    resetCollectionNavState();
  }

  function moveFocus(direction) {
    const elements = domSimulator.getFocusableElements();
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

  function focusElement(el) {
    el.focus({ preventScroll: true });
    if (document.activeElement !== el) return false;

    controllerFocusedElement?.classList.remove('remapad-controller-focus');
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    el.classList.add('remapad-controller-focus');
    controllerFocusedElement = el;
    return true;
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

    const glyphs = GLYPHS[resolveIconStyle()] || GLYPHS.playstation;
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

  async function saveQuickMap() {
    if (!quickMapState?.selector || quickMapState.button === null || !quickMapState.action) return;

    const { action, button, selector } = quickMapState;
    if (!['click', 'focus', 'hover'].includes(action)) return;
    const actionValue = `${action}_element:${selector}`;
    try {
      activeProfile = await settingsStore.saveButtonMapping(button, actionValue);
      settings = settingsStore.getSettings();
      updateHUD();
      closeQuickMap();
    } catch (error) {
      console.warn('[Remapad CS] Quick Map save failed:', error);
      quickMapState = { ...quickMapState, message: 'Unable to save this mapping. Please try again.' };
      renderQuickMap();
    }
  }

  // ─── Virtual Cursor ─────────────────────────────────────────────────────────

  function initCursor(stickId) {
    const cursor = cursors[stickId];
    if (cursor.element) return;
    injectCursorStyles();

    const el = document.createElement('div');
    el.className = `remapad-cursor remapad-cursor--${stickId}`;
    el.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'remapad-cursor-label';
    label.textContent = stickId === 'left' ? 'L' : 'R';
    el.appendChild(label);
    document.body.appendChild(el);
    cursor.element = el;

    if (!cursor.x || !cursor.y) {
      cursor.x = window.innerWidth / 2;
      cursor.y = window.innerHeight / 2;
    }
  }

  function injectCursorStyles() {
    if (cursorStyleElement) return;
    cursorStyleElement = document.createElement('style');
    cursorStyleElement.textContent = `
      .remapad-cursor {
        position: fixed;
        top: 0;
        left: 0;
        width: 22px;
        height: 22px;
        margin-left: -11px;
        margin-top: -11px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.5);
        z-index: 2147483647;
        pointer-events: none;
        transition: transform 0.05s linear, opacity 0.2s ease;
        opacity: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
      }
      .remapad-cursor.visible {
        opacity: 1;
      }
      .remapad-cursor-label {
        pointer-events: none;
        user-select: none;
      }
      .remapad-cursor-target {
        outline: 3px solid var(--remapad-cursor-color, rgba(229, 9, 20, 0.7)) !important;
        outline-offset: 4px !important;
      }
    `;
    document.head.appendChild(cursorStyleElement);
  }

  function showCursor(stickId) {
    initCursor(stickId);
    const cursor = cursors[stickId];
    cursor.element?.classList.add('visible');
    cursor.visible = true;
  }

  function hideCursor(stickId) {
    const cursor = cursors[stickId];
    cursor.element?.classList.remove('visible');
    cursor.visible = false;
    clearCursorTarget(stickId);
  }

  function removeCursors() {
    hideCursor('left');
    hideCursor('right');
    cursors.left.element?.remove();
    cursors.right.element?.remove();
    cursors.left.element = null;
    cursors.right.element = null;
    cursorStyleElement?.remove();
    cursorStyleElement = null;
  }

  function updateCursor(stickId, ax, ay) {
    if (quickMapElement || !settings.navSettings?.enabled) {
      hideCursor(stickId);
      return;
    }
    const nav = settings.navSettings;
    const stickConfig = stickId === 'left' ? nav.leftStick : nav.rightStick;
    const deadzone = stickConfig?.deadzone ?? DEADZONE;
    const speed = stickConfig?.cursorSpeed ?? CURSOR_SPEED_PX_PER_SEC;
    const magnitude = Math.hypot(ax, ay);

    showCursor(stickId);
    const cursor = cursors[stickId];

    if (magnitude > deadzone) {
      const now = performance.now();
      const dt = cursor.lastTime ? Math.min(0.1, (now - cursor.lastTime) / 1000) : (POLL_INTERVAL_MS / 1000);
      cursor.lastTime = now;

      const normMag = (magnitude - deadzone) / (1 - deadzone);
      const velocity = Math.pow(normMag, 1.2) * speed;
      const nx = ax / magnitude;
      const ny = ay / magnitude;
      cursor.x = clamp(cursor.x + nx * velocity * dt, 0, window.innerWidth);
      cursor.y = clamp(cursor.y + ny * velocity * dt, 0, window.innerHeight);
    } else {
      cursor.lastTime = null;
    }

    if (cursor.element) {
      cursor.element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
      const color = (stickConfig?.cursorColor || '').trim() || defaultCursorColor(stickId);
      cursor.element.style.backgroundColor = hexToRgba(color, 0.85);
      cursor.element.style.boxShadow = `0 0 0 2px ${hexToRgba(color, 0.4)}, 0 4px 16px rgba(0, 0, 0, 0.5)`;
    }

    updateCursorTarget(stickId);
  }

  function defaultCursorColor(stickId) {
    return stickId === 'left' ? '#00a8e1' : '#e50914';
  }

  function updateCursorTarget(stickId) {
    const cursor = cursors[stickId];
    if (!cursor.element) return;
    let el = document.elementFromPoint(cursor.x, cursor.y);
    if (el === cursor.element) el = null;
    let target = el;
    while (target && !isClickableCursorTarget(target)) {
      target = target.parentElement;
    }

    if (target && target !== cursor.target) {
      clearCursorTarget(stickId);
      cursor.target = target;
      const stickConfig = stickId === 'left' ? settings.navSettings?.leftStick : settings.navSettings?.rightStick;
      const color = (stickConfig?.cursorColor || '').trim() || defaultCursorColor(stickId);
      cursor.target.style.setProperty('--remapad-cursor-color', hexToRgba(color, 0.7));
      cursor.target.classList.add('remapad-cursor-target');
      domSimulator.dispatchHoverEvents(cursor.target, true);
    } else if (!target) {
      clearCursorTarget(stickId);
    }
  }

  function isClickableCursorTarget(el) {
    if (!(el instanceof Element)) return false;
    if (isRemapadElement(el)) return false;
    const style = getComputedStyle(el);
    if (style.pointerEvents === 'none') return false;
    const tag = el.tagName;
    return tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' ||
           tag === 'TEXTAREA' || el.matches('[role="button"], [tabindex]:not([tabindex="-1"])') ||
           el.matches('video, .title-card-container, [data-testid="card"], [class*="card" i]');
  }

  function clearCursorTarget(stickId) {
    const cursor = cursors[stickId];
    if (cursor.target) {
      domSimulator.dispatchHoverEvents(cursor.target, false);
      cursor.target.classList.remove('remapad-cursor-target');
      cursor.target.style.removeProperty('--remapad-cursor-color');
      cursor.target = null;
    }
  }

  function executeCursorClick() {
    const rightCursor = cursors.right;
    const leftCursor = cursors.left;
    const activeCursor = (rightCursor.visible && rightCursor.target) ? rightCursor
      : (leftCursor.visible && leftCursor.target) ? leftCursor
      : null;

    if (activeCursor?.target) {
      const modalFocusState = beginModalFocusTracking();
      activateElementAsClick(activeCursor.target, activeCursor.x, activeCursor.y);
      focusNewModalAfterClick(modalFocusState);
      return;
    }

    const fallbackEl = document.elementFromPoint(rightCursor.x, rightCursor.y)
      || document.elementFromPoint(leftCursor.x, leftCursor.y);
    const fallbackCursor = (document.elementFromPoint(rightCursor.x, rightCursor.y) === fallbackEl) ? rightCursor
      : (document.elementFromPoint(leftCursor.x, leftCursor.y) === fallbackEl) ? leftCursor
      : rightCursor;
    if (fallbackEl && !isRemapadElement(fallbackEl)) {
      const modalFocusState = beginModalFocusTracking();
      activateElementAsClick(fallbackEl, fallbackCursor.x, fallbackCursor.y);
      focusNewModalAfterClick(modalFocusState);
    }
  }

  // ─── Keyboard trigger helpers ──────────────────────────────────────────────

  function getEffectiveKeyboardTriggerMode() {
    const siteMode = settings.siteKeyboardTriggerModes?.[currentHostname];
    if (siteMode === 'focus' || siteMode === 'click' || siteMode === 'both' || siteMode === 'disabled') return siteMode;
    return settings.keyboardTriggerMode || 'both';
  }

  function getEffectiveKeyboardTriggerSelectors() {
    const siteSelectors = settings.siteKeyboardTriggerSelectors?.[currentHostname];
    if (Array.isArray(siteSelectors)) return siteSelectors;
    return settings.keyboardTriggerSelectors || [];
  }

  function matchesCustomTriggerSelector(el) {
    const selectors = getEffectiveKeyboardTriggerSelectors();
    if (!selectors.length) return false;
    for (const selector of selectors) {
      if (typeof selector !== 'string') continue;
      try {
        if (el.matches(selector)) return true;
      } catch (e) {
        console.warn('[Remapad CS] Invalid keyboard trigger selector:', selector, e);
      }
    }
    return false;
  }

  function isKeyboardTrigger(el) {
    if (!el) return false;
    if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isEditableElement(el)) return true;
    return matchesCustomTriggerSelector(el);
  }

  function isKeyboardContextActive() {
    if (!settings.keyboardEnabled || typeof RemapadKeyboard === 'undefined') return false;
    if (!settings.globalEnabled) return false;
    if (settings.enabledSites[currentHostname] === false) return false;
    return siteMappingActive;
  }

  function maybeOpenKeyboard(el, x, y) {
    if (!isKeyboardContextActive()) return false;
    const mode = getEffectiveKeyboardTriggerMode();
    if (mode === 'disabled') return false;
    if (!isKeyboardTrigger(el)) return false;

    // Determine trigger source: click (cursor) or focus
    const isClickTrigger = x !== null && x !== undefined;
    if (isClickTrigger && mode !== 'click' && mode !== 'both') return false;
    if (!isClickTrigger && mode !== 'focus' && mode !== 'both') return false;

    // Prevent re-opening keyboard on the same element
    if (keyboardOpenTarget === el) return true;

    keyboardOpenTarget = el;
    resolveKeyboardLayout().then(layoutId => {
      const glyphs = GLYPHS[resolveIconStyle()] || GLYPHS.playstation;
      const shortcutGlyphs = {
        confirm: glyphs['2'],
        cancel: glyphs['1'],
        backspace: glyphs['3']
      };
      RemapadKeyboard.open(el, {
        layoutId,
        layouts: settings.customKeyboardLayouts,
        shortcutGlyphs,
        onClose: (target, confirmed) => {
          keyboardOpenTarget = null;
          if (target) {
            keyboardIgnoreFocusTarget = target;
            keyboardIgnoreFocusUntil = Date.now() + 300;
          }
          if (target && confirmed && isClickTrigger) {
            domSimulator.simulateClickAt(target, x, y);
          }
        }
      });
    });
    return true;
  }

  function setupKeyboardFocusTrigger() {
    if (keyboardFocusSetupDone) return;
    keyboardFocusSetupDone = true;

    document.addEventListener('focusin', (event) => {
      const mode = getEffectiveKeyboardTriggerMode();
      if (mode !== 'focus' && mode !== 'both') return;
      const target = event.target;
      if (!target || target.closest('.remapad-keyboard-overlay')) return;
      if (target === keyboardIgnoreFocusTarget && Date.now() < keyboardIgnoreFocusUntil) return;
      maybeOpenKeyboard(target, null, null);
    }, true);
  }

  function resolveNavigatorLayout() {
    const raw = (navigator.language || '').toLowerCase().trim();
    if (!raw) return null;
    const base = raw.split(/[-_]/)[0];
    return RemapadLanguageDetector?.LANG_TO_LAYOUT?.[raw]
      || RemapadLanguageDetector?.LANG_TO_LAYOUT?.[base]
      || null;
  }

  async function resolveKeyboardLayout() {
    const siteLayout = settings.siteKeyboardLayouts?.[currentHostname];
    if (siteLayout && siteLayout !== 'auto') return siteLayout;

    if (settings.keyboardAutoDetect) {
      const layout = resolveNavigatorLayout();
      if (layout) return layout;
    }

    return settings.keyboardLayout || 'qwerty';
  }

  function activateElementAsClick(el, x, y) {
    const mode = getEffectiveKeyboardTriggerMode();
    if (mode === 'click' || mode === 'both') {
      if (maybeOpenKeyboard(el, x, y)) return;
    }
    domSimulator.ensureWindowFocus();
    domSimulator.simulateClickAt(el, x, y);
    simulateKeyboardActivate(el);
    messagingClient.requestTrustedClick(x, y);
    const video = domSimulator.findVideoUnderPoint(x, y, [cursors.left.element, cursors.right.element]);
    if (video) {
      checkAutoplayAndWarn(() => domSimulator.toggleVideoPlay(video));
    }
  }

  let autoplayCheckPromise = null;
  let autoplayStatus = { supported: false, mediaelement: 'unknown', audiocontext: 'unknown', audio: 'unknown', video: 'unknown', timestamp: 0 };
  let autoplayWarningShown = false;

  async function checkAutoplayPolicy() {
    if (autoplayCheckPromise) return autoplayCheckPromise;
    autoplayCheckPromise = (async () => {
      const result = { supported: false, mediaelement: 'unknown', audiocontext: 'unknown', audio: 'unknown', video: 'unknown', timestamp: Date.now() };

      if (typeof navigator.getAutoplayPolicy === 'function') {
        try {
          result.supported = true;
          result.mediaelement = navigator.getAutoplayPolicy('mediaelement');
          result.audiocontext = navigator.getAutoplayPolicy('audiocontext');
        } catch (e) {
          result.supported = false;
        }
      }

      result.audio = await probeAudioAutoplay();
      result.video = await probeVideoAutoplay();
      if (result.mediaelement === 'unknown') {
        if (result.audio === 'blocked' || result.video === 'blocked') result.mediaelement = 'disallowed';
        else if (result.audio === 'allowed-muted' || result.video === 'allowed-muted') result.mediaelement = 'allowed-muted';
        else if (result.audio === 'allowed' && result.video === 'allowed') result.mediaelement = 'allowed';
      }

      autoplayStatus = result;
      console.log('[Remapad] Autoplay status:', result);
      return result;
    })();
    return autoplayCheckPromise;
  }

  function probeAudioAutoplay() {
    return new Promise(resolve => {
      try {
        const audio = document.createElement('audio');
        const isMuted = !!settings.muteActivation;
        audio.muted = false;
        audio.volume = isMuted ? 0.001 : 1.0;
        audio.src = createWavProbeDataUrl(isMuted);

        let settled = false;
        const cleanup = () => {
          try { audio.pause(); } catch (_) {}
          try { audio.remove(); } catch (_) {}
        };

        const finish = (state) => {
          if (settled) return;
          settled = true;
          if (state !== 'allowed') {
            cleanup();
          } else {
            audio.addEventListener('ended', cleanup, { once: true });
            setTimeout(cleanup, 600);
          }
          resolve(state);
        };

        const promise = audio.play();
        if (promise !== undefined) {
          promise.then(() => finish('allowed')).catch(err => finish(err?.name === 'NotAllowedError' ? 'blocked' : 'allowed'));
        } else {
          finish('allowed');
        }
        setTimeout(() => finish('allowed'), 600);
      } catch (e) {
        resolve('unknown');
      }
    });
  }

  function probeVideoAutoplay() {
    return new Promise(resolve => {
      try {
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        const isMuted = !!settings.muteActivation;
        video.muted = false;
        video.volume = isMuted ? 0.001 : 1.0;
        video.src = createWavProbeDataUrl(isMuted);

        let settled = false;
        const cleanup = () => {
          try { video.pause(); } catch (_) {}
          try { video.remove(); } catch (_) {}
        };

        const finish = (state) => {
          if (settled) return;
          settled = true;
          if (state !== 'allowed') {
            cleanup();
          } else {
            video.addEventListener('ended', cleanup, { once: true });
            setTimeout(cleanup, 600);
          }
          resolve(state);
        };

        const promise = video.play();
        if (promise !== undefined) {
          promise.then(() => finish('allowed')).catch(err => finish(err?.name === 'NotAllowedError' ? 'blocked' : 'allowed'));
        } else {
          finish('allowed');
        }
        setTimeout(() => finish('allowed'), 600);
      } catch (e) {
        resolve('unknown');
      }
    });
  }

  async function checkAutoplayAndWarn(playFn) {
    const status = await checkAutoplayPolicy();
    const blocked = status.mediaelement !== 'allowed';
    console.log('[Remapad] checkAutoplayAndWarn blocked:', blocked, status);
    if (blocked && !autoplayWarningShown) {
      autoplayWarningShown = true;
      showAutoplayWarning(formatAutoplayWarning(status));
      return;
    }
    playFn();
  }

  function formatAutoplayWarning(status) {
    if (status.audio === 'blocked' && status.video === 'blocked') {
      return { title: 'Autoplay blocked', message: 'Audio and video autoplay are blocked on this site. Remapad cannot override autoplay permissions. Enable autoplay for this site in your browser settings to use controller playback.' };
    }
    if (status.audio === 'blocked') {
      return { title: 'Audio autoplay blocked', message: 'Audio autoplay is blocked on this site. Remapad cannot override autoplay permissions. Enable audio autoplay for this site in your browser settings to use controller playback.' };
    }
    if (status.video === 'blocked') {
      return { title: 'Video autoplay blocked', message: 'Video autoplay is blocked on this site. Remapad cannot override autoplay permissions. Enable video autoplay for this site in your browser settings to use controller playback.' };
    }
    if (status.mediaelement === 'allowed-muted') {
      return { title: 'Muted autoplay only', message: 'This site only allows muted autoplay. Video with audio requires a real click. Remapad cannot override autoplay permissions. Enable audio autoplay for this site in your browser settings to use controller playback with sound.' };
    }
    return { title: 'Autoplay restricted', message: 'Autoplay is restricted on this site. Some video controls may require a real click. Remapad cannot override autoplay permissions. Enable autoplay for this site in your browser settings for full controller playback.' };
  }

  function showAutoplayWarning({ title, message }) {
    injectHUDStyles();
    const id = 'remapad-autoplay-warning';
    let el = document.getElementById(id);
    if (el) el.remove();

    el = document.createElement('div');
    el.id = id;
    el.className = 'remapad-autoplay-warning';
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <div class="remapad-autoplay-warning__inner">
        <svg class="remapad-autoplay-warning__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div class="remapad-autoplay-warning__text">
          <strong>${escapeHtml(title)}</strong> — ${escapeHtml(message)}
        </div>
        <button class="remapad-autoplay-warning__close" aria-label="Dismiss">×</button>
      </div>
    `;
    document.body.appendChild(el);

    el.querySelector('.remapad-autoplay-warning__close').addEventListener('click', () => {
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 350);
    });

    requestAnimationFrame(() => el.classList.add('visible'));
    setTimeout(() => {
      if (el.parentElement) {
        el.classList.remove('visible');
        setTimeout(() => el.remove(), 350);
      }
    }, 7000);
  }

  function simulateKeyboardActivate(el) {
    if (el.focus && typeof el.focus === 'function' && el.tabIndex !== -1) {
      focusElement(el);
    }
    const keyOpts = {
      bubbles: true,
      cancelable: true,
      view: window,
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      composed: true
    };
    el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
    el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
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
       .remapad-hud-sticks {
         display: flex !important;
         align-items: center !important;
         gap: 12px !important;
         padding-left: 12px !important;
         border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
       }
       .remapad-hud-stick {
         display: flex !important;
         align-items: center !important;
         gap: 8px !important;
         color: #e5e2e1 !important;
         font-size: 13px !important;
         font-weight: 600 !important;
         letter-spacing: 0.03em !important;
         text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
         white-space: nowrap !important;
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
         .remapad-hud-item.highlighted,
         .remapad-hud-stick.highlighted,
         .remapad-hud-edit.highlighted {
           background: rgba(229, 9, 20, 0.25) !important;
           outline: 2px solid #e50914 !important;
           outline-offset: 4px !important;
           border-radius: 4px !important;
           box-shadow: 0 0 10px rgba(229, 9, 20, 0.5) !important;
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
        .remapad-active-collection {
          outline: 2px solid rgba(229, 9, 20, 0.7) !important;
          outline-offset: 4px !important;
          box-shadow: 0 0 0 4px rgba(229, 9, 20, 0.12), 0 0 20px rgba(229, 9, 20, 0.25) !important;
          border-radius: 4px !important;
          transition: outline 0.2s ease, box-shadow 0.2s ease !important;
        }
         .remapad-cnav-hud {
           position: fixed !important;
           top: 20px !important;
           left: 50% !important;
           transform: translateX(-50%) translateY(-110%) !important;
           z-index: 2147483647 !important;
           background: rgba(16, 16, 16, 0.92) !important;
           backdrop-filter: blur(20px) !important;
           -webkit-backdrop-filter: blur(20px) !important;
           border: 1px solid rgba(255, 255, 255, 0.1) !important;
           border-radius: 9999px !important;
           padding: 10px 20px !important;
           display: flex !important;
           align-items: center !important;
           justify-content: space-between !important;
           gap: 20px !important;
           min-width: 280px !important;
           max-width: calc(100vw - 48px) !important;
           box-sizing: border-box !important;
           box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(229, 9, 20, 0.15) !important;
           font-family: 'Geist', 'Inter', -apple-system, sans-serif !important;
           transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease !important;
           opacity: 0 !important;
           pointer-events: none !important;
           user-select: none !important;
         }
         .remapad-cnav-hud.visible {
           transform: translateX(-50%) translateY(0) !important;
           opacity: 1 !important;
         }
         .remapad-cnav-left {
           display: flex !important;
           align-items: center !important;
           gap: 10px !important;
           overflow: hidden !important;
           min-width: 0 !important;
         }
         .remapad-cnav-right {
           display: flex !important;
           align-items: center !important;
           gap: 10px !important;
           flex-shrink: 0 !important;
         }
         .remapad-cnav-icon {
           width: 14px !important;
           height: 14px !important;
           color: rgba(229, 9, 20, 0.9) !important;
           flex-shrink: 0 !important;
         }
         .remapad-cnav-pos {
           font-size: 13px !important;
           font-weight: 700 !important;
           color: #fff !important;
           white-space: nowrap !important;
           flex-shrink: 0 !important;
         }
         .remapad-cnav-label {
           font-size: 12px !important;
           font-weight: 500 !important;
           color: rgba(255, 255, 255, 0.5) !important;
           white-space: nowrap !important;
           overflow: hidden !important;
           text-overflow: ellipsis !important;
         }
         .remapad-cnav-of {
           font-weight: 400 !important;
           opacity: 0.55 !important;
           font-size: 11px !important;
         }
         .remapad-cnav-dots {
           display: flex !important;
           align-items: center !important;
           gap: 4px !important;
         }
         .remapad-cnav-dot {
           width: 5px !important;
           height: 5px !important;
           border-radius: 50% !important;
           background: rgba(255, 255, 255, 0.2) !important;
           transition: background 0.2s, transform 0.2s !important;
           display: block !important;
         }
         .remapad-cnav-dot.active {
           background: #e50914 !important;
           transform: scale(1.4) !important;
         }
         .remapad-cnav-item {
           font-size: 12px !important;
           font-weight: 600 !important;
           color: rgba(255, 255, 255, 0.75) !important;
           white-space: nowrap !important;
         }
      .remapad-cnav-item--hint {
        color: rgba(255, 255, 255, 0.35) !important;
        font-weight: 500 !important;
      }
      .remapad-autoplay-warning {
        position: fixed !important;
        top: 20px !important;
        left: 50% !important;
        transform: translateX(-50%) translateY(-120%) !important;
        z-index: 2147483647 !important;
        max-width: calc(100vw - 48px) !important;
        width: 520px !important;
        box-sizing: border-box !important;
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .remapad-autoplay-warning.visible {
        transform: translateX(-50%) translateY(0) !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }
      .remapad-autoplay-warning__inner {
        background: rgba(16, 16, 16, 0.95) !important;
        backdrop-filter: blur(20px) !important;
        -webkit-backdrop-filter: blur(20px) !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        border-left: 4px solid #e50914 !important;
        border-radius: 12px !important;
        padding: 16px 18px !important;
        display: flex !important;
        align-items: flex-start !important;
        gap: 14px !important;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7) !important;
        font-family: 'Geist', 'Inter', -apple-system, sans-serif !important;
        color: #fff !important;
      }
      .remapad-autoplay-warning__icon {
        width: 22px !important;
        height: 22px !important;
        color: #e50914 !important;
        flex-shrink: 0 !important;
        margin-top: 1px !important;
      }
      .remapad-autoplay-warning__text {
        font-size: 13px !important;
        line-height: 1.55 !important;
        color: rgba(255, 255, 255, 0.92) !important;
        flex: 1 !important;
      }
      .remapad-autoplay-warning__text strong {
        color: #fff !important;
        font-weight: 700 !important;
        display: block !important;
        margin-bottom: 4px !important;
      }
      .remapad-autoplay-warning__close {
        background: transparent !important;
        border: 0 !important;
        color: rgba(255, 255, 255, 0.5) !important;
        font-size: 20px !important;
        font-weight: 300 !important;
        line-height: 1 !important;
        padding: 0 0 0 8px !important;
        cursor: pointer !important;
        flex-shrink: 0 !important;
        transition: color 0.2s !important;
      }
      .remapad-autoplay-warning__close:hover {
        color: #fff !important;
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

    const currentGlyphs = GLYPHS[resolveIconStyle()] || GLYPHS.playstation;

    const standardButtons = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
    const items = standardButtons.map((btnIdx, arrayIndex) => {
      const action = activeProfile[btnIdx];
      const glyph = escapeHtml(currentGlyphs[btnIdx] || btnIdx);
      const label = escapeHtml(formatActionLabel(action, btnIdx));
      const unmapped = !action || action === 'none';
      const isHighlighted = arrayIndex === hudHighlightedIndex;
      return `
        <div class="remapad-hud-item${unmapped ? ' remapad-hud-item--unmapped' : ''}${isHighlighted ? ' highlighted' : ''}" data-hud-selectable>
          <span class="remapad-hud-glyph">${glyph}</span>
          <span class="remapad-hud-label">${label}</span>
        </div>
      `;
    }).join('');

    const lsHighlighted = hudHighlightedIndex === 16;
    const rsHighlighted = hudHighlightedIndex === 17;
    const editHighlighted = hudHighlightedIndex === 18;

    const stickItems = `
      <div class="remapad-hud-sticks" aria-label="Stick controls">
      <div class="remapad-hud-stick${lsHighlighted ? ' highlighted' : ''}" data-hud-selectable>
        <span class="remapad-hud-glyph">LS</span>
        <span class="remapad-hud-label">Scroll</span>
      </div>
      <div class="remapad-hud-stick${rsHighlighted ? ' highlighted' : ''}" data-hud-selectable>
        <span class="remapad-hud-glyph">RS↑↓</span>
        <span class="remapad-hud-label">Focus</span>
      </div>
      </div>
    `;
    let innerHtml = `<div class="remapad-hud-row">${items}${stickItems}</div>`;

    // Add close button
    innerHtml += `<button class="remapad-hud-edit${editHighlighted ? ' highlighted' : ''}" id="remapad-hud-edit-btn" type="button" data-hud-selectable>Edit</button>`;
    innerHtml += `<button class="remapad-hud-close" id="remapad-hud-close-btn" type="button" title="Hide this guide" aria-label="Hide controller guide">✕</button>`;

    hudElement.innerHTML = innerHtml;

    hudElement.querySelector('#remapad-hud-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hudPermanentlyHidden = true;
      hideHUD();
    });

    hudElement.querySelector('#remapad-hud-edit-btn')?.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      messagingClient.openSiteMapping();
    });

  }

  function updateHUDHighlight() {
    if (!hudElement) return;
    const items = hudElement.querySelectorAll('[data-hud-selectable]');
    items.forEach((item, idx) => {
      if (idx === hudHighlightedIndex) {
        item.classList.add('highlighted');
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } else {
        item.classList.remove('highlighted');
      }
    });
  }

  function toggleHUD() {
    if (!hudElement) return;
    clearTimeout(hudTimeout);

    if (hudVisible) {
      hideHUD();
      return;
    }

    hudHighlightedIndex = -1;
    hudPermanentlyHidden = false;
    hudElement.classList.add('visible');
    hudVisible = true;
  }

  function hideHUD() {
    if (hudElement && hudVisible) {
      hudHighlightedIndex = -1;
      updateHUDHighlight();
      hudElement.classList.remove('visible');
      hudVisible = false;
    }
  }

  function removeHUD(stopPolling = true) {
    closeQuickMap();
    stopModalFocusObserver();
    hudHighlightedIndex = -1;
    document.documentElement.removeAttribute('data-remapad-active');
    removeCursors();
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

  // ─── Boot ───────────────────────────────────────────────────────────────────

  window.addEventListener('pagehide', () => {
    closeQuickMap();
    stopModalFocusObserver();
    resetNavigationState();
  });

  window.addEventListener('resize', () => {
    cursors.left.x = clamp(cursors.left.x, 0, window.innerWidth);
    cursors.left.y = clamp(cursors.left.y, 0, window.innerHeight);
    cursors.right.x = clamp(cursors.right.x, 0, window.innerWidth);
    cursors.right.y = clamp(cursors.right.y, 0, window.innerHeight);
  });

  // Handle messages from options page / popup
  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'COUNT_SELECTORS') {
      const { containerSelector, itemSelector } = msg;
      let containerCount = 0;
      let itemCount = 0;
      let error = null;
      try {
        const containers = Array.from(document.querySelectorAll(containerSelector || ''));
        containerCount = containers.filter(el => isVisibleElement(el)).length;
        if (itemSelector) {
          containers.forEach(c => {
            itemCount += Array.from(c.querySelectorAll(itemSelector)).filter(el => isVisibleElement(el)).length;
          });
        }
      } catch (e) {
        error = e.message;
      }
      sendResponse({ containerCount, itemCount, error });
      return true;
    }

    if (msg?.type === 'GET_AUTOPLAY_STATUS') {
      checkAutoplayPolicy().then(status => {
        sendResponse({ status });
      });
      return true;
    }
  });

  init();
})();
