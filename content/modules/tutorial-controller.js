/**
 * Remapad — Injected Site Tutorial
 * A small, mapping-scoped onboarding dialog. It is shown once per hostname and
 * consumes controller input while open so tutorial navigation cannot also act
 * on the underlying site.
 */

(function (global) {
  'use strict';

  // Bump when onboarding content changes so existing users see the revised
  // guidance once without resetting completion for unrelated sites.
  const TUTORIAL_VERSION = 2;
  const STORAGE_KEY = 'siteTutorialVersions';

  function create({ api, hostname, constants, overlayStyles, callbacks }) {
    const { GLYPHS, ACTION_LABELS } = constants;
    let tutorialElement = null;
    let activeStep = 0;
    let restoreFocusElement = null;
    let showCheckPromise = null;

    function isVisible() {
      return Boolean(tutorialElement);
    }

    function getGlyph(button) {
      const glyphs = GLYPHS[callbacks.getIconStyle()] || GLYPHS.playstation;
      return glyphs[String(button)] || String(button);
    }

    function escapeHtml(value) {
      const element = document.createElement('span');
      element.textContent = String(value);
      return element.innerHTML;
    }

    function findMappedButton(action) {
      const profile = callbacks.getActiveProfile();
      return Object.keys(profile).find(button => profile[button] === action);
    }

    function formatActionLabel(action) {
      if (!action || action === 'none') return 'Unmapped';
      if (action.startsWith('click_element:')) return 'Select page control';
      if (action.startsWith('hover_element:')) return 'Hover page control';
      if (action.startsWith('focus_element:')) return 'Focus page control';
      if (action.startsWith('press_key:')) return `Key: ${action.substring('press_key:'.length)}`;
      if (action.startsWith('dom_action:')) return 'Custom page action';
      return ACTION_LABELS[action] || action.replaceAll('_', ' ');
    }

    function getStickMode(stickName) {
      const config = callbacks.getSettings().navSettings?.[stickName];
      if (!config?.enabled || config.mode === 'disabled') return 'disabled';
      const labels = {
        cursor: 'virtual cursor',
        navigate: 'page navigation',
        scroll: 'scrolling'
      };
      return labels[config.mode] || config.mode;
    }

    function renderFaceMappings() {
      const profile = callbacks.getActiveProfile();
      return ['0', '1', '2', '3'].map(button => `
        <div class="remapad-tutorial-mapping">
          <kbd>${escapeHtml(getGlyph(button))}</kbd>
          <span>${escapeHtml(formatActionLabel(profile[button]))}</span>
        </div>
      `).join('');
    }

    function getControllerName() {
      const names = {
        xbox: 'Xbox',
        playstation: 'PlayStation',
        nintendo: 'Nintendo'
      };
      return names[callbacks.getIconStyle()] || 'your';
    }

    function buildSteps() {
      const guideButton = findMappedButton('toggle_hud');
      const guideGlyph = getGlyph(guideButton ?? 9);
      const leftMode = getStickMode('leftStick');
      const rightMode = getStickMode('rightStick');
      const controllerName = getControllerName();

      return [
        {
          eyebrow: 'How navigation works',
          title: 'Two thumbsticks, two simple jobs',
          body: `By default, the left thumbstick scrolls and the right thumbstick moves a virtual cursor. On this site they are currently set to ${leftMode} and ${rightMode}. You can adjust their mode, cursor speed, and deadzone in Remapad’s navigation settings.`,
          visual: `
            <div class="remapad-tutorial-sticks" aria-label="Thumbstick controls">
              <span><i>LS</i><strong>Scroll</strong></span>
              <span><i>RS</i><strong>Virtual cursor</strong></span>
            </div>`
        },
        {
          eyebrow: 'Current site mapping',
          title: `Select what you want on ${escapeHtml(hostname)}`,
          body: `These are the four face-button actions in this site’s active mapping. The labels below use the detected ${controllerName} layout.`,
          visual: `<div class="remapad-tutorial-mappings">${renderFaceMappings()}</div>`
        },
        {
          eyebrow: 'Controller layouts',
          title: 'Different symbols, same button positions',
          body: 'Remapad detects the connected controller and swaps the guide symbols automatically. Xbox uses A/B/X/Y, PlayStation uses ✕/○/□/△, and Nintendo uses B/A/Y/X.',
          visual: `
            <div class="remapad-tutorial-layouts" aria-label="Controller face-button layouts">
              <span><strong>Xbox</strong><i>A</i><i>B</i><i>X</i><i>Y</i></span>
              <span><strong>PlayStation</strong><i>✕</i><i>○</i><i>□</i><i>△</i></span>
              <span><strong>Nintendo</strong><i>B</i><i>A</i><i>Y</i><i>X</i></span>
            </div>`
        },
        {
          eyebrow: 'Review or edit',
          title: 'Open the Navigation Guide',
          body: guideButton !== undefined
            ? `Press <kbd>${escapeHtml(guideGlyph)}</kbd> (Start/Menu) to open this site’s Navigation Guide, press D-pad Left twice to highlight Edit, then press <kbd>${escapeHtml(getGlyph(0))}</kbd> to select it.`
            : `This site does not currently have Navigation Guide mapped. Open Remapad from the extension menu and assign it to <kbd>${escapeHtml(getGlyph(9))}</kbd> (Start/Menu), then highlight Edit in the guide.`,
          visual: `
            <div class="remapad-tutorial-edit-flow" aria-label="Open guide, highlight Edit, and confirm">
              <span><kbd>${escapeHtml(guideGlyph)}</kbd><small>Open guide</small></span>
              <b>→</b>
              <span><kbd>← ×2</kbd><small>Highlight Edit</small></span>
              <b>→</b>
              <span><kbd>${escapeHtml(getGlyph(0))}</kbd><small>Confirm</small></span>
            </div>`
        }
      ];
    }

    function render() {
      if (!tutorialElement) return;
      const steps = buildSteps();
      const step = steps[activeStep];
      const dots = steps.map((_, index) => (
        `<button type="button" class="remapad-tutorial-dot${index === activeStep ? ' active' : ''}" data-remapad-tutorial-step="${index}" aria-label="Go to tutorial step ${index + 1}"${index === activeStep ? ' aria-current="step"' : ''}></button>`
      )).join('');

      tutorialElement.innerHTML = `
        <div class="remapad-tutorial-card">
          <button type="button" class="remapad-tutorial-skip" data-remapad-tutorial-close>Skip</button>
          <div class="remapad-tutorial-visual">${step.visual}</div>
          <p class="remapad-tutorial-eyebrow">${step.eyebrow} · ${activeStep + 1}/${steps.length}</p>
          <h2 id="remapad-tutorial-title">${step.title}</h2>
          <p class="remapad-tutorial-copy">${step.body}</p>
          <div class="remapad-tutorial-controls">
            <button type="button" class="remapad-tutorial-back" data-remapad-tutorial-prev ${activeStep === 0 ? 'disabled' : ''}>Back</button>
            <div class="remapad-tutorial-dots">${dots}</div>
            <button type="button" class="remapad-tutorial-next" data-remapad-tutorial-next>${activeStep === steps.length - 1 ? 'Done' : 'Next'}</button>
          </div>
          <p class="remapad-tutorial-gamepad-hint">D-pad ← → to browse · ${getGlyph(0)} confirm · ${getGlyph(1)} close</p>
        </div>`;

      tutorialElement.querySelector('[data-remapad-tutorial-next]')?.focus({ preventScroll: true });
    }

    function move(direction) {
      if (!tutorialElement) return;
      const lastStep = buildSteps().length - 1;
      const nextStep = Math.max(0, Math.min(lastStep, activeStep + direction));
      if (nextStep === activeStep) return;
      activeStep = nextStep;
      render();
    }

    async function markSeen() {
      try {
        const data = await api.storage.local.get([STORAGE_KEY]);
        const versions = data[STORAGE_KEY] && typeof data[STORAGE_KEY] === 'object'
          ? data[STORAGE_KEY]
          : {};
        if (versions[hostname] === TUTORIAL_VERSION) return;
        await api.storage.local.set({
          [STORAGE_KEY]: { ...versions, [hostname]: TUTORIAL_VERSION }
        });
      } catch (error) {
        console.warn('[Remapad CS] Unable to save tutorial progress:', error);
      }
    }

    function close({ remember = true } = {}) {
      if (!tutorialElement) return;
      document.removeEventListener('keydown', onKeyDown, true);
      tutorialElement.remove();
      tutorialElement = null;
      const focusTarget = restoreFocusElement;
      restoreFocusElement = null;
      if (focusTarget?.isConnected) focusTarget.focus?.({ preventScroll: true });
      if (remember) markSeen();
    }

    function finishOrAdvance() {
      if (activeStep < buildSteps().length - 1) {
        move(1);
      } else {
        close();
      }
    }

    function onClick(event) {
      if (event.target.closest('[data-remapad-tutorial-close]')) {
        close();
      } else if (event.target.closest('[data-remapad-tutorial-next]')) {
        finishOrAdvance();
      } else if (event.target.closest('[data-remapad-tutorial-prev]')) {
        move(-1);
      } else {
        const stepButton = event.target.closest('[data-remapad-tutorial-step]');
        if (stepButton) {
          activeStep = Number(stepButton.dataset.remapadTutorialStep);
          render();
        }
      }
    }

    function onKeyDown(event) {
      if (!tutorialElement) return;
      const handledKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'];
      if (!handledKeys.includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(-1);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(1);
      else if (event.key === 'Escape') close();
      else finishOrAdvance();
    }

    function handleButtonPress(button) {
      if (!tutorialElement) return false;
      if (button === 12 || button === 14) move(-1);
      else if (button === 13 || button === 15) move(1);
      else if (button === 0) finishOrAdvance();
      else if (button === 1 || button === 9) close();
      return true;
    }

    async function showIfNeeded() {
      if (tutorialElement || showCheckPromise || !callbacks.isSiteActive()) return;
      showCheckPromise = (async () => {
        try {
          const data = await api.storage.local.get([STORAGE_KEY]);
          if (!callbacks.isSiteActive() || data[STORAGE_KEY]?.[hostname] === TUTORIAL_VERSION) return;

          overlayStyles.inject();
          restoreFocusElement = document.activeElement;
          activeStep = 0;
          tutorialElement = document.createElement('div');
          tutorialElement.className = 'remapad-tutorial';
          tutorialElement.setAttribute('role', 'dialog');
          tutorialElement.setAttribute('aria-modal', 'true');
          tutorialElement.setAttribute('aria-labelledby', 'remapad-tutorial-title');
          tutorialElement.addEventListener('click', onClick);
          document.body.appendChild(tutorialElement);
          document.addEventListener('keydown', onKeyDown, true);
          render();
        } catch (error) {
          console.warn('[Remapad CS] Unable to load tutorial progress:', error);
        } finally {
          showCheckPromise = null;
        }
      })();
      return showCheckPromise;
    }

    return {
      showIfNeeded,
      handleButtonPress,
      isVisible,
      close
    };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.TutorialController = { create };
})(typeof window !== 'undefined' ? window : globalThis);
