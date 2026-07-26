/**
 * Remapad — Controller Style Detector
 * MV3-compatible classic script; exposed via window.RemapadCS.ControllerStyle.
 * Detects the connected controller from its Gamepad API id string, preserves
 * the last recognized style, and lets an explicit icon-style setting override it.
 */

(function (global) {
  'use strict';

  function createDetector(patterns) {
    let detectedStyle = null;

    function detect(gamepadId) {
      const id = (gamepadId || '').toLowerCase();
      for (const { test, style } of patterns) {
        if (test.test(id)) return style;
      }
      return null;
    }

    function update(gamepadId) {
      // Preserve the last recognized style across disconnect/reconnect cycles.
      // Only a positive match overwrites it, so auto icon style stays stable.
      const style = detect(gamepadId);
      if (style) {
        detectedStyle = style;
      }
      return detectedStyle;
    }

    function resolve(iconStyle) {
      const stored = iconStyle || 'auto';
      if (stored !== 'auto') return stored;
      return detectedStyle || 'playstation';
    }

    function getDetected() {
      return detectedStyle;
    }

    return { detect, update, resolve, getDetected };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.ControllerStyle = { create: createDetector };
})(typeof window !== 'undefined' ? window : globalThis);
