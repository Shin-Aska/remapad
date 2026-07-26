/**
 * Remapad Options — Gamepad Status and Navigation
 * MV3-compatible classic script; exposed via window.RemapadOptions.Gamepad.
 * Polls controller state, updates editor/status visuals, and dispatches the
 * reserved options-page profile while preserving overlay input precedence.
 */

(function (global) {
  'use strict';

  function create({ state, constants, utils, dom, mappingEditor, cursor, modal, optionsTutorial, switchOptionsTab }) {
    const { RESERVED_OPTIONS_KEY, BUTTON_NAMES, OPTIONS_NAV_REPEAT_MS } = constants;
    const { clamp } = utils;
    let previousPressed = [];
    let pollInterval = null;
    let lastDetectedControllerStyle = null;
    let lastOptionsActionTime = 0;
    let testMode = false;
    let testTimer = null;
    let activeGamepadIndex = null;

    function hasActiveInput(gamepad) {
      return gamepad.buttons.some(button => button.pressed || button.value > 0.5)
        || gamepad.axes.some(axis => Math.abs(axis) > 0.2);
    }

    function selectActiveGamepad(gamepads) {
      const connected = [...gamepads].filter(gamepad => gamepad && gamepad.connected);
      if (!connected.length) {
        activeGamepadIndex = null;
        return null;
      }

      // Chromium can expose more than one entry for the same Windows device.
      // Follow the entry producing input instead of permanently choosing slot 0.
      const producingInput = connected.find(hasActiveInput);
      const previous = connected.find(gamepad => gamepad.index === activeGamepadIndex);
      const preferred = producingInput
        || previous
        || connected.find(gamepad => !/^unknown gamepad/i.test(gamepad.id))
        || connected[0];

      if (preferred.index !== activeGamepadIndex) {
        activeGamepadIndex = preferred.index;
        previousPressed = [];
      }
      return preferred;
    }

    function startPolling() {
      if (pollInterval) return;
      pollInterval = setInterval(pollGamepads, 50);
    }

    function updateNavigationStickViz(gamepad) {
      const format = value => value.toFixed(2);
      const leftX = clamp(gamepad.axes[0] || 0, -1, 1);
      const leftY = clamp(gamepad.axes[1] || 0, -1, 1);
      const rightX = clamp(gamepad.axes[2] || 0, -1, 1);
      const rightY = clamp(gamepad.axes[3] || 0, -1, 1);
      if (dom.leftStickDot) dom.leftStickDot.style.transform = `translate(${leftX * 40}px, ${leftY * 40}px)`;
      if (dom.rightStickDot) dom.rightStickDot.style.transform = `translate(${rightX * 40}px, ${rightY * 40}px)`;
      if (dom.leftAxisX) dom.leftAxisX.textContent = format(leftX);
      if (dom.leftAxisY) dom.leftAxisY.textContent = format(leftY);
      if (dom.rightAxisX) dom.rightAxisX.textContent = format(rightX);
      if (dom.rightAxisY) dom.rightAxisY.textContent = format(rightY);
      if (dom.leftAxisXBottom) dom.leftAxisXBottom.textContent = format(leftX);
      if (dom.leftAxisYBottom) dom.leftAxisYBottom.textContent = format(leftY);
      if (dom.rightAxisXBottom) dom.rightAxisXBottom.textContent = format(rightX);
      if (dom.rightAxisYBottom) dom.rightAxisYBottom.textContent = format(rightY);
    }

    function resetNavigationStickViz() {
      [
        dom.leftStickDot, dom.rightStickDot, dom.leftAxisX, dom.leftAxisY,
        dom.rightAxisX, dom.rightAxisY, dom.leftAxisXBottom, dom.leftAxisYBottom,
        dom.rightAxisXBottom, dom.rightAxisYBottom
      ].forEach(element => {
        if (!element) return;
        if (element.classList.contains('stick-dot')) element.style.transform = '';
        else element.textContent = '0.00';
      });
    }

    function getScrollableElement() {
      let element = document.activeElement;
      while (element && element !== document.body) {
        const style = getComputedStyle(element);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight) return element;
        element = element.parentElement;
      }
      return global;
    }

    function executeOptionsScroll(action, configuredAmount) {
      const nav = state.getSettings().navSettings;
      const scrollStick = nav?.rightStick?.mode === 'scroll' ? nav.rightStick : nav?.leftStick;
      const scrollAmount = configuredAmount ?? scrollStick?.scrollAmountPx ?? 150;
      const scrollable = getScrollableElement();
      const scrollBy = (element, top, left) => {
        if (element === global) global.scrollBy({ top, left, behavior: 'auto' });
        else element.scrollBy({ top, left, behavior: 'auto' });
      };
      switch (action) {
        case 'scroll_up': case 'nav_up': case 'focus_up': scrollBy(scrollable, -scrollAmount, 0); break;
        case 'scroll_down': case 'nav_down': case 'focus_down': scrollBy(scrollable, scrollAmount, 0); break;
        case 'scroll_left': case 'nav_left': case 'focus_left': scrollBy(scrollable, 0, -scrollAmount); break;
        case 'scroll_right': case 'nav_right': case 'focus_right': scrollBy(scrollable, 0, scrollAmount); break;
      }
    }

    function optionsBack() {
      if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) {
        RemapadKeyboard.close(false);
        return;
      }
      if (cursor.isOverlayOpen()) {
        cursor.closeGamepadSelect();
        return;
      }
      if (modal.isOpen()) {
        modal.close(false);
        return;
      }
      if (mappingEditor.isDropdownOpen()) mappingEditor.closeDropdown();
    }

    function executeOptionsAction(action) {
      if (cursor.isOverlayOpen()) {
        switch (action) {
          case 'focus_up': case 'nav_up': case 'scroll_up': cursor.moveOverlayFocus('up'); return;
          case 'focus_down': case 'nav_down': case 'scroll_down': cursor.moveOverlayFocus('down'); return;
          case 'focus_left': case 'nav_left': case 'scroll_left': cursor.moveOverlayFocus('left'); return;
          case 'focus_right': case 'nav_right': case 'scroll_right': cursor.moveOverlayFocus('right'); return;
          case 'select': case 'click': cursor.activateOverlayFocus(); return;
          case 'back': case 'backspace': optionsBack(); return;
          case 'prev_tab': switchOptionsTab(-1); return;
          case 'next_tab': switchOptionsTab(1); return;
        }
        return;
      }
      switch (action) {
        case 'focus_up': case 'nav_up': case 'scroll_up':
        case 'focus_down': case 'nav_down': case 'scroll_down':
        case 'focus_left': case 'nav_left': case 'scroll_left':
        case 'focus_right': case 'nav_right': case 'scroll_right':
          executeOptionsScroll(action);
          break;
        case 'select': case 'click': cursor.executeCursorClick(); break;
        case 'back': case 'backspace': optionsBack(); break;
        case 'prev_tab': switchOptionsTab(-1); break;
        case 'next_tab': switchOptionsTab(1); break;
      }
    }

    function updateOptionsGamepadNav(gamepad, previousSnapshot) {
      const profile = state.getSettings().websiteMappings[RESERVED_OPTIONS_KEY];
      if (!profile) return;
      const directional = new Set([
        'focus_up', 'focus_down', 'focus_left', 'focus_right', 'nav_up', 'nav_down', 'nav_left', 'nav_right',
        'scroll_up', 'scroll_down', 'scroll_left', 'scroll_right', 'prev_tab', 'next_tab'
      ]);
      const now = Date.now();
      gamepad.buttons.forEach((button, index) => {
        const isPressed = button.pressed || button.value > 0.5;
        const wasPressed = previousSnapshot[index] || false;
        const action = profile[index.toString()];
        if (!action || action === 'none') return;
        const isDirectional = directional.has(action);
        if (isPressed && (!wasPressed || isDirectional && now - lastOptionsActionTime > OPTIONS_NAV_REPEAT_MS)) {
          executeOptionsAction(action);
          lastOptionsActionTime = now;
        }
      });
    }

    function updateConnectedStatus(gamepad) {
      const rawId = gamepad.id.split('(')[0].trim() || 'Controller';
      const cleanId = rawId.length > 20 ? rawId.slice(0, 20) + '…' : rawId;
      dom.deviceNameEl.textContent = cleanId;
      dom.navControllerNameEl.textContent = cleanId.length > 18 ? cleanId.slice(0, 18) + '…' : cleanId;
      if (dom.navStatusName) dom.navStatusName.textContent = cleanId;
      if (dom.navStatusBadge) dom.navStatusBadge.className = 'nav-status-badge connected';
      if (dom.navStatusDot) dom.navStatusDot.className = 'nav-status-dot pulse';
      if (dom.navStatusText) dom.navStatusText.textContent = 'CONNECTED';
      dom.statusBadgeEl.className = 'status-badge connected';
      dom.statusDotEl.className = 'status-dot pulse';
      dom.statusTextEl.textContent = 'CONNECTED';
    }

    function updateDisconnectedStatus() {
      dom.deviceNameEl.textContent = 'No Controller Detected';
      dom.navControllerNameEl.textContent = 'No Controller';
      dom.statusBadgeEl.className = 'status-badge disconnected';
      dom.statusDotEl.className = 'status-dot';
      dom.statusTextEl.textContent = 'DISCONNECTED';
      dom.deviceBatteryEl.style.display = 'none';
      if (dom.navStatusName) dom.navStatusName.textContent = 'No Controller';
      if (dom.navStatusBadge) dom.navStatusBadge.className = 'nav-status-badge disconnected';
      if (dom.navStatusDot) dom.navStatusDot.className = 'nav-status-dot';
      if (dom.navStatusText) dom.navStatusText.textContent = 'DISCONNECTED';
      document.querySelectorAll('.svg-btn').forEach(button => button.classList.remove('highlighted'));
      resetNavigationStickViz();
    }

    function pollGamepads() {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gamepad = selectActiveGamepad(gamepads);
      if (!gamepad) {
        updateDisconnectedStatus();
        return;
      }
      const detected = mappingEditor.detectControllerStyle(gamepad.id);
      if (detected && detected !== lastDetectedControllerStyle) {
        lastDetectedControllerStyle = detected;
        if (state.getSettings().iconStyle === 'auto') {
          mappingEditor.renderIconStyles();
          mappingEditor.updateSvgTextLabels();
        }
      }
      updateConnectedStatus(gamepad);
      const previousSnapshot = [...previousPressed];
      gamepad.buttons.forEach((button, index) => {
        const isPressed = button.pressed || button.value > 0.5;
        const wasPressed = previousSnapshot[index] || false;
        previousPressed[index] = isPressed;
        const path = document.getElementById(`svg-btn-${index}`);
        const callout = document.querySelector(`.editor-callout[data-btn="${index}"]`);
        if (path) path.classList.toggle('highlighted', isPressed);
        if (callout) {
          if (isPressed && !wasPressed) {
            callout.style.transform = 'scale(1.15)';
            callout.style.borderColor = 'var(--primary)';
          } else if (!isPressed) {
            callout.style.transform = '';
            callout.style.borderColor = '';
          }
        }
      });
      const leftThumb = document.getElementById('svg-btn-10');
      const rightThumb = document.getElementById('svg-btn-11');
      if (leftThumb) {
        leftThumb.setAttribute('cx', (135 + (gamepad.axes[0] || 0) * 8).toString());
        leftThumb.setAttribute('cy', (185 + (gamepad.axes[1] || 0) * 8).toString());
      }
      if (rightThumb) {
        rightThumb.setAttribute('cx', (265 + (gamepad.axes[2] || 0) * 8).toString());
        rightThumb.setAttribute('cy', (185 + (gamepad.axes[3] || 0) * 8).toString());
      }
      if (optionsTutorial?.handleGamepad(gamepad, previousSnapshot)) {
        cursor.hideCursor('left');
        cursor.hideCursor('right');
        updateNavigationStickViz(gamepad);
        return;
      }
      const nav = state.getSettings().navSettings;
      if (nav?.enabled) {
        const rightX = gamepad.axes[2] || 0;
        const rightY = gamepad.axes[3] || 0;
        const leftX = gamepad.axes[0] || 0;
        const leftY = gamepad.axes[1] || 0;
        updateOptionsStick('left', leftX, leftY, nav.leftStick);
        updateOptionsStick('right', rightX, rightY, nav.rightStick);
      } else {
        cursor.hideCursor('left');
        cursor.hideCursor('right');
      }
      updateNavigationStickViz(gamepad);
      updateOptionsGamepadNav(gamepad, previousSnapshot);
    }

    function updateOptionsStick(stickId, axisX, axisY, config) {
      if (config?.mode === 'cursor') {
        cursor.updateCursor(stickId, axisX, axisY);
        return;
      }

      cursor.hideCursor(stickId);
      if (config?.mode !== 'scroll') return;

      const deadzone = config.deadzone ?? 0.3;
      if (Math.hypot(axisX, axisY) <= deadzone || Date.now() - lastOptionsActionTime <= OPTIONS_NAV_REPEAT_MS) {
        return;
      }

      const action = Math.abs(axisY) >= Math.abs(axisX)
        ? axisY < 0 ? 'scroll_up' : 'scroll_down'
        : axisX < 0 ? 'scroll_left' : 'scroll_right';
      executeOptionsScroll(action, config.scrollAmountPx);
      lastOptionsActionTime = Date.now();
    }

    function bind() {
      global.addEventListener('gamepadconnected', () => startPolling());
      global.addEventListener('gamepaddisconnected', () => pollGamepads());
      dom.testInputBtn.addEventListener('click', () => {
        if (testMode) return;
        testMode = true;
        const originalText = dom.testInputBtn.textContent;
        dom.testInputBtn.textContent = 'Press any controller button…';
        dom.testInputBtn.style.background = 'var(--secondary-container)';
        dom.testInputBtn.style.color = 'var(--on-secondary-container)';
        const interval = setInterval(() => {
          const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
          for (const gamepad of gamepads) {
            if (!gamepad || !gamepad.connected) continue;
            const pressed = gamepad.buttons.findIndex(button => button.pressed);
            if (pressed !== -1) {
              const name = BUTTON_NAMES[pressed.toString()] || `Button ${pressed}`;
              const toast = dom.toastEl;
              toast.textContent = `Detected Input: ${name}`;
              toast.className = 'toast success';
              toast.classList.add('show');
              setTimeout(() => toast.classList.remove('show'), 2500);
              clearTest();
              return;
            }
          }
        }, 50);
        testTimer = setTimeout(() => {
          clearTest();
          const toast = dom.toastEl;
          toast.textContent = 'Test timed out. Press a button on your gamepad.';
          toast.className = 'toast ';
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 2500);
        }, 6000);
        function clearTest() {
          clearInterval(interval);
          clearTimeout(testTimer);
          testMode = false;
          dom.testInputBtn.textContent = originalText;
          dom.testInputBtn.style.background = '';
          dom.testInputBtn.style.color = '';
        }
      });
      global.addEventListener('beforeunload', event => {
        if (state.getUnsavedChanges()) {
          event.preventDefault();
          event.returnValue = '';
        }
      });
    }

    return { startPolling, pollGamepads, bind };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.Gamepad = { create };
})(typeof window !== 'undefined' ? window : globalThis);
