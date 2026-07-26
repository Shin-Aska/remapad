/**
 * Remapad Content Script — Shared Utilities
 * MV3-compatible classic script; exposed via window.RemapadCS.Utils.
 * General helpers plus keyboard code mapping and an in-memory WAV probe used
 * by the autoplay service.
 */

(function (global) {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampIndex(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // ─── String / CSS helpers ───────────────────────────────────────────────────

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

  // ─── DOM helpers ──────────────────────────────────────────────────────────────

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
    return Boolean(target.closest('.remapad-quick-map, .remapad-hud-container, .remapad-keyboard-overlay, .remapad-tutorial'));
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

  // ─── Keyboard compatibility ───────────────────────────────────────────────────

  // Synthetic keyboard events use both modern `code` values and legacy keyCode/
  // which for sites that still rely on deprecated properties.
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

  // ─── Spatial geometry helpers ─────────────────────────────────────────────────

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

  // ─── Autoplay probe & UI sound WAV generator ──────────────────────────────────

  const SOUND_PRESETS = Object.freeze({
    // Access Point (Default notification sound file with .ogg -> .mp3 fallback + synth backup)
    access_point: {
      description: 'Access Point Notification (Audio File: .ogg → .mp3)',
      file: 'access_point',
      duration: 0.40,
      notes: [
        { freq: 440.00, start: 0.00, decay: 15, amp: 0.25 },
        { freq: 880.00, start: 0.08, decay: 12, amp: 0.35 },
        { freq: 1320.00, start: 0.16, decay: 10, amp: 0.40, harmonics: [1.0, 0.3, 0.1] }
      ]
    },
    // Protocol (Secondary notification sound file with .ogg -> .mp3 fallback + synth backup)
    protocol: {
      description: 'Protocol Notification (Audio File: .ogg → .mp3)',
      file: 'protocol',
      duration: 0.38,
      notes: [
        { freq: 587.33, start: 0.00, decay: 16, amp: 0.25 },
        { freq: 880.00, start: 0.10, decay: 14, amp: 0.35 }
      ]
    },
    // Probe: 3-note ascending triad (C5 - E5 - C6)
    probe: {
      description: 'Ascending 3-note triad arpeggio (C5 - E5 - C6)',
      duration: 0.35,
      notes: [
        { freq: 523.25, start: 0.00, decay: 18, amp: 0.25 },
        { freq: 659.25, start: 0.07, decay: 18, amp: 0.25 },
        { freq: 1046.50, start: 0.14, decay: 10, amp: 0.35 }
      ]
    },
    // Chime: Sparkling 4-note chord (C5 - G5 - C6 - E6) with long shimmer decay
    chime: {
      description: 'Sparkling 4-note shimmer chord (C5 - G5 - C6 - E6)',
      duration: 0.45,
      notes: [
        { freq: 523.25, start: 0.00, decay: 12, amp: 0.25 },
        { freq: 783.99, start: 0.06, decay: 12, amp: 0.25 },
        { freq: 1046.50, start: 0.12, decay: 10, amp: 0.30 },
        { freq: 1318.51, start: 0.18, decay: 8, amp: 0.30, harmonics: [1.0, 0.4, 0.15] }
      ]
    },
    // Coin: Classic 8-bit retro arcade pickup sound (B5 -> E6 step pitch)
    coin: {
      description: 'Retro 2-tone arcade pickup chime (B5 → E6 step pitch)',
      duration: 0.25,
      notes: [
        { freq: 987.77, start: 0.00, decay: 35, amp: 0.30, timbre: 'square' },
        { freq: 1318.51, start: 0.07, decay: 16, amp: 0.40, timbre: 'square' }
      ]
    },
    // Success: Warm multi-note major chord victory flourish
    success: {
      description: 'Warm multi-note major chord victory flourish',
      duration: 0.50,
      notes: [
        { freq: 523.25, start: 0.00, decay: 10, amp: 0.20 },
        { freq: 659.25, start: 0.03, decay: 10, amp: 0.20 },
        { freq: 783.99, start: 0.06, decay: 10, amp: 0.25 },
        { freq: 1046.50, start: 0.09, decay: 8, amp: 0.35, harmonics: [1.0, 0.3, 0.1] }
      ]
    },
    // Click: Crisp ultra-short tactile audio click impulse
    click: {
      description: 'Tactile audio click impulse (15ms damped tone)',
      duration: 0.04,
      notes: [
        { freq: 1200, freqEnd: 400, start: 0.00, decay: 120, amp: 0.50, attack: 0.001 }
      ]
    },
    // Alert: Dual-tone harmonic warning chime (A4 + Eb5 tritone)
    alert: {
      description: 'Dual-tone harmonic warning chime (A4 + E♭5 tritone)',
      duration: 0.40,
      notes: [
        { freq: 440.00, start: 0.00, decay: 12, amp: 0.30 },
        { freq: 622.25, start: 0.00, decay: 12, amp: 0.30 },
        { freq: 440.00, start: 0.18, decay: 14, amp: 0.25 },
        { freq: 622.25, start: 0.18, decay: 14, amp: 0.25 }
      ]
    },
    // Pop: Ascending pitch-bent bubble pop
    pop: {
      description: 'Pitch-bent ascending bubble pop (300Hz → 900Hz sweep)',
      duration: 0.12,
      notes: [
        { freq: 300, freqEnd: 900, start: 0.00, decay: 45, amp: 0.45, attack: 0.002 }
      ]
    }
  });

  /**
   * Generates a tiny in-memory PCM WAV data URL for audio/video probes alongside
   * native autoplay policy queries or for UI sound feedback.
   *
   * Signatures:
   *   createWavProbeDataUrl(muted?: boolean, presetName?: string)
   *   createWavProbeDataUrl(presetName?: string)
   *   createWavProbeDataUrl(options?: { muted?: boolean, preset?: string, duration?: number, volume?: number, sampleRate?: number })
   */
  function createWavProbeDataUrl(mutedOrOptions = false, presetName = 'access_point') {
    let muted = false;
    let presetKey = 'access_point';
    let customDuration = null;
    let volumeMult = 1.0;
    let sampleRate = 22050;

    if (typeof mutedOrOptions === 'boolean') {
      muted = mutedOrOptions;
      presetKey = presetName || 'access_point';
    } else if (typeof mutedOrOptions === 'string') {
      presetKey = mutedOrOptions;
    } else if (mutedOrOptions && typeof mutedOrOptions === 'object') {
      muted = !!mutedOrOptions.muted;
      presetKey = mutedOrOptions.preset || presetName || 'access_point';
      if (typeof mutedOrOptions.duration === 'number') customDuration = mutedOrOptions.duration;
      if (typeof mutedOrOptions.volume === 'number') volumeMult = mutedOrOptions.volume;
      if (typeof mutedOrOptions.sampleRate === 'number') sampleRate = mutedOrOptions.sampleRate;
    }

    let preset = SOUND_PRESETS[presetKey] || SOUND_PRESETS.access_point || SOUND_PRESETS.probe;
    if (!preset.notes) {
      preset = SOUND_PRESETS.probe;
    }
    const duration = customDuration || preset.duration || 0.35;
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

    const ampMult = (muted ? 0.0001 : 1.0) * volumeMult;
    const notes = preset.notes || SOUND_PRESETS.probe.notes;

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sampleVal = 0;
      for (let n = 0; n < notes.length; n++) {
        const note = notes[n];
        if (t >= note.start) {
          const dt = t - note.start;
          const noteDur = note.duration || (duration - note.start);
          if (dt <= noteDur) {
            const attackTime = note.attack || 0.005;
            const attack = Math.min(1.0, dt / attackTime);
            const env = attack * Math.exp(-dt * (note.decay || 18));

            let freq = note.freq;
            if (typeof note.freqEnd === 'number') {
              const progress = Math.min(1.0, dt / (note.duration || 0.1));
              freq = note.freq + (note.freqEnd - note.freq) * progress;
            }

            const rad = 2 * Math.PI * freq * dt;
            let wave = 0;

            if (note.timbre === 'square') {
              wave = Math.sin(rad) + (1 / 3) * Math.sin(3 * rad) + (1 / 5) * Math.sin(5 * rad);
            } else {
              const harmonics = note.harmonics || [1.0, 0.25, 0.1];
              for (let h = 0; h < harmonics.length; h++) {
                wave += harmonics[h] * Math.sin((h + 1) * rad);
              }
            }

            sampleVal += wave * env * (note.amp || 0.25) * ampMult;
          }
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

    const btoaFn = (typeof globalThis !== 'undefined' && globalThis.btoa) ? globalThis.btoa.bind(globalThis) : global.btoa;
    return 'data:audio/wav;base64,' + btoaFn(binary);
  }

  /**
   * Resolves audio URL sources for a notification preset.
   * For file-based presets ('access_point', 'protocol'), returns an array of URLs
   * starting with .ogg first, then falling back to .mp3, then synthesized WAV.
   */
  async function getNotificationAudioSources(presetName = 'access_point', muted = false) {
    const key = presetName || 'access_point';
    const preset = SOUND_PRESETS[key] || SOUND_PRESETS.access_point || SOUND_PRESETS.probe;

    if (preset && preset.file) {
      const runtime = typeof chrome !== 'undefined' && chrome.runtime
        ? chrome.runtime
        : typeof browser !== 'undefined' && browser.runtime
          ? browser.runtime
          : null;
      let embeddedSources = [];
      if (runtime?.sendMessage) {
        try {
          const response = await runtime.sendMessage({
            type: 'GET_NOTIFICATION_SOURCES',
            preset: preset.file
          });
          if (Array.isArray(response?.sources)) {
            embeddedSources = response.sources.filter(source => (
              typeof source === 'string' && source.startsWith('data:audio/')
            ));
          }
        } catch (_) {}
      }
      return [
        ...embeddedSources,
        createWavProbeDataUrl(muted, key)
      ];
    }

    return [createWavProbeDataUrl(muted, key)];
  }

  /**
   * Plays a notification sound preset trying .ogg first, then .mp3, then synthesized WAV.
   */
  async function playNotificationSound(presetName = 'access_point', options = {}) {
    const sources = await getNotificationAudioSources(presetName, options.muted);
    const audio = new Audio();
    audio.volume = typeof options.volume === 'number' ? options.volume : 0.5;

    let currentIndex = 0;
    return new Promise((resolve, reject) => {
      function tryNext() {
        if (currentIndex >= sources.length) {
          return reject(new Error('All audio sources failed to play'));
        }
        const src = sources[currentIndex++];
        audio.src = src;
        audio.play().then(resolve).catch(err => {
          console.warn(`[Remapad] Audio source failed (${src}), trying fallback...`, err);
          tryNext();
        });
      }
      tryNext();
    });
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
    createWavProbeDataUrl,
    getNotificationAudioSources,
    playNotificationSound,
    SOUND_PRESETS
  };

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.Utils = Utils;
})(typeof window !== 'undefined' ? window : globalThis);
