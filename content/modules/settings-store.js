/**
 * Remapad — Settings Store
 * MV3-compatible classic script; exposed via window.RemapadCS.SettingsStore.
 * Loads extension storage, merges defaults while preserving newly added nested
 * settings, resolves the active profile for the current hostname, and persists
 * Quick Map button mappings.
 */

(function (global) {
  'use strict';

  function create({ api, constants, hostname }) {
    const {
      DEFAULT_NAV_SETTINGS,
      DEFAULT_PROFILE,
      WEBSITE_MAPPINGS_DEFAULT,
      SITE_COLLECTIONS_DEFAULT
    } = constants;

    let settings = {
      iconStyle: 'auto',
      websiteMappings: { ...WEBSITE_MAPPINGS_DEFAULT },
      defaultMapping: { ...DEFAULT_PROFILE },
      enabledSites: {},
      globalEnabled: true,
      siteCollections: { ...SITE_COLLECTIONS_DEFAULT },
      navSettings: structuredClone(DEFAULT_NAV_SETTINGS),
      keyboardEnabled: true,
      keyboardTriggerMode: 'both',
      keyboardTriggerSelectors: [],
      keyboardLayout: 'qwerty',
      keyboardAutoDetect: true,
      siteKeyboardLayouts: {},
      siteKeyboardTriggerModes: {},
      siteKeyboardTriggerSelectors: {},
      customKeyboardLayouts: {},
      notificationSound: 'access_point',
      notificationVolume: 50
    };

    let activeProfile = { ...DEFAULT_PROFILE };
    let siteMappingActive = false;

    function mergeNavSettings(stored) {
      // Start from current defaults so newly added nested settings survive.
      // Then shallow-merge each known subsection, preserving user overrides.
      const merged = structuredClone(DEFAULT_NAV_SETTINGS);
      if (!stored || typeof stored !== 'object') return merged;

      if (stored.enabled !== undefined) merged.enabled = stored.enabled;
      if (stored.strategy) merged.strategy = stored.strategy;
      if (stored.rightStick && typeof stored.rightStick === 'object') {
        merged.rightStick = { ...merged.rightStick, ...stored.rightStick };
      }
      if (stored.leftStick && typeof stored.leftStick === 'object') {
        merged.leftStick = { ...merged.leftStick, ...stored.leftStick };
      }
      if (stored.axisMap && typeof stored.axisMap === 'object') {
        for (const dir of ['up', 'down', 'left', 'right']) {
          if (stored.axisMap[dir] && typeof stored.axisMap[dir] === 'object') {
            merged.axisMap[dir] = { ...merged.axisMap[dir], ...stored.axisMap[dir] };
          }
        }
      }
      if (stored.collectionGrid && typeof stored.collectionGrid === 'object') {
        merged.collectionGrid = { ...merged.collectionGrid, ...stored.collectionGrid };
      }
      return merged;
    }

    async function load() {
      const data = await api.storage.local.get([
        'iconStyle', 'websiteMappings', 'defaultMapping', 'profiles', 'enabledSites', 'globalEnabled', 'siteCollections', 'navSettings', 'muteActivation', 'notificationSound', 'notificationVolume', 'keyboardEnabled', 'keyboardTriggerMode', 'keyboardTriggerSelectors', 'keyboardLayout', 'keyboardAutoDetect', 'siteKeyboardLayouts', 'siteKeyboardTriggerModes', 'siteKeyboardTriggerSelectors', 'customKeyboardLayouts'
      ]);

      if (data.notificationSound && typeof data.notificationSound === 'string') settings.notificationSound = data.notificationSound;
      if (data.notificationVolume !== undefined && typeof data.notificationVolume === 'number') settings.notificationVolume = data.notificationVolume;
      if (data.keyboardEnabled !== undefined) settings.keyboardEnabled = data.keyboardEnabled;
      if (data.keyboardTriggerMode && typeof data.keyboardTriggerMode === 'string') settings.keyboardTriggerMode = data.keyboardTriggerMode;
      if (data.keyboardTriggerSelectors && Array.isArray(data.keyboardTriggerSelectors)) settings.keyboardTriggerSelectors = data.keyboardTriggerSelectors;
      if (data.keyboardLayout) settings.keyboardLayout = data.keyboardLayout;
      if (data.keyboardAutoDetect !== undefined) settings.keyboardAutoDetect = data.keyboardAutoDetect;
      if (data.siteKeyboardLayouts && typeof data.siteKeyboardLayouts === 'object') settings.siteKeyboardLayouts = data.siteKeyboardLayouts;
      if (data.siteKeyboardTriggerModes && typeof data.siteKeyboardTriggerModes === 'object') settings.siteKeyboardTriggerModes = data.siteKeyboardTriggerModes;
      if (data.siteKeyboardTriggerSelectors && typeof data.siteKeyboardTriggerSelectors === 'object') settings.siteKeyboardTriggerSelectors = data.siteKeyboardTriggerSelectors;
      if (data.customKeyboardLayouts && typeof data.customKeyboardLayouts === 'object') settings.customKeyboardLayouts = data.customKeyboardLayouts;

      if (data.iconStyle) settings.iconStyle = data.iconStyle;
      if (data.enabledSites) settings.enabledSites = data.enabledSites;
      if (data.globalEnabled !== undefined) settings.globalEnabled = data.globalEnabled;
      if (data.muteActivation !== undefined) settings.muteActivation = data.muteActivation;
      if (data.siteCollections && typeof data.siteCollections === 'object') {
        settings.siteCollections = data.siteCollections;
      }
      if (data.navSettings && typeof data.navSettings === 'object') {
        settings.navSettings = mergeNavSettings(data.navSettings);
      }

      let isMapped = false;

      if (data.profiles && Object.keys(data.profiles).length > 0) {
        const profiles = data.profiles;
        const defaultProfile = profiles['default'] || DEFAULT_PROFILE;
        const mappedVal = data.websiteMappings ? data.websiteMappings[hostname] : null;
        isMapped = mappedVal !== undefined && mappedVal !== null;
        if (typeof mappedVal === 'string') {
          activeProfile = profiles[mappedVal] || defaultProfile;
        } else if (mappedVal && typeof mappedVal === 'object') {
          activeProfile = mappedVal;
        } else {
          activeProfile = defaultProfile;
        }
      } else {
        if (data.defaultMapping) {
          settings.defaultMapping = data.defaultMapping;
        } else {
          settings.defaultMapping = { ...DEFAULT_PROFILE };
        }
        if (data.websiteMappings && typeof data.websiteMappings === 'object') {
          settings.websiteMappings = data.websiteMappings;
        } else {
          settings.websiteMappings = { ...WEBSITE_MAPPINGS_DEFAULT };
        }
        activeProfile = settings.websiteMappings[hostname] || settings.defaultMapping || DEFAULT_PROFILE;
        isMapped = settings.websiteMappings[hostname] !== undefined;
      }

      siteMappingActive = isMapped;

      // Ensure every button has a value: stored profiles may omit buttons or
      // come from the legacy `profiles` object, so overlay defaults on top.
      activeProfile = { ...DEFAULT_PROFILE, ...activeProfile };

      return { isMapped };
    }

    function getSettings() { return settings; }
    function getActiveProfile() { return activeProfile; }
    function isMapped() { return siteMappingActive; }
    function isSiteEnabled() { return settings.enabledSites[hostname] !== false; }
    function isQuickMapAvailable() { return settings.globalEnabled && isSiteEnabled(); }

    function setActiveProfile(profile) { activeProfile = profile; }
    function setSiteMappingActive(value) { siteMappingActive = value; }
    function updateWebsiteMappings(mappings) { settings.websiteMappings = mappings; }

    async function saveButtonMapping(button, actionValue) {
      // Re-read storage before writing to reduce stale in-memory overwrites and
      // preserve the latest mappings observed in storage.
      const data = await api.storage.local.get(['websiteMappings']);
      const websiteMappings = {
        ...(data.websiteMappings && typeof data.websiteMappings === 'object'
          ? data.websiteMappings
          : settings.websiteMappings)
      };
      const storedProfile = websiteMappings[hostname];
      const baseProfile = storedProfile && typeof storedProfile === 'object'
        ? storedProfile
        : activeProfile || settings.defaultMapping || DEFAULT_PROFILE;
      const updatedProfile = { ...baseProfile, [button]: actionValue };

      websiteMappings[hostname] = updatedProfile;
      await api.storage.local.set({ websiteMappings });
      settings.websiteMappings = websiteMappings;
      activeProfile = updatedProfile;
      return updatedProfile;
    }

    return {
      load,
      getSettings,
      getActiveProfile,
      isMapped,
      isSiteEnabled,
      isQuickMapAvailable,
      setActiveProfile,
      setSiteMappingActive,
      updateWebsiteMappings,
      saveButtonMapping,
      mergeNavSettings
    };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.SettingsStore = { create };
})(typeof window !== 'undefined' ? window : globalThis);
