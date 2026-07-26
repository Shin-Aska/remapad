/**
 * Remapad Options — Targeted Walkthrough
 * Visits every major Options section once, switching tabs and spotlighting the
 * relevant controls. Completion is stored independently from site tutorials.
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'optionsTutorialVersion';
  const TUTORIAL_VERSION = 1;

  const STEPS = [
    {
      panel: 'controller',
      target: 'tabs',
      title: 'Four areas, one controller setup',
      body: 'Use these tabs to edit controller mappings, navigation behavior, collection-aware browsing, and miscellaneous keyboard or global settings.'
    },
    {
      panel: 'controller',
      target: 'controller-status',
      title: 'Controller Status',
      body: 'See the connected controller and test whether browser gamepad input is reaching Remapad.'
    },
    {
      panel: 'controller',
      target: 'website-mappings',
      title: 'Website Mappings',
      body: 'Add sites, enable or disable their mappings, and choose which website profile you want to edit.'
    },
    {
      panel: 'controller',
      target: 'icon-layout',
      title: 'Icon Layout Style',
      body: 'Choose automatic detection or force Xbox, PlayStation, or Nintendo button symbols throughout Remapad.'
    },
    {
      panel: 'controller',
      target: 'mapping-editor',
      title: 'Visual Mapping Editor',
      body: 'Select a site, choose any controller button, assign an action, then save. Reset Mapping restores that profile’s defaults.'
    },
    {
      panel: 'navigation',
      target: 'live-sticks',
      title: 'Live Sticks',
      body: 'Move both thumbsticks to inspect their raw axes and verify deadzones before tuning navigation.'
    },
    {
      panel: 'navigation',
      target: 'navigation-general',
      title: 'General Navigation',
      body: 'Enable controller navigation and choose whether Remapad automatically uses collection, spatial, or DOM-order navigation.'
    },
    {
      panel: 'navigation',
      target: 'right-stick',
      title: 'Right Stick',
      body: 'Configure the virtual cursor or directional navigation, including speed, deadzone, repeat timing, color, and direction mode.'
    },
    {
      panel: 'navigation',
      target: 'left-stick',
      title: 'Left Stick',
      body: 'Configure scrolling, navigation, or another cursor. The default role is smooth page scrolling.'
    },
    {
      panel: 'navigation',
      target: 'direction-map',
      title: 'Direction Map',
      body: 'Override what each stick direction does and which thumbstick owns that direction.'
    },
    {
      panel: 'navigation',
      target: 'collection-grid',
      title: 'Collection Grid',
      body: 'Tune row and item wrapping plus the geometry Remapad uses when moving between streaming-site collections.'
    },
    {
      panel: 'collection',
      target: 'collection-intro',
      title: 'Collection & Search Navigation',
      body: 'This area teaches Remapad how a site groups rows and cards, and where its search controls live.'
    },
    {
      panel: 'collection',
      target: 'collection-sites',
      title: 'Collection Sites',
      body: 'Choose an existing mapped site or add another hostname, then save all collection configurations together.'
    },
    {
      panel: 'collection',
      target: 'collection-editor',
      title: 'Collection Selector Editor',
      body: 'Define and test container, item, search-trigger, and search-input selectors for the selected site.'
    },
    {
      panel: 'keyboard',
      target: 'virtual-keyboard',
      title: 'Virtual Keyboard',
      body: 'Globally enable or disable Remapad’s on-screen keyboard on mapped pages.'
    },
    {
      panel: 'keyboard',
      target: 'keyboard-trigger',
      title: 'Keyboard Trigger Mode',
      body: 'Choose whether focused fields, controller clicks, both, or neither should open the virtual keyboard.'
    },
    {
      panel: 'keyboard',
      target: 'custom-triggers',
      title: 'Custom Trigger Selectors',
      body: 'Add CSS selectors for unusual editors, chat boxes, or other controls that should summon the keyboard.'
    },
    {
      panel: 'keyboard',
      target: 'keyboard-layout',
      title: 'Default Keyboard Layout',
      body: 'Choose the fallback language layout and whether Remapad should infer a layout from the browser language.'
    },
    {
      panel: 'keyboard',
      target: 'probe-sound',
      title: 'Activation Probe Sound',
      body: 'Control the global activation chime, select its sound preset, preview it, and adjust its volume.'
    },
    {
      panel: 'keyboard',
      target: 'tutorial-resets',
      title: 'Tutorial Resets',
      body: 'Reset website onboarding independently from this Options walkthrough. Each switch performs a one-time reset and returns to its off position.'
    }
  ];

  function create({ api, showToast }) {
    let activeStep = -1;
    let overlay = null;
    let spotlight = null;
    let popover = null;
    let restoreFocus = null;
    let showPromise = null;

    function isVisible() {
      return Boolean(overlay);
    }

    function nextFrame() {
      return new Promise(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(fallback);
          resolve();
        };
        const fallback = setTimeout(finish, 120);
        requestAnimationFrame(() => requestAnimationFrame(finish));
      });
    }

    function getTarget(step) {
      return document.querySelector(`[data-options-tutorial="${step.target}"]`);
    }

    async function activatePanel(panel) {
      const tab = document.getElementById(`tab-btn-${panel}`);
      if (tab && !tab.classList.contains('active')) {
        tab.click();
        await nextFrame();
      }
    }

    function positionTutorial(target) {
      if (!target || !spotlight || !popover) return;
      const padding = 7;
      const rect = target.getBoundingClientRect();
      spotlight.style.top = `${Math.max(4, rect.top - padding)}px`;
      spotlight.style.left = `${Math.max(4, rect.left - padding)}px`;
      spotlight.style.width = `${Math.max(24, Math.min(global.innerWidth - 8, rect.width + padding * 2))}px`;
      spotlight.style.height = `${Math.max(24, Math.min(global.innerHeight - 8, rect.height + padding * 2))}px`;

      const popoverRect = popover.getBoundingClientRect();
      const gap = 18;
      let left = rect.right + gap;
      let top = rect.top;
      if (left + popoverRect.width > global.innerWidth - 16) {
        left = rect.left - popoverRect.width - gap;
      }
      if (left < 16) {
        left = Math.min(global.innerWidth - popoverRect.width - 16, Math.max(16, rect.left));
        top = rect.bottom + gap;
        if (top + popoverRect.height > global.innerHeight - 16) {
          top = rect.top - popoverRect.height - gap;
        }
      }
      popover.style.left = `${Math.max(16, left)}px`;
      popover.style.top = `${Math.max(16, Math.min(top, global.innerHeight - popoverRect.height - 16))}px`;
    }

    function renderPopover(step) {
      if (!popover) return;
      popover.innerHTML = `
        <p class="options-tutorial-kicker">OPTIONS TOUR · ${activeStep + 1}/${STEPS.length}</p>
        <h2 id="options-tutorial-title">${step.title}</h2>
        <p class="options-tutorial-copy">${step.body}</p>
        <div class="options-tutorial-progress" aria-hidden="true">
          <span style="width:${((activeStep + 1) / STEPS.length) * 100}%"></span>
        </div>
        <div class="options-tutorial-actions">
          <button type="button" class="btn-ghost" data-options-tutorial-skip>Skip tour</button>
          <div>
            <button type="button" class="btn-ghost" data-options-tutorial-prev ${activeStep === 0 ? 'disabled' : ''}>Back</button>
            <button type="button" class="btn-primary" data-options-tutorial-next>${activeStep === STEPS.length - 1 ? 'Done' : 'Next'}</button>
          </div>
        </div>
        <p class="options-tutorial-hint">Arrow keys or D-pad to move · Enter/A to continue · Escape/B to close</p>`;
    }

    async function showStep(index) {
      if (!overlay) return;
      activeStep = Math.max(0, Math.min(STEPS.length - 1, index));
      const step = STEPS[activeStep];
      await activatePanel(step.panel);
      const target = getTarget(step);
      if (!target) {
        if (activeStep < STEPS.length - 1) return showStep(activeStep + 1);
        return close({ remember: true });
      }

      target.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' });
      renderPopover(step);
      await nextFrame();
      positionTutorial(target);
      popover.querySelector('[data-options-tutorial-next]')?.focus({ preventScroll: true });
    }

    async function markComplete() {
      try {
        await api.storage.local.set({ [STORAGE_KEY]: TUTORIAL_VERSION });
      } catch (error) {
        console.warn('[Remapad Options] Unable to save tutorial completion:', error);
      }
    }

    function close({ remember = true } = {}) {
      if (!overlay) return;
      document.removeEventListener('keydown', onKeyDown, true);
      global.removeEventListener('resize', onResize);
      overlay.remove();
      spotlight.remove();
      popover.remove();
      overlay = null;
      spotlight = null;
      popover = null;
      activeStep = -1;
      if (restoreFocus?.isConnected) restoreFocus.focus?.({ preventScroll: true });
      restoreFocus = null;
      if (remember) markComplete();
    }

    function advance() {
      if (activeStep === STEPS.length - 1) close({ remember: true });
      else showStep(activeStep + 1);
    }

    function retreat() {
      if (activeStep > 0) showStep(activeStep - 1);
    }

    function onKeyDown(event) {
      if (!overlay) return;
      const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape'];
      if (!handled.includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') retreat();
      else if (event.key === 'Escape') close({ remember: true });
      else advance();
    }

    function onResize() {
      const step = STEPS[activeStep];
      if (step) positionTutorial(getTarget(step));
    }

    function onClick(event) {
      if (event.target.closest('[data-options-tutorial-skip]')) close({ remember: true });
      else if (event.target.closest('[data-options-tutorial-prev]')) retreat();
      else if (event.target.closest('[data-options-tutorial-next]')) advance();
    }

    function handleGamepad(gamepad, previousButtons) {
      if (!overlay) return false;
      gamepad.buttons.forEach((button, index) => {
        const pressed = button.pressed || button.value > 0.5;
        if (!pressed || previousButtons[index]) return;
        if (index === 12 || index === 14) retreat();
        else if (index === 13 || index === 15 || index === 0) advance();
        else if (index === 1 || index === 9) close({ remember: true });
      });
      return true;
    }

    async function show({ force = false } = {}) {
      if (overlay || showPromise) return;
      showPromise = (async () => {
        try {
          if (!force) {
            const data = await api.storage.local.get([STORAGE_KEY]);
            if (data[STORAGE_KEY] === TUTORIAL_VERSION) return;
          }
          restoreFocus = document.activeElement;
          overlay = document.createElement('div');
          overlay.className = 'options-tutorial-blocker';
          spotlight = document.createElement('div');
          spotlight.className = 'options-tutorial-spotlight';
          popover = document.createElement('section');
          popover.className = 'options-tutorial-popover';
          popover.addEventListener('click', onClick);
          popover.setAttribute('role', 'dialog');
          popover.setAttribute('aria-modal', 'true');
          popover.setAttribute('aria-labelledby', 'options-tutorial-title');
          document.body.append(overlay, spotlight, popover);
          document.addEventListener('keydown', onKeyDown, true);
          global.addEventListener('resize', onResize);
          await showStep(0);
        } catch (error) {
          console.warn('[Remapad Options] Unable to start tutorial:', error);
          close({ remember: false });
        } finally {
          showPromise = null;
        }
      })();
      return showPromise;
    }

    async function resetWebsiteTutorial() {
      await api.storage.local.remove('siteTutorialVersions');
      showToast('Website tutorial reset. It will appear again on mapped sites.', 'success');
    }

    async function resetOptionsTutorial() {
      await api.storage.local.remove(STORAGE_KEY);
      close({ remember: false });
      showToast('Settings tutorial reset.', 'success');
      await show({ force: true });
    }

    function bindResetControls(dom) {
      dom.resetWebsiteTutorialToggle?.addEventListener('change', async () => {
        if (!dom.resetWebsiteTutorialToggle.checked) return;
        dom.resetWebsiteTutorialToggle.disabled = true;
        try {
          await resetWebsiteTutorial();
        } finally {
          dom.resetWebsiteTutorialToggle.checked = false;
          dom.resetWebsiteTutorialToggle.disabled = false;
        }
      });
      dom.resetOptionsTutorialToggle?.addEventListener('change', async () => {
        if (!dom.resetOptionsTutorialToggle.checked) return;
        dom.resetOptionsTutorialToggle.disabled = true;
        try {
          await resetOptionsTutorial();
        } finally {
          dom.resetOptionsTutorialToggle.checked = false;
          dom.resetOptionsTutorialToggle.disabled = false;
        }
      });
    }

    return {
      showIfNeeded: () => show(),
      resetWebsiteTutorial,
      resetOptionsTutorial,
      bindResetControls,
      handleGamepad,
      isVisible
    };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.OptionsTutorial = { create };
})(typeof window !== 'undefined' ? window : globalThis);
