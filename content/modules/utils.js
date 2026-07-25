/**
 * Remapad Content Script — Shared Utilities
 * MV3-compatible classic script; exposed via window.RemapadCS.Utils.
 */

(function (global) {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampIndex(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function escapeCssIdentifier(value) {
    if (global.CSS && global.CSS.escape) {
      return global.CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, char => `\\${char.codePointAt(0).toString(16)} `);
  }

  function escapeCssString(value) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ');
  }

  function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(0, 0, 0, ${alpha})`;
    const short = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
    if (short) {
      const r = Number.parseInt(short[1] + short[1], 16);
      const g = Number.parseInt(short[2] + short[2], 16);
      const b = Number.parseInt(short[3] + short[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    const full = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (full) {
      const r = Number.parseInt(full[1], 16);
      const g = Number.parseInt(full[2], 16);
      const b = Number.parseInt(full[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(0, 0, 0, ${alpha})`;
  }

  function isVisibleElement(element) {
    return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  }

  function getElementArea(element) {
    const rect = element.getBoundingClientRect();
    return rect.width * rect.height;
  }

  function safeQuerySelector(selector) {
    try {
      return document.querySelector(selector);
    } catch (e) {
      console.warn('[Remapad CS] Invalid selector:', selector);
      return null;
    }
  }

  function isRemapadElement(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('.remapad-quick-map, .remapad-hud-container, .remapad-keyboard-overlay'));
  }

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
      view: global,
      key,
      code,
      keyCode,
      which: keyCode,
      ...modifiers
    };
    target.dispatchEvent(new KeyboardEvent('keydown', opts));
    target.dispatchEvent(new KeyboardEvent('keyup', opts));
  }

  function rectCenter(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  function centerDistance(sourceRect, targetRect) {
    const sx = sourceRect.left + sourceRect.width / 2;
    const sy = sourceRect.top + sourceRect.height / 2;
    const tx = targetRect.left + targetRect.width / 2;
    const ty = targetRect.top + targetRect.height / 2;
    return Math.hypot(tx - sx, ty - sy);
  }

  function isDirectionalMove(direction, sourceRect, targetRect) {
    switch (direction) {
      case 'up':    return targetRect.bottom < sourceRect.top;
      case 'down':  return targetRect.top > sourceRect.bottom;
      case 'left':  return targetRect.right < sourceRect.left;
      case 'right': return targetRect.left > sourceRect.right;
      default:      return false;
    }
  }

  function isInBeam(direction, sourceRect, targetRect) {
    if (direction === 'up' || direction === 'down') {
      return targetRect.right > sourceRect.left && targetRect.left < sourceRect.right;
    }
    return targetRect.bottom > sourceRect.top && targetRect.top < sourceRect.bottom;
  }

  function primaryEdgeDistance(direction, sourceRect, targetRect) {
    switch (direction) {
      case 'up':    return sourceRect.top - targetRect.bottom;
      case 'down':  return targetRect.top - sourceRect.bottom;
      case 'left':  return sourceRect.left - targetRect.right;
      case 'right': return targetRect.left - sourceRect.right;
      default:      return Infinity;
    }
  }

  function orthogonalEdgeDistance(direction, sourceRect, targetRect) {
    if (direction === 'up' || direction === 'down') {
      const overlap = Math.max(0, Math.min(sourceRect.right, targetRect.right) - Math.max(sourceRect.left, targetRect.left));
      const span = Math.max(sourceRect.width, targetRect.width);
      return span - overlap;
    }
    const overlap = Math.max(0, Math.min(sourceRect.bottom, targetRect.bottom) - Math.max(sourceRect.top, targetRect.top));
    const span = Math.max(sourceRect.height, targetRect.height);
    return span - overlap;
  }

  function anchorDistance(direction, targetRect, preferredInline) {
    if (direction === 'up' || direction === 'down') {
      const targetCenter = targetRect.left + targetRect.width / 2;
      return Math.abs(targetCenter - preferredInline);
    }
    const targetCenter = targetRect.top + targetRect.height / 2;
    return Math.abs(targetCenter - preferredInline);
  }

  function createWavProbeDataUrl(muted = false) {
    const sampleRate = 22050;
    const duration = 0.35;
    const numSamples = Math.floor(sampleRate * duration);
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + numSamples * 2);
    const view = new DataView(buffer);
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    const ampMult = muted ? 0.0001 : 1.0;

    const notes = [
      { freq: 523.25, start: 0.00, decay: 18, amp: 0.25 * ampMult },
      { freq: 659.25, start: 0.07, decay: 18, amp: 0.25 * ampMult },
      { freq: 1046.50, start: 0.14, decay: 10, amp: 0.35 * ampMult }
    ];

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sampleVal = 0;
      for (let n = 0; n < notes.length; n++) {
        const note = notes[n];
        if (t >= note.start) {
          const dt = t - note.start;
          const attack = Math.min(1.0, dt / 0.005);
          const env = attack * Math.exp(-dt * note.decay);
          const rad = 2 * Math.PI * note.freq * dt;
          const wave = Math.sin(rad) + 0.25 * Math.sin(2 * rad) + 0.1 * Math.sin(3 * rad);
          sampleVal += wave * env * note.amp;
        }
      }
      sampleVal = Math.max(-1, Math.min(1, sampleVal));
      view.setInt16(offset, sampleVal * 32767, true);
      offset += 2;
    }
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return 'data:audio/wav;base64,' + global.btoa(binary);
  }

  const Utils = {
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
  };

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.Utils = Utils;
})(typeof window !== 'undefined' ? window : globalThis);
