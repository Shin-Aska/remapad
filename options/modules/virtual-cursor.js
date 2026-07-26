/**
 * Remapad Options — Virtual Cursor and Input Overlay
 * MV3-compatible classic script; exposed via window.RemapadOptions.VirtualCursor.
 * Owns dual cursors plus gamepad-operated select, color, and keyboard overlays.
 */

(function (global) {
  'use strict';

  function create({ state, constants, utils, dom }) {
    const { COLOR_PRESETS } = constants;
    const { clamp, hexToRgba } = utils;
    const cursors = {
      left: { element: null, target: null, x: 0, y: 0, visible: false },
      right: { element: null, target: null, x: 0, y: 0, visible: false }
    };
    let cursorStyleElement = null;
    let gamepadSelectTarget = null;
    let gamepadFocusIndex = -1;
    let gamepadFocusElements = [];

    function defaultCursorColor(stickId) {
      return stickId === 'left' ? '#00a8e1' : '#e50914';
    }

    function dispatchHoverEvents(element, enter) {
      if (!element) return;
      const eventType = enter ? 'mouseover' : 'mouseout';
      const leaveType = enter ? 'mouseenter' : 'mouseleave';
      const options = { bubbles: true, cancelable: true, view: global };
      element.dispatchEvent(new MouseEvent(eventType, options));
      element.dispatchEvent(new MouseEvent(leaveType, options));
    }

    function isRemapadElement(target) {
      return target instanceof Element && Boolean(target.closest('.remapad-quick-map, .remapad-hud-container, .remapad-cursor, .gamepad-select-overlay, .remapad-keyboard-overlay'));
    }

    function isClickableCursorTarget(element) {
      if (!(element instanceof Element) || isRemapadElement(element)) return false;
      if (getComputedStyle(element).pointerEvents === 'none') return false;
      const tag = element.tagName;
      return tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' ||
        tag === 'TEXTAREA' || element.matches('[role="button"], [tabindex]:not([tabindex="-1"])') ||
        element.matches('video, .title-card-container, [data-testid="card"], [class*="card" i]');
    }

    function clearCursorTarget(stickId) {
      const cursor = cursors[stickId];
      if (!cursor.target) return;
      dispatchHoverEvents(cursor.target, false);
      cursor.target.classList.remove('remapad-cursor-target');
      cursor.target.style.removeProperty('--remapad-cursor-color');
      cursor.target = null;
    }

    function updateCursorTarget(stickId) {
      const cursor = cursors[stickId];
      if (!cursor.element) return;
      let element = document.elementFromPoint(cursor.x, cursor.y);
      if (element === cursor.element) element = null;
      let target = element;
      while (target && !isClickableCursorTarget(target)) target = target.parentElement;
      if (target && target !== cursor.target) {
        clearCursorTarget(stickId);
        cursor.target = target;
        const nav = state.getSettings().navSettings;
        const config = stickId === 'left' ? nav.leftStick : nav.rightStick;
        const color = (config?.cursorColor || '').trim() || defaultCursorColor(stickId);
        cursor.target.style.setProperty('--remapad-cursor-color', hexToRgba(color, 0.7));
        cursor.target.classList.add('remapad-cursor-target');
        dispatchHoverEvents(cursor.target, true);
      } else if (!target) {
        clearCursorTarget(stickId);
      }
    }

    function injectStyles() {
      if (cursorStyleElement) return;
      cursorStyleElement = document.createElement('style');
      cursorStyleElement.textContent = `
        .remapad-cursor { position:fixed;top:0;left:0;width:22px;height:22px;margin-left:-11px;margin-top:-11px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,0.4),0 4px 16px rgba(0,0,0,0.5);z-index:2147483647;pointer-events:none;transition:transform 0.05s linear,opacity 0.2s ease;opacity:0;display:flex;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:10px;font-weight:700;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,0.7); }
        .remapad-cursor.visible { opacity:1; }
        .remapad-cursor-label { pointer-events:none;user-select:none; }
        .remapad-cursor-target { outline:3px solid var(--remapad-cursor-color,rgba(229,9,20,0.7)) !important;outline-offset:4px !important; }
      `;
      document.head.appendChild(cursorStyleElement);
    }

    function initCursor(stickId) {
      const cursor = cursors[stickId];
      if (cursor.element) return;
      injectStyles();
      const element = document.createElement('div');
      element.className = `remapad-cursor remapad-cursor--${stickId}`;
      element.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'remapad-cursor-label';
      label.textContent = stickId === 'left' ? 'L' : 'R';
      element.appendChild(label);
      document.body.appendChild(element);
      cursor.element = element;
      if (!cursor.x || !cursor.y) {
        cursor.x = global.innerWidth / 2;
        cursor.y = global.innerHeight / 2;
      }
    }

    function showCursor(stickId) {
      initCursor(stickId);
      cursors[stickId].element?.classList.add('visible');
      cursors[stickId].visible = true;
    }

    function hideCursor(stickId) {
      cursors[stickId].element?.classList.remove('visible');
      cursors[stickId].visible = false;
      clearCursorTarget(stickId);
    }

    function updateCursor(stickId, axisX, axisY) {
      if (!state.getSettings().navSettings?.enabled || isOverlayOpen()) {
        hideCursor(stickId);
        return;
      }
      const nav = state.getSettings().navSettings;
      const config = stickId === 'left' ? nav.leftStick : nav.rightStick;
      const deadzone = config?.deadzone ?? 0.3;
      const speed = config?.cursorSpeed ?? 800;
      const magnitude = Math.hypot(axisX, axisY);
      showCursor(stickId);
      const cursor = cursors[stickId];
      if (magnitude > deadzone) {
        const now = performance.now();
        const delta = cursor.lastTime ? Math.min(0.1, (now - cursor.lastTime) / 1000) : 0.05;
        cursor.lastTime = now;
        const normalizedMagnitude = (magnitude - deadzone) / (1 - deadzone);
        const velocity = Math.pow(normalizedMagnitude, 1.2) * speed;
        cursor.x = clamp(cursor.x + axisX / magnitude * velocity * delta, 0, global.innerWidth);
        cursor.y = clamp(cursor.y + axisY / magnitude * velocity * delta, 0, global.innerHeight);
      } else {
        cursor.lastTime = null;
      }
      if (cursor.element) {
        const color = (config?.cursorColor || '').trim() || defaultCursorColor(stickId);
        cursor.element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
        cursor.element.style.backgroundColor = hexToRgba(color, 0.85);
        cursor.element.style.boxShadow = `0 0 0 2px ${hexToRgba(color, 0.4)}, 0 4px 16px rgba(0, 0, 0, 0.5)`;
      }
      updateCursorTarget(stickId);
    }

    function simulateClickAt(element, x, y) {
      const options = { bubbles: true, cancelable: true, view: global, clientX: x, clientY: y, screenX: x + global.screenX, screenY: y + global.screenY, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true, composed: true };
      if (typeof PointerEvent !== 'undefined') {
        const pointerOptions = { ...options, pointerId: 1, width: 1, height: 1, pressure: 0.5 };
        element.dispatchEvent(new PointerEvent('pointerover', pointerOptions));
        element.dispatchEvent(new PointerEvent('pointerenter', pointerOptions));
        element.dispatchEvent(new PointerEvent('pointermove', pointerOptions));
        element.dispatchEvent(new PointerEvent('pointerdown', { ...pointerOptions, buttons: 1 }));
        element.dispatchEvent(new MouseEvent('mousedown', options));
        element.dispatchEvent(new PointerEvent('pointerup', { ...pointerOptions, buttons: 0 }));
        element.dispatchEvent(new MouseEvent('mouseup', options));
        element.click();
        element.dispatchEvent(new PointerEvent('pointerout', pointerOptions));
        element.dispatchEvent(new PointerEvent('pointerleave', pointerOptions));
      } else {
        element.dispatchEvent(new MouseEvent('mouseover', options));
        element.dispatchEvent(new MouseEvent('mouseenter', options));
        element.dispatchEvent(new MouseEvent('mousemove', options));
        element.dispatchEvent(new MouseEvent('mousedown', options));
        element.dispatchEvent(new MouseEvent('mouseup', options));
        element.click();
        element.dispatchEvent(new MouseEvent('mouseout', options));
        element.dispatchEvent(new MouseEvent('mouseleave', options));
      }
    }

    function simulateKeyboardActivate(element) {
      if (element.focus && typeof element.focus === 'function' && element.tabIndex !== -1) element.focus({ preventScroll: true });
      const options = { bubbles: true, cancelable: true, view: global, key: 'Enter', code: 'Enter', keyCode: 13, which: 13, composed: true };
      element.dispatchEvent(new KeyboardEvent('keydown', options));
      element.dispatchEvent(new KeyboardEvent('keyup', options));
    }

    function openGamepadKeyboard(input) {
      if (typeof RemapadKeyboard === 'undefined') return;
      RemapadKeyboard.open(input, {
        layoutId: state.getSettings().keyboardLayout || 'qwerty',
        layouts: state.getSettings().customKeyboardLayouts,
        onClose: () => {
          gamepadFocusElements = [];
          gamepadFocusIndex = -1;
        }
      });
      gamepadFocusElements = RemapadKeyboard.getFocusableElements ? RemapadKeyboard.getFocusableElements() : [];
      gamepadFocusIndex = 0;
      refreshGamepadFocusVisual();
    }

    function openGamepadColorPicker(colorInput) {
      gamepadSelectTarget = colorInput;
      dom.gamepadSelectOverlay.innerHTML = '';
      COLOR_PRESETS.forEach(color => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gamepad-select-option';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.gap = '8px';
        if (colorInput.value.toLowerCase() === color.toLowerCase()) button.classList.add('gamepad-select-option-selected');
        const swatch = document.createElement('span');
        swatch.style.cssText = 'width:16px;height:16px;border-radius:3px;border:1px solid rgba(255,255,255,0.2);flex-shrink:0';
        swatch.style.background = color;
        const label = document.createElement('span');
        label.textContent = color;
        button.append(swatch, label);
        button.dataset.value = color;
        button.addEventListener('click', event => {
          event.stopPropagation();
          confirmGamepadSelect(color);
        });
        dom.gamepadSelectOverlay.appendChild(button);
      });
      positionGamepadSelect(colorInput);
      const selected = COLOR_PRESETS.findIndex(color => color.toLowerCase() === (colorInput.value || '').toLowerCase());
      gamepadFocusIndex = selected >= 0 ? selected : 0;
      gamepadFocusElements = Array.from(dom.gamepadSelectOverlay.querySelectorAll('.gamepad-select-option'));
      refreshGamepadFocusVisual();
    }

    function positionGamepadSelect(target) {
      const rect = target.getBoundingClientRect();
      dom.gamepadSelectOverlay.style.display = 'block';
      dom.gamepadSelectOverlay.style.left = `${rect.left}px`;
      dom.gamepadSelectOverlay.style.top = `${rect.bottom + 4}px`;
      dom.gamepadSelectOverlay.style.minWidth = `${Math.max(rect.width, 180)}px`;
    }

    function openGamepadSelect(select) {
      gamepadSelectTarget = select;
      const options = Array.from(select.options);
      const selectedValue = select.value;
      dom.gamepadSelectOverlay.innerHTML = '';
      options.forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gamepad-select-option';
        if (option.value === selectedValue) button.classList.add('gamepad-select-option-selected');
        button.textContent = option.textContent;
        button.dataset.value = option.value;
        button.dataset.index = String(index);
        button.addEventListener('click', event => {
          event.stopPropagation();
          confirmGamepadSelect(option.value);
        });
        dom.gamepadSelectOverlay.appendChild(button);
      });
      positionGamepadSelect(select);
      const selected = options.findIndex(option => option.value === selectedValue);
      gamepadFocusIndex = selected >= 0 ? selected : 0;
      gamepadFocusElements = Array.from(dom.gamepadSelectOverlay.querySelectorAll('.gamepad-select-option'));
      refreshGamepadFocusVisual();
    }

    function confirmGamepadSelect(value) {
      if (!gamepadSelectTarget) return;
      gamepadSelectTarget.value = value;
      gamepadSelectTarget.dispatchEvent(new Event('change', { bubbles: true }));
      closeGamepadSelect();
    }

    function closeGamepadSelect() {
      dom.gamepadSelectOverlay.style.display = 'none';
      gamepadSelectTarget = null;
      gamepadFocusElements = [];
      gamepadFocusIndex = -1;
    }

    function refreshGamepadFocusVisual() {
      document.querySelectorAll('.gamepad-focused').forEach(element => element.classList.remove('gamepad-focused'));
      if (gamepadFocusIndex >= 0 && gamepadFocusElements[gamepadFocusIndex]) {
        gamepadFocusElements[gamepadFocusIndex].classList.add('gamepad-focused');
        gamepadFocusElements[gamepadFocusIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }

    function getOverlayFocusableElements() {
      if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) {
        return RemapadKeyboard.getFocusableElements ? RemapadKeyboard.getFocusableElements() : [];
      }
      if (dom.gamepadSelectOverlay && dom.gamepadSelectOverlay.style.display !== 'none') {
        return Array.from(dom.gamepadSelectOverlay.querySelectorAll('.gamepad-select-option'));
      }
      return [];
    }

    function isOverlayOpen() {
      return (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) ||
        (dom.gamepadSelectOverlay && dom.gamepadSelectOverlay.style.display !== 'none');
    }

    function activateOverlayFocus() {
      if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) {
        RemapadKeyboard.activateFocus();
        return;
      }
      const elements = getOverlayFocusableElements();
      if (gamepadFocusIndex < 0 || gamepadFocusIndex >= elements.length) return;
      const element = elements[gamepadFocusIndex];
      if (dom.gamepadSelectOverlay?.style.display !== 'none' && element.classList.contains('gamepad-select-option')) {
        confirmGamepadSelect(element.dataset.value);
      }
    }

    function moveOverlayFocus(direction) {
      if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) {
        RemapadKeyboard.moveFocus(direction);
        return;
      }
      const elements = getOverlayFocusableElements();
      if (!elements.length || dom.gamepadSelectOverlay?.style.display === 'none') return;
      const delta = direction === 'up' || direction === 'left' ? -1 : 1;
      gamepadFocusIndex = (gamepadFocusIndex + delta + elements.length) % elements.length;
      gamepadFocusElements = elements;
      refreshGamepadFocusVisual();
    }

    function activateElementAsClick(element, x, y) {
      if (element.tagName === 'SELECT') {
        openGamepadSelect(element);
        return;
      }
      if (element.tagName === 'INPUT' && element.type === 'color') {
        openGamepadColorPicker(element);
        return;
      }
      if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isEditableElement(element)) {
        openGamepadKeyboard(element);
        return;
      }
      simulateClickAt(element, x, y);
      simulateKeyboardActivate(element);
    }

    function executeCursorClick() {
      const active = cursors.right.visible && cursors.right.target ? cursors.right
        : cursors.left.visible && cursors.left.target ? cursors.left : null;
      if (active?.target) {
        activateElementAsClick(active.target, active.x, active.y);
        return;
      }
      const rightElement = document.elementFromPoint(cursors.right.x, cursors.right.y);
      const leftElement = document.elementFromPoint(cursors.left.x, cursors.left.y);
      const element = rightElement || leftElement;
      const cursor = rightElement === element ? cursors.right : leftElement === element ? cursors.left : cursors.right;
      if (element && !isRemapadElement(element)) activateElementAsClick(element, cursor.x, cursor.y);
    }

    function handleDocumentClick(event) {
      if (dom.gamepadSelectOverlay?.style.display !== 'none' && !dom.gamepadSelectOverlay.contains(event.target) && event.target !== gamepadSelectTarget) {
        closeGamepadSelect();
      }
    }

    return {
      updateCursor,
      hideCursor,
      executeCursorClick,
      activateOverlayFocus,
      moveOverlayFocus,
      isOverlayOpen,
      isRemapadElement,
      closeGamepadSelect,
      handleDocumentClick
    };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.VirtualCursor = { create };
})(typeof window !== 'undefined' ? window : globalThis);
