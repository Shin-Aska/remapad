/**
 * Remapad Options — Keyboard Settings
 * MV3-compatible classic script; exposed via window.RemapadOptions.KeyboardSettings.
 */

(function (global) {
  'use strict';

  function create({ state, dom, saveSettings }) {
    function playSoundPreview(presetKey) {
      try {
        const utils = window.RemapadCS?.Utils;
        const volSetting = state.getSettings().notificationVolume;
        const volume = (typeof volSetting === 'number' ? volSetting : 50) / 100;
        if (utils && typeof utils.playNotificationSound === 'function') {
          utils.playNotificationSound(presetKey, { volume }).catch(e => console.warn('[Remapad Options] Play sound preview failed:', e));
          return;
        }
        const createWav = utils?.createWavProbeDataUrl;
        if (!createWav) return;
        const dataUrl = createWav(false, presetKey);
        const audio = new Audio(dataUrl);
        audio.volume = volume;
        audio.play().catch(e => console.warn('[Remapad Options] Play sound preview failed:', e));
      } catch (err) {
        console.error('[Remapad Options] Sound preview error:', err);
      }
    }

    function render() {
      const settings = state.getSettings();
      if (dom.keyboardEnabledToggle) dom.keyboardEnabledToggle.checked = !!settings.keyboardEnabled;
      if (dom.keyboardTriggerModeSelect) dom.keyboardTriggerModeSelect.value = settings.keyboardTriggerMode || 'both';
      const selectorsInput = document.getElementById('keyboard-trigger-selectors-input');
      if (selectorsInput) selectorsInput.value = (settings.keyboardTriggerSelectors || []).join('\n');
      if (dom.keyboardLayoutSelect) dom.keyboardLayoutSelect.value = settings.keyboardLayout || 'qwerty';
      if (dom.keyboardAutodetectToggle) dom.keyboardAutodetectToggle.checked = !!settings.keyboardAutoDetect;
      if (dom.muteActivationToggle) dom.muteActivationToggle.checked = !settings.muteActivation;
      if (dom.notificationSoundSelect) dom.notificationSoundSelect.value = settings.notificationSound || 'access_point';
      const vol = settings.notificationVolume !== undefined ? settings.notificationVolume : 50;
      if (dom.notificationVolumeSlider) dom.notificationVolumeSlider.value = vol;
      if (dom.notificationVolumeVal) dom.notificationVolumeVal.textContent = vol + '%';
    }

    function bind() {
      if (dom.keyboardLayoutSelect) {
        dom.keyboardLayoutSelect.addEventListener('change', () => {
          const settings = state.getSettings();
          settings.keyboardLayout = dom.keyboardLayoutSelect.value;
          state.markUnsaved();
          if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.setLayout) {
            RemapadKeyboard.setLayout(settings.keyboardLayout);
          }
          saveSettings();
        });
      }
      if (dom.keyboardAutodetectToggle) {
        dom.keyboardAutodetectToggle.addEventListener('change', () => {
          state.getSettings().keyboardAutoDetect = dom.keyboardAutodetectToggle.checked;
          state.markUnsaved();
          saveSettings();
        });
      }
      if (dom.keyboardEnabledToggle) {
        dom.keyboardEnabledToggle.addEventListener('change', () => {
          state.getSettings().keyboardEnabled = dom.keyboardEnabledToggle.checked;
          state.markUnsaved();
          saveSettings();
        });
      }
      if (dom.keyboardTriggerModeSelect) {
        dom.keyboardTriggerModeSelect.addEventListener('change', () => {
          state.getSettings().keyboardTriggerMode = dom.keyboardTriggerModeSelect.value;
          state.markUnsaved();
          saveSettings();
        });
      }
      if (dom.keyboardTriggerSelectorsSave) {
        dom.keyboardTriggerSelectorsSave.addEventListener('click', () => {
          const input = document.getElementById('keyboard-trigger-selectors-input');
          if (!input) return;
          state.getSettings().keyboardTriggerSelectors = input.value
            .split('\n')
            .map(selector => selector.trim())
            .filter(selector => selector.length > 0);
          state.markUnsaved();
          saveSettings();
        });
      }
      dom.muteActivationToggle?.addEventListener('change', () => {
        state.getSettings().muteActivation = !dom.muteActivationToggle.checked;
        saveSettings();
      });
      if (dom.notificationSoundSelect) {
        dom.notificationSoundSelect.addEventListener('change', () => {
          state.getSettings().notificationSound = dom.notificationSoundSelect.value;
          saveSettings();
          playSoundPreview(dom.notificationSoundSelect.value);
        });
      }
      if (dom.notificationVolumeSlider) {
        dom.notificationVolumeSlider.addEventListener('input', () => {
          const vol = parseInt(dom.notificationVolumeSlider.value, 10);
          if (dom.notificationVolumeVal) dom.notificationVolumeVal.textContent = vol + '%';
          state.getSettings().notificationVolume = vol;
        });
        dom.notificationVolumeSlider.addEventListener('change', () => {
          const vol = parseInt(dom.notificationVolumeSlider.value, 10);
          state.getSettings().notificationVolume = vol;
          saveSettings();
          playSoundPreview(dom.notificationSoundSelect ? dom.notificationSoundSelect.value : 'access_point');
        });
      }
      if (dom.testSoundBtn) {
        dom.testSoundBtn.addEventListener('click', () => {
          const selected = dom.notificationSoundSelect ? dom.notificationSoundSelect.value : (state.getSettings().notificationSound || 'access_point');
          playSoundPreview(selected);
        });
      }
    }

    return { render, bind };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.KeyboardSettings = { create };
})(typeof window !== 'undefined' ? window : globalThis);
