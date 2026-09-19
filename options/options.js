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
  let pendingSiteTabId = null;

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

  function showRequestedSiteAddPrompt() {
    const params = new URLSearchParams(window.location.search);
    const requestedSite = Options.Utils.parseDomain(params.get('addSite') || '');
    if (!requestedSite || !requestedSite.includes('.')) return false;

    const sourceTabId = Number.parseInt(params.get('sourceTabId') || '', 10);
    pendingSiteTabId = Number.isInteger(sourceTabId) && sourceTabId >= 0 ? sourceTabId : null;

    dom.newSiteInput.value = requestedSite;
    dom.siteAddGuidanceDomain.textContent = requestedSite;
    dom.siteAddGuidance.hidden = false;
    dom.websiteMappingsCard.classList.add('site-add-prompt');

    requestAnimationFrame(() => {
      dom.websiteMappingsCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      dom.newSiteInput.focus({ preventScroll: true });
      dom.newSiteInput.select();
    });

    params.delete('addSite');
    params.delete('sourceTabId');
    const query = params.toString();
    const cleanUrl = window.location.pathname + (query ? '?' + query : '');
    window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    return true;
  }

  async function activateSiteMapping(domain) {
    if (pendingSiteTabId === null) return { success: true, reloaded: false };

    const tabId = pendingSiteTabId;
    pendingSiteTabId = null;
    try {
      const response = await api.runtime.sendMessage({
        type: 'ACTIVATE_SITE_MAPPING',
        hostname: domain,
        tabId
      });
      return response || { success: false, reloaded: false };
    } catch (error) {
      console.warn('[Remapad Options] Unable to activate mapped site tab:', error);
      return { success: false, reloaded: false, error: error.message };
    }
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
    return result.ok;
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
    api,
    state,
    constants: Options.Constants,
    utils: Options.Utils,
    dom,
    modal,
    renderAll,
    saveSettings,
    showToast,
    activateSiteMapping,
    onDocumentClick: cursor.handleDocumentClick
  });
  const reportIssues = Options.ReportIssues ? Options.ReportIssues.create({ dom, showToast }) : null;
  const tabs = Options.Tabs.create({ collectionSettings, navigationSettings, keyboardSettings, reportIssues });
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
    switchOptionsTab: tabs.switchBy,
    reportIssues
  });

  // Listeners that existed before async storage hydration remain registered
  // before load(), preserving controller-connect and page interaction ordering.
  mappingEditor.bind();
  modal.bind();
  gamepad.bind();
  keyboardSettings.bind();
  if (reportIssues) reportIssues.bind();
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
    if (reportIssues) reportIssues.prefillFromUrl();

    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam === 'report-issues' || tabParam === 'report') {
      tabs.activateTabById('tab-btn-report-issues');
    }

    const showingSiteAddPrompt = loadResult.ok && showRequestedSiteAddPrompt();
    gamepad.startPolling();
    if (!showingSiteAddPrompt) optionsTutorial.showIfNeeded();
  })();
})();
