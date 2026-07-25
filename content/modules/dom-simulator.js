(function (global) {
  'use strict';

  function create({ utils, constants, messagingClient }) {
    const {
      dispatchKeyEvent,
      isVisibleElement,
      getElementArea,
      isRemapadElement
    } = utils;

    const {
      FULLSCREEN_CONTROL_SELECTOR,
      DOM_ACTION_OPERATIONS,
      MAX_DOM_ACTION_PAYLOAD_LENGTH,
      TOGGLEABLE_DOM_ATTRIBUTES
    } = constants;

    function dispatchHoverEvents(el, enter) {
      if (!el) return;
      const eventType = enter ? 'mouseover' : 'mouseout';
      const leaveType = enter ? 'mouseenter' : 'mouseleave';
      const opts = { bubbles: true, cancelable: true, view: global };
      el.dispatchEvent(new MouseEvent(eventType, opts));
      el.dispatchEvent(new MouseEvent(leaveType, opts));
    }

    function ensureWindowFocus() {
      try {
        if (typeof global.focus === 'function') global.focus();
      } catch (e) {}
    }

    function simulateClickAt(el, x, y) {
      const opts = {
        bubbles: true,
        cancelable: true,
        view: global,
        clientX: x,
        clientY: y,
        screenX: x + global.screenX,
        screenY: y + global.screenY,
        pointerType: 'mouse',
        button: 0,
        buttons: 1,
        isPrimary: true,
        composed: true
      };

      if (typeof PointerEvent !== 'undefined') {
        const pointerOpts = { ...opts, pointerId: 1, width: 1, height: 1, pressure: 0.5 };
        el.dispatchEvent(new PointerEvent('pointerover', pointerOpts));
        el.dispatchEvent(new PointerEvent('pointerenter', pointerOpts));
        el.dispatchEvent(new PointerEvent('pointermove', pointerOpts));
        el.dispatchEvent(new PointerEvent('pointerdown', { ...pointerOpts, buttons: 1 }));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', { ...pointerOpts, buttons: 0 }));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click();
        el.dispatchEvent(new PointerEvent('pointerout', pointerOpts));
        el.dispatchEvent(new PointerEvent('pointerleave', pointerOpts));
      } else {
        el.dispatchEvent(new MouseEvent('mouseover', opts));
        el.dispatchEvent(new MouseEvent('mouseenter', opts));
        el.dispatchEvent(new MouseEvent('mousemove', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click();
        el.dispatchEvent(new MouseEvent('mouseout', opts));
        el.dispatchEvent(new MouseEvent('mouseleave', opts));
      }
    }

    function findVideoUnderPoint(x, y, cursorElements = []) {
      let el = document.elementFromPoint(x, y);
      if (cursorElements.includes(el)) el = null;
      if (el instanceof HTMLVideoElement) return el;
      for (let i = 0; el && i < 8; i++) {
        const videos = el.querySelectorAll?.('video');
        if (videos?.length === 1) return videos[0];
        el = el.parentElement;
      }
      const allVideos = Array.from(document.querySelectorAll('video'));
      return allVideos.find(v => {
        const rect = v.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      }) || allVideos[0] || null;
    }

    function toggleVideoPlay(video) {
      if (!video) return;
      if (video.paused || video.ended) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }

    function getFullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function getPrimaryVideo() {
      return Array.from(document.querySelectorAll('video'))
        .filter(isVisibleElement)
        .sort((first, second) => getElementArea(second) - getElementArea(first))[0] || null;
    }

    function getFullscreenTarget(video) {
      if (!video) return null;
      return video.closest([
        '[data-uia*="player" i]',
        '[data-testid*="player" i]',
        '.html5-video-player',
        '[class*="player" i]',
        '[id*="player" i]'
      ].join(', ')) || video;
    }

    function getFullscreenControl() {
      return Array.from(document.querySelectorAll(FULLSCREEN_CONTROL_SELECTOR))
        .find(element => isVisibleElement(element) && !element.matches(':disabled')) || null;
    }

    function requestElementFullscreen(element) {
      const requestFullscreen = element.requestFullscreen || element.webkitRequestFullscreen;
      if (!requestFullscreen) return Promise.reject(new Error('Fullscreen API is unavailable for this element.'));
      return Promise.resolve(requestFullscreen.call(element));
    }

    function exitDocumentFullscreen() {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      if (!exitFullscreen) return Promise.reject(new Error('Fullscreen API is unavailable for this document.'));
      return Promise.resolve(exitFullscreen.call(document));
    }

    async function toggleFullscreen() {
      const isFS = !!getFullscreenElement();

      const allControls = Array.from(document.querySelectorAll(FULLSCREEN_CONTROL_SELECTOR));
      const control = allControls.find(el => isVisibleElement(el)) || allControls[0];
      if (control) {
        try {
          control.click();
          control.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: global }));
        } catch (_) {}
      }

      const video = getPrimaryVideo();
      const playerTarget = video ? getFullscreenTarget(video) : null;
      const keyTargets = [
        document.activeElement,
        video,
        playerTarget,
        document.body,
        document,
        global
      ].filter(Boolean);

      for (const target of keyTargets) {
        dispatchKeyEvent(target, 'f', 'KeyF');
        dispatchKeyEvent(target, 'F', 'KeyF');
      }

      messagingClient.browserAction('toggle_window_fullscreen');

      if (isFS) {
        try {
          await exitDocumentFullscreen();
        } catch (error) {
          console.warn('[Remapad CS] Exit fullscreen fallback:', error);
        }
      } else {
        const targetElement = playerTarget || video;
        if (targetElement) {
          try {
            await requestElementFullscreen(targetElement);
          } catch (error) {
            console.warn('[Remapad CS] Direct requestFullscreen fallback:', error);
          }
        }
      }
    }

    function isValidDomActionConfig(config) {
      if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
      if (!DOM_ACTION_OPERATIONS.has(config.operation)) return false;
      if (typeof config.selector !== 'string' || !config.selector.trim() || config.selector.length > 2000) return false;

      if (config.operation === 'set-value') {
        return typeof config.value === 'string' && config.value.length <= 2000;
      }

      if (config.operation === 'toggle-attribute') {
        return typeof config.value === 'string' && isToggleableDomAttribute(config.value);
      }

      return true;
    }

    function isToggleableDomAttribute(attribute) {
      return TOGGLEABLE_DOM_ATTRIBUTES.has(attribute) || attribute.startsWith('aria-') || attribute.startsWith('data-');
    }

    function setElementValue(element, value) {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        const prototype = Object.getPrototypeOf(element);
        const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (valueSetter) valueSetter.call(element, value);
        else element.value = value;
      } else if (element.isContentEditable) {
        element.textContent = value;
      } else {
        console.warn('[Remapad CS] DOM set-value target must be a form control or contenteditable element:', element);
        return;
      }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function toggleMediaElement(element) {
      if (typeof element.play !== 'function' || typeof element.pause !== 'function') {
        console.warn('[Remapad CS] DOM toggle-media target must be an audio or video element:', element);
        return;
      }

      if (element.paused) {
        try {
          const playResult = element.play();
          if (playResult && typeof playResult.catch === 'function') {
            playResult.catch(error => {
              console.warn('[Remapad CS] Unable to play media element:', error);
            });
          }
        } catch (error) {
          console.warn('[Remapad CS] Unable to play media element:', error);
        }
      } else {
        element.pause();
      }
    }

    function executeDomAction(encodedConfig, callbacks = {}) {
      if (encodedConfig.length > MAX_DOM_ACTION_PAYLOAD_LENGTH) {
        console.warn('[Remapad CS] DOM action configuration is too large.');
        return;
      }

      let config;
      try {
        config = JSON.parse(decodeURIComponent(encodedConfig));
      } catch (error) {
        console.warn('[Remapad CS] Invalid DOM action configuration:', error);
        return;
      }

      if (!isValidDomActionConfig(config)) {
        console.warn('[Remapad CS] Unsupported DOM action configuration:', config);
        return;
      }

      const element = utils.safeQuerySelector(config.selector);
      if (!element) {
        console.warn('[Remapad CS] Selector not found for DOM action:', config.selector);
        return;
      }

      switch (config.operation) {
        case 'click':
          if (callbacks.beginModalFocusTracking && callbacks.focusNewModalAfterClick) {
            const modalFocusState = callbacks.beginModalFocusTracking();
            element.click();
            callbacks.focusNewModalAfterClick(modalFocusState);
          } else {
            element.click();
          }
          break;
        case 'focus':
          if (callbacks.focusElement) callbacks.focusElement(element);
          break;
        case 'scroll':
          element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          break;
        case 'set-value':
          setElementValue(element, config.value);
          break;
        case 'toggle-attribute':
          element.toggleAttribute(config.value);
          break;
        case 'toggle-media':
          toggleMediaElement(element);
          break;
      }
    }

    function getScrollableElement() {
      let el = document.activeElement;
      while (el && el !== document.body) {
        const style = getComputedStyle(el);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
          return el;
        }
        el = el.parentElement;
      }
      return window;
    }

    function getFocusableElements() {
      const selector = [
        'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]', 'video[controls]', 'audio[controls]'
      ].join(',');

      return Array.from(document.querySelectorAll(selector)).filter(el =>
        !el.closest('.remapad-hud-container') &&
        !el.matches(':disabled') &&
        !el.closest('[inert]') &&
        el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
      );
    }

    return {
      dispatchHoverEvents,
      ensureWindowFocus,
      simulateClickAt,
      findVideoUnderPoint,
      toggleVideoPlay,
      getFullscreenElement,
      getPrimaryVideo,
      getFullscreenTarget,
      getFullscreenControl,
      requestElementFullscreen,
      exitDocumentFullscreen,
      toggleFullscreen,
      isValidDomActionConfig,
      isToggleableDomAttribute,
      setElementValue,
      toggleMediaElement,
      executeDomAction,
      getScrollableElement,
      getFocusableElements
    };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.DomSimulator = { create };
})(typeof window !== 'undefined' ? window : globalThis);