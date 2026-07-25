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
