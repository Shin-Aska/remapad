/**
 * Remapad — Bottom HUD / Navigation Guide Controller
 * MV3-compatible classic script; exposed via window.RemapadCS.HudController.
 * Renders the controller mapping overlay, owns highlight navigation, and
 * dispatches Edit from either a trusted DOM click or controller-highlight
 * activation. Input is consumed only while visible.
 */

(function (global) {
  'use strict';

  function create({ utils, constants, overlayStyles, callbacks }) {
    const { escapeHtml } = utils;
    const { GLYPHS, ACTION_LABELS, DEADZONE } = constants;
    // Item ordering: 16 controller buttons followed by left/right stick labels
    // and the Edit control. This order drives D-pad left/right highlight motion.
    const hudItems = [
      '0', '1', '2', '3', '4', '5', '6', '7',
      '8', '9', '10', '11', '12', '13', '14', '15',
      'ls', 'rs', 'edit'
    ];
    const standardButtons = hudItems.slice(0, 16);
    let hudElement = null;
    let hudTimeout = null;
    let hudVisible = false;
    let hudHighlightedIndex = -1;
    let hudPermanentlyHidden = false;

    function injectStyles() {
      overlayStyles.inject();
    }

    function update() {
      if (hudPermanentlyHidden) return;

      injectStyles();

      if (!hudElement) {
        hudElement = document.createElement('div');
        hudElement.className = 'remapad-hud-container';
        hudElement.setAttribute('role', 'navigation');
        hudElement.setAttribute('aria-label', 'Remapad controller mappings');
        document.body.appendChild(hudElement);
      }

      const currentGlyphs = GLYPHS[callbacks.getIconStyle()] || GLYPHS.playstation;
      const activeProfile = callbacks.getActiveProfile();
      const items = standardButtons.map((btnIdx, arrayIndex) => {
        const action = activeProfile[btnIdx];
        const glyph = escapeHtml(currentGlyphs[btnIdx] || btnIdx);
        const label = escapeHtml(formatActionLabel(action, btnIdx));
        const unmapped = !action || action === 'none';
        const isHighlighted = arrayIndex === hudHighlightedIndex;
        return `
          <div class="remapad-hud-item${unmapped ? ' remapad-hud-item--unmapped' : ''}${isHighlighted ? ' highlighted' : ''}" data-hud-selectable>
            <span class="remapad-hud-glyph">${glyph}</span>
            <span class="remapad-hud-label">${label}</span>
          </div>
        `;
      }).join('');

      const lsHighlighted = hudHighlightedIndex === 16;
      const rsHighlighted = hudHighlightedIndex === 17;
      const editHighlighted = hudHighlightedIndex === 18;
      const stickItems = `
        <div class="remapad-hud-sticks" aria-label="Stick controls">
        <div class="remapad-hud-stick${lsHighlighted ? ' highlighted' : ''}" data-hud-selectable>
          <span class="remapad-hud-glyph">LS</span>
          <span class="remapad-hud-label">Scroll</span>
        </div>
        <div class="remapad-hud-stick${rsHighlighted ? ' highlighted' : ''}" data-hud-selectable>
          <span class="remapad-hud-glyph">RS↑↓</span>
          <span class="remapad-hud-label">Focus</span>
        </div>
        </div>
      `;
      let innerHtml = `<div class="remapad-hud-row">${items}${stickItems}</div>`;
      innerHtml += `<button class="remapad-hud-edit${editHighlighted ? ' highlighted' : ''}" id="remapad-hud-edit-btn" type="button" data-hud-selectable>Edit</button>`;
      innerHtml += '<button class="remapad-hud-close" id="remapad-hud-close-btn" type="button" title="Hide this guide" aria-label="Hide controller guide">✕</button>';
      hudElement.innerHTML = innerHtml;

      hudElement.querySelector('#remapad-hud-close-btn')?.addEventListener('click', event => {
        event.stopPropagation();
        hudPermanentlyHidden = true;
        hide();
      });

      // The DOM Edit handler requires a trusted click; controller-highlight
      // activation invokes the same callback directly without a DOM event.
      hudElement.querySelector('#remapad-hud-edit-btn')?.addEventListener('click', event => {
        if (!event.isTrusted) return;
        callbacks.openSiteMapping();
      });
    }

    function updateHighlight() {
      if (!hudElement) return;
      const items = hudElement.querySelectorAll('[data-hud-selectable]');
      items.forEach((item, idx) => {
        if (idx === hudHighlightedIndex) {
          item.classList.add('highlighted');
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        } else {
          item.classList.remove('highlighted');
        }
      });
    }

    function toggle() {
      if (!hudElement) return;
      clearTimeout(hudTimeout);

      if (hudVisible) {
        hide();
        return;
      }

      hudHighlightedIndex = -1;
      hudPermanentlyHidden = false;
      hudElement.classList.add('visible');
      hudVisible = true;
    }

    function hide() {
      if (hudElement && hudVisible) {
        hudHighlightedIndex = -1;
        updateHighlight();
        hudElement.classList.remove('visible');
        hudVisible = false;
      }
    }

    function remove() {
      hudHighlightedIndex = -1;
      if (hudElement) {
        hudElement.remove();
        hudElement = null;
      }
      clearTimeout(hudTimeout);
    }

    // While visible, D-pad navigates the highlight, button 0 activates, and
    // button 1 closes. All consumed input returns true so the caller skips the
    // active profile action for these buttons.
    function handleButtonPress(btnIdx) {
      if (!hudVisible) return false;

      if (hudHighlightedIndex === -1 && (btnIdx === 12 || btnIdx === 13 || btnIdx === 14 || btnIdx === 15)) {
        hudHighlightedIndex = 0;
        updateHighlight();
        return true;
      }

      if (hudHighlightedIndex < 0) return false;

      if (btnIdx === 0) {
        const target = hudItems[hudHighlightedIndex];
        if (target === 'edit') {
          callbacks.openSiteMapping();
          hide();
        } else if (target !== 'ls' && target !== 'rs') {
          const action = callbacks.getActiveProfile()[target];
          if (action && action !== 'none') {
            callbacks.executeAction(action);
            hide();
          }
        }
        return true;
      }
      if (btnIdx === 1) {
        hudHighlightedIndex = -1;
        updateHighlight();
        hide();
        return true;
      }
      if (btnIdx === 14) {
        hudHighlightedIndex = (hudHighlightedIndex - 1 + hudItems.length) % hudItems.length;
        updateHighlight();
        return true;
      }
      if (btnIdx === 15) {
        hudHighlightedIndex = (hudHighlightedIndex + 1) % hudItems.length;
        updateHighlight();
        return true;
      }
      return btnIdx === 12 || btnIdx === 13;
    }

    function handleStickMove(x) {
      if (!hudVisible) return false;
      if (Math.abs(x) > DEADZONE) {
        if (hudHighlightedIndex === -1) {
          hudHighlightedIndex = 0;
        } else {
          const direction = x > 0 ? 1 : -1;
          hudHighlightedIndex = (hudHighlightedIndex + direction + hudItems.length) % hudItems.length;
        }
        updateHighlight();
      }
      return true;
    }

    function isVisible() {
      return hudVisible;
    }

    function getHighlightedIndex() {
      return hudHighlightedIndex;
    }

    function formatActionLabel(action, btnIdx = null) {
      if (!action || action === 'none') return 'Unmapped';
      if (action.startsWith('click_element:')) return 'Click element';
      if (action.startsWith('hover_element:')) return 'Hover element';
      if (action.startsWith('dom_action:')) return formatDomActionLabel(action.substring('dom_action:'.length));
      if (action.startsWith('press_key:')) return `Key: ${action.substring('press_key:'.length)}`;
      if (action.startsWith('focus_element:')) return 'Focus element';
      return ACTION_LABELS[action] || action;
    }

    function formatDomActionLabel(encodedConfig) {
      try {
        const config = JSON.parse(decodeURIComponent(encodedConfig));
        const labels = {
          click: 'Click element',
          focus: 'Focus element',
          scroll: 'Scroll to element',
          'set-value': 'Set form value',
          'toggle-attribute': 'Toggle attribute',
          'toggle-media': 'Play/Pause media'
        };
        return labels[config.operation] || ACTION_LABELS.dom_action;
      } catch (_) {
        return ACTION_LABELS.dom_action;
      }
    }

    return {
      injectStyles,
      update,
      toggle,
      hide,
      remove,
      isVisible,
      getHighlightedIndex,
      handleButtonPress,
      handleStickMove
    };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.HudController = { create };
})(typeof window !== 'undefined' ? window : globalThis);
