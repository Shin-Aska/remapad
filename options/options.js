/**
 * Remapad Options — Composition Root
 * MV3-compatible classic script. Module scripts are ordered by options.html;
 * this file owns construction, render sequencing, and page startup only.
 */

;(function () {
  'use strict';

  const api = typeof chrome !== 'undefined' ? chrome : browser;
  const Options = window.RemapadOptions || {};
  const dom = Options.Dom.create();
  const state = Options.StateStore.create({ api, constants: Options.Constants });

  function showToast(message, type = '') {
    dom.toastEl.textContent = message;
    dom.toastEl.className = `toast ${type}`;
    dom.toastEl.classList.add('show');
    setTimeout(() => dom.toastEl.classList.remove('show'), 2500);
  }

  function renderAll() {
    if (dom.muteActivationToggle) {
      dom.muteActivationToggle.checked = !state.getSettings().muteActivation;
    }
    if (dom.notificationSoundSelect) {
      dom.notificationSoundSelect.value = state.getSettings().notificationSound || 'access_point';
    }
    if (dom.notificationVolumeSlider) {
      const vol = state.getSettings().notificationVolume !== undefined ? state.getSettings().notificationVolume : 50;
      dom.notificationVolumeSlider.value = vol;
      if (dom.notificationVolumeVal) dom.notificationVolumeVal.textContent = vol + '%';
    }
    mappingEditor.renderEditorSiteSelect();
    mappingEditor.renderWebsiteMappings();
    mappingEditor.renderIconStyles();
    mappingEditor.populateVisualLabels();
    collectionSettings.render();
    navigationSettings.render();
    keyboardSettings.render();
  }

  async function saveSettings() {
    if (dom.muteActivationToggle) {
      state.getSettings().muteActivation = !dom.muteActivationToggle.checked;
    }
    if (dom.notificationSoundSelect) {
      state.getSettings().notificationSound = dom.notificationSoundSelect.value;
    }
    if (dom.notificationVolumeSlider) {
      state.getSettings().notificationVolume = parseInt(dom.notificationVolumeSlider.value, 10);
    }
    const result = await state.save();
    if (result.ok) {
      showToast('Changes saved successfully!', 'success');
      renderAll();
    } else {
      showToast('Error saving settings: ' + result.error.message);
    }
  }

  const modal = Options.ConfigModal.create({ constants: Options.Constants, dom });
  const cursor = Options.VirtualCursor.create({ state, constants: Options.Constants, utils: Options.Utils, dom });
  const navigationSettings = Options.NavigationSettings.create({
    api,
    state,
    constants: Options.Constants,
    dom,
    showToast,
    saveSettings
  });
  const keyboardSettings = Options.KeyboardSettings.create({ state, dom, saveSettings });
  const collectionSettings = Options.CollectionSettings.create({
    api,
    state,
    constants: Options.Constants,
    utils: Options.Utils,
    showToast,
    saveSettings
  });
  const mappingEditor = Options.MappingEditor.create({
    state,
    constants: Options.Constants,
    utils: Options.Utils,
    dom,
    modal,
    renderAll,
    saveSettings,
    showToast,
    onDocumentClick: cursor.handleDocumentClick
  });
  const tabs = Options.Tabs.create({ collectionSettings, navigationSettings, keyboardSettings });
  const optionsTutorial = Options.OptionsTutorial.create({ api, showToast });
  const gamepad = Options.Gamepad.create({
    state,
    constants: Options.Constants,
    utils: Options.Utils,
    dom,
    mappingEditor,
    cursor,
    modal,
    optionsTutorial,
    switchOptionsTab: tabs.switchBy
  });

  // Listeners that existed before async storage hydration remain registered
  // before load(), preserving controller-connect and page interaction ordering.
  mappingEditor.bind();
  modal.bind();
  gamepad.bind();
  keyboardSettings.bind();
  collectionSettings.bind({
    addButton: dom.collectionAddSiteBtn,
    input: dom.collectionNewSiteInput,
    saveAllButton: dom.collectionSaveAllBtn
  });
  optionsTutorial.bindResetControls(dom);

  (async () => {
    const loadResult = await state.load();
    if (loadResult.ok) renderAll();
    tabs.init();
    navigationSettings.bind();
    gamepad.startPolling();
    optionsTutorial.showIfNeeded();
  })();
})();
