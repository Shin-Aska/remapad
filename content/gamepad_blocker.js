(() => {
  'use strict';

  const nativeGetGamepads = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : null;
  const nativeAddEventListener = window.addEventListener;
  const nativeRemoveEventListener = window.removeEventListener;
  const wrappedGamepadListeners = new WeakMap();

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
        if (document.documentElement.getAttribute('data-remapad-active') === 'true') {
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

  if (nativeGetGamepads) {
    navigator.getGamepads = function getGamepads() {
      if (document.documentElement.getAttribute('data-remapad-active') === 'true') {
        return [null, null, null, null];
      }
      return nativeGetGamepads();
    };
  }

  window.addEventListener = function addEventListener(type, listener, options) {
    if (type === 'gamepadconnected' || type === 'gamepaddisconnected') {
      return nativeAddEventListener.call(window, type, getWrappedGamepadListener(type, listener, options, true), options);
    }
    return nativeAddEventListener.call(window, type, listener, options);
  };

  window.removeEventListener = function removeEventListener(type, listener, options) {
    if (type === 'gamepadconnected' || type === 'gamepaddisconnected') {
      return nativeRemoveEventListener.call(window, type, getWrappedGamepadListener(type, listener, options, false) || listener, options);
    }
    return nativeRemoveEventListener.call(window, type, listener, options);
  };
})();
