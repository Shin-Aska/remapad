(function (global) {
  'use strict';

  function create({ utils, constants, domSimulator, callbacks }) {
    const { clamp, hexToRgba, isRemapadElement } = utils;
    const { POLL_INTERVAL_MS, DEADZONE, CURSOR_SPEED_PX_PER_SEC } = constants;
    const cursors = {
      left: { element: null, target: null, x: 0, y: 0, visible: false },
      right: { element: null, target: null, x: 0, y: 0, visible: false }
    };
    let cursorStyleElement = null;

    function initCursor(stickId) {
      const cursor = cursors[stickId];
      if (cursor.element) return;
      injectCursorStyles();

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

    function show(stickId) {
      initCursor(stickId);
      const cursor = cursors[stickId];
      cursor.element?.classList.add('visible');
      cursor.visible = true;
    }

    function clearTarget(stickId) {
      const cursor = cursors[stickId];
      if (!cursor.target) return;
      domSimulator.dispatchHoverEvents(cursor.target, false);
      cursor.target.classList.remove('remapad-cursor-target');
      cursor.target.style.removeProperty('--remapad-cursor-color');
      cursor.target = null;
    }

    function hide(stickId) {
      const cursor = cursors[stickId];
      cursor.element?.classList.remove('visible');
      cursor.visible = false;
      clearTarget(stickId);
    }

    function remove() {
      hide('left');
      hide('right');
      cursors.left.element?.remove();
      cursors.right.element?.remove();
      cursors.left.element = null;
      cursors.right.element = null;
      cursorStyleElement?.remove();
      cursorStyleElement = null;
    }

    function defaultColor(stickId) {
      return stickId === 'left' ? '#00a8e1' : '#e50914';
    }

    function isClickableTarget(element) {
      if (!(element instanceof Element)) return false;
      if (isRemapadElement(element)) return false;
      if (getComputedStyle(element).pointerEvents === 'none') return false;
      const tag = element.tagName;
      return tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' ||
        tag === 'TEXTAREA' || element.matches('[role="button"], [tabindex]:not([tabindex="-1"])') ||
        element.matches('video, .title-card-container, [data-testid="card"], [class*="card" i]');
    }

    function updateTarget(stickId) {
      const cursor = cursors[stickId];
      if (!cursor.element) return;
      let element = document.elementFromPoint(cursor.x, cursor.y);
      if (element === cursor.element) element = null;
      let target = element;
      while (target && !isClickableTarget(target)) {
        target = target.parentElement;
      }

      if (target && target !== cursor.target) {
        clearTarget(stickId);
        cursor.target = target;
        const nav = callbacks.getSettings().navSettings;
        const stickConfig = stickId === 'left' ? nav?.leftStick : nav?.rightStick;
        const color = (stickConfig?.cursorColor || '').trim() || defaultColor(stickId);
        cursor.target.style.setProperty('--remapad-cursor-color', hexToRgba(color, 0.7));
        cursor.target.classList.add('remapad-cursor-target');
        domSimulator.dispatchHoverEvents(cursor.target, true);
      } else if (!target) {
        clearTarget(stickId);
      }
    }

    function update(stickId, axisX, axisY) {
      const nav = callbacks.getSettings().navSettings;
      if (callbacks.isQuickMapOpen() || !nav?.enabled) {
        hide(stickId);
        return;
      }
      const stickConfig = stickId === 'left' ? nav.leftStick : nav.rightStick;
      const deadzone = stickConfig?.deadzone ?? DEADZONE;
      const speed = stickConfig?.cursorSpeed ?? CURSOR_SPEED_PX_PER_SEC;
      const magnitude = Math.hypot(axisX, axisY);

      show(stickId);
      const cursor = cursors[stickId];
      if (magnitude > deadzone) {
        const now = performance.now();
        const delta = cursor.lastTime ? Math.min(0.1, (now - cursor.lastTime) / 1000) : POLL_INTERVAL_MS / 1000;
        cursor.lastTime = now;
        const normalizedMagnitude = (magnitude - deadzone) / (1 - deadzone);
        const velocity = Math.pow(normalizedMagnitude, 1.2) * speed;
        cursor.x = clamp(cursor.x + (axisX / magnitude) * velocity * delta, 0, global.innerWidth);
        cursor.y = clamp(cursor.y + (axisY / magnitude) * velocity * delta, 0, global.innerHeight);
      } else {
        cursor.lastTime = null;
      }

      if (cursor.element) {
        const color = (stickConfig?.cursorColor || '').trim() || defaultColor(stickId);
        cursor.element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
        cursor.element.style.backgroundColor = hexToRgba(color, 0.85);
        cursor.element.style.boxShadow = `0 0 0 2px ${hexToRgba(color, 0.4)}, 0 4px 16px rgba(0, 0, 0, 0.5)`;
      }
      updateTarget(stickId);
    }

    function hasActiveTarget() {
      return Boolean(
        (cursors.right.visible && cursors.right.target) ||
        (cursors.left.visible && cursors.left.target)
      );
    }

    function click() {
      const rightCursor = cursors.right;
      const leftCursor = cursors.left;
      const activeCursor = rightCursor.visible && rightCursor.target
        ? rightCursor
        : leftCursor.visible && leftCursor.target
          ? leftCursor
          : null;

      if (activeCursor?.target) {
        const modalFocusState = callbacks.beginModalFocusTracking();
        callbacks.activateElementAsClick(activeCursor.target, activeCursor.x, activeCursor.y);
        callbacks.focusNewModalAfterClick(modalFocusState);
        return;
      }

      const rightElement = document.elementFromPoint(rightCursor.x, rightCursor.y);
      const leftElement = document.elementFromPoint(leftCursor.x, leftCursor.y);
      const fallbackElement = rightElement || leftElement;
      const fallbackCursor = rightElement === fallbackElement
        ? rightCursor
        : leftElement === fallbackElement
          ? leftCursor
          : rightCursor;
      if (fallbackElement && !isRemapadElement(fallbackElement)) {
        const modalFocusState = callbacks.beginModalFocusTracking();
        callbacks.activateElementAsClick(fallbackElement, fallbackCursor.x, fallbackCursor.y);
        callbacks.focusNewModalAfterClick(modalFocusState);
      }
    }

    function getElements() {
      return [cursors.left.element, cursors.right.element];
    }

    function handleResize() {
      cursors.left.x = clamp(cursors.left.x, 0, global.innerWidth);
      cursors.left.y = clamp(cursors.left.y, 0, global.innerHeight);
      cursors.right.x = clamp(cursors.right.x, 0, global.innerWidth);
      cursors.right.y = clamp(cursors.right.y, 0, global.innerHeight);
    }

    return { update, hide, remove, hasActiveTarget, click, getElements, handleResize };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.CursorController = { create };
})(typeof window !== 'undefined' ? window : globalThis);
