/**
 * Remapad Shared Virtual Keyboard
 * Used by both the options page and the content script.
 * Creates a gamepad-navigable on-screen keyboard overlay.
 */

(function (global) {
  'use strict';

  const DEFAULT_KEYBOARD_LAYOUTS = {
    qwerty: {
      name: 'QWERTY',
      layers: {
        alpha: [
          ['q','w','e','r','t','y','u','i','o','p'],
          ['a','s','d','f','g','h','j','k','l'],
          ['shift','z','x','c','v','b','n','m','backspace'],
          ['toggle-layer',' ','.','-','_','/',':','confirm']
        ],
        symbols: [
          ['1','2','3','4','5','6','7','8','9','0'],
          ['!','@','#','$','%','^','&','*','(',')'],
          ['shift','"',"'",';',',','+','=','?','backspace'],
          ['toggle-layer',' ','.','-','_','/',':','confirm']
        ]
      }
    },
    dvorak: {
      name: 'Dvorak',
      layers: {
        alpha: [
          ['p','y','f','g','c','r','l',',','.'],
          ['a','o','e','u','i','d','h','t','n','s'],
          ['shift','q','j','k','x','b','m','w','v','z'],
          ['toggle-layer',' ','backspace','confirm']
        ],
        symbols: [
          ['1','2','3','4','5','6','7','8','9','0'],
          ['!','@','#','$','%','^','&','*','(',')'],
          ['shift','"',"'",';',',','+','=','?','backspace'],
          ['toggle-layer',' ','.','-','_','/',':','confirm']
        ]
      }
    },
    azerty: {
      name: 'AZERTY',
      layers: {
        alpha: [
          ['a','z','e','r','t','y','u','i','o','p'],
          ['q','s','d','f','g','h','j','k','l','m'],
          ['shift','w','x','c','v','b','n',"'",'backspace'],
          ['toggle-layer',' ','.','-','_','/',':','confirm']
        ],
        symbols: [
          ['1','2','3','4','5','6','7','8','9','0'],
          ['!','@','#','$','%','^','&','*','(',')'],
          ['shift','"',';','.',',','+','=','?','backspace'],
          ['toggle-layer',' ','-','_','/',':','confirm']
        ]
      }
    }
  };

  let layouts = { ...DEFAULT_KEYBOARD_LAYOUTS };
  let keyboardOverlay = null;
  let keyboardGrid = null;
  let keyboardPreview = null;
  let keyboardConfirmBtn = null;
  let keyboardCancelBtn = null;
  let keyboardStyleElement = null;

  let keyboardTarget = null;
  let keyboardValue = '';
  let keyboardLayer = 'alpha';
  let keyboardLayoutId = 'qwerty';
  let keyboardFocusIndex = -1;
  let keyboardFocusElements = [];
  let keyboardOpenCallback = null;
  let keyboardCloseCallback = null;
  let keyboardActionCallback = null;

  function ensureKeyboardDOM() {
    if (keyboardOverlay) return;

    injectKeyboardStyles();

    keyboardOverlay = document.createElement('div');
    keyboardOverlay.className = 'remapad-keyboard-overlay';
    keyboardOverlay.setAttribute('role', 'dialog');
    keyboardOverlay.setAttribute('aria-label', 'Virtual keyboard');
    keyboardOverlay.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'remapad-keyboard-header';
    const title = document.createElement('span');
    title.className = 'remapad-keyboard-title';
    title.textContent = 'Type text';
    keyboardPreview = document.createElement('span');
    keyboardPreview.className = 'remapad-keyboard-preview';
    header.appendChild(title);
    header.appendChild(keyboardPreview);

    keyboardGrid = document.createElement('div');
    keyboardGrid.className = 'remapad-keyboard-grid';

    const footer = document.createElement('div');
    footer.className = 'remapad-keyboard-footer';
    keyboardConfirmBtn = document.createElement('button');
    keyboardConfirmBtn.type = 'button';
    keyboardConfirmBtn.className = 'remapad-keyboard-btn';
    keyboardConfirmBtn.textContent = 'Confirm';
    keyboardCancelBtn = document.createElement('button');
    keyboardCancelBtn.type = 'button';
    keyboardCancelBtn.className = 'remapad-keyboard-btn';
    keyboardCancelBtn.textContent = 'Cancel';
    footer.appendChild(keyboardConfirmBtn);
    footer.appendChild(keyboardCancelBtn);

    keyboardOverlay.appendChild(header);
    keyboardOverlay.appendChild(keyboardGrid);
    keyboardOverlay.appendChild(footer);
    document.body.appendChild(keyboardOverlay);

    keyboardConfirmBtn.addEventListener('click', (e) => { e.stopPropagation(); closeGamepadKeyboard(true); });
    keyboardCancelBtn.addEventListener('click', (e) => { e.stopPropagation(); closeGamepadKeyboard(false); });
  }

  function injectKeyboardStyles() {
    if (keyboardStyleElement) return;
    keyboardStyleElement = document.createElement('style');
    keyboardStyleElement.textContent = `
      .remapad-keyboard-overlay {
        position: fixed;
        bottom: 0;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483646;
        background: #1c1c1c;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px 4px 0 0;
        box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.6);
        padding: 12px 16px 16px;
        width: 520px;
        max-width: 95vw;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .remapad-keyboard-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .remapad-keyboard-title {
        font-size: 12px;
        color: #e9bcb6;
      }
      .remapad-keyboard-preview {
        font-size: 13px;
        color: #e5e2e1;
        max-width: 380px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .remapad-keyboard-grid {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .remapad-keyboard-row {
        display: flex;
        gap: 4px;
        justify-content: center;
      }
      .remapad-keyboard-key {
        min-width: 32px;
        height: 36px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        color: #e5e2e1;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
      }
      .remapad-keyboard-key:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .remapad-keyboard-key-wide {
        min-width: 60px;
      }
      .remapad-keyboard-key-special {
        background: rgba(255, 255, 255, 0.03);
        font-size: 12px;
      }
      .remapad-keyboard-key.focused {
        background: rgba(229, 9, 20, 0.3);
        outline: 2px solid #ffb4aa;
        outline-offset: 1px;
      }
      .remapad-keyboard-btn {
        background: rgba(255, 255, 255, 0.05);
        color: #e5e2e1;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        padding: 6px 16px;
        cursor: pointer;
        font-size: 13px;
      }
      .remapad-keyboard-btn.focused {
        background: rgba(229, 9, 20, 0.3);
        outline: 2px solid #ffb4aa;
        outline-offset: 1px;
      }
    `;
    document.head.appendChild(keyboardStyleElement);
  }

  function getCurrentLayout() {
    return layouts[keyboardLayoutId] || layouts.qwerty;
  }

  function buildGamepadKeyboard() {
    ensureKeyboardDOM();
    keyboardGrid.innerHTML = '';
    const layout = getCurrentLayout();
    const layer = layout.layers[keyboardLayer] || layout.layers.alpha;

    layer.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'remapad-keyboard-row';
      row.forEach(keyValue => {
        const keyDef = resolveKeyDef(keyValue, keyboardLayer);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'remapad-keyboard-key';
        if (keyDef.wide) btn.classList.add('remapad-keyboard-key-wide');
        if (keyDef.special) btn.classList.add('remapad-keyboard-key-special');
        btn.textContent = keyDef.label;
        btn.dataset.keyValue = keyDef.value;
        btn.dataset.special = keyDef.special ? '1' : '0';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleGamepadKeyboardKey(keyDef.value);
        });
        rowEl.appendChild(btn);
      });
      keyboardGrid.appendChild(rowEl);
    });
  }

  function resolveKeyDef(value, layerId) {
    const labels = {
      'shift': layerId === 'alpha' ? '⇧' : '⇧',
      'backspace': '⌫',
      'toggle-layer': layerId === 'alpha' ? '123' : 'ABC',
      ' ': '␣',
      'confirm': '✓'
    };
    const wideKeys = new Set(['shift', 'backspace', 'toggle-layer', ' ', 'confirm']);
    const specialKeys = new Set(['shift', 'backspace', 'toggle-layer', ' ', 'confirm']);
    return {
      value,
      label: labels[value] || value,
      wide: wideKeys.has(value),
      special: specialKeys.has(value)
    };
  }

  function handleGamepadKeyboardKey(value) {
    if (value === 'backspace') {
      keyboardValue = keyboardValue.slice(0, -1);
    } else if (value === 'shift') {
      keyboardLayer = keyboardLayer === 'alpha' ? 'symbols' : 'alpha';
      buildGamepadKeyboard();
    } else if (value === 'toggle-layer') {
      keyboardLayer = keyboardLayer === 'alpha' ? 'symbols' : 'alpha';
      buildGamepadKeyboard();
    } else if (value === 'confirm') {
      closeGamepadKeyboard(true);
      return;
    } else if (value === ' ') {
      keyboardValue += ' ';
    } else {
      keyboardValue += value;
    }
    updateGamepadKeyboardPreview();
    refreshKeyboardFocusVisual();
    if (keyboardActionCallback) keyboardActionCallback('key', value);
  }

  function setNativeValue(target, value) {
    if (!target) return;
    const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(target, value);
    } else {
      target.value = value;
    }
  }

  function updateGamepadKeyboardPreview() {
    if (keyboardPreview) {
      keyboardPreview.textContent = keyboardValue || ' ';
    }
    if (keyboardTarget) {
      setNativeValue(keyboardTarget, keyboardValue);
      keyboardTarget.dispatchEvent(new InputEvent('input', { bubbles: true, data: keyboardValue.slice(-1) || null, inputType: 'insertText' }));
    }
  }

  function openGamepadKeyboard(inputEl, options = {}) {
    if (!inputEl) return;
    ensureKeyboardDOM();
    keyboardTarget = inputEl;
    keyboardValue = inputEl.value || '';
    keyboardLayer = 'alpha';
    if (options.layoutId && layouts[options.layoutId]) keyboardLayoutId = options.layoutId;
    if (options.layouts) layouts = { ...DEFAULT_KEYBOARD_LAYOUTS, ...options.layouts };
    keyboardOpenCallback = options.onOpen || null;
    keyboardCloseCallback = options.onClose || null;
    keyboardActionCallback = options.onAction || null;

    buildGamepadKeyboard();
    updateGamepadKeyboardPreview();
    keyboardOverlay.style.display = 'block';
    keyboardFocusElements = collectKeyboardFocusables();
    keyboardFocusIndex = 0;
    refreshKeyboardFocusVisual();
    if (keyboardOpenCallback) keyboardOpenCallback();
  }

  function closeGamepadKeyboard(confirm) {
    if (!keyboardOverlay) return;
    if (confirm && keyboardTarget) {
      setNativeValue(keyboardTarget, keyboardValue);
      keyboardTarget.dispatchEvent(new InputEvent('input', { bubbles: true, data: keyboardValue.slice(-1) || null, inputType: 'insertText' }));
      keyboardTarget.dispatchEvent(new Event('change', { bubbles: true }));
    }
    keyboardOverlay.style.display = 'none';
    const target = keyboardTarget;
    keyboardTarget = null;
    keyboardValue = '';
    keyboardFocusElements = [];
    keyboardFocusIndex = -1;
    if (keyboardCloseCallback) keyboardCloseCallback(target, confirm);
  }

  function isKeyboardOpen() {
    return keyboardOverlay && keyboardOverlay.style.display !== 'none';
  }

  function collectKeyboardFocusables() {
    ensureKeyboardDOM();
    const keys = Array.from(keyboardGrid.querySelectorAll('.remapad-keyboard-key'));
    keys.push(keyboardConfirmBtn);
    keys.push(keyboardCancelBtn);
    return keys;
  }

  function refreshKeyboardFocusVisual() {
    ensureKeyboardDOM();
    document.querySelectorAll('.remapad-keyboard-key.focused, .remapad-keyboard-btn.focused').forEach(el => el.classList.remove('focused'));
    if (keyboardFocusIndex >= 0 && keyboardFocusElements[keyboardFocusIndex]) {
      keyboardFocusElements[keyboardFocusIndex].classList.add('focused');
      keyboardFocusElements[keyboardFocusIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  function getKeyboardFocusableElements() {
    if (!isKeyboardOpen()) return [];
    return collectKeyboardFocusables();
  }

  function moveKeyboardFocus(direction) {
    const elements = getKeyboardFocusableElements();
    if (elements.length === 0) return;

    if (keyboardFocusIndex < 0 || keyboardFocusIndex >= elements.length || keyboardFocusElements !== elements) {
      keyboardFocusIndex = 0;
      keyboardFocusElements = elements;
      refreshKeyboardFocusVisual();
      return;
    }

    if (direction === 'up' || direction === 'left' || direction === 'down' || direction === 'right') {
      const nextIdx = findSpatialNeighbor(elements, keyboardFocusIndex, direction);
      if (nextIdx >= 0) {
        keyboardFocusIndex = nextIdx;
        keyboardFocusElements = elements;
        refreshKeyboardFocusVisual();
      }
    }
  }

  function activateKeyboardFocus() {
    const elements = getKeyboardFocusableElements();
    if (keyboardFocusIndex < 0 || keyboardFocusIndex >= elements.length) return;
    const el = elements[keyboardFocusIndex];
    if (el.classList.contains('remapad-keyboard-key')) {
      handleGamepadKeyboardKey(el.dataset.keyValue);
      return;
    }
    if (el === keyboardConfirmBtn) { closeGamepadKeyboard(true); return; }
    if (el === keyboardCancelBtn) { closeGamepadKeyboard(false); return; }
  }

  function findSpatialNeighbor(elements, currentIndex, direction) {
    if (currentIndex < 0 || currentIndex >= elements.length) return -1;
    const currentEl = elements[currentIndex];
    const currentRect = currentEl.getBoundingClientRect();
    const originCx = currentRect.left + currentRect.width / 2;
    const originCy = currentRect.top + currentRect.height / 2;

    let bestIdx = -1;
    let bestScore = Infinity;

    elements.forEach((el, idx) => {
      if (idx === currentIndex || el === currentEl) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;

      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - originCx;
      const dy = cy - originCy;

      let inDirection = false;
      let primaryDist = 0;
      let lateralDist = 0;

      if (direction === 'up') {
        inDirection = dy < -2;
        primaryDist = Math.abs(dy);
        lateralDist = Math.abs(dx);
      } else if (direction === 'down') {
        inDirection = dy > 2;
        primaryDist = Math.abs(dy);
        lateralDist = Math.abs(dx);
      } else if (direction === 'left') {
        inDirection = dx < -2;
        primaryDist = Math.abs(dx);
        lateralDist = Math.abs(dy);
      } else if (direction === 'right') {
        inDirection = dx > 2;
        primaryDist = Math.abs(dx);
        lateralDist = Math.abs(dy);
      }

      if (!inDirection) return;

      const alignedThreshold = direction === 'up' || direction === 'down'
        ? Math.max(currentRect.width, r.width) * 0.2
        : Math.max(currentRect.height, r.height) * 0.2;

      const overlap = direction === 'up' || direction === 'down'
        ? Math.min(currentRect.right, r.right) - Math.max(currentRect.left, r.left)
        : Math.min(currentRect.bottom, r.bottom) - Math.max(currentRect.top, r.top);

      const aligned = overlap >= alignedThreshold;
      const score = primaryDist + lateralDist * 5 + (aligned ? 0 : 1e6);

      if (score < bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    return bestIdx;
  }

  function setKeyboardLayout(layoutId) {
    if (layouts[layoutId]) {
      keyboardLayoutId = layoutId;
      if (isKeyboardOpen()) buildGamepadKeyboard();
    }
  }

  function registerLayouts(customLayouts) {
    layouts = { ...DEFAULT_KEYBOARD_LAYOUTS, ...customLayouts };
  }

  function getKeyboardLayouts() {
    return { ...layouts };
  }

  function isEditableElement(el) {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return ['text', 'password', 'email', 'search', 'url', 'tel', 'number', ''].includes(type);
    }
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
    return false;
  }

  global.RemapadKeyboard = {
    DEFAULT_KEYBOARD_LAYOUTS,
    open: openGamepadKeyboard,
    close: closeGamepadKeyboard,
    isOpen: isKeyboardOpen,
    moveFocus: moveKeyboardFocus,
    activateFocus: activateKeyboardFocus,
    getFocusableElements: getKeyboardFocusableElements,
    setLayout: setKeyboardLayout,
    registerLayouts,
    getLayouts: getKeyboardLayouts,
    isEditableElement,
    refreshFocus: refreshKeyboardFocusVisual
  };
})(typeof window !== 'undefined' ? window : globalThis);
