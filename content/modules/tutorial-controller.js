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
  const OUTCOME_STORAGE_KEY = 'siteTutorialOutcomes';
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
    let closePromise = null;

    function isVisible() {
      return Boolean(tutorialElement);
    }

    function getGlyph(button) {
      const glyphs = GLYPHS[callbacks.getIconStyle()] || GLYPHS.playstation;
      return glyphs[String(button)] || String(button);
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

    function getControllerName() {
      const names = {
        xbox: 'Xbox',
        playstation: 'PlayStation',
        nintendo: 'Nintendo',
        steamdeck: 'Steam Deck',
        n64: 'N64'
      };
      return names[callbacks.getIconStyle()] || 'your';
    }

    function getActivationChoice() {
      const settings = callbacks.getSettings();
      return settings.muteActivation
        ? '__muted__'
        : settings.notificationSound || 'access_point';
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
          body: `By default, the left thumbstick moves a virtual cursor and the right thumbstick scrolls. On this site they are currently set to ${leftMode} and ${rightMode}. You can adjust their mode, cursor speed, and deadzone in Remapad’s navigation settings.`
        },
        {
          eyebrow: 'Current site mapping',
          title: `Select what you want on ${hostname}`,
          body: `These are the four face-button actions in this site’s active mapping. The labels below use the detected ${controllerName} layout.`
        },
        {
          eyebrow: 'Controller layouts',
          title: 'Different symbols, same button positions',
          body: 'Remapad detects the connected controller and swaps the guide symbols automatically. Xbox uses A/B/X/Y, PlayStation uses ✕/○/□/△, and Nintendo uses B/A/Y/X.'
        },
        {
          eyebrow: 'Review or edit',
          title: 'Open the Navigation Guide',
          body: guideButton !== undefined
            ? `Press ${guideGlyph} (Start/Menu) to open this site’s Navigation Guide, press D-pad Left twice to highlight Edit, then press ${getGlyph(0)} to select it.`
            : `This site does not currently have Navigation Guide mapped. Open Remapad from the extension menu and assign it to ${getGlyph(9)} (Start/Menu), then highlight Edit in the guide.`
        },
        {
          eyebrow: 'Activation notification',
          title: '“Remapad extension activated”',
          body: 'The activation sound confirms that Remapad is running on a mapped website. You can customize it later under Miscellaneous Options → Play probe sound on activation, or choose a sound—or no notification—right now.',
          visualClass: 'remapad-tutorial-visual--activation',
          activation: true
        }
      ];
    }

    function appendLabeledValue(parent, wrapperTag, valueTag, value, label) {
      const wrapper = document.createElement(wrapperTag);
      const valueElement = document.createElement(valueTag);
      valueElement.textContent = value;
      const labelElement = document.createElement('small');
      labelElement.textContent = label;
      wrapper.append(valueElement, labelElement);
      parent.appendChild(wrapper);
    }

    function renderStepVisual(stepIndex, visual) {
      visual.replaceChildren();
      if (stepIndex === 0) {
        const sticks = document.createElement('div');
        sticks.className = 'remapad-tutorial-sticks';
        sticks.setAttribute('aria-label', 'Thumbstick controls');
        for (const [glyph, label] of [['LS', 'Virtual cursor'], ['RS', 'Scroll']]) {
          const stick = document.createElement('span');
          const glyphElement = document.createElement('i');
          glyphElement.textContent = glyph;
          const labelElement = document.createElement('strong');
          labelElement.textContent = label;
          stick.append(glyphElement, labelElement);
          sticks.appendChild(stick);
        }
        visual.appendChild(sticks);
      } else if (stepIndex === 1) {
        const mappings = document.createElement('div');
        mappings.className = 'remapad-tutorial-mappings';
        const profile = callbacks.getActiveProfile();
        for (const button of ['0', '1', '2', '3']) {
          const mapping = document.createElement('div');
          mapping.className = 'remapad-tutorial-mapping';
          const key = document.createElement('kbd');
          key.textContent = getGlyph(button);
          const label = document.createElement('span');
          label.textContent = formatActionLabel(profile[button]);
          mapping.append(key, label);
          mappings.appendChild(mapping);
        }
        visual.appendChild(mappings);
      } else if (stepIndex === 2) {
        const layouts = document.createElement('div');
        layouts.className = 'remapad-tutorial-layouts';
        layouts.setAttribute('aria-label', 'Controller face-button layouts');
        for (const [name, glyphs] of [
          ['Xbox', ['A', 'B', 'X', 'Y']],
          ['PlayStation', ['✕', '○', '□', '△']],
          ['Nintendo', ['B', 'A', 'Y', 'X']]
        ]) {
          const row = document.createElement('span');
          const heading = document.createElement('strong');
          heading.textContent = name;
          row.appendChild(heading);
          glyphs.forEach(glyph => {
            const item = document.createElement('i');
            item.textContent = glyph;
            row.appendChild(item);
          });
          layouts.appendChild(row);
        }
        visual.appendChild(layouts);
      } else if (stepIndex === 3) {
        const flow = document.createElement('div');
        flow.className = 'remapad-tutorial-edit-flow';
        flow.setAttribute('aria-label', 'Open guide, highlight Edit, and confirm');
        const guideButton = findMappedButton('toggle_hud');
        appendLabeledValue(flow, 'span', 'kbd', getGlyph(guideButton ?? 9), 'Open guide');
        const firstArrow = document.createElement('b');
        firstArrow.textContent = '→';
        flow.appendChild(firstArrow);
        appendLabeledValue(flow, 'span', 'kbd', '← ×2', 'Highlight Edit');
        const secondArrow = document.createElement('b');
        secondArrow.textContent = '→';
        flow.appendChild(secondArrow);
        appendLabeledValue(flow, 'span', 'kbd', getGlyph(0), 'Confirm');
        visual.appendChild(flow);
      } else {
        const settings = callbacks.getSettings();
        const selected = getActivationChoice();
        const volume = typeof settings.notificationVolume === 'number'
          ? Math.max(0, Math.min(100, settings.notificationVolume))
          : 50;
        const activation = document.createElement('div');
        activation.className = 'remapad-tutorial-activation';
        const soundLabel = document.createElement('label');
        const soundText = document.createElement('span');
        soundText.textContent = 'Activation sound';
        const select = document.createElement('select');
        select.dataset.remapadActivationSound = '';
        ACTIVATION_SOUND_OPTIONS.forEach(option => {
          const item = document.createElement('option');
          item.value = option.value;
          item.textContent = option.label;
          select.appendChild(item);
        });
        select.value = selected;
        soundLabel.append(soundText, select);

        const row = document.createElement('div');
        row.className = 'remapad-tutorial-activation-row';
        const preview = document.createElement('button');
        preview.type = 'button';
        preview.dataset.remapadActivationPreview = '';
        preview.disabled = selected === '__muted__';
        preview.textContent = '▶ Preview';
        const volumeLabel = document.createElement('label');
        const volumeText = document.createElement('span');
        volumeText.append(document.createTextNode('Volume '));
        const output = document.createElement('output');
        output.dataset.remapadActivationVolumeOutput = '';
        output.textContent = `${volume}%`;
        volumeText.appendChild(output);
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = String(volume);
        slider.dataset.remapadActivationVolume = '';
        volumeLabel.append(volumeText, slider);
        row.append(preview, volumeLabel);

        const status = document.createElement('p');
        status.className = 'remapad-tutorial-activation-status';
        status.dataset.remapadActivationStatus = '';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.textContent = selected === '__muted__'
          ? 'Activation notification is muted.'
          : 'This choice applies to every mapped website.';
        activation.append(soundLabel, row, status);
        visual.appendChild(activation);
      }
    }

    function render() {
      if (!tutorialElement) return;
      const steps = buildSteps();
      const step = steps[activeStep];
      RemapadDOM.replaceStaticChildren(tutorialElement, `
        <div class="remapad-tutorial-card">
          <button type="button" class="remapad-tutorial-skip" data-remapad-tutorial-close>Skip</button>
          <div class="remapad-tutorial-visual"></div>
          <p class="remapad-tutorial-eyebrow"></p>
          <h2 id="remapad-tutorial-title"></h2>
          <p class="remapad-tutorial-copy"></p>
          <div class="remapad-tutorial-controls">
            <button type="button" class="remapad-tutorial-back" data-remapad-tutorial-prev>Back</button>
            <div class="remapad-tutorial-dots"></div>
            <button type="button" class="remapad-tutorial-next" data-remapad-tutorial-next></button>
          </div>
          <p class="remapad-tutorial-gamepad-hint"></p>
        </div>`);

      const visual = tutorialElement.querySelector('.remapad-tutorial-visual');
      if (step.visualClass) visual.classList.add(step.visualClass);
      renderStepVisual(activeStep, visual);
      tutorialElement.querySelector('.remapad-tutorial-eyebrow').textContent = `${step.eyebrow} · ${activeStep + 1}/${steps.length}`;
      tutorialElement.querySelector('#remapad-tutorial-title').textContent = step.title;
      tutorialElement.querySelector('.remapad-tutorial-copy').textContent = step.body;
      tutorialElement.querySelector('[data-remapad-tutorial-prev]').disabled = activeStep === 0;
      tutorialElement.querySelector('[data-remapad-tutorial-next]').textContent = activeStep === steps.length - 1 ? 'Done' : 'Next';
      tutorialElement.querySelector('.remapad-tutorial-gamepad-hint').textContent =
        `${step.activation ? 'D-pad ↑ ↓ changes sound · ' : 'D-pad ← → to browse · '}${getGlyph(0)} confirm · ${getGlyph(1)} close`;

      const dots = tutorialElement.querySelector('.remapad-tutorial-dots');
      steps.forEach((_, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = `remapad-tutorial-dot${index === activeStep ? ' active' : ''}`;
        dot.dataset.remapadTutorialStep = String(index);
        dot.setAttribute('aria-label', `Go to tutorial step ${index + 1}`);
        if (index === activeStep) dot.setAttribute('aria-current', 'step');
        dots.appendChild(dot);
      });

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

    async function markSeen(outcome) {
      try {
        const data = await api.storage.local.get([STORAGE_KEY, OUTCOME_STORAGE_KEY]);
        const versions = data[STORAGE_KEY] && typeof data[STORAGE_KEY] === 'object'
          ? data[STORAGE_KEY]
          : {};
        const outcomes = data[OUTCOME_STORAGE_KEY] && typeof data[OUTCOME_STORAGE_KEY] === 'object'
          ? data[OUTCOME_STORAGE_KEY]
          : {};
        if (versions[hostname] === TUTORIAL_VERSION && outcomes[hostname] === outcome) return;
        await api.storage.local.set({
          [STORAGE_KEY]: { ...versions, [hostname]: TUTORIAL_VERSION },
          [OUTCOME_STORAGE_KEY]: { ...outcomes, [hostname]: outcome }
        });
      } catch (error) {
        console.warn('[Remapad CS] Unable to save tutorial progress:', error);
      }
    }

    async function close({ remember = true, outcome = 'skipped' } = {}) {
      if (!tutorialElement) return;
      if (remember) {
        if (closePromise) return closePromise;
        tutorialElement.setAttribute('aria-busy', 'true');
        const actionButton = tutorialElement.querySelector(
          outcome === 'skipped'
            ? '[data-remapad-tutorial-close]'
            : '[data-remapad-tutorial-next]'
        );
        if (actionButton) {
          actionButton.disabled = true;
          actionButton.textContent = outcome === 'skipped' ? 'Skipping…' : 'Saving…';
        }
        closePromise = markSeen(outcome);
        await closePromise;
        closePromise = null;
        if (!tutorialElement) return;
      }
      document.removeEventListener('keydown', onKeyDown, true);
      tutorialElement.remove();
      tutorialElement = null;
      const focusTarget = restoreFocusElement;
      restoreFocusElement = null;
      if (focusTarget?.isConnected) focusTarget.focus?.({ preventScroll: true });
    }

    function finishOrAdvance() {
      if (activeStep < buildSteps().length - 1) {
        move(1);
      } else {
        close({ outcome: 'completed' });
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
          // Capture within the overlay so host-page bubble handlers cannot
          // swallow clicks on Skip or the tutorial controls.
          tutorialElement.addEventListener('click', onClick, true);
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
