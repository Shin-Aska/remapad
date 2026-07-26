/**
 * Remapad Options — Navigation Settings
 * MV3-compatible classic script; exposed via window.RemapadOptions.NavigationSettings.
 */

(function (global) {
  'use strict';

  function create({ api, state, constants, dom, showToast, saveSettings }) {
    const { DEFAULT_NAV_SETTINGS, ACTION_LABEL_MAP } = constants;

    function updateStickModeVisibility() {
      const rightMode = dom.navRightMode ? dom.navRightMode.value : 'cursor';
      document.querySelectorAll('.nav-mode-group-right').forEach(element => {
        element.style.display = element.dataset.mode === rightMode ? 'flex' : 'none';
      });
      const leftMode = dom.navLeftMode ? dom.navLeftMode.value : 'scroll';
      document.querySelectorAll('.nav-mode-group-left').forEach(element => {
        element.style.display = element.dataset.mode === leftMode ? 'flex' : 'none';
      });
    }

    function updateDirectionMeta(direction) {
      const nav = state.getSettings().navSettings;
      const entry = nav.axisMap[direction] || DEFAULT_NAV_SETTINGS.axisMap[direction];
      const meta = dom.directionMetaEls[direction];
      if (!meta) return;
      meta.assigned.textContent = entry.stick === 'left' ? 'Left stick' : 'Right stick';
      meta.action.textContent = ACTION_LABEL_MAP[entry.action] || entry.action;
    }

    function updateNavDeadzoneRings() {
      const nav = state.getSettings().navSettings;
      if (dom.leftStickDeadzone) {
        const radius = Math.round((nav.leftStick.deadzone || 0.3) * 50);
        dom.leftStickDeadzone.style.width = `${radius}%`;
        dom.leftStickDeadzone.style.height = `${radius}%`;
      }
      if (dom.rightStickDeadzone) {
        const radius = Math.round((nav.rightStick.deadzone || 0.3) * 50);
        dom.rightStickDeadzone.style.width = `${radius}%`;
        dom.rightStickDeadzone.style.height = `${radius}%`;
      }
    }

    function render() {
      const nav = state.getSettings().navSettings;
      if (!nav) return;

      dom.navEnabledInput.checked = nav.enabled;
      dom.navStrategyInput.value = nav.strategy;
      dom.navRightEnabled.checked = nav.rightStick.enabled;
      dom.navRightMode.value = nav.rightStick.mode;
      dom.navRightDeadzone.value = nav.rightStick.deadzone;
      dom.navRightDeadzoneVal.textContent = nav.rightStick.deadzone;
      if (dom.navRightRepeatDelay) {
        dom.navRightRepeatDelay.value = nav.rightStick.repeatDelayMs ?? 150;
        if (dom.navRightRepeatDelayVal) dom.navRightRepeatDelayVal.textContent = dom.navRightRepeatDelay.value;
      }
      dom.navRightCursorSpeed.value = nav.rightStick.cursorSpeed ?? DEFAULT_NAV_SETTINGS.rightStick.cursorSpeed;
      dom.navRightCursorSpeedVal.textContent = dom.navRightCursorSpeed.value;
      dom.navRightCursorColor.value = nav.rightStick.cursorColor || DEFAULT_NAV_SETTINGS.rightStick.cursorColor;
      if (dom.navRightScrollAmount) {
        dom.navRightScrollAmount.value = nav.rightStick.scrollAmountPx ?? 150;
        if (dom.navRightScrollAmountVal) dom.navRightScrollAmountVal.textContent = dom.navRightScrollAmount.value;
      }
      dom.navRightAccel.checked = nav.rightStick.repeatAcceleration;
      dom.navRightDirectionMode.value = nav.rightStick.directionMode;
      dom.navLeftEnabled.checked = nav.leftStick.enabled;
      dom.navLeftMode.value = nav.leftStick.mode;
      dom.navLeftDeadzone.value = nav.leftStick.deadzone;
      dom.navLeftDeadzoneVal.textContent = nav.leftStick.deadzone;
      dom.navLeftScrollAmount.value = nav.leftStick.scrollAmountPx;
      dom.navLeftScrollAmountVal.textContent = nav.leftStick.scrollAmountPx;
      dom.navLeftCursorSpeed.value = nav.leftStick.cursorSpeed ?? DEFAULT_NAV_SETTINGS.leftStick.cursorSpeed;
      dom.navLeftCursorSpeedVal.textContent = dom.navLeftCursorSpeed.value;
      dom.navLeftCursorColor.value = nav.leftStick.cursorColor || DEFAULT_NAV_SETTINGS.leftStick.cursorColor;

      for (const direction of ['up', 'down', 'left', 'right']) {
        const entry = nav.axisMap[direction] || DEFAULT_NAV_SETTINGS.axisMap[direction];
        const inputs = dom.navAxisInputs[direction];
        if (inputs) {
          inputs.stick.value = entry.stick;
          inputs.action.value = entry.action;
        }
        updateDirectionMeta(direction);
      }

      updateNavDeadzoneRings();
      updateStickModeVisibility();
      dom.navWrapRows.checked = nav.collectionGrid.wrapRows;
      dom.navWrapItems.checked = nav.collectionGrid.wrapItems;
      dom.navLateralPenalty.value = nav.collectionGrid.lateralPenalty;
      dom.navLateralPenaltyVal.textContent = nav.collectionGrid.lateralPenalty;
      dom.navRowOverlap.value = nav.collectionGrid.rowOverlapThreshold;
      dom.navRowOverlapVal.textContent = nav.collectionGrid.rowOverlapThreshold;
    }

    function collectFromUi() {
      return {
        enabled: dom.navEnabledInput.checked,
        strategy: dom.navStrategyInput.value,
        rightStick: {
          enabled: dom.navRightEnabled.checked,
          mode: dom.navRightMode.value,
          deadzone: Number.parseFloat(dom.navRightDeadzone.value),
          repeatDelayMs: dom.navRightRepeatDelay ? Number.parseInt(dom.navRightRepeatDelay.value, 10) : 150,
          cursorSpeed: Number.parseInt(dom.navRightCursorSpeed.value, 10),
          cursorColor: dom.navRightCursorColor.value || DEFAULT_NAV_SETTINGS.rightStick.cursorColor,
          scrollAmountPx: dom.navRightScrollAmount ? Number.parseInt(dom.navRightScrollAmount.value, 10) : 150,
          repeatAcceleration: dom.navRightAccel.checked,
          directionMode: dom.navRightDirectionMode.value
        },
        leftStick: {
          enabled: dom.navLeftEnabled.checked,
          mode: dom.navLeftMode.value,
          deadzone: Number.parseFloat(dom.navLeftDeadzone.value),
          scrollAmountPx: Number.parseInt(dom.navLeftScrollAmount.value, 10),
          cursorSpeed: Number.parseInt(dom.navLeftCursorSpeed.value, 10),
          cursorColor: dom.navLeftCursorColor.value || DEFAULT_NAV_SETTINGS.leftStick.cursorColor
        },
        axisMap: {
          up: { stick: dom.navAxisInputs.up.stick.value, direction: 'up', action: dom.navAxisInputs.up.action.value },
          down: { stick: dom.navAxisInputs.down.stick.value, direction: 'down', action: dom.navAxisInputs.down.action.value },
          left: { stick: dom.navAxisInputs.left.stick.value, direction: 'left', action: dom.navAxisInputs.left.action.value },
          right: { stick: dom.navAxisInputs.right.stick.value, direction: 'right', action: dom.navAxisInputs.right.action.value }
        },
        collectionGrid: {
          wrapRows: dom.navWrapRows.checked,
          wrapItems: dom.navWrapItems.checked,
          lateralPenalty: Number.parseFloat(dom.navLateralPenalty.value),
          rowOverlapThreshold: Number.parseFloat(dom.navRowOverlap.value)
        }
      };
    }

    function bind() {
      function syncNavSettingsFromUi() {
        state.getSettings().navSettings = collectFromUi();
        state.markUnsaved();
        api.storage.local.set({ navSettings: state.getSettings().navSettings });
      }
      const syncSlider = (input, label, onChange) => {
        if (!input) return;
        input.addEventListener('input', () => {
          if (label) label.textContent = input.value;
          if (onChange) onChange();
          else state.markUnsaved();
        });
      };

      syncSlider(dom.navRightDeadzone, dom.navRightDeadzoneVal, syncNavSettingsFromUi);
      syncSlider(dom.navRightRepeatDelay, dom.navRightRepeatDelayVal, syncNavSettingsFromUi);
      syncSlider(dom.navRightCursorSpeed, dom.navRightCursorSpeedVal, syncNavSettingsFromUi);
      syncSlider(dom.navRightScrollAmount, dom.navRightScrollAmountVal, syncNavSettingsFromUi);
      syncSlider(dom.navLeftDeadzone, dom.navLeftDeadzoneVal, syncNavSettingsFromUi);
      syncSlider(dom.navLeftScrollAmount, dom.navLeftScrollAmountVal, syncNavSettingsFromUi);
      syncSlider(dom.navLeftCursorSpeed, dom.navLeftCursorSpeedVal, syncNavSettingsFromUi);
      syncSlider(dom.navLeftRepeatDelay, dom.navLeftRepeatDelayVal, syncNavSettingsFromUi);
      syncSlider(dom.navLateralPenalty, dom.navLateralPenaltyVal, syncNavSettingsFromUi);
      syncSlider(dom.navRowOverlap, dom.navRowOverlapVal, syncNavSettingsFromUi);

      dom.navRightMode?.addEventListener('change', () => {
        updateStickModeVisibility();
        syncNavSettingsFromUi();
      });
      dom.navLeftMode?.addEventListener('change', () => {
        updateStickModeVisibility();
        syncNavSettingsFromUi();
      });

      [
        dom.navEnabledInput, dom.navStrategyInput, dom.navRightEnabled, dom.navRightMode,
        dom.navRightAccel, dom.navRightDirectionMode, dom.navRightCursorColor, dom.navLeftEnabled,
        dom.navLeftMode, dom.navLeftCursorColor, dom.navWrapRows, dom.navWrapItems,
        ...Object.values(dom.navAxisInputs).flatMap(inputs => [inputs.stick, inputs.action])
      ].filter(Boolean).forEach(input => input.addEventListener('change', syncNavSettingsFromUi));

      dom.navSaveBtn?.addEventListener('click', saveSettings);
      dom.navResetBtn?.addEventListener('click', () => {
        if (!confirm('Reset navigation settings to defaults?')) return;
        state.getSettings().navSettings = structuredClone(DEFAULT_NAV_SETTINGS);
        state.markUnsaved();
        render();
        showToast('Navigation settings reset.');
      });

      updateNavDeadzoneRings();
      updateStickModeVisibility();
    }

    return { render, bind, updateNavDeadzoneRings, updateStickModeVisibility };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.NavigationSettings = { create };
})(typeof window !== 'undefined' ? window : globalThis);
