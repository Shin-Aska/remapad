/**
 * Remapad Options — Mapping Configuration Modal
 * MV3-compatible classic script; exposed via window.RemapadOptions.ConfigModal.
 */

(function (global) {
  'use strict';

  function create({ constants, dom }) {
    const { DOM_ACTION_LABELS, TOGGLEABLE_DOM_ATTRIBUTES } = constants;
    let modalResolveFn = null;
    let currentRecordedKey = '';

    function handleKeyDown(event) {
      event.preventDefault();
      event.stopPropagation();
      const parts = [];
      if (event.ctrlKey && event.key !== 'Control') parts.push('Ctrl');
      if (event.altKey && event.key !== 'Alt') parts.push('Alt');
      if (event.shiftKey && event.key !== 'Shift') parts.push('Shift');
      if (event.metaKey && event.key !== 'Meta') parts.push('Meta');
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
        parts.push(event.key === ' ' ? 'Space' : event.key === '+' ? 'Plus' : event.key);
      }
      const keyString = parts.join('+');
      if (keyString) {
        currentRecordedKey = keyString;
        dom.detectedKeyDisplay.textContent = keyString;
        dom.keyboardCaptureBox.classList.add('active');
      }
    }

    function isToggleableDomAttribute(attribute) {
      return TOGGLEABLE_DOM_ATTRIBUTES.has(attribute) || attribute.startsWith('aria-') || attribute.startsWith('data-');
    }

    function isValidDomActionConfig(config) {
      if (!config || !DOM_ACTION_LABELS[config.operation]) return false;
      if (typeof config.selector !== 'string' || !config.selector || config.selector.length > 2000) return false;
      if (config.operation === 'set-value') return typeof config.value === 'string' && config.value.length <= 2000;
      if (config.operation === 'toggle-attribute') return typeof config.value === 'string' && isToggleableDomAttribute(config.value);
      return true;
    }

    function parseDomAction(action) {
      if (!action.startsWith('dom_action:')) return null;
      try {
        const config = JSON.parse(decodeURIComponent(action.substring('dom_action:'.length)));
        return isValidDomActionConfig(config) ? config : null;
      } catch (error) {
        return null;
      }
    }

    function getDomActionConfig() {
      const operation = dom.domOperationSelect.value;
      const selector = dom.customSelectorInput.value.trim();
      const value = dom.domValueInput.value;
      const config = { operation, selector };
      if (operation === 'set-value' || operation === 'toggle-attribute') config.value = value;
      return isValidDomActionConfig(config) ? config : null;
    }

    function updateDomValueField() {
      const isSetValue = dom.domOperationSelect.value === 'set-value';
      const isToggleAttribute = dom.domOperationSelect.value === 'toggle-attribute';
      dom.domValueGroup.style.display = isSetValue || isToggleAttribute ? 'block' : 'none';
      dom.domValueLabel.textContent = isSetValue ? 'Value to set' : 'Attribute name';
      dom.domValueInput.placeholder = isSetValue ? 'e.g. Stranger Things' : 'e.g. aria-expanded or hidden';
    }

    function open(mode, currentVal = '') {
      return new Promise(resolve => {
        modalResolveFn = resolve;
        dom.configModal.style.display = 'flex';
        dom.keyboardCaptureBox.classList.remove('active');
        if (mode === 'keyboard') {
          dom.modalTitle.textContent = 'Configure Keyboard Key';
          dom.modalKeyboardSec.style.display = 'block';
          dom.modalSelectorSec.style.display = 'none';
          dom.modalDomActionSec.style.display = 'none';
          currentRecordedKey = currentVal || '';
          dom.detectedKeyDisplay.textContent = currentRecordedKey || 'Press any key...';
          global.addEventListener('keydown', handleKeyDown, true);
        } else {
          const isDomAction = mode === 'dom';
          dom.modalTitle.textContent = isDomAction
            ? 'Configure Direct DOM Action'
            : mode === 'click' ? 'Configure Click Element' : mode === 'hover' ? 'Configure Hover Element' : 'Configure Focus Element';
          dom.modalKeyboardSec.style.display = 'none';
          dom.modalSelectorSec.style.display = 'block';
          dom.modalDomActionSec.style.display = isDomAction ? 'block' : 'none';
          const config = isDomAction && currentVal ? currentVal : null;
          dom.customSelectorInput.value = config?.selector || currentVal || '';
          dom.commonSelectorsSelect.value = '';
          if (isDomAction) {
            dom.domOperationSelect.value = DOM_ACTION_LABELS[config?.operation] ? config.operation : 'click';
            dom.domValueInput.value = config?.value || '';
            updateDomValueField();
          }
        }
      });
    }

    function close(isConfirmed = false) {
      global.removeEventListener('keydown', handleKeyDown, true);
      dom.configModal.style.display = 'none';
      if (!modalResolveFn) return;
      if (isConfirmed) {
        if (dom.modalKeyboardSec.style.display === 'block') modalResolveFn(currentRecordedKey || null);
        else if (dom.modalDomActionSec.style.display === 'block') modalResolveFn(getDomActionConfig());
        else modalResolveFn(dom.customSelectorInput.value.trim() || null);
      } else {
        modalResolveFn(null);
      }
      modalResolveFn = null;
    }

    function formatDomActionLabel(action) {
      const config = parseDomAction(action);
      return config ? `${DOM_ACTION_LABELS[config.operation]}: ${config.selector}` : 'Direct DOM Action';
    }

    function bind() {
      dom.commonSelectorsSelect.addEventListener('change', () => {
        if (dom.commonSelectorsSelect.value) dom.customSelectorInput.value = dom.commonSelectorsSelect.value;
      });
      dom.domOperationSelect.addEventListener('change', updateDomValueField);
      dom.modalCloseX.addEventListener('click', () => close(false));
      dom.modalCancelBtn.addEventListener('click', () => close(false));
      dom.modalConfirmBtn.addEventListener('click', () => close(true));
    }

    return { open, close, bind, parseDomAction, formatDomActionLabel, isOpen: () => dom.configModal.style.display !== 'none' };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.ConfigModal = { create };
})(typeof window !== 'undefined' ? window : globalThis);
