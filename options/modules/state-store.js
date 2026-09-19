/**
 * Remapad Options — State Store
 * MV3-compatible classic script; exposed via window.RemapadOptions.StateStore.
 * Owns storage migration, defaults, selected profiles, and unsaved-change state.
 */

(function (global) {
  'use strict';

  function create({ api, constants }) {
    const {
      RESERVED_OPTIONS_KEY,
      OPTIONS_PAGE_PROFILE,
      DEFAULT_PROFILE,
      DEFAULT_NAV_SETTINGS
    } = constants;

    let settings = {
      iconStyle: 'auto',
      websiteMappings: {
        [RESERVED_OPTIONS_KEY]: { ...OPTIONS_PAGE_PROFILE },
        'netflix.com': { ...DEFAULT_PROFILE },
        'primevideo.com': { ...DEFAULT_PROFILE }
      },
      defaultMapping: { ...DEFAULT_PROFILE },
      enabledSites: {},
      globalEnabled: true,
      siteCollections: {
        'netflix.com': {
          containerSelector: '.lolomoRow',
          itemSelector: '.title-card-container',
          searchTriggerSelector: '.searchTab, [data-uia="search-tab"]',
          searchInputSelector: 'input[type="search"], input[data-uia*="search" i]'
        },
        'primevideo.com': {
          containerSelector: '[data-testid="grid-lockup"], ._1h3rtFr, .wv_A6',
          itemSelector: '[data-testid="card"], ._1t8qyG2, .P2TLe',
          searchTriggerSelector: 'button[aria-label*="search" i], [data-testid*="search" i][role="button"]',
          searchInputSelector: '[data-testid="search-field"] input, .nav-search-field input, input[type="search"]'
        }
      },
      navSettings: structuredClone(DEFAULT_NAV_SETTINGS),
      muteActivation: false,
      notificationSound: 'access_point',
      notificationVolume: 50,
      keyboardEnabled: true,
      keyboardLayout: 'qwerty',
      keyboardAutoDetect: true,
      keyboardTriggerMode: 'both',
      keyboardTriggerSelectors: [],
      siteKeyboardLayouts: {},
      siteKeyboardTriggerModes: {},
      siteKeyboardTriggerSelectors: {},
      customKeyboardLayouts: null
    };
    let selectedSiteKey = 'default';
    let selectedCollectionSite = '';
    let unsavedChanges = false;

    function mergeProfileWithDefaults(profile) {
      return profile && typeof profile === 'object'
        ? { ...DEFAULT_PROFILE, ...profile }
        : { ...DEFAULT_PROFILE };
    }

    function mergeOptionsProfileWithDefaults(profile) {
      return profile && typeof profile === 'object'
        ? { ...OPTIONS_PAGE_PROFILE, ...profile }
        : { ...OPTIONS_PAGE_PROFILE };
    }

    function mergeNavSettings(stored) {
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
        for (const direction of ['up', 'down', 'left', 'right']) {
          if (stored.axisMap[direction] && typeof stored.axisMap[direction] === 'object') {
            merged.axisMap[direction] = { ...merged.axisMap[direction], ...stored.axisMap[direction] };
          }
        }
      }
      if (stored.collectionGrid && typeof stored.collectionGrid === 'object') {
        merged.collectionGrid = { ...merged.collectionGrid, ...stored.collectionGrid };
      }
      return merged;
    }

    async function load() {
      try {
        const data = await api.storage.local.get([
          'iconStyle', 'websiteMappings', 'defaultMapping', 'profiles', 'enabledSites', 'globalEnabled', 'siteCollections', 'navSettings', 'muteActivation', 'notificationSound', 'notificationVolume', 'keyboardEnabled', 'keyboardLayout', 'keyboardAutoDetect', 'keyboardTriggerMode', 'keyboardTriggerSelectors', 'siteKeyboardLayouts', 'siteKeyboardTriggerModes', 'siteKeyboardTriggerSelectors', 'customKeyboardLayouts'
        ]);

        if (data.iconStyle) settings.iconStyle = data.iconStyle;
        if (data.enabledSites) settings.enabledSites = data.enabledSites;
        if (data.globalEnabled !== undefined) settings.globalEnabled = data.globalEnabled;
        if (data.muteActivation !== undefined) settings.muteActivation = data.muteActivation;
        if (data.notificationSound) settings.notificationSound = data.notificationSound;
        if (data.notificationVolume !== undefined && typeof data.notificationVolume === 'number') settings.notificationVolume = data.notificationVolume;
        if (data.keyboardEnabled !== undefined) settings.keyboardEnabled = data.keyboardEnabled;
        if (data.keyboardLayout) settings.keyboardLayout = data.keyboardLayout;
        if (data.keyboardAutoDetect !== undefined) settings.keyboardAutoDetect = data.keyboardAutoDetect;
        if (data.keyboardTriggerMode) settings.keyboardTriggerMode = data.keyboardTriggerMode;
        if (Array.isArray(data.keyboardTriggerSelectors)) settings.keyboardTriggerSelectors = data.keyboardTriggerSelectors;
        if (data.siteKeyboardLayouts && typeof data.siteKeyboardLayouts === 'object') settings.siteKeyboardLayouts = data.siteKeyboardLayouts;
        if (data.siteKeyboardTriggerModes && typeof data.siteKeyboardTriggerModes === 'object') settings.siteKeyboardTriggerModes = data.siteKeyboardTriggerModes;
        if (data.siteKeyboardTriggerSelectors && typeof data.siteKeyboardTriggerSelectors === 'object') settings.siteKeyboardTriggerSelectors = data.siteKeyboardTriggerSelectors;
        if (data.customKeyboardLayouts) settings.customKeyboardLayouts = data.customKeyboardLayouts;
        if (data.siteCollections && typeof data.siteCollections === 'object') {
          const builtInCollections = settings.siteCollections;
          settings.siteCollections = Object.fromEntries(
            Object.entries(data.siteCollections).map(([site, config]) => [
              site,
              {
                ...(builtInCollections[site] || {}),
                ...(config && typeof config === 'object' ? config : {})
              }
            ])
          );
        }
        if (data.navSettings && typeof data.navSettings === 'object') settings.navSettings = mergeNavSettings(data.navSettings);

        if (data.profiles && Object.keys(data.profiles).length > 0) {
          const profiles = data.profiles;
          const defaultProfile = mergeProfileWithDefaults(profiles.default);
          settings.defaultMapping = { ...defaultProfile };
          settings.websiteMappings = {};
          if (data.websiteMappings) {
            Object.keys(data.websiteMappings).forEach(domain => {
              const value = data.websiteMappings[domain];
              if (typeof value === 'string') {
                settings.websiteMappings[domain] = mergeProfileWithDefaults(profiles[value] || defaultProfile);
              } else if (value && typeof value === 'object') {
                settings.websiteMappings[domain] = mergeProfileWithDefaults(value);
              }
            });
          }
          settings.websiteMappings[RESERVED_OPTIONS_KEY] = mergeOptionsProfileWithDefaults(OPTIONS_PAGE_PROFILE);
          await api.storage.local.set({
            defaultMapping: settings.defaultMapping,
            websiteMappings: settings.websiteMappings
          });
          await api.storage.local.remove('profiles');
        } else {
          settings.defaultMapping = data.defaultMapping
            ? mergeProfileWithDefaults(data.defaultMapping)
            : { ...DEFAULT_PROFILE };
          settings.websiteMappings = data.websiteMappings && Object.keys(data.websiteMappings).length > 0
            ? Object.fromEntries(Object.entries(data.websiteMappings).map(([domain, profile]) => [domain, mergeProfileWithDefaults(profile)]))
            : {
              'netflix.com': { ...DEFAULT_PROFILE },
              'primevideo.com': { ...DEFAULT_PROFILE }
            };
          settings.websiteMappings[RESERVED_OPTIONS_KEY] = mergeOptionsProfileWithDefaults(
            data.websiteMappings && data.websiteMappings[RESERVED_OPTIONS_KEY]
              ? data.websiteMappings[RESERVED_OPTIONS_KEY]
              : OPTIONS_PAGE_PROFILE
          );
        }

        const params = new URLSearchParams(global.location.search);
        const siteParam = params.get('site');
        if (siteParam) {
          const cleanSite = siteParam.trim().toLowerCase().replace(/^www\./, '');
          if (cleanSite && settings.websiteMappings[cleanSite]) {
            selectedSiteKey = cleanSite;
          }
          const cleanUrl = global.location.protocol + '//' + global.location.host + global.location.pathname;
          global.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        }
        return { ok: true };
      } catch (error) {
        console.error('[Remapad Options] Load settings failed:', error);
        return { ok: false, error };
      }
    }

    async function save() {
      try {
        await api.storage.local.set({
          iconStyle: settings.iconStyle,
          websiteMappings: settings.websiteMappings,
          defaultMapping: settings.defaultMapping,
          enabledSites: settings.enabledSites,
          globalEnabled: settings.globalEnabled,
          siteCollections: settings.siteCollections,
          navSettings: settings.navSettings,
          muteActivation: settings.muteActivation,
          notificationSound: settings.notificationSound,
          notificationVolume: settings.notificationVolume,
          keyboardEnabled: settings.keyboardEnabled,
          keyboardLayout: settings.keyboardLayout,
          keyboardAutoDetect: settings.keyboardAutoDetect,
          keyboardTriggerMode: settings.keyboardTriggerMode,
          keyboardTriggerSelectors: settings.keyboardTriggerSelectors,
          siteKeyboardLayouts: settings.siteKeyboardLayouts,
          siteKeyboardTriggerModes: settings.siteKeyboardTriggerModes,
          siteKeyboardTriggerSelectors: settings.siteKeyboardTriggerSelectors,
          customKeyboardLayouts: settings.customKeyboardLayouts
        });
        unsavedChanges = false;
        return { ok: true };
      } catch (error) {
        return { ok: false, error };
      }
    }

    return {
      load,
      save,
      mergeNavSettings,
      getSettings: () => settings,
      getSelectedSiteKey: () => selectedSiteKey,
      setSelectedSiteKey: value => { selectedSiteKey = value; },
      getSelectedCollectionSite: () => selectedCollectionSite,
      setSelectedCollectionSite: value => { selectedCollectionSite = value; },
      markUnsaved: () => { unsavedChanges = true; },
      getUnsavedChanges: () => unsavedChanges
    };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.StateStore = { create };
})(typeof window !== 'undefined' ? window : globalThis);
