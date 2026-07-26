/**
 * Remapad — MAIN-world Gamepad Blocker
 * Injected at document_start so it can wrap navigator.getGamepads and the
 * window gamepad event listeners before page scripts register their own.
 * Cross-world visibility is toggled by the isolated content script via the
 * `data-remapad-active` attribute on `document.documentElement`.
 */

(() => {
  'use strict';

  const nativeGetGamepads = navigator.getGamepads || null;
  const nativeAddEventListener = window.addEventListener;
  const nativeRemoveEventListener = window.removeEventListener;
  const wrappedGamepadListeners = new WeakMap();
  let active = true;

  // WeakMap keys are the original listener functions/objects so callers can
  // remove them later with the same reference. The inner Map keys are
  // `${eventType}:${capture}` because the same listener can be registered with
  // different capture values.
  function getWrappedGamepadListener(type, listener, options, create) {
    if (!listener || (typeof listener !== 'function' && typeof listener.handleEvent !== 'function')) {
      return listener;
    }

    const capture = typeof options === 'boolean' ? options : Boolean(options && options.capture);
    const key = `${type}:${capture}`;
    let listeners = wrappedGamepadListeners.get(listener);
    if (!listeners && create) {
      listeners = new Map();
      wrappedGamepadListeners.set(listener, listeners);
    }
    if (!listeners || !listeners.has(key)) {
      if (!create) return null;
      listeners.set(key, function wrappedGamepadListener(event) {
        if (active && document.documentElement.getAttribute('data-remapad-active') === 'true') {
          event.stopImmediatePropagation();
          return;
        }
        return typeof listener === 'function'
          ? listener.call(this, event)
          : listener.handleEvent.call(listener, event);
      });
    }

    return listeners.get(key);
  }

  function remapadGetGamepads() {
    if (active && document.documentElement.getAttribute('data-remapad-active') === 'true') {
      return [null, null, null, null];
    }
    return nativeGetGamepads.call(navigator);
  }

  function remapadAddEventListener(type, listener, options) {
    if (type === 'gamepadconnected' || type === 'gamepaddisconnected') {
      return nativeAddEventListener.call(window, type, getWrappedGamepadListener(type, listener, options, true), options);
    }
    return nativeAddEventListener.call(window, type, listener, options);
  }

  function remapadRemoveEventListener(type, listener, options) {
    if (type === 'gamepadconnected' || type === 'gamepaddisconnected') {
      return nativeRemoveEventListener.call(window, type, getWrappedGamepadListener(type, listener, options, false) || listener, options);
    }
    return nativeRemoveEventListener.call(window, type, listener, options);
  }

  function activate() {
    active = true;
    if (nativeGetGamepads) navigator.getGamepads = remapadGetGamepads;
    window.addEventListener = remapadAddEventListener;
    window.removeEventListener = remapadRemoveEventListener;
  }

  function deactivate() {
    active = false;
    document.documentElement.removeAttribute('data-remapad-active');
    if (nativeGetGamepads && navigator.getGamepads === remapadGetGamepads) {
      navigator.getGamepads = nativeGetGamepads;
    }
    if (window.addEventListener === remapadAddEventListener) {
      window.addEventListener = nativeAddEventListener;
    }
    if (window.removeEventListener === remapadRemoveEventListener) {
      window.removeEventListener = nativeRemoveEventListener;
    }
  }

  activate();
  nativeAddEventListener.call(document, 'remapad:activate', activate);
  nativeAddEventListener.call(document, 'remapad:deactivate', deactivate);
})();
