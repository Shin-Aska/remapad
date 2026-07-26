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
  const TUTORIAL_VERSION = 3;
  const STORAGE_KEY = 'siteTutorialVersions';
  const ACTIVATION_SOUND_OPTIONS = [
    { value: '__muted__', label: 'No notification (Muted)' },
    { value: 'access_point', label: 'Access Point' },
    { value: 'protocol', label: 'Protocol Notification' },
    { value: 'probe', label: 'Probe Triad' },
    { value: 'chime', label: 'Sparkling Chime' },
    { value: 'coin', label: 'Retro Arcade Coin' },
    { value: 'success', label: 'Victory Flourish' },
    { value: 'click', label: 'Tactile Click' },
    { value: 'alert', label: 'Warning Alert' },
    { value: 'pop', label: 'Bubble Pop' }
  ];

  function create({ api, hostname, constants, utils, overlayStyles, callbacks }) {
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

    function getActivationChoice() {
      const settings = callbacks.getSettings();
      return settings.muteActivation
        ? '__muted__'
        : settings.notificationSound || 'access_point';
    }

    function renderActivationControls() {
      const settings = callbacks.getSettings();
      const selected = getActivationChoice();
      const volume = typeof settings.notificationVolume === 'number'
        ? Math.max(0, Math.min(100, settings.notificationVolume))
        : 50;
      const options = ACTIVATION_SOUND_OPTIONS.map(option => (
        `<option value="${option.value}"${option.value === selected ? ' selected' : ''}>${option.label}</option>`
      )).join('');
      return `
        <div class="remapad-tutorial-activation">
          <label>
            <span>Activation sound</span>
            <select data-remapad-activation-sound>${options}</select>
          </label>
          <div class="remapad-tutorial-activation-row">
            <button type="button" data-remapad-activation-preview ${selected === '__muted__' ? 'disabled' : ''}>▶ Preview</button>
            <label>
              <span>Volume <output data-remapad-activation-volume-output>${volume}%</output></span>
              <input type="range" min="0" max="100" value="${volume}" data-remapad-activation-volume>
            </label>
          </div>
          <p class="remapad-tutorial-activation-status" data-remapad-activation-status role="status" aria-live="polite">${selected === '__muted__' ? 'Activation notification is muted.' : 'This choice applies to every mapped website.'}</p>
        </div>`;
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
        },
        {
          eyebrow: 'Activation notification',
          title: '“Remapad extension activated”',
          body: 'The activation sound confirms that Remapad is running on a mapped website. You can customize it later under Miscellaneous Options → Play probe sound on activation, or choose a sound—or no notification—right now.',
          visual: renderActivationControls(),
          visualClass: 'remapad-tutorial-visual--activation',
          activation: true
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
          <div class="remapad-tutorial-visual${step.visualClass ? ` ${step.visualClass}` : ''}">${step.visual}</div>
          <p class="remapad-tutorial-eyebrow">${step.eyebrow} · ${activeStep + 1}/${steps.length}</p>
          <h2 id="remapad-tutorial-title">${step.title}</h2>
          <p class="remapad-tutorial-copy">${step.body}</p>
          <div class="remapad-tutorial-controls">
            <button type="button" class="remapad-tutorial-back" data-remapad-tutorial-prev ${activeStep === 0 ? 'disabled' : ''}>Back</button>
            <div class="remapad-tutorial-dots">${dots}</div>
            <button type="button" class="remapad-tutorial-next" data-remapad-tutorial-next>${activeStep === steps.length - 1 ? 'Done' : 'Next'}</button>
          </div>
          <p class="remapad-tutorial-gamepad-hint">${step.activation ? 'D-pad ↑ ↓ changes sound · ' : 'D-pad ← → to browse · '}${getGlyph(0)} confirm · ${getGlyph(1)} close</p>
        </div>`;

      tutorialElement.querySelector('[data-remapad-tutorial-next]')?.focus({ preventScroll: true });
    }

    function setActivationStatus(message) {
      const status = tutorialElement?.querySelector('[data-remapad-activation-status]');
      if (status) status.textContent = message;
    }

    async function saveActivationSettings(choice, volume) {
      const currentSettings = callbacks.getSettings();
      const patch = {};
      if (choice !== undefined) {
        patch.muteActivation = choice === '__muted__';
        if (choice !== '__muted__') patch.notificationSound = choice;
      }
      if (volume !== undefined) {
        patch.notificationVolume = Math.max(0, Math.min(100, volume));
      }
      Object.assign(currentSettings, patch);
      try {
        await api.storage.local.set(patch);
        setActivationStatus(patch.muteActivation
          ? 'No notification selected. Activation sound is now muted.'
          : 'Activation notification saved globally.');
      } catch (error) {
        console.warn('[Remapad CS] Unable to save activation notification:', error);
        setActivationStatus('Could not save that choice. Try again in Settings.');
      }
    }

    function previewActivationSound() {
      const settings = callbacks.getSettings();
      if (settings.muteActivation) {
        setActivationStatus('Choose a sound before previewing.');
        return;
      }
      setActivationStatus('Playing preview…');
      utils.playNotificationSound(settings.notificationSound || 'access_point', {
        volume: (typeof settings.notificationVolume === 'number' ? settings.notificationVolume : 50) / 100
      }).then(() => {
        setActivationStatus('Preview played. This choice applies globally.');
      }).catch(error => {
        console.warn('[Remapad CS] Unable to preview activation notification:', error);
        setActivationStatus('Your browser blocked the preview, but the setting was saved.');
      });
    }

    function cycleActivationChoice(direction) {
      const select = tutorialElement?.querySelector('[data-remapad-activation-sound]');
      if (!select) return;
      const currentIndex = ACTIVATION_SOUND_OPTIONS.findIndex(option => option.value === select.value);
      const nextIndex = (currentIndex + direction + ACTIVATION_SOUND_OPTIONS.length) % ACTIVATION_SOUND_OPTIONS.length;
      select.value = ACTIVATION_SOUND_OPTIONS[nextIndex].value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
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
      } else if (event.target.closest('[data-remapad-activation-preview]')) {
        previewActivationSound();
      } else {
        const stepButton = event.target.closest('[data-remapad-tutorial-step]');
        if (stepButton) {
          activeStep = Number(stepButton.dataset.remapadTutorialStep);
          render();
        }
      }
    }

    function onChange(event) {
      if (event.target.matches('[data-remapad-activation-sound]')) {
        const choice = event.target.value;
        const previewButton = tutorialElement?.querySelector('[data-remapad-activation-preview]');
        if (previewButton) previewButton.disabled = choice === '__muted__';
        saveActivationSettings(choice);
      } else if (event.target.matches('[data-remapad-activation-volume]')) {
        saveActivationSettings(undefined, Number(event.target.value));
      }
    }

    function onInput(event) {
      if (!event.target.matches('[data-remapad-activation-volume]')) return;
      const output = tutorialElement?.querySelector('[data-remapad-activation-volume-output]');
      if (output) output.textContent = `${event.target.value}%`;
    }

    function onKeyDown(event) {
      if (!tutorialElement) return;
      const handledKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'];
      if (!handledKeys.includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.target.matches('[data-remapad-activation-sound]') &&
          (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        cycleActivationChoice(event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (event.target.matches('[data-remapad-activation-volume]') &&
          event.key.startsWith('Arrow')) {
        const direction = event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? -1 : 1;
        event.target.value = String(Math.max(0, Math.min(100, Number(event.target.value) + direction * 5)));
        event.target.dispatchEvent(new Event('input', { bubbles: true }));
        event.target.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      const activationStep = buildSteps()[activeStep]?.activation;
      if (activationStep && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        cycleActivationChoice(event.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(-1);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(1);
      else if (event.key === 'Escape') close();
      else finishOrAdvance();
    }

    function handleButtonPress(button) {
      if (!tutorialElement) return false;
      const activationStep = buildSteps()[activeStep]?.activation;
      if (activationStep && button === 12) cycleActivationChoice(-1);
      else if (activationStep && button === 13) cycleActivationChoice(1);
      else if (button === 12 || button === 14) move(-1);
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
          tutorialElement.addEventListener('change', onChange);
          tutorialElement.addEventListener('input', onInput);
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
