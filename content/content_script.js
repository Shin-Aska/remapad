/**
 * Remapad — Content Script
 * MV3-compatible classic script (not ES modules). Imports modules from the
 * global `window.RemapadCS` namespace and owns polling, action dispatch, the
 * Quick Map picker state machine, keyboard trigger wiring, and aggregate teardown.
 */

;(function () {
  'use strict';

  // Duplicate injection guard: bail early if this bundle runs again in the
  // same document, rather than double-wiring listeners, polling, and overlay DOM.
  if (window.__remapadInjected) return;
  window.__remapadInjected = true;

  const api = typeof chrome !== 'undefined' ? chrome : browser;

  // ─── Constants & Settings ──────────────────────────────────────────────────

  // Lazy lookup of the shared namespace populated by manifest-ordered scripts.
  // Each module is created here with callbacks the module invokes; ownership of
  // the state those callbacks read remains in this file.
  const CS = window.RemapadCS || {};

  const {
    POLL_INTERVAL_MS,
    DEADZONE,
    AXIS_REPEAT_DELAY_MS,
    MAX_DOM_ACTION_PAYLOAD_LENGTH,
    DEFAULT_NAV_SETTINGS,
    DEFAULT_PROFILE,
    GLYPHS,
    DOM_ACTION_OPERATIONS,
    TOGGLEABLE_DOM_ATTRIBUTES,
    SITE_SEARCH_SELECTORS,
    FULLSCREEN_CONTROL_SELECTOR,
    WEBSITE_MAPPINGS_DEFAULT,
    SITE_COLLECTIONS_DEFAULT,
    CONTROLLER_STYLE_PATTERNS
  } = CS.Constants || {};

  const {
    clampIndex,
    escapeHtml,
    escapeCssIdentifier,
    escapeCssString,
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
  const overlayStyles = CS.OverlayStyles.create();
  const autoplayService = CS.AutoplayService?.create({ utils: CS.Utils, getSettings: () => settings });
  const modalFocusManager = CS.ModalFocusManager?.create({ utils: CS.Utils });
  let hudController;
  let navigationController;
  let cursorController;

  // ─── State ──────────────────────────────────────────────────────────────────

  let settings = settingsStore.getSettings();
  let activeProfile = settingsStore.getActiveProfile();

  let prevButtonStates = [];
  let axisTimers = {};
  let axisRepeatCounts = { left: 0, right: 0 };
  let axisLastDirections = { left: null, right: null };
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

  function resolveIconStyle() {
    return controllerStyle.resolve(settings.iconStyle);
  }

  // ─── Initialisation ─────────────────────────────────────────────────────────

  async function init() {
    try {
      // Settings and active profile are loaded asynchronously from extension
      // storage; controllers are only created once because they register DOM
      // and their callbacks close over mutable state owned here.
      const { isMapped } = await settingsStore.load();

      settings = settingsStore.getSettings();
      activeProfile = settingsStore.getActiveProfile();
      siteMappingActive = isMapped;

      if (!hudController) {
        hudController = CS.HudController.create({
          utils: CS.Utils,
          constants: CS.Constants,
          overlayStyles,
          callbacks: {
            getActiveProfile: () => activeProfile,
            getIconStyle: resolveIconStyle,
            openSiteMapping: () => messagingClient.openSiteMapping(),
            executeAction
          }
        });
      }

      if (!navigationController) {
        navigationController = CS.NavigationController.create({
          utils: CS.Utils,
          domSimulator,
          modalFocusManager,
          sitePolicy,
          callbacks: {
            getSettings: () => settings,
            injectOverlayStyles: () => overlayStyles.inject(),
            focusElement,
            moveFocus,
            getControllerFocusedElement: () => controllerFocusedElement,
            setControllerFocusedElement: element => {
              controllerFocusedElement = element;
            }
          }
        });
      }

      if (!cursorController) {
        cursorController = CS.CursorController.create({
          utils: CS.Utils,
          constants: CS.Constants,
          domSimulator,
          callbacks: {
            getSettings: () => settings,
            isQuickMapOpen: () => Boolean(quickMapElement),
            beginModalFocusTracking,
            focusNewModalAfterClick,
            activateElementAsClick
          }
        });
      }

      setupKeyboardFocusTrigger();

      const quickMapAvailable = settingsStore.isQuickMapAvailable();

      if (quickMapAvailable) {
        setupGamepadPolling();
      }

      // `data-remapad-active` is the cross-world switch read by the MAIN-world
      // gamepad_blocker; set it only after controllers are ready so pages never
      // see a gamepad shadow without a working content-script owner.
      if (quickMapAvailable && isMapped) {
        document.documentElement.setAttribute('data-remapad-active', 'true');
        hudController.update();
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
    const status = await autoplayService.checkAutoplayPolicy();
    if (status.mediaelement !== 'allowed' && !autoplayService.isWarningShown()) {
      autoplayService.showAutoplayWarning(autoplayService.formatAutoplayWarning(status), overlayStyles.inject);
    }
  }

  // Storage changes from the options page / popup re-run init(). Existing
  // controllers retain their instances while callback-backed state refreshes.
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      init();
    }
  });

  // ─── Polling & Gamepad processing ───────────────────────────────────────────

  let pollInterval = null;

  function setupGamepadPolling() {
    if (pollInterval) clearInterval(pollInterval);

    // Browser gamepad events are unreliable for continuous state, so register
    // them only for connection/disconnection logging while the interval poll
    // drives actual input processing.
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
    hudController?.hide();
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
        hudController?.hide();
      }
    }
  }

  function processGamepad(gp) {
    const previous = controllerStyle.getDetected();
    controllerStyle.update(gp.id);
    if (controllerStyle.getDetected() !== previous && settings.iconStyle === 'auto') {
      if (hudController?.isVisible()) hudController.update();
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
        cursorController.update('left', gp.axes[0] || 0, gp.axes[1] || 0);
      } else {
        cursorController.hide('left');
        handleStick(gp.axes[0], gp.axes[1], 'left', nav);
      }

      if (rightMode === 'cursor') {
        cursorController.update('right', gp.axes[2] || 0, gp.axes[3] || 0);
      } else {
        cursorController.hide('right');
        handleStick(gp.axes[2], gp.axes[3], 'right', nav);
      }
    } else {
      cursorController.hide('left');
      cursorController.hide('right');
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
    if (hudController?.isVisible() && stickId === 'left') {
      const timerKey = `axis_${stickId}`;
      if (!axisTimers[timerKey]) {
        onStickMove(x, y);
        axisTimers[timerKey] = setTimeout(() => delete axisTimers[timerKey], AXIS_REPEAT_DELAY_MS);
      }
      return;
    }

    // Virtual keyboard mode: route stick axes to keyboard focus navigation.
    // Left stick mirrors D-pad/scroll directions; right stick mirrors the focus
    // next/prev behavior used by DOM-order navigation.
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

  // Input precedence (highest to lowest): virtual keyboard, Quick Map picker,
  // HUD navigation, active profile mappings. The Start button may also open
  // Quick Map when explicitly mapped to `open_options`.
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

    if (hudController?.handleButtonPress(btnIdx)) return false;

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

    if (hudController?.handleStickMove(x)) return;

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
      hudController?.toggle();
      return;
    }

    // Collection navigation actions
    if (action === 'nav_next_collection' || action === 'nav_prev_collection' ||
        action === 'nav_next_item' || action === 'nav_prev_item') {
      navigationController.executeCollectionNav(action);
      return;
    }

    // Spatial navigation directions
    if (action === 'nav_up' || action === 'nav_down' ||
        action === 'nav_left' || action === 'nav_right') {
      const direction = action.substring('nav_'.length);
      navigationController.executeSpatialNav(direction);
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
        if (cursorController.hasActiveTarget()) {
          cursorController.click();
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

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function performBackAction() {
    if (sitePolicy.navigateNetflixHome()) return;

    const modal = modalFocusManager.getOpenModals()[0];
    if (modal && modalFocusManager.closeModal(modal, { getControllerFocusedElement: () => controllerFocusedElement, focusElement, resetNavigationState })) return;

    resetNavigationState();
    history.back();
  }

  function beginModalFocusTracking() {
    return modalFocusManager.beginTracking({ getControllerFocusedElement: () => controllerFocusedElement });
  }

  function focusNewModalAfterClick(state) {
    modalFocusManager.focusNewModalAfterClick(state, { focusElement, resetNavigationState });
  }

  function stopModalFocusObserver() {
    modalFocusManager.stopObserver();
  }

  function resetNavigationState() {
    controllerFocusedElement?.classList.remove('remapad-controller-focus');
    controllerFocusedElement = null;
    navigationController?.resetCollectionNavState();
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

  // State machine: button → action → pick → review. Capture-phase pointer
  // listeners suppress the real click/pointerup so the page control can be
  // chosen without activating it. `quickMapSuppressClick` /
  // `quickMapSuppressPointerUp` are one-shot gates reset after each pick.
  function openQuickMap() {
    if (quickMapElement) return;

    overlayStyles.inject();
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
      hudController?.update();
      closeQuickMap();
    } catch (error) {
      console.warn('[Remapad CS] Quick Map save failed:', error);
      quickMapState = { ...quickMapState, message: 'Unable to save this mapping. Please try again.' };
      renderQuickMap();
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
    const video = domSimulator.findVideoUnderPoint(x, y, cursorController.getElements());
    if (video) {
      autoplayService.checkAutoplayAndWarn(() => domSimulator.toggleVideoPlay(video), overlayStyles.inject);
    }
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

  // ─── Aggregate teardown ─────────────────────────────────────────────────────

  // Central cleanup path called on disabled, unavailable, or unmapped paths.
  // It closes Quick Map, stops modal observation, removes cursor/HUD/styles,
  // clears the cross-world active flag, and optionally stops polling.
  function removeHUD(stopPolling = true) {
    closeQuickMap();
    stopModalFocusObserver();
    document.documentElement.removeAttribute('data-remapad-active');
    cursorController?.remove();
    hudController?.remove();
    overlayStyles.remove();
    if (stopPolling && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    controllerFocusedElement?.classList.remove('remapad-controller-focus');
    controllerFocusedElement = null;
  }

  // ─── Boot ───────────────────────────────────────────────────────────────────

  // pagehide intentionally performs only transient Quick Map, modal, and
  // navigation cleanup. removeHUD performs broader UI/controller cleanup with
  // optional polling shutdown, but does not remove every persistent listener or resource.
  window.addEventListener('pagehide', () => {
    closeQuickMap();
    stopModalFocusObserver();
    resetNavigationState();
  });

  window.addEventListener('resize', () => {
    cursorController?.handleResize();
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
      autoplayService.checkAutoplayPolicy().then(status => {
        sendResponse({ status });
      });
      return true;
    }
  });

  init();
})();
