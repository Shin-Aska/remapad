/**
 * Remapad — Modal Focus Manager
 * MV3-compatible classic script; exposed via window.RemapadCS.ModalFocusManager.
 * Tracks visible modal dialogs, ranks them by z-index/DOM order, and restores
 * focus after modal close via a generation-coupled MutationObserver.
 */

(function (global) {
  'use strict';

  function create({ utils }) {
    const { isVisibleElement, isRemapadElement } = utils;

    let modalFocusObserver = null;
    let modalFocusTimeout = null;
    let modalFocusAnimationFrame = null;
    let modalFocusGeneration = 0;
    const modalOpeners = new WeakMap();

    function getOpenModals() {
      const selector = [
        '[role="dialog"]',
        '[aria-modal="true"]',
        '[data-uia*="modal" i]',
        '[data-testid*="modal" i]',
        '[class*="modal" i]'
      ].join(', ');

      return Array.from(document.querySelectorAll(selector))
        .filter(element => !isRemapadElement(element) && isVisibleElement(element))
        .sort((first, second) => {
          // Higher z-index wins; ties are broken by later DOM position, which
          // generally corresponds to the topmost modal in document order.
          const firstZIndex = Number.parseInt(getComputedStyle(first).zIndex, 10) || 0;
          const secondZIndex = Number.parseInt(getComputedStyle(second).zIndex, 10) || 0;
          if (firstZIndex !== secondZIndex) return secondZIndex - firstZIndex;
          return first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1;
        });
    }

    function isDismissControl(element) {
      if (element.matches('button.close, button.close-button, [role="button"].close-button, button[class~="close" i], [role="button"][class~="close" i]')) {
        return true;
      }

      const hasDismissIdentifier = value => /(?:^|[-_\s])(?:close|dismiss|cancel)(?:$|[-_\s])/i.test(value || '');
      if (hasDismissIdentifier(element.getAttribute('data-uia')) || hasDismissIdentifier(element.getAttribute('data-testid'))) {
        return true;
      }

      const isDismissLabel = value => /^(?:close|dismiss|cancel)(?:\s+(?:dialog|modal|menu|panel|overlay|player|preview))?$/i.test((value || '').trim());
      return isDismissLabel(element.getAttribute('aria-label')) || isDismissLabel(element.getAttribute('title'));
    }

    function getModalFocusTarget(modal) {
      const selector = [
        '[autofocus]',
        '[data-uia*="close" i]',
        '[data-testid*="close" i]',
        '[aria-label*="close" i]',
        'button:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])'
      ].join(', ');

      return Array.from(modal.querySelectorAll(selector)).find(isVisibleElement) || null;
    }

    function stopObserver() {
      modalFocusGeneration += 1;
      modalFocusObserver?.disconnect();
      modalFocusObserver = null;
      clearTimeout(modalFocusTimeout);
      modalFocusTimeout = null;
      if (modalFocusAnimationFrame !== null) cancelAnimationFrame(modalFocusAnimationFrame);
      modalFocusAnimationFrame = null;
    }

    function closeModal(modal, callbacks) {
      const controllerFocusedElement = callbacks.getControllerFocusedElement();
      const previousFocus = modalOpeners.get(modal) || controllerFocusedElement;
      const closeControl = Array.from(modal.querySelectorAll('button, [role="button"], a[href]')).find(
        element => isVisibleElement(element) && !element.matches(':disabled') && isDismissControl(element)
      );

      if (closeControl) {
        closeControl.click();
        restoreFocusAfterModalClose(previousFocus, modal, callbacks);
        return true;
      }

      if (typeof modal.close === 'function') {
        modal.close();
        restoreFocusAfterModalClose(previousFocus, modal, callbacks);
        return true;
      }

      return false;
    }

    // Each tracking/restoration cycle gets a generation number. Stopping the
    // observer increments the generation, so any in-flight callbacks from a
    // previous cycle abort instead of acting on stale state.
    function restoreFocusAfterModalClose(previousFocus, modal, callbacks) {
      stopObserver();
      callbacks.resetNavigationState();
      const generation = modalFocusGeneration;
      const restoreFocus = () => {
        if (generation !== modalFocusGeneration) return true;
        if (modal.isConnected && isVisibleElement(modal)) return false;
        stopObserver();
        if (previousFocus?.isConnected && isVisibleElement(previousFocus)) {
          callbacks.focusElement(previousFocus);
        }
        return true;
      };

      modalFocusAnimationFrame = requestAnimationFrame(() => {
        modalFocusAnimationFrame = null;
        if (generation !== modalFocusGeneration) return;
        if (restoreFocus()) return;

        // Modal removal is often asynchronous; watch for visibility/DOM changes.
        modalFocusObserver = new MutationObserver(restoreFocus);
        modalFocusObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-hidden', 'class', 'open', 'style']
        });
        modalFocusTimeout = setTimeout(stopObserver, 1200);
      });
    }

    function beginTracking(callbacks) {
      stopObserver();
      return {
        existingModals: new Set(getOpenModals()),
        opener: callbacks.getControllerFocusedElement(),
        initialUrl: location.href,
        generation: modalFocusGeneration
      };
    }

    function focusNewModalAfterClick({ existingModals, opener, initialUrl, generation }, callbacks) {
      const focusNewModal = () => {
        if (generation !== modalFocusGeneration) return true;
        const modal = getOpenModals().find(element => !existingModals.has(element));
        if (!modal) return false;

        if (opener?.isConnected) modalOpeners.set(modal, opener);
        callbacks.resetNavigationState();
        const focusTarget = getModalFocusTarget(modal);
        if (focusTarget) callbacks.focusElement(focusTarget);
        stopObserver();
        return true;
      };

      if (focusNewModal()) return;

      modalFocusObserver = new MutationObserver(focusNewModal);
      modalFocusObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-hidden', 'class', 'open', 'style']
      });
      modalFocusTimeout = setTimeout(() => {
        if (generation !== modalFocusGeneration) return;
        if (location.href !== initialUrl) callbacks.resetNavigationState();
        stopObserver();
      }, 1200);
    }

    return {
      getOpenModals,
      closeModal,
      beginTracking,
      focusNewModalAfterClick,
      stopObserver,
      getModalFocusTarget
    };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.ModalFocusManager = { create };
})(typeof window !== 'undefined' ? window : globalThis);