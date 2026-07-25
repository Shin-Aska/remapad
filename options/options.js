/**
 * Remapad Options — Visual Controller & Profiles Mapping Editor
 */

'use strict';

const api = typeof chrome !== 'undefined' ? chrome : browser;

// ─── Constants & Default Settings ────────────────────────────────────────────

const RESERVED_OPTIONS_KEY = '__remapad_options__';

const WEBSITE_MAPPINGS_DEFAULT = {
  'netflix.com':    'default',
  'primevideo.com': 'default',
};

const FRIENDLY_NAMES = {
  [RESERVED_OPTIONS_KEY]: 'Remapad Settings',
  'netflix.com': 'Netflix',
  'primevideo.com': 'Prime Video',
  'youtube.com': 'YouTube',
  'twitch.tv': 'Twitch',
  'disneyplus.com': 'Disney+',
  'hulu.com': 'Hulu',
  'max.com': 'Max'
};

const OPTIONS_PAGE_PROFILE = {
  '0': 'select',
  '1': 'back',
  '2': 'none',
  '3': 'none',
  '4': 'prev_tab',
  '5': 'next_tab',
  '6': 'none',
  '7': 'none',
  '8': 'none',
  '9': 'none',
  '10': 'none',
  '11': 'none',
  '12': 'scroll_up',
  '13': 'scroll_down',
  '14': 'scroll_left',
  '15': 'scroll_right'
};

function getFriendlyLabel(domain) {
  if (FRIENDLY_NAMES[domain]) return FRIENDLY_NAMES[domain];
  const parts = domain.split('.');
  if (parts.length > 0) {
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  return domain;
}

const DEFAULT_PROFILE = {
  "0": "click",          // Cross / A
  "1": "back",           // Circle / B
  "2": "fullscreen",     // Square / X
  "3": "search",         // Triangle / Y
  "4": "seek_backward",  // L1 Bumper
  "5": "seek_forward",   // R1 Bumper
  "6": "volume_down",    // L2 Trigger
  "7": "volume_up",      // R2 Trigger
  "8": "toggle_play",    // Select
  "9": "toggle_hud",     // Start
  "10": "none",          // L3 Stick Click
  "11": "none",          // R3 Stick Click
  "12": "scroll_up",     // D-Pad Up
  "13": "scroll_down",   // D-Pad Down
  "14": "scroll_left",   // D-Pad Left
  "15": "scroll_right"   // D-Pad Right
};

const DEFAULT_NAV_SETTINGS = {
  enabled: true,
  strategy: 'auto',
  rightStick: {
    enabled: true,
    mode: 'cursor',
    deadzone: 0.3,
    repeatDelayMs: 150,
    repeatAcceleration: true,
    directionMode: 'dominant-axis',
    cursorSpeed: 800,
    cursorColor: '#e50914'
  },
  leftStick: {
    enabled: true,
    mode: 'scroll',
    deadzone: 0.3,
    scrollAmountPx: 150,
    cursorSpeed: 800,
    cursorColor: '#00a8e1'
  },
  axisMap: {
    up:    { stick: 'right', direction: 'up',    action: 'nav_up' },
    down:  { stick: 'right', direction: 'down',  action: 'nav_down' },
    left:  { stick: 'right', direction: 'left',  action: 'nav_left' },
    right: { stick: 'right', direction: 'right', action: 'nav_right' }
  },
  collectionGrid: {
    wrapRows: false,
    wrapItems: false,
    lateralPenalty: 3,
    rowOverlapThreshold: 0.5
  }
};

const ICON_STYLES = [
  {
    id:   'playstation',
    name: 'PlayStation (DualSense)',
    sub:  '✕ and ○ Layout',
    btns: ['✕', '○'],
  },
  {
    id:   'xbox',
    name: 'Xbox (Series X/S)',
    sub:  'A and B Layout',
    btns: ['A', 'B'],
  },
  {
    id:   'nintendo',
    name: 'Nintendo (Switch)',
    sub:  'Inverted Layout',
    btns: ['A', 'B'],
  },
];

const ACTION_OPTIONS = [
  { value: 'none',                 label: '-- Unmapped --'               },
  { value: 'click',                label: 'Select / Click'               },
  { value: 'back',                 label: 'Go Back'                      },
  { value: 'search',               label: 'Search Bar'                   },
  { value: 'fullscreen',           label: 'Toggle Fullscreen'            },
  { value: 'toggle_play',          label: 'Play / Pause'                 },
  { value: 'scroll_up',            label: 'Scroll Up'                    },
  { value: 'scroll_down',          label: 'Scroll Down'                  },
  { value: 'scroll_left',          label: 'Scroll Left'                  },
  { value: 'scroll_right',         label: 'Scroll Right'                 },
  { value: 'focus_next',           label: 'Focus Next Element'           },
  { value: 'focus_prev',           label: 'Focus Previous Element'       },
  { value: 'toggle_hud',           label: 'Toggle Navigation Guide'      },
  { value: 'volume_up',            label: 'Volume Up'                    },
  { value: 'volume_down',          label: 'Volume Down'                  },
  { value: 'seek_forward',         label: 'Seek Forward'                 },
  { value: 'seek_backward',        label: 'Seek Backward'                },
  { value: 'next_tab',             label: 'Next Tab'                     },
  { value: 'prev_tab',             label: 'Previous Tab'                 },
  { value: 'close_tab',            label: 'Close Active Tab'             },
  { value: 'open_options',         label: 'Open Options Editor'          },
  // Collection navigation
  { value: 'nav_next_collection',  label: '⬇ Next Row (Collection Nav)'  },
  { value: 'nav_prev_collection',  label: '⬆ Prev Row (Collection Nav)'  },
  { value: 'nav_next_item',        label: '➡ Next Item (Collection Nav)' },
  { value: 'nav_prev_item',        label: '⬅ Prev Item (Collection Nav)' },
  // Spatial navigation
  { value: 'nav_up',               label: 'Navigate Up'                },
  { value: 'nav_down',             label: 'Navigate Down'              },
  { value: 'nav_left',             label: 'Navigate Left'              },
  { value: 'nav_right',            label: 'Navigate Right'             },
  { value: 'select',               label: 'Select / Activate'          },
  { value: 'back',                 label: 'Back / Cancel'              },
  { value: 'prev_tab',             label: 'Previous Tab'               },
  { value: 'next_tab',             label: 'Next Tab'                   },
  { value: 'focus_up',             label: 'Focus Up'                   },
  { value: 'focus_down',           label: 'Focus Down'                 },
  { value: 'focus_left',           label: 'Focus Left'                 },
  { value: 'focus_right',          label: 'Focus Right'                },
  // Advanced
  { value: 'click_element',  label: 'Click CSS Element...'              },
  { value: 'hover_element',  label: 'Hover CSS Element...'              },
  { value: 'focus_element',  label: 'Focus CSS Element...'              },
  { value: 'dom_action',     label: 'Direct DOM Action...'              },
  { value: 'press_key',      label: 'Press Keyboard Key... (Legacy)'    }
];

const DOM_ACTION_LABELS = {
  click: 'Click',
  focus: 'Focus',
  scroll: 'Scroll to',
  'set-value': 'Set value',
  'toggle-attribute': 'Toggle attribute',
  'toggle-media': 'Play/Pause media'
};

const TOGGLEABLE_DOM_ATTRIBUTES = new Set([
  'hidden',
  'disabled',
  'open',
  'checked',
  'selected',
  'muted',
  'controls',
  'loop',
  'autoplay'
]);

const BUTTON_NAMES = {
  "0": "Cross (A)", "1": "Circle (B)", "2": "Square (X)", "3": "Triangle (Y)",
  "4": "L1 Bumper", "5": "R1 Bumper", "6": "L2 Trigger", "7": "R2 Trigger",
  "8": "Select Button", "9": "Start Button",
  "10": "L3 Click", "11": "R3 Click",
  "12": "D-Pad Up", "13": "D-Pad Down",
  "14": "D-Pad Left", "15": "D-Pad Right"
};

// ─── State ────────────────────────────────────────────────────────────────────

let settings = {
  iconStyle:       'playstation',
  websiteMappings: {
    [RESERVED_OPTIONS_KEY]: { ...OPTIONS_PAGE_PROFILE },
    'netflix.com':    { ...DEFAULT_PROFILE },
    'primevideo.com': { ...DEFAULT_PROFILE }
  },
  defaultMapping:  { ...DEFAULT_PROFILE },
  enabledSites:    {},
  globalEnabled:   true,
  siteCollections: {
    'netflix.com': {
      containerSelector: '.lolomoRow',
      itemSelector: '.title-card-container'
    },
    'primevideo.com': {
      containerSelector: '[data-testid="grid-lockup"], ._1h3rtFr, .wv_A6',
      itemSelector: '[data-testid="card"], ._1t8qyG2, .P2TLe'
    }
  },
  navSettings: structuredClone(DEFAULT_NAV_SETTINGS),
  muteActivation: false
};

let selectedSiteKey  = 'default';
let selectedCollectionSite = '';
let activeCalloutBtn = null;
let unsavedChanges   = false;

// ─── DOM Elements ─────────────────────────────────────────────────────────────

const muteActivationToggle = document.getElementById('mute-activation-toggle');
const editorSiteSelect    = document.getElementById('editor-site-select');
const mappingsListEl      = document.getElementById('website-mappings-list');
const iconStyleListEl     = document.getElementById('icon-style-list');
const statusBadgeEl       = document.getElementById('status-badge');
const statusDotEl         = document.getElementById('status-dot');
const statusTextEl        = document.getElementById('status-text');
const deviceNameEl        = document.getElementById('device-name');
const deviceBatteryEl     = document.getElementById('device-battery');
const batteryTextEl       = document.getElementById('battery-text');
const resetBtn            = document.getElementById('reset-btn');
const saveBtn             = document.getElementById('save-btn');
const actionDropdown      = document.getElementById('action-dropdown');
const actionSelect        = document.getElementById('action-select');
const testInputBtn        = document.getElementById('test-input-btn');
const toastEl             = document.getElementById('toast');
const navControllerNameEl = document.getElementById('nav-controller-name');

// Config Modal DOM Elements
const configModal           = document.getElementById('config-modal');
const modalTitle            = document.getElementById('modal-title');
const modalCloseX           = document.getElementById('modal-close-x');
const modalKeyboardSec      = document.getElementById('modal-keyboard-sec');
const keyboardCaptureBox    = document.getElementById('keyboard-capture-box');
const detectedKeyDisplay    = document.getElementById('detected-key-display');
const modalSelectorSec      = document.getElementById('modal-selector-sec');
const modalDomActionSec     = document.getElementById('modal-dom-action-sec');
const commonSelectorsSelect = document.getElementById('common-selectors-select');
const customSelectorInput   = document.getElementById('custom-selector-input');
const domOperationSelect    = document.getElementById('dom-operation-select');
const domValueGroup         = document.getElementById('dom-value-group');
const domValueLabel         = document.getElementById('dom-value-label');
const domValueInput         = document.getElementById('dom-value-input');
const modalCancelBtn        = document.getElementById('modal-cancel-btn');
const modalConfirmBtn       = document.getElementById('modal-confirm-btn');
const newSiteInput        = document.getElementById('new-site-input');
const addSiteBtn          = document.getElementById('add-site-btn');

const navEnabledInput     = document.getElementById('nav-enabled');
const navStrategyInput    = document.getElementById('nav-strategy');
const navRightEnabled     = document.getElementById('nav-right-enabled');
const navRightMode        = document.getElementById('nav-right-mode');
const navRightDeadzone    = document.getElementById('nav-right-deadzone');
const navRightDeadzoneVal = document.getElementById('nav-right-deadzone-val');
const navRightRepeatDelay    = document.getElementById('nav-right-repeat-delay');
const navRightRepeatDelayVal = document.getElementById('nav-right-repeat-delay-val');
const navRightCursorSpeed    = document.getElementById('nav-right-cursor-speed');
const navRightCursorSpeedVal = document.getElementById('nav-right-cursor-speed-val');
const navRightScrollAmount   = document.getElementById('nav-right-scroll-amount');
const navRightScrollAmountVal= document.getElementById('nav-right-scroll-amount-val');
const navRightAccel          = document.getElementById('nav-right-accel');
const navRightDirectionMode  = document.getElementById('nav-right-direction-mode');
const navLeftEnabled      = document.getElementById('nav-left-enabled');
const navLeftMode         = document.getElementById('nav-left-mode');
const navLeftDeadzone     = document.getElementById('nav-left-deadzone');
const navLeftDeadzoneVal  = document.getElementById('nav-left-deadzone-val');
const navLeftScrollAmount = document.getElementById('nav-left-scroll-amount');
const navLeftScrollAmountVal = document.getElementById('nav-left-scroll-amount-val');
const navLeftCursorSpeed    = document.getElementById('nav-left-cursor-speed');
const navLeftCursorSpeedVal = document.getElementById('nav-left-cursor-speed-val');
const navLeftRepeatDelay    = document.getElementById('nav-left-repeat-delay');
const navLeftRepeatDelayVal = document.getElementById('nav-left-repeat-delay-val');
const navLeftDirectionMode  = document.getElementById('nav-left-direction-mode');
const navRightCursorColor   = document.getElementById('nav-right-cursor-color');
const navLeftCursorColor    = document.getElementById('nav-left-cursor-color');
const navAxisInputs       = {
  up:    { stick: document.getElementById('nav-axis-up-stick'),    action: document.getElementById('nav-axis-up-action')    },
  down:  { stick: document.getElementById('nav-axis-down-stick'),  action: document.getElementById('nav-axis-down-action')  },
  left:  { stick: document.getElementById('nav-axis-left-stick'),  action: document.getElementById('nav-axis-left-action')  },
  right: { stick: document.getElementById('nav-axis-right-stick'), action: document.getElementById('nav-axis-right-action') }
};
const navWrapRows         = document.getElementById('nav-wrap-rows');
const navWrapItems        = document.getElementById('nav-wrap-items');
const navLateralPenalty   = document.getElementById('nav-lateral-penalty');
const navLateralPenaltyVal= document.getElementById('nav-lateral-penalty-val');
const navRowOverlap       = document.getElementById('nav-row-overlap');
const navRowOverlapVal    = document.getElementById('nav-row-overlap-val');
const navSaveBtn          = document.getElementById('nav-save-btn');
const navResetBtn         = document.getElementById('nav-reset-btn');

const navStatusName       = document.getElementById('nav-status-name');
const navStatusBadge      = document.getElementById('nav-status-badge');
const navStatusDot        = document.getElementById('nav-status-dot');
const navStatusText       = document.getElementById('nav-status-text');

const leftStickDot        = document.getElementById('left-stick-dot');
const leftStickDeadzone   = document.getElementById('left-stick-deadzone');
const leftAxisX           = document.getElementById('left-axis-x');
const leftAxisY           = document.getElementById('left-axis-y');
const leftAxisXBottom     = document.getElementById('left-axis-x-bottom');
const leftAxisYBottom     = document.getElementById('left-axis-y-bottom');

const rightStickDot       = document.getElementById('right-stick-dot');
const rightStickDeadzone  = document.getElementById('right-stick-deadzone');
const rightAxisX          = document.getElementById('right-axis-x');
const rightAxisY          = document.getElementById('right-axis-y');
const rightAxisXBottom    = document.getElementById('right-axis-x-bottom');
const rightAxisYBottom    = document.getElementById('right-axis-y-bottom');

const directionMetaEls    = {
  up:    { assigned: document.getElementById('nav-direction-assigned-up'),    action: document.getElementById('nav-direction-action-up')    },
  down:  { assigned: document.getElementById('nav-direction-assigned-down'),  action: document.getElementById('nav-direction-action-down')  },
  left:  { assigned: document.getElementById('nav-direction-assigned-left'),  action: document.getElementById('nav-direction-action-left')  },
  right: { assigned: document.getElementById('nav-direction-assigned-right'), action: document.getElementById('nav-direction-action-right') }
};

const ACTION_LABEL_MAP = Object.fromEntries(ACTION_OPTIONS.map(o => [o.value, o.label]));

// ─── Load Settings ────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const data = await api.storage.local.get([
      'iconStyle', 'websiteMappings', 'defaultMapping', 'profiles', 'enabledSites', 'globalEnabled', 'siteCollections', 'navSettings', 'muteActivation'
    ]);

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

    if (data.profiles && Object.keys(data.profiles).length > 0) {
      const profiles = data.profiles;
      const defaultProfile = mergeProfileWithDefaults(profiles['default']);
      settings.defaultMapping = { ...defaultProfile };
      settings.websiteMappings = {};
      if (data.websiteMappings) {
        Object.keys(data.websiteMappings).forEach(domain => {
          const val = data.websiteMappings[domain];
          if (typeof val === 'string') {
            settings.websiteMappings[domain] = mergeProfileWithDefaults(profiles[val] || defaultProfile);
          } else if (val && typeof val === 'object') {
            settings.websiteMappings[domain] = mergeProfileWithDefaults(val);
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
      if (data.defaultMapping) {
        settings.defaultMapping = mergeProfileWithDefaults(data.defaultMapping);
      } else {
        settings.defaultMapping = { ...DEFAULT_PROFILE };
      }
      if (data.websiteMappings && Object.keys(data.websiteMappings).length > 0) {
        settings.websiteMappings = Object.fromEntries(
          Object.entries(data.websiteMappings).map(([domain, profile]) => [domain, mergeProfileWithDefaults(profile)])
        );
      } else {
        settings.websiteMappings = {
          'netflix.com':    { ...DEFAULT_PROFILE },
          'primevideo.com': { ...DEFAULT_PROFILE }
        };
      }

      settings.websiteMappings[RESERVED_OPTIONS_KEY] = mergeOptionsProfileWithDefaults(
        data.websiteMappings && data.websiteMappings[RESERVED_OPTIONS_KEY]
          ? data.websiteMappings[RESERVED_OPTIONS_KEY]
          : OPTIONS_PAGE_PROFILE
      );
    }

    const params = new URLSearchParams(window.location.search);
    const siteParam = params.get('site');
    if (siteParam) {
      const cleanSite = siteParam.trim().toLowerCase().replace(/^www\./, '');
      if (cleanSite) {
        if (!settings.websiteMappings[cleanSite]) {
          settings.websiteMappings[cleanSite] = { ...settings.defaultMapping };
          await api.storage.local.set({ websiteMappings: settings.websiteMappings });
        }
        selectedSiteKey = cleanSite;
      }
      const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
      window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
    }

    renderAll();
  } catch (e) {
    console.error('[Remapad Options] Load settings failed:', e);
  }
}

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

// ─── Save Settings ────────────────────────────────────────────────────────────

async function saveSettings() {
  try {
    if (muteActivationToggle) {
      settings.muteActivation = muteActivationToggle.checked;
    }
    await api.storage.local.set({
      iconStyle:       settings.iconStyle,
      websiteMappings: settings.websiteMappings,
      defaultMapping:  settings.defaultMapping,
      enabledSites:    settings.enabledSites,
      globalEnabled:   settings.globalEnabled,
      siteCollections: settings.siteCollections,
      navSettings:     settings.navSettings,
      muteActivation:  settings.muteActivation
    });

    unsavedChanges = false;
    showToast('Changes saved successfully!', 'success');
    renderAll();
  } catch (e) {
    showToast('Error saving settings: ' + e.message);
  }
}

// ─── Render All Components ────────────────────────────────────────────────────

function renderAll() {
  if (muteActivationToggle) {
    muteActivationToggle.checked = !!settings.muteActivation;
  }
  renderEditorSiteSelect();
  renderWebsiteMappings();
  renderIconStyles();
  populateVisualLabels();
  renderCollectionConfig();
  renderNavConfig();
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

function updateStickModeVisibility() {
  const rightMode = navRightMode ? navRightMode.value : 'cursor';
  document.querySelectorAll('.nav-mode-group-right').forEach(el => {
    el.style.display = (el.dataset.mode === rightMode) ? 'flex' : 'none';
  });

  const leftMode = navLeftMode ? navLeftMode.value : 'scroll';
  document.querySelectorAll('.nav-mode-group-left').forEach(el => {
    el.style.display = (el.dataset.mode === leftMode) ? 'flex' : 'none';
  });
}

function renderNavConfig() {
  const nav = settings.navSettings;
  if (!nav) return;

  navEnabledInput.checked = nav.enabled;
  navStrategyInput.value = nav.strategy;

  navRightEnabled.checked = nav.rightStick.enabled;
  navRightMode.value = nav.rightStick.mode;
  navRightDeadzone.value = nav.rightStick.deadzone;
  navRightDeadzoneVal.textContent = nav.rightStick.deadzone;
  if (navRightRepeatDelay) {
    navRightRepeatDelay.value = nav.rightStick.repeatDelayMs ?? 150;
    if (navRightRepeatDelayVal) navRightRepeatDelayVal.textContent = navRightRepeatDelay.value;
  }
  navRightCursorSpeed.value = nav.rightStick.cursorSpeed ?? DEFAULT_NAV_SETTINGS.rightStick.cursorSpeed;
  navRightCursorSpeedVal.textContent = navRightCursorSpeed.value;
  navRightCursorColor.value = nav.rightStick.cursorColor || DEFAULT_NAV_SETTINGS.rightStick.cursorColor;
  if (navRightScrollAmount) {
    navRightScrollAmount.value = nav.rightStick.scrollAmountPx ?? 150;
    if (navRightScrollAmountVal) navRightScrollAmountVal.textContent = navRightScrollAmount.value;
  }
  navRightAccel.checked = nav.rightStick.repeatAcceleration;
  navRightDirectionMode.value = nav.rightStick.directionMode;

  navLeftEnabled.checked = nav.leftStick.enabled;
  navLeftMode.value = nav.leftStick.mode;
  navLeftDeadzone.value = nav.leftStick.deadzone;
  navLeftDeadzoneVal.textContent = nav.leftStick.deadzone;
  navLeftScrollAmount.value = nav.leftStick.scrollAmountPx;
  navLeftScrollAmountVal.textContent = nav.leftStick.scrollAmountPx;
  navLeftCursorSpeed.value = nav.leftStick.cursorSpeed ?? DEFAULT_NAV_SETTINGS.leftStick.cursorSpeed;
  navLeftCursorSpeedVal.textContent = navLeftCursorSpeed.value;
  navLeftCursorColor.value = nav.leftStick.cursorColor || DEFAULT_NAV_SETTINGS.leftStick.cursorColor;

  for (const dir of ['up', 'down', 'left', 'right']) {
    const entry = nav.axisMap[dir] || DEFAULT_NAV_SETTINGS.axisMap[dir];
    const inputs = navAxisInputs[dir];
    if (inputs) {
      inputs.stick.value = entry.stick;
      inputs.action.value = entry.action;
    }
    updateDirectionMeta(dir);
  }

  updateNavDeadzoneRings();
  updateStickModeVisibility();

  navWrapRows.checked = nav.collectionGrid.wrapRows;
  navWrapItems.checked = nav.collectionGrid.wrapItems;
  navLateralPenalty.value = nav.collectionGrid.lateralPenalty;
  navLateralPenaltyVal.textContent = nav.collectionGrid.lateralPenalty;
  navRowOverlap.value = nav.collectionGrid.rowOverlapThreshold;
  navRowOverlapVal.textContent = nav.collectionGrid.rowOverlapThreshold;
}

function updateDirectionMeta(dir) {
  const entry = settings.navSettings.axisMap[dir] || DEFAULT_NAV_SETTINGS.axisMap[dir];
  const meta = directionMetaEls[dir];
  if (!meta) return;
  meta.assigned.textContent = entry.stick === 'left' ? 'Left stick' : 'Right stick';
  meta.action.textContent = ACTION_LABEL_MAP[entry.action] || entry.action;
}

function updateNavDeadzoneRings() {
  if (leftStickDeadzone) {
    const leftRadius = Math.round((settings.navSettings.leftStick.deadzone || 0.3) * 50);
    leftStickDeadzone.style.width = `${leftRadius}%`;
    leftStickDeadzone.style.height = `${leftRadius}%`;
  }
  if (rightStickDeadzone) {
    const rightRadius = Math.round((settings.navSettings.rightStick.deadzone || 0.3) * 50);
    rightStickDeadzone.style.width = `${rightRadius}%`;
    rightStickDeadzone.style.height = `${rightRadius}%`;
  }
}

function collectNavSettingsFromUI() {
  return {
    enabled: navEnabledInput.checked,
    strategy: navStrategyInput.value,
    rightStick: {
      enabled: navRightEnabled.checked,
      mode: navRightMode.value,
      deadzone: Number.parseFloat(navRightDeadzone.value),
      repeatDelayMs: navRightRepeatDelay ? Number.parseInt(navRightRepeatDelay.value, 10) : 150,
      cursorSpeed: Number.parseInt(navRightCursorSpeed.value, 10),
      cursorColor: navRightCursorColor.value || DEFAULT_NAV_SETTINGS.rightStick.cursorColor,
      scrollAmountPx: navRightScrollAmount ? Number.parseInt(navRightScrollAmount.value, 10) : 150,
      repeatAcceleration: navRightAccel.checked,
      directionMode: navRightDirectionMode.value
    },
    leftStick: {
      enabled: navLeftEnabled.checked,
      mode: navLeftMode.value,
      deadzone: Number.parseFloat(navLeftDeadzone.value),
      scrollAmountPx: Number.parseInt(navLeftScrollAmount.value, 10),
      cursorSpeed: Number.parseInt(navLeftCursorSpeed.value, 10),
      cursorColor: navLeftCursorColor.value || DEFAULT_NAV_SETTINGS.leftStick.cursorColor
    },
    axisMap: {
      up:    { stick: navAxisInputs.up.stick.value,    direction: 'up',    action: navAxisInputs.up.action.value    },
      down:  { stick: navAxisInputs.down.stick.value,  direction: 'down',  action: navAxisInputs.down.action.value  },
      left:  { stick: navAxisInputs.left.stick.value,  direction: 'left',  action: navAxisInputs.left.action.value  },
      right: { stick: navAxisInputs.right.stick.value, direction: 'right', action: navAxisInputs.right.action.value }
    },
    collectionGrid: {
      wrapRows: navWrapRows.checked,
      wrapItems: navWrapItems.checked,
      lateralPenalty: Number.parseFloat(navLateralPenalty.value),
      rowOverlapThreshold: Number.parseFloat(navRowOverlap.value)
    }
  };
}

function bindNavInputs() {
  const syncSlider = (input, label, onChange) => {
    if (!input) return;
    input.addEventListener('input', () => {
      if (label) label.textContent = input.value;
      if (onChange) onChange();
      else unsavedChanges = true;
    });
  };

  syncSlider(navRightDeadzone, navRightDeadzoneVal, syncNavSettingsFromUI);
  syncSlider(navRightRepeatDelay, navRightRepeatDelayVal, syncNavSettingsFromUI);
  syncSlider(navRightCursorSpeed, navRightCursorSpeedVal, syncNavSettingsFromUI);
  syncSlider(navRightScrollAmount, navRightScrollAmountVal, syncNavSettingsFromUI);
  syncSlider(navLeftDeadzone, navLeftDeadzoneVal, syncNavSettingsFromUI);
  syncSlider(navLeftScrollAmount, navLeftScrollAmountVal, syncNavSettingsFromUI);
  syncSlider(navLeftCursorSpeed, navLeftCursorSpeedVal, syncNavSettingsFromUI);
  syncSlider(navLeftRepeatDelay, navLeftRepeatDelayVal, syncNavSettingsFromUI);
  syncSlider(navLateralPenalty, navLateralPenaltyVal, syncNavSettingsFromUI);
  syncSlider(navRowOverlap, navRowOverlapVal, syncNavSettingsFromUI);

  navRightMode?.addEventListener('change', () => {
    updateStickModeVisibility();
    syncNavSettingsFromUI();
  });
  navLeftMode?.addEventListener('change', () => {
    updateStickModeVisibility();
    syncNavSettingsFromUI();
  });

  const inputs = [
    navEnabledInput,
    navStrategyInput,
    navRightEnabled,
    navRightMode,
    navRightAccel,
    navRightDirectionMode,
    navRightCursorColor,
    navLeftEnabled,
    navLeftMode,
    navLeftCursorColor,
    navWrapRows,
    navWrapItems,
    ...Object.values(navAxisInputs).flatMap(i => [i.stick, i.action])
  ].filter(Boolean);

  function syncNavSettingsFromUI() {
    settings.navSettings = collectNavSettingsFromUI();
    unsavedChanges = true;
    api.storage.local.set({ navSettings: settings.navSettings });
  }

  inputs.forEach(input => {
    input.addEventListener('change', syncNavSettingsFromUI);
  });

  navSaveBtn?.addEventListener('click', saveSettings);

  navResetBtn?.addEventListener('click', () => {
    if (!confirm('Reset navigation settings to defaults?')) return;
    settings.navSettings = structuredClone(DEFAULT_NAV_SETTINGS);
    unsavedChanges = true;
    renderNavConfig();
    showToast('Navigation settings reset.');
  });

  updateNavDeadzoneRings();
  updateStickModeVisibility();
}

function renderEditorSiteSelect() {
  const prevVal = selectedSiteKey;
  editorSiteSelect.innerHTML = '';

  const optDefault = document.createElement('option');
  optDefault.value = 'default';
  optDefault.textContent = 'Default (All Other Sites)';
  editorSiteSelect.appendChild(optDefault);

  Object.keys(settings.websiteMappings).forEach(domain => {
    const opt = document.createElement('option');
    opt.value = domain;
    opt.textContent = `${getFriendlyLabel(domain)} (${domain})`;
    editorSiteSelect.appendChild(opt);
  });

  if (Array.from(editorSiteSelect.options).some(o => o.value === prevVal)) {
    selectedSiteKey = prevVal;
  } else {
    selectedSiteKey = 'default';
  }
  editorSiteSelect.value = selectedSiteKey;
}

function renderWebsiteMappings() {
  mappingsListEl.innerHTML = '';

  const domains = Object.keys(settings.websiteMappings);
  if (domains.length === 0) {
    mappingsListEl.innerHTML = `
      <div style="text-align:center;padding:16px 0;color:var(--on-surface-variant);font-size:13px;font-family:var(--font-body)">
        No website mappings configured. Add a site below to start.
      </div>
    `;
    return;
  }

  domains.forEach(domain => {
    const friendlyName = getFriendlyLabel(domain);
    const isSelected = selectedSiteKey === domain;

    const row = document.createElement('div');
    row.className = 'mapping-row' + (isSelected ? ' selected-site' : '');
    row.innerHTML = `
      <div class="mapping-row-left" tabindex="-1" style="display:flex;align-items:center;gap:8px;flex:1;overflow:hidden">
        <img class="site-favicon-img" src="https://www.google.com/s2/favicons?sz=32&domain=${domain}" style="width:16px;height:16px;border-radius:2px;display:block;flex-shrink:0">
        <svg class="fallback-globe-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:none;color:var(--on-surface-variant);flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span class="mapping-row-label" style="font-family:var(--font-body);font-size:13px;color:var(--on-surface);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${friendlyName} (${domain})">${friendlyName} <span style="font-size:11px;color:var(--on-surface-variant);margin-left:4px">(${domain})</span></span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <button class="delete-site-btn" data-site="${domain}" style="background:none;border:none;color:var(--error);cursor:pointer;padding:4px;display:flex;align-items:center;opacity:0.7;transition:opacity 0.2s" title="Remove site mapping">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    `;

    const faviconImg = row.querySelector('.site-favicon-img');
    const fallbackSvg = row.querySelector('.fallback-globe-svg');
    if (faviconImg && fallbackSvg) {
      faviconImg.addEventListener('error', () => {
        faviconImg.style.display = 'none';
        fallbackSvg.style.display = 'block';
      });
    }

    const rowLeft = row.querySelector('.mapping-row-left');
    rowLeft.addEventListener('click', () => {
      selectedSiteKey = domain;
      editorSiteSelect.value = domain;
      populateVisualLabels();
      closeDropdown();
      renderWebsiteMappings();
    });

    const deleteBtn = row.querySelector('.delete-site-btn');
    if (domain === RESERVED_OPTIONS_KEY) {
      deleteBtn.style.display = 'none';
      deleteBtn.disabled = true;
    }
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (domain === RESERVED_OPTIONS_KEY) return;
      if (confirm(`Remove mapping for ${domain}?`)) {
        delete settings.websiteMappings[domain];
        if (selectedSiteKey === domain) {
          selectedSiteKey = 'default';
        }
        unsavedChanges = true;
        renderAll();
      }
    });

    mappingsListEl.appendChild(row);
  });
}

function renderIconStyles() {
  iconStyleListEl.innerHTML = '';

  ICON_STYLES.forEach(style => {
    const isSelected = settings.iconStyle === style.id;

    const item = document.createElement('div');
    item.className = 'icon-style-item' + (isSelected ? ' selected' : '');
    item.setAttribute('tabindex', '-1');

    item.innerHTML = `
      <div class="icon-style-left">
        <div class="button-glyphs">
          ${style.btns.map(b => `<span class="btn-glyph-badge">${b}</span>`).join('')}
        </div>
        <div>
          <div class="icon-style-name">${escHtml(style.name)}</div>
          <div class="icon-style-sub ${isSelected ? 'profile-active' : 'profile-default'}">
            ${isSelected ? 'Active Layout' : style.sub}
          </div>
        </div>
      </div>
      ${isSelected 
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;display:block;flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--on-surface-variant)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;display:block;flex-shrink:0;opacity:0.5"><circle cx="12" cy="12" r="10"/></svg>`
      }
    `;

    item.addEventListener('click', () => {
      settings.iconStyle = style.id;
      unsavedChanges = true;
      renderIconStyles();
      // Update glyphs on SVG button labels
      updateSvgTextLabels();
    });

    iconStyleListEl.appendChild(item);
  });
}

function updateSvgTextLabels() {
  const isXbox = settings.iconStyle === 'xbox';
  const isNintendo = settings.iconStyle === 'nintendo';
  
  const crossTxt = document.querySelector('text[x="340"][y="163"]');
  const circleTxt = document.querySelector('text[x="360"][y="143"]');
  const squareTxt = document.querySelector('text[x="320"][y="143"]');
  const triangleTxt = document.querySelector('text[x="340"][y="123"]');

  const crossCallout = document.querySelector('.callout-cross .callout-btn-name');
  const circleCallout = document.querySelector('.callout-circle .callout-btn-name');
  const squareCallout = document.querySelector('.callout-square .callout-btn-name');
  const triangleCallout = document.querySelector('.callout-triangle .callout-btn-name');

  if (isXbox) {
    if (crossTxt) crossTxt.textContent = 'A';
    if (circleTxt) circleTxt.textContent = 'B';
    if (squareTxt) squareTxt.textContent = 'X';
    if (triangleTxt) triangleTxt.textContent = 'Y';

    if (crossCallout) crossCallout.textContent = 'Button A';
    if (circleCallout) circleCallout.textContent = 'Button B';
    if (squareCallout) squareCallout.textContent = 'Button X';
    if (triangleCallout) triangleCallout.textContent = 'Button Y';
  } else if (isNintendo) {
    if (crossTxt) crossTxt.textContent = 'B';
    if (circleTxt) circleTxt.textContent = 'A';
    if (squareTxt) squareTxt.textContent = 'Y';
    if (triangleTxt) triangleTxt.textContent = 'X';

    if (crossCallout) crossCallout.textContent = 'Button B';
    if (circleCallout) circleCallout.textContent = 'Button A';
    if (squareCallout) squareCallout.textContent = 'Button Y';
    if (triangleCallout) triangleCallout.textContent = 'Button X';
  } else { // Playstation
    if (crossTxt) crossTxt.textContent = '✕';
    if (circleTxt) circleTxt.textContent = '○';
    if (squareTxt) squareTxt.textContent = '□';
    if (triangleTxt) triangleTxt.textContent = '△';

    if (crossCallout) crossCallout.textContent = 'Cross (✕)';
    if (circleCallout) circleCallout.textContent = 'Circle (○)';
    if (squareCallout) squareCallout.textContent = 'Square (□)';
    if (triangleCallout) triangleCallout.textContent = 'Triangle (△)';
  }
}

function populateVisualLabels() {
  const mapping = (selectedSiteKey === 'default') ? settings.defaultMapping : (settings.websiteMappings[selectedSiteKey] || DEFAULT_PROFILE);

  Object.keys(BUTTON_NAMES).forEach(btnKey => {
    const labelEl = document.getElementById(`label-btn-${btnKey}`);
    if (labelEl) {
      const action = mapping[btnKey] || 'none';
      const displayAction = action;
      let actionLabel = '';
      if (displayAction.startsWith('click_element:')) {
        actionLabel = `Click: ${action.substring('click_element:'.length)}`;
      } else if (displayAction.startsWith('hover_element:')) {
        actionLabel = `Hover: ${action.substring('hover_element:'.length)}`;
      } else if (displayAction.startsWith('press_key:')) {
        actionLabel = `Key: ${action.substring('press_key:'.length)}`;
      } else if (displayAction.startsWith('focus_element:')) {
        actionLabel = `Focus: ${action.substring('focus_element:'.length)}`;
      } else if (displayAction.startsWith('dom_action:')) {
        actionLabel = formatDomActionLabel(displayAction);
      } else {
        actionLabel = ACTION_OPTIONS.find(a => a.value === displayAction)?.label || displayAction;
      }
      labelEl.textContent = actionLabel;
      labelEl.title = actionLabel;
    }
  });

  updateSvgTextLabels();
}

// ─── Visual Gamepad Mapping Editor Trigger ────────────────────────────────────

editorSiteSelect.addEventListener('change', () => {
  selectedSiteKey = editorSiteSelect.value;
  populateVisualLabels();
  closeDropdown();
  renderWebsiteMappings();
});

// ─── Visual Gamepad Mapping Editor Trigger ────────────────────────────────────

// Populate select dropdown actions once
ACTION_OPTIONS.forEach(opt => {
  const o = document.createElement('option');
  o.value = opt.value;
  o.textContent = opt.label;
  actionSelect.appendChild(o);
});

document.querySelectorAll('.editor-callout').forEach(callout => {
  if (!callout.hasAttribute('tabindex')) callout.setAttribute('tabindex', '-1');
  callout.addEventListener('click', (e) => {
    e.stopPropagation();
    
    const btnKey = callout.dataset.btn;
    activeCalloutBtn = btnKey;

    const mapping = (selectedSiteKey === 'default') ? settings.defaultMapping : (settings.websiteMappings[selectedSiteKey] || DEFAULT_PROFILE);
    const currentAction = mapping[btnKey] || 'none';
    if (currentAction.startsWith('click_element:')) {
      actionSelect.value = 'click_element';
    } else if (currentAction.startsWith('hover_element:')) {
      actionSelect.value = 'hover_element';
    } else if (currentAction.startsWith('press_key:')) {
      actionSelect.value = 'press_key';
    } else if (currentAction.startsWith('focus_element:')) {
      actionSelect.value = 'focus_element';
    } else if (currentAction.startsWith('dom_action:')) {
      actionSelect.value = 'dom_action';
    } else {
      actionSelect.value = currentAction;
    }

    // Show dropdown popover next to clicked callout
    const rect = callout.getBoundingClientRect();
    const parentRect = callout.offsetParent.getBoundingClientRect();

    // Position dropover
    actionDropdown.style.top = `${rect.top - parentRect.top + callout.offsetHeight + 6}px`;
    actionDropdown.style.left = `${rect.left - parentRect.left}px`;
    actionDropdown.style.display = 'block';
  });
});

actionSelect.addEventListener('change', async () => {
  if (!activeCalloutBtn) return;

  const mapping = (selectedSiteKey === 'default') ? settings.defaultMapping : (settings.websiteMappings[selectedSiteKey] || DEFAULT_PROFILE);
  const currentVal = mapping[activeCalloutBtn] || '';
  let newAction = actionSelect.value;

  if (newAction === 'click_element') {
    const initVal = currentVal.startsWith('click_element:') ? currentVal.substring('click_element:'.length) : '';
    const val = await openConfigModal('click', initVal);
    if (val && val.trim()) {
      newAction = `click_element:${val.trim()}`;
    } else {
      actionSelect.value = currentVal.startsWith('click_element:') ? 'click_element' : 'none';
      return;
    }
  } else if (newAction === 'hover_element') {
    const initVal = currentVal.startsWith('hover_element:') ? currentVal.substring('hover_element:'.length) : '';
    const val = await openConfigModal('hover', initVal);
    if (val && val.trim()) {
      newAction = `hover_element:${val.trim()}`;
    } else {
      actionSelect.value = currentVal.startsWith('hover_element:') ? 'hover_element' : 'none';
      return;
    }
  } else if (newAction === 'focus_element') {
    const initVal = currentVal.startsWith('focus_element:') ? currentVal.substring('focus_element:'.length) : '';
    const val = await openConfigModal('focus', initVal);
    if (val && val.trim()) {
      newAction = `focus_element:${val.trim()}`;
    } else {
      actionSelect.value = currentVal.startsWith('focus_element:') ? 'focus_element' : 'none';
      return;
    }
  } else if (newAction === 'press_key') {
    const initVal = currentVal.startsWith('press_key:') ? currentVal.substring('press_key:'.length) : '';
    const val = await openConfigModal('keyboard', initVal);
    if (val && val.trim()) {
      newAction = `press_key:${val.trim()}`;
    } else {
      actionSelect.value = currentVal.startsWith('press_key:') ? 'press_key' : 'none';
      return;
    }
  } else if (newAction === 'dom_action') {
    const config = await openConfigModal('dom', parseDomAction(currentVal));
    if (config) {
      newAction = `dom_action:${encodeURIComponent(JSON.stringify(config))}`;
    } else {
      actionSelect.value = currentVal.startsWith('dom_action:') ? 'dom_action' : 'none';
      return;
    }
  }

  mapping[activeCalloutBtn] = newAction;
  unsavedChanges = true;

  populateVisualLabels();
  closeDropdown();
});

// Click outside dropdown closes it
document.addEventListener('click', (e) => {
  if (!actionDropdown.contains(e.target)) {
    closeDropdown();
  }
  if (gamepadSelectOverlay && gamepadSelectOverlay.style.display !== 'none') {
    if (!gamepadSelectOverlay.contains(e.target) && e.target !== gamepadSelectTarget) {
      closeGamepadSelect();
    }
  }
  if (gamepadKeyboardOverlay && gamepadKeyboardOverlay.style.display !== 'none') {
    if (!gamepadKeyboardOverlay.contains(e.target) && e.target !== gamepadKeyboardTarget) {
      closeGamepadKeyboard(false);
    }
  }
});

function closeDropdown() {
  actionDropdown.style.display = 'none';
  activeCalloutBtn = null;
}

// ─── Save / Reset Actions ─────────────────────────────────────────────────────

saveBtn.addEventListener('click', saveSettings);

resetBtn.addEventListener('click', () => {
  if (!confirm('Revert all bindings in this mapping to defaults?')) return;
  if (selectedSiteKey === 'default') {
    settings.defaultMapping = { ...DEFAULT_PROFILE };
  } else if (selectedSiteKey === RESERVED_OPTIONS_KEY) {
    settings.websiteMappings[selectedSiteKey] = { ...OPTIONS_PAGE_PROFILE };
  } else {
    settings.websiteMappings[selectedSiteKey] = { ...settings.defaultMapping };
  }
  unsavedChanges = true;
  populateVisualLabels();
  showToast('Mapping reset to default.');
});

// ─── Gamepad Polling & Test Inputs ───────────────────────────────────────────

let prevPressed = [];
let pollInterval = null;

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(pollGamepads, 50);
}

function pollGamepads() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...gamepads].find(g => g && g.connected);

  if (gp) {
    const rawId = gp.id.split('(')[0].trim() || 'Controller';
    const cleanId = rawId.length > 20 ? rawId.slice(0, 20) + '…' : rawId;

    deviceNameEl.textContent = cleanId;
    navControllerNameEl.textContent = cleanId.length > 18 ? cleanId.slice(0, 18) + '…' : cleanId;
    if (navStatusName) navStatusName.textContent = cleanId;
    if (navStatusBadge) navStatusBadge.className = 'nav-status-badge connected';
    if (navStatusDot) navStatusDot.className = 'nav-status-dot pulse';
    if (navStatusText) navStatusText.textContent = 'CONNECTED';

    statusBadgeEl.className = 'status-badge connected';
    statusDotEl.className   = 'status-dot pulse';
    statusTextEl.textContent = 'CONNECTED';

    const prevPressedSnapshot = [...prevPressed];

    // 1. Highlight visual buttons inside SVG in real-time
    gp.buttons.forEach((btn, idx) => {
      const isPressed = btn.pressed || btn.value > 0.5;
      const wasPressed = prevPressedSnapshot[idx] || false;
      prevPressed[idx] = isPressed;

      const path = document.getElementById(`svg-btn-${idx}`);
      const callout = document.querySelector(`.editor-callout[data-btn="${idx}"]`);

      if (path) {
        if (isPressed) {
          path.classList.add('highlighted');
        } else {
          path.classList.remove('highlighted');
        }
      }

      if (callout) {
        if (isPressed && !wasPressed) {
          callout.style.transform = 'scale(1.15)';
          callout.style.borderColor = 'var(--primary)';
        } else if (!isPressed) {
          callout.style.transform = '';
          callout.style.borderColor = '';
        }
      }
    });

    // 2. Animate stick offsets in SVG
    const leftStickThumb = document.getElementById('svg-btn-10');
    const rightStickThumb = document.getElementById('svg-btn-11');

    if (leftStickThumb) {
      const lx = gp.axes[0] || 0;
      const ly = gp.axes[1] || 0;
      leftStickThumb.setAttribute('cx', (135 + lx * 8).toString());
      leftStickThumb.setAttribute('cy', (185 + ly * 8).toString());
    }
    if (rightStickThumb) {
      const rx = gp.axes[2] || 0;
      const ry = gp.axes[3] || 0;
      rightStickThumb.setAttribute('cx', (265 + rx * 8).toString());
      rightStickThumb.setAttribute('cy', (185 + ry * 8).toString());
    }

    // 3. Drive virtual cursor and scroll from sticks
    if (settings.navSettings?.enabled) {
      const nav = settings.navSettings;
      const rx = gp.axes[2] || 0;
      const ry = gp.axes[3] || 0;
      const lx = gp.axes[0] || 0;
      const ly = gp.axes[1] || 0;

      if (nav.rightStick?.mode === 'cursor') {
        updateCursor('right', rx, ry);
      } else {
        hideCursor('right');
      }

      if (nav.leftStick?.mode === 'scroll') {
        const leftDeadzone = nav.leftStick?.deadzone ?? 0.3;
        const leftMag = Math.hypot(lx, ly);
        if (leftMag > leftDeadzone) {
          const now = Date.now();
          if (now - lastOptionsActionTime > OPTIONS_NAV_REPEAT_MS) {
            const dir = Math.abs(ly) >= Math.abs(lx) ? (ly < 0 ? 'scroll_up' : 'scroll_down') : (lx < 0 ? 'scroll_left' : 'scroll_right');
            executeOptionsScroll(dir);
            lastOptionsActionTime = now;
          }
        }
      } else if (nav.leftStick?.mode === 'cursor') {
        updateCursor('left', lx, ly);
      } else {
        hideCursor('left');
      }
    } else {
      hideCursor('left');
      hideCursor('right');
    }

    updateNavigationStickViz(gp);
    updateOptionsGamepadNav(gp, prevPressedSnapshot);

  } else {
    deviceNameEl.textContent = 'No Controller Detected';
    navControllerNameEl.textContent = 'No Controller';
    statusBadgeEl.className = 'status-badge disconnected';
    statusDotEl.className   = 'status-dot';
    statusTextEl.textContent = 'DISCONNECTED';
    deviceBatteryEl.style.display = 'none';
    if (navStatusName) navStatusName.textContent = 'No Controller';
    if (navStatusBadge) navStatusBadge.className = 'nav-status-badge disconnected';
    if (navStatusDot) navStatusDot.className = 'nav-status-dot';
    if (navStatusText) navStatusText.textContent = 'DISCONNECTED';

    document.querySelectorAll('.svg-btn').forEach(btn => btn.classList.remove('highlighted'));
    resetNavigationStickViz();
  }
}

function updateNavigationStickViz(gp) {
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const fmt = (n) => n.toFixed(2);

  const lx = gp.axes[0] || 0;
  const ly = gp.axes[1] || 0;
  const rx = gp.axes[2] || 0;
  const ry = gp.axes[3] || 0;

  const leftX = clamp(lx, -1, 1);
  const leftY = clamp(ly, -1, 1);
  const rightX = clamp(rx, -1, 1);
  const rightY = clamp(ry, -1, 1);

  if (leftStickDot) leftStickDot.style.transform = `translate(${leftX * 40}px, ${leftY * 40}px)`;
  if (rightStickDot) rightStickDot.style.transform = `translate(${rightX * 40}px, ${rightY * 40}px)`;

  if (leftAxisX) leftAxisX.textContent = fmt(leftX);
  if (leftAxisY) leftAxisY.textContent = fmt(leftY);
  if (rightAxisX) rightAxisX.textContent = fmt(rightX);
  if (rightAxisY) rightAxisY.textContent = fmt(rightY);

  if (leftAxisXBottom) leftAxisXBottom.textContent = fmt(leftX);
  if (leftAxisYBottom) leftAxisYBottom.textContent = fmt(leftY);
  if (rightAxisXBottom) rightAxisXBottom.textContent = fmt(rightX);
  if (rightAxisYBottom) rightAxisYBottom.textContent = fmt(rightY);
}

function resetNavigationStickViz() {
  const els = [
    leftStickDot, rightStickDot,
    leftAxisX, leftAxisY, rightAxisX, rightAxisY,
    leftAxisXBottom, leftAxisYBottom, rightAxisXBottom, rightAxisYBottom
  ];
  els.forEach(el => {
    if (!el) return;
    if (el.classList.contains('stick-dot')) {
      el.style.transform = '';
    } else {
      el.textContent = '0.00';
    }
  });
}

let gamepadFocusIndex = -1;
let gamepadFocusElements = [];
let lastOptionsActionTime = 0;
const OPTIONS_NAV_REPEAT_MS = 350;

// ─── Virtual Cursor Engine (ported from content_script.js) ────────────────────

const cursors = {
  left:  { element: null, target: null, x: 0, y: 0, visible: false },
  right: { element: null, target: null, x: 0, y: 0, visible: false }
};
let cursorStyleElement = null;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgba(hex, alpha) {
  if (!hex) return `rgba(0, 0, 0, ${alpha})`;
  const short = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
  if (short) {
    const r = Number.parseInt(short[1] + short[1], 16);
    const g = Number.parseInt(short[2] + short[2], 16);
    const b = Number.parseInt(short[3] + short[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  const full = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (full) {
    const r = Number.parseInt(full[1], 16);
    const g = Number.parseInt(full[2], 16);
    const b = Number.parseInt(full[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(0, 0, 0, ${alpha})`;
}

function defaultCursorColor(stickId) {
  return stickId === 'left' ? '#00a8e1' : '#e50914';
}

function dispatchHoverEvents(el, enter) {
  if (!el) return;
  const eventType = enter ? 'mouseover' : 'mouseout';
  const leaveType = enter ? 'mouseenter' : 'mouseleave';
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new MouseEvent(eventType, opts));
  el.dispatchEvent(new MouseEvent(leaveType, opts));
}

function isRemapadElement(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('.remapad-quick-map, .remapad-hud-container, .remapad-cursor, .gamepad-select-overlay, .gamepad-keyboard-overlay'));
}

function isClickableCursorTarget(el) {
  if (!(el instanceof Element)) return false;
  if (isRemapadElement(el)) return false;
  const style = getComputedStyle(el);
  if (style.pointerEvents === 'none') return false;
  const tag = el.tagName;
  return tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' ||
         tag === 'TEXTAREA' || el.matches('[role="button"], [tabindex]:not([tabindex="-1"])') ||
         el.matches('video, .title-card-container, [data-testid="card"], [class*="card" i]');
}

function clearCursorTarget(stickId) {
  const cursor = cursors[stickId];
  if (cursor.target) {
    dispatchHoverEvents(cursor.target, false);
    cursor.target.classList.remove('remapad-cursor-target');
    cursor.target.style.removeProperty('--remapad-cursor-color');
    cursor.target = null;
  }
}

function updateCursorTarget(stickId) {
  const cursor = cursors[stickId];
  if (!cursor.element) return;
  let el = document.elementFromPoint(cursor.x, cursor.y);
  if (el === cursor.element) el = null;
  let target = el;
  while (target && !isClickableCursorTarget(target)) {
    target = target.parentElement;
  }

  if (target && target !== cursor.target) {
    clearCursorTarget(stickId);
    cursor.target = target;
    const nav = settings.navSettings;
    const stickConfig = stickId === 'left' ? nav.leftStick : nav.rightStick;
    const color = (stickConfig?.cursorColor || '').trim() || defaultCursorColor(stickId);
    cursor.target.style.setProperty('--remapad-cursor-color', hexToRgba(color, 0.7));
    cursor.target.classList.add('remapad-cursor-target');
    dispatchHoverEvents(cursor.target, true);
  } else if (!target) {
    clearCursorTarget(stickId);
  }
}

function injectCursorStyles() {
  if (cursorStyleElement) return;
  cursorStyleElement = document.createElement('style');
  cursorStyleElement.textContent = `
    .remapad-cursor {
      position: fixed;
      top: 0;
      left: 0;
      width: 22px;
      height: 22px;
      margin-left: -11px;
      margin-top: -11px;
      border-radius: 50%;
      border: 2px solid #fff;
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.5);
      z-index: 2147483647;
      pointer-events: none;
      transition: transform 0.05s linear, opacity 0.2s ease;
      opacity: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
    }
    .remapad-cursor.visible {
      opacity: 1;
    }
    .remapad-cursor-label {
      pointer-events: none;
      user-select: none;
    }
    .remapad-cursor-target {
      outline: 3px solid var(--remapad-cursor-color, rgba(229, 9, 20, 0.7)) !important;
      outline-offset: 4px !important;
    }
  `;
  document.head.appendChild(cursorStyleElement);
}

function initCursor(stickId) {
  const cursor = cursors[stickId];
  if (cursor.element) return;
  injectCursorStyles();

  const el = document.createElement('div');
  el.className = `remapad-cursor remapad-cursor--${stickId}`;
  el.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'remapad-cursor-label';
  label.textContent = stickId === 'left' ? 'L' : 'R';
  el.appendChild(label);
  document.body.appendChild(el);
  cursor.element = el;

  if (!cursor.x || !cursor.y) {
    cursor.x = window.innerWidth / 2;
    cursor.y = window.innerHeight / 2;
  }
}

function showCursor(stickId) {
  initCursor(stickId);
  const cursor = cursors[stickId];
  cursor.element?.classList.add('visible');
  cursor.visible = true;
}

function hideCursor(stickId) {
  const cursor = cursors[stickId];
  cursor.element?.classList.remove('visible');
  cursor.visible = false;
  clearCursorTarget(stickId);
}

function updateCursor(stickId, ax, ay) {
  if (!settings.navSettings?.enabled || isOverlayOpen()) {
    hideCursor(stickId);
    return;
  }
  const nav = settings.navSettings;
  const stickConfig = stickId === 'left' ? nav.leftStick : nav.rightStick;
  const deadzone = stickConfig?.deadzone ?? 0.3;
  const speed = stickConfig?.cursorSpeed ?? 800;
  const magnitude = Math.hypot(ax, ay);

  showCursor(stickId);
  const cursor = cursors[stickId];

  if (magnitude > deadzone) {
    const now = performance.now();
    const dt = cursor.lastTime ? Math.min(0.1, (now - cursor.lastTime) / 1000) : 0.05;
    cursor.lastTime = now;

    const normMag = (magnitude - deadzone) / (1 - deadzone);
    const velocity = Math.pow(normMag, 1.2) * speed;
    const nx = ax / magnitude;
    const ny = ay / magnitude;
    cursor.x = clamp(cursor.x + nx * velocity * dt, 0, window.innerWidth);
    cursor.y = clamp(cursor.y + ny * velocity * dt, 0, window.innerHeight);
  } else {
    cursor.lastTime = null;
  }

  if (cursor.element) {
    cursor.element.style.transform = `translate(${cursor.x}px, ${cursor.y}px)`;
    const color = (stickConfig?.cursorColor || '').trim() || defaultCursorColor(stickId);
    cursor.element.style.backgroundColor = hexToRgba(color, 0.85);
    cursor.element.style.boxShadow = `0 0 0 2px ${hexToRgba(color, 0.4)}, 0 4px 16px rgba(0, 0, 0, 0.5)`;
  }

  updateCursorTarget(stickId);
}

function simulateClickAt(el, x, y) {
  const opts = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x + window.screenX,
    screenY: y + window.screenY,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    isPrimary: true,
    composed: true
  };

  if (typeof PointerEvent !== 'undefined') {
    const pointerOpts = { ...opts, pointerId: 1, width: 1, height: 1, pressure: 0.5 };
    el.dispatchEvent(new PointerEvent('pointerover', pointerOpts));
    el.dispatchEvent(new PointerEvent('pointerenter', pointerOpts));
    el.dispatchEvent(new PointerEvent('pointermove', pointerOpts));
    el.dispatchEvent(new PointerEvent('pointerdown', { ...pointerOpts, buttons: 1 }));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', { ...pointerOpts, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
    el.dispatchEvent(new PointerEvent('pointerout', pointerOpts));
    el.dispatchEvent(new PointerEvent('pointerleave', pointerOpts));
  } else {
    el.dispatchEvent(new MouseEvent('mouseover', opts));
    el.dispatchEvent(new MouseEvent('mouseenter', opts));
    el.dispatchEvent(new MouseEvent('mousemove', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
    el.dispatchEvent(new MouseEvent('mouseout', opts));
    el.dispatchEvent(new MouseEvent('mouseleave', opts));
  }
}

function simulateKeyboardActivate(el) {
  if (el.focus && typeof el.focus === 'function' && el.tabIndex !== -1) {
    el.focus({ preventScroll: true });
  }
  const keyOpts = {
    bubbles: true,
    cancelable: true,
    view: window,
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    composed: true
  };
  el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
  el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
}

function activateElementAsClick(el, x, y) {
  // For native controls that need custom overlays, open the overlay instead of clicking
  if (el.tagName === 'SELECT') {
    openGamepadSelect(el);
    return;
  }
  if (el.tagName === 'INPUT' && el.type === 'color') {
    openGamepadColorPicker(el);
    return;
  }
  if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === '' || el.type === 'url' || el.type === 'search')) {
    openGamepadKeyboard(el);
    return;
  }
  simulateClickAt(el, x, y);
  simulateKeyboardActivate(el);
}

function executeCursorClick() {
  const rightCursor = cursors.right;
  const leftCursor = cursors.left;
  const activeCursor = (rightCursor.visible && rightCursor.target) ? rightCursor
    : (leftCursor.visible && leftCursor.target) ? leftCursor
    : null;

  if (activeCursor?.target) {
    activateElementAsClick(activeCursor.target, activeCursor.x, activeCursor.y);
    return;
  }

  const fallbackEl = document.elementFromPoint(rightCursor.x, rightCursor.y)
    || document.elementFromPoint(leftCursor.x, leftCursor.y);
  const fallbackCursor = (document.elementFromPoint(rightCursor.x, rightCursor.y) === fallbackEl) ? rightCursor
    : (document.elementFromPoint(leftCursor.x, leftCursor.y) === fallbackEl) ? leftCursor
    : rightCursor;
  if (fallbackEl && !isRemapadElement(fallbackEl)) {
    activateElementAsClick(fallbackEl, fallbackCursor.x, fallbackCursor.y);
  }
}

// ─── Scroll Helper ────────────────────────────────────────────────────────────

function getScrollableElement() {
  let el = document.activeElement;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return el;
    }
    el = el.parentElement;
  }
  return window;
}

function executeOptionsScroll(action) {
  const nav = settings.navSettings;
  const scrollAmount = nav?.leftStick?.scrollAmountPx ?? 150;
  const scrollEl = getScrollableElement();
  const scrollBy = (el, top, left) => {
    if (el === window) {
      window.scrollBy({ top, left, behavior: 'auto' });
    } else {
      el.scrollBy({ top, left, behavior: 'auto' });
    }
  };

  switch (action) {
    case 'scroll_up':
    case 'nav_up':
    case 'focus_up':
      scrollBy(scrollEl, -scrollAmount, 0);
      break;
    case 'scroll_down':
    case 'nav_down':
    case 'focus_down':
      scrollBy(scrollEl, scrollAmount, 0);
      break;
    case 'scroll_left':
    case 'nav_left':
    case 'focus_left':
      scrollBy(scrollEl, 0, -scrollAmount);
      break;
    case 'scroll_right':
    case 'nav_right':
    case 'focus_right':
      scrollBy(scrollEl, 0, scrollAmount);
      break;
  }
}

const gamepadSelectOverlay = document.getElementById('gamepad-select-overlay');
let gamepadSelectTarget = null;

const gamepadKeyboardOverlay = document.getElementById('gamepad-keyboard-overlay');
const gamepadKeyboardGrid = document.getElementById('gamepad-keyboard-grid');
const gamepadKeyboardPreview = document.getElementById('gamepad-keyboard-preview');
const gamepadKeyboardConfirmBtn = document.getElementById('gamepad-keyboard-confirm');
const gamepadKeyboardCancelBtn = document.getElementById('gamepad-keyboard-cancel');
let gamepadKeyboardTarget = null;
let gamepadKeyboardValue = '';
let gamepadKeyboardLayer = 'alpha';

const KEYBOARD_LAYOUTS = {
  alpha: [
    [
      { label: 'q', value: 'q' }, { label: 'w', value: 'w' }, { label: 'e', value: 'e' },
      { label: 'r', value: 'r' }, { label: 't', value: 't' }, { label: 'y', value: 'y' },
      { label: 'u', value: 'u' }, { label: 'i', value: 'i' }, { label: 'o', value: 'o' },
      { label: 'p', value: 'p' }
    ],
    [
      { label: 'a', value: 'a' }, { label: 's', value: 's' }, { label: 'd', value: 'd' },
      { label: 'f', value: 'f' }, { label: 'g', value: 'g' }, { label: 'h', value: 'h' },
      { label: 'j', value: 'j' }, { label: 'k', value: 'k' }, { label: 'l', value: 'l' }
    ],
    [
      { label: '⇧', value: 'shift', special: true, wide: true },
      { label: 'z', value: 'z' }, { label: 'x', value: 'x' }, { label: 'c', value: 'c' },
      { label: 'v', value: 'v' }, { label: 'b', value: 'b' }, { label: 'n', value: 'n' },
      { label: 'm', value: 'm' },
      { label: '⌫', value: 'backspace', special: true, wide: true }
    ],
    [
      { label: '123', value: 'toggle-layer', special: true, wide: true },
      { label: '␣', value: ' ', special: true, wide: true },
      { label: '.', value: '.' },
      { label: '-', value: '-' },
      { label: '_', value: '_' },
      { label: '/', value: '/' },
      { label: ':', value: ':' },
      { label: '✓', value: 'confirm', special: true, wide: true }
    ]
  ],
  symbols: [
    [
      { label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' },
      { label: '4', value: '4' }, { label: '5', value: '5' }, { label: '6', value: '6' },
      { label: '7', value: '7' }, { label: '8', value: '8' }, { label: '9', value: '9' },
      { label: '0', value: '0' }
    ],
    [
      { label: '!', value: '!' }, { label: '@', value: '@' }, { label: '#', value: '#' },
      { label: '$', value: '$' }, { label: '%', value: '%' }, { label: '^', value: '^' },
      { label: '&', value: '&' }, { label: '*', value: '*' }, { label: '(', value: '(' },
      { label: ')', value: ')' }
    ],
    [
      { label: '⇧', value: 'shift', special: true, wide: true },
      { label: '"', value: '"' }, { label: "'", value: "'" }, { label: ';', value: ';' },
      { label: ',', value: ',' }, { label: '+', value: '+' }, { label: '=', value: '=' },
      { label: '?', value: '?' },
      { label: '⌫', value: 'backspace', special: true, wide: true }
    ],
    [
      { label: 'ABC', value: 'toggle-layer', special: true, wide: true },
      { label: '␣', value: ' ', special: true, wide: true },
      { label: '.', value: '.' },
      { label: '-', value: '-' },
      { label: '_', value: '_' },
      { label: '/', value: '/' },
      { label: ':', value: ':' },
      { label: '✓', value: 'confirm', special: true, wide: true }
    ]
  ]
};

function buildGamepadKeyboard() {
  gamepadKeyboardGrid.innerHTML = '';
  const layout = KEYBOARD_LAYOUTS[gamepadKeyboardLayer] || KEYBOARD_LAYOUTS.alpha;

  layout.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'gamepad-keyboard-row';
    row.forEach(keyDef => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gamepad-keyboard-key';
      if (keyDef.wide) btn.classList.add('gamepad-keyboard-key-wide');
      if (keyDef.special) btn.classList.add('gamepad-keyboard-key-special');
      btn.textContent = keyDef.label;
      btn.dataset.keyValue = keyDef.value;
      btn.dataset.special = keyDef.special ? '1' : '0';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleGamepadKeyboardKey(keyDef.value);
      });
      rowEl.appendChild(btn);
    });
    gamepadKeyboardGrid.appendChild(rowEl);
  });

  gamepadKeyboardConfirmBtn.onclick = (e) => { e.stopPropagation(); closeGamepadKeyboard(true); };
  gamepadKeyboardCancelBtn.onclick = (e) => { e.stopPropagation(); closeGamepadKeyboard(false); };
}

function handleGamepadKeyboardKey(value) {
  if (value === 'backspace') {
    gamepadKeyboardValue = gamepadKeyboardValue.slice(0, -1);
  } else if (value === 'shift') {
    gamepadKeyboardLayer = gamepadKeyboardLayer === 'alpha' ? 'symbols' : 'alpha';
    buildGamepadKeyboard();
  } else if (value === 'toggle-layer') {
    gamepadKeyboardLayer = gamepadKeyboardLayer === 'alpha' ? 'symbols' : 'alpha';
    buildGamepadKeyboard();
  } else if (value === 'confirm') {
    closeGamepadKeyboard(true);
    return;
  } else if (value === ' ') {
    gamepadKeyboardValue += ' ';
  } else {
    gamepadKeyboardValue += value;
  }
  updateGamepadKeyboardPreview();
}

function updateGamepadKeyboardPreview() {
  if (gamepadKeyboardPreview) {
    gamepadKeyboardPreview.textContent = gamepadKeyboardValue || ' ';
  }
  if (gamepadKeyboardTarget) {
    gamepadKeyboardTarget.value = gamepadKeyboardValue;
    gamepadKeyboardTarget.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function openGamepadKeyboard(inputEl) {
  gamepadKeyboardTarget = inputEl;
  gamepadKeyboardValue = inputEl.value || '';
  gamepadKeyboardLayer = 'alpha';
  buildGamepadKeyboard();
  updateGamepadKeyboardPreview();
  gamepadKeyboardOverlay.style.display = 'block';
  gamepadFocusElements = collectKeyboardFocusables();
  gamepadFocusIndex = 0;
  refreshGamepadFocusVisual();
}

function closeGamepadKeyboard(confirm) {
  if (confirm && gamepadKeyboardTarget) {
    gamepadKeyboardTarget.value = gamepadKeyboardValue;
    gamepadKeyboardTarget.dispatchEvent(new Event('input', { bubbles: true }));
    gamepadKeyboardTarget.dispatchEvent(new Event('change', { bubbles: true }));
  }
  gamepadKeyboardOverlay.style.display = 'none';
  gamepadKeyboardTarget = null;
  gamepadKeyboardValue = '';
  gamepadFocusElements = [];
  gamepadFocusIndex = -1;
}

function collectKeyboardFocusables() {
  const keys = Array.from(gamepadKeyboardGrid.querySelectorAll('.gamepad-keyboard-key'));
  keys.push(gamepadKeyboardConfirmBtn);
  keys.push(gamepadKeyboardCancelBtn);
  return keys;
}

const COLOR_PRESETS = ['#e50914', '#00a8e1', '#ff6b35', '#4caf50', '#9c27b0', '#ffeb3b', '#ffffff', '#000000', '#ff4081', '#00bcd4', '#8bc34a', '#ffc107'];

function openGamepadColorPicker(colorInput) {
  gamepadSelectTarget = colorInput;
  gamepadSelectOverlay.innerHTML = '';

  COLOR_PRESETS.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gamepad-select-option';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.gap = '8px';
    if (colorInput.value.toLowerCase() === color.toLowerCase()) {
      btn.classList.add('gamepad-select-option-selected');
    }
    btn.innerHTML = `<span style="width:16px;height:16px;border-radius:3px;background:${color};border:1px solid rgba(255,255,255,0.2);flex-shrink:0"></span><span>${color}</span>`;
    btn.dataset.value = color;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmGamepadSelect(color);
    });
    gamepadSelectOverlay.appendChild(btn);
  });

  const rect = colorInput.getBoundingClientRect();
  gamepadSelectOverlay.style.display = 'block';
  gamepadSelectOverlay.style.left = `${rect.left}px`;
  gamepadSelectOverlay.style.top = `${rect.bottom + 4}px`;
  gamepadSelectOverlay.style.minWidth = `${Math.max(rect.width, 180)}px`;

  const selectedIdx = COLOR_PRESETS.findIndex(c => c.toLowerCase() === (colorInput.value || '').toLowerCase());
  gamepadFocusIndex = selectedIdx >= 0 ? selectedIdx : 0;
  gamepadFocusElements = Array.from(gamepadSelectOverlay.querySelectorAll('.gamepad-select-option'));
  refreshGamepadFocusVisual();
}

function openGamepadSelect(selectEl) {
  gamepadSelectTarget = selectEl;
  const options = Array.from(selectEl.options);
  const selectedVal = selectEl.value;

  gamepadSelectOverlay.innerHTML = '';
  options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gamepad-select-option';
    if (opt.value === selectedVal) btn.classList.add('gamepad-select-option-selected');
    btn.textContent = opt.textContent;
    btn.dataset.value = opt.value;
    btn.dataset.index = String(i);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmGamepadSelect(opt.value);
    });
    gamepadSelectOverlay.appendChild(btn);
  });

  const rect = selectEl.getBoundingClientRect();
  gamepadSelectOverlay.style.display = 'block';
  gamepadSelectOverlay.style.left = `${rect.left}px`;
  gamepadSelectOverlay.style.top = `${rect.bottom + 4}px`;
  gamepadSelectOverlay.style.minWidth = `${Math.max(rect.width, 180)}px`;

  const selectedIdx = options.findIndex(o => o.value === selectedVal);
  gamepadFocusIndex = selectedIdx >= 0 ? selectedIdx : 0;
  gamepadFocusElements = Array.from(gamepadSelectOverlay.querySelectorAll('.gamepad-select-option'));
  refreshGamepadFocusVisual();
}

function confirmGamepadSelect(value) {
  if (!gamepadSelectTarget) return;
  gamepadSelectTarget.value = value;
  gamepadSelectTarget.dispatchEvent(new Event('change', { bubbles: true }));
  closeGamepadSelect();
}

function closeGamepadSelect() {
  gamepadSelectOverlay.style.display = 'none';
  gamepadSelectTarget = null;
  gamepadFocusElements = [];
  gamepadFocusIndex = -1;
}

function refreshGamepadFocusVisual() {
  document.querySelectorAll('.gamepad-focused').forEach(el => el.classList.remove('gamepad-focused'));
  if (gamepadFocusIndex >= 0 && gamepadFocusElements[gamepadFocusIndex]) {
    gamepadFocusElements[gamepadFocusIndex].classList.add('gamepad-focused');
    gamepadFocusElements[gamepadFocusIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

function getOverlayFocusableElements() {
  if (gamepadKeyboardOverlay && gamepadKeyboardOverlay.style.display !== 'none') {
    return collectKeyboardFocusables();
  }
  if (gamepadSelectOverlay && gamepadSelectOverlay.style.display !== 'none') {
    return Array.from(gamepadSelectOverlay.querySelectorAll('.gamepad-select-option'));
  }
  return [];
}

function isOverlayOpen() {
  return (gamepadKeyboardOverlay && gamepadKeyboardOverlay.style.display !== 'none') ||
         (gamepadSelectOverlay && gamepadSelectOverlay.style.display !== 'none');
}

function activateOverlayFocus() {
  const elements = getOverlayFocusableElements();
  if (gamepadFocusIndex < 0 || gamepadFocusIndex >= elements.length) return;
  const el = elements[gamepadFocusIndex];

  if (gamepadKeyboardOverlay && gamepadKeyboardOverlay.style.display !== 'none') {
    if (el.classList.contains('gamepad-keyboard-key')) {
      handleGamepadKeyboardKey(el.dataset.keyValue);
      gamepadFocusElements = collectKeyboardFocusables();
      refreshGamepadFocusVisual();
      return;
    }
    if (el === gamepadKeyboardConfirmBtn) { closeGamepadKeyboard(true); return; }
    if (el === gamepadKeyboardCancelBtn) { closeGamepadKeyboard(false); return; }
  }

  if (gamepadSelectOverlay && gamepadSelectOverlay.style.display !== 'none') {
    if (el.classList.contains('gamepad-select-option')) {
      confirmGamepadSelect(el.dataset.value);
      return;
    }
  }
}

function moveOverlayFocus(direction) {
  const elements = getOverlayFocusableElements();
  if (elements.length === 0) return;

  if (gamepadSelectOverlay && gamepadSelectOverlay.style.display !== 'none') {
    const delta = (direction === 'up' || direction === 'left') ? -1 : 1;
    const nextIdx = (gamepadFocusIndex + delta + elements.length) % elements.length;
    gamepadFocusIndex = nextIdx;
    gamepadFocusElements = elements;
    refreshGamepadFocusVisual();
    return;
  }

  if (gamepadKeyboardOverlay && gamepadKeyboardOverlay.style.display !== 'none') {
    const nextIdx = findSpatialNeighbor(elements, gamepadFocusIndex, direction);
    if (nextIdx >= 0) {
      gamepadFocusIndex = nextIdx;
      gamepadFocusElements = elements;
      refreshGamepadFocusVisual();
    }
    return;
  }
}

function findSpatialNeighbor(elements, currentIndex, direction) {
  if (currentIndex < 0 || currentIndex >= elements.length) return -1;
  const currentEl = elements[currentIndex];
  const currentRect = currentEl.getBoundingClientRect();
  const originCx = currentRect.left + currentRect.width / 2;
  const originCy = currentRect.top + currentRect.height / 2;

  let bestIdx = -1;
  let bestScore = Infinity;

  elements.forEach((el, idx) => {
    if (idx === currentIndex || el === currentEl) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = cx - originCx;
    const dy = cy - originCy;

    let inDirection = false;
    let primaryDist = 0;
    let lateralDist = 0;

    if (direction === 'up') {
      inDirection = dy < -2;
      primaryDist = Math.abs(dy);
      lateralDist = Math.abs(dx);
    } else if (direction === 'down') {
      inDirection = dy > 2;
      primaryDist = Math.abs(dy);
      lateralDist = Math.abs(dx);
    } else if (direction === 'left') {
      inDirection = dx < -2;
      primaryDist = Math.abs(dx);
      lateralDist = Math.abs(dy);
    } else if (direction === 'right') {
      inDirection = dx > 2;
      primaryDist = Math.abs(dx);
      lateralDist = Math.abs(dy);
    }

    if (!inDirection) return;

    const alignedThreshold = direction === 'up' || direction === 'down'
      ? Math.max(currentRect.width, r.width) * 0.2
      : Math.max(currentRect.height, r.height) * 0.2;

    const overlap = direction === 'up' || direction === 'down'
      ? Math.min(currentRect.right, r.right) - Math.max(currentRect.left, r.left)
      : Math.min(currentRect.bottom, r.bottom) - Math.max(currentRect.top, r.top);

    const aligned = overlap >= alignedThreshold;
    const score = primaryDist + lateralDist * 5 + (aligned ? 0 : 1e6);

    if (score < bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });

  return bestIdx;
}

function optionsBack() {
  if (gamepadKeyboardOverlay && gamepadKeyboardOverlay.style.display !== 'none') {
    closeGamepadKeyboard(false);
    return;
  }
  if (gamepadSelectOverlay && gamepadSelectOverlay.style.display !== 'none') {
    closeGamepadSelect();
    return;
  }
  if (configModal && configModal.style.display !== 'none') {
    closeConfigModal(false);
    return;
  }
  if (actionDropdown && actionDropdown.style.display !== 'none') {
    closeDropdown();
  }
}

function switchOptionsTab(direction) {
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  const activeIdx = tabs.findIndex(t => t.classList.contains('active'));
  if (activeIdx === -1) return;
  const nextIdx = (activeIdx + direction + tabs.length) % tabs.length;
  tabs[nextIdx].click();
}

function executeOptionsAction(action) {
  if (isOverlayOpen()) {
    switch (action) {
      case 'focus_up':
      case 'nav_up':
      case 'scroll_up':
        moveOverlayFocus('up');
        return;
      case 'focus_down':
      case 'nav_down':
      case 'scroll_down':
        moveOverlayFocus('down');
        return;
      case 'focus_left':
      case 'nav_left':
      case 'scroll_left':
        moveOverlayFocus('left');
        return;
      case 'focus_right':
      case 'nav_right':
      case 'scroll_right':
        moveOverlayFocus('right');
        return;
      case 'select':
      case 'click':
        activateOverlayFocus();
        return;
      case 'back':
      case 'backspace':
        optionsBack();
        return;
      case 'prev_tab':
        switchOptionsTab(-1);
        return;
      case 'next_tab':
        switchOptionsTab(1);
        return;
    }
    return;
  }

  switch (action) {
    case 'focus_up':
    case 'nav_up':
    case 'scroll_up':
    case 'focus_down':
    case 'nav_down':
    case 'scroll_down':
    case 'focus_left':
    case 'nav_left':
    case 'scroll_left':
    case 'focus_right':
    case 'nav_right':
    case 'scroll_right':
      executeOptionsScroll(action);
      break;
    case 'select':
    case 'click':
      executeCursorClick();
      break;
    case 'back':
    case 'backspace':
      optionsBack();
      break;
    case 'prev_tab':
      switchOptionsTab(-1);
      break;
    case 'next_tab':
      switchOptionsTab(1);
      break;
  }
}

function updateOptionsGamepadNav(gp, prevPressedSnapshot) {
  const profile = settings.websiteMappings[RESERVED_OPTIONS_KEY];
  if (!profile) return;

  const now = Date.now();
  const directional = new Set([
    'focus_up', 'focus_down', 'focus_left', 'focus_right',
    'nav_up', 'nav_down', 'nav_left', 'nav_right',
    'scroll_up', 'scroll_down', 'scroll_left', 'scroll_right',
    'prev_tab', 'next_tab'
  ]);

  gp.buttons.forEach((btn, idx) => {
    const isPressed = btn.pressed || btn.value > 0.5;
    const wasPressed = prevPressedSnapshot[idx] || false;
    const action = profile[idx.toString()];

    if (!action || action === 'none') return;

    const isDirectional = directional.has(action);
    if (isPressed && (!wasPressed || (isDirectional && now - lastOptionsActionTime > OPTIONS_NAV_REPEAT_MS))) {
      executeOptionsAction(action);
      lastOptionsActionTime = now;
    }
  });
}

// Test input listener
let testMode = false;
let testTimer = null;

testInputBtn.addEventListener('click', () => {
  if (testMode) return;
  testMode = true;

  const originalText = testInputBtn.textContent;
  testInputBtn.textContent = 'Press any controller button…';
  testInputBtn.style.background = 'var(--secondary-container)';
  testInputBtn.style.color      = 'var(--on-secondary-container)';

  const interval = setInterval(() => {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gamepads) {
      if (!gp || !gp.connected) continue;
      const pressed = gp.buttons.findIndex(b => b.pressed);
      if (pressed !== -1) {
        const btnName = BUTTON_NAMES[pressed.toString()] || `Button ${pressed}`;
        showToast(`Detected Input: ${btnName}`, 'success');
        clearTest();
        return;
      }
    }
  }, 50);

  testTimer = setTimeout(() => {
    clearTest();
    showToast('Test timed out. Press a button on your gamepad.');
  }, 6000);

  function clearTest() {
    clearInterval(interval);
    clearTimeout(testTimer);
    testMode = false;
    testInputBtn.textContent = originalText;
    testInputBtn.style.background = '';
    testInputBtn.style.color      = '';
  }
});

// Warn before unload
window.addEventListener('beforeunload', (e) => {
  if (unsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ─── Utilities ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return (str || '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function showToast(msg, type = '') {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type}`;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// Add Custom Site Mapping
addSiteBtn.addEventListener('click', () => {
  const rawInput = newSiteInput.value.trim().toLowerCase();
  if (!rawInput) return;

  // Clean domain input
  let domain = rawInput;
  try {
    if (domain.includes('://')) {
      domain = new URL(domain).hostname;
    } else {
      domain = new URL('https://' + domain).hostname;
    }
  } catch (e) {
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
  domain = domain.replace(/^www\./, '');

  if (!domain || !domain.includes('.')) {
    alert('Please enter a valid website domain (e.g. twitch.tv).');
    return;
  }

  if (domain === RESERVED_OPTIONS_KEY) {
    alert('That name is reserved for the Remapad Settings mapping.');
    return;
  }

  if (settings.websiteMappings[domain]) {
    alert('This website is already mapped!');
    return;
  }

  // Copy default mappings for the new website mapping
  settings.websiteMappings[domain] = { ...settings.defaultMapping };
  selectedSiteKey = domain; // Select in editor immediately!
  unsavedChanges = true;
  newSiteInput.value = '';
  renderAll();
  showToast(`Added mapping for ${domain}`, 'success');
});

// ─── Modal Configuration Dialog Logic ─────────────────────────────────────────

let modalResolveFn = null;
let currentRecordedKey = '';

function handleModalKeyDown(e) {
  e.preventDefault();
  e.stopPropagation();

  let parts = [];
  if (e.ctrlKey && e.key !== 'Control') parts.push('Ctrl');
  if (e.altKey && e.key !== 'Alt') parts.push('Alt');
  if (e.shiftKey && e.key !== 'Shift') parts.push('Shift');
  if (e.metaKey && e.key !== 'Meta') parts.push('Meta');

  if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift' && e.key !== 'Meta') {
    if (e.key === ' ') {
      parts.push('Space');
    } else if (e.key === '+') {
      parts.push('Plus');
    } else {
      parts.push(e.key);
    }
  }

  const keyString = parts.join('+');
  if (keyString) {
    currentRecordedKey = keyString;
    detectedKeyDisplay.textContent = keyString;
    keyboardCaptureBox.classList.add('active');
  }
}

function openConfigModal(mode, currentVal = '') {
  return new Promise((resolve) => {
    modalResolveFn = resolve;
    configModal.style.display = 'flex';
    keyboardCaptureBox.classList.remove('active');
    
    if (mode === 'keyboard') {
      modalTitle.textContent = 'Configure Keyboard Key';
      modalKeyboardSec.style.display = 'block';
      modalSelectorSec.style.display = 'none';
      modalDomActionSec.style.display = 'none';
      
      currentRecordedKey = currentVal || '';
      detectedKeyDisplay.textContent = currentRecordedKey || 'Press any key...';
      
      window.addEventListener('keydown', handleModalKeyDown, true);
    } else {
      const isDomAction = mode === 'dom';
      modalTitle.textContent = isDomAction
        ? 'Configure Direct DOM Action'
        : mode === 'click' ? 'Configure Click Element' : mode === 'hover' ? 'Configure Hover Element' : 'Configure Focus Element';
      modalKeyboardSec.style.display = 'none';
      modalSelectorSec.style.display = 'block';
      modalDomActionSec.style.display = isDomAction ? 'block' : 'none';

      const config = isDomAction && currentVal ? currentVal : null;
      customSelectorInput.value = config?.selector || currentVal || '';
      commonSelectorsSelect.value = '';
      if (isDomAction) {
        domOperationSelect.value = DOM_ACTION_LABELS[config?.operation] ? config.operation : 'click';
        domValueInput.value = config?.value || '';
        updateDomValueField();
      }
    }
  });
}

function closeConfigModal(isConfirmed = false) {
  window.removeEventListener('keydown', handleModalKeyDown, true);
  configModal.style.display = 'none';
  
  if (modalResolveFn) {
    if (isConfirmed) {
      if (modalKeyboardSec.style.display === 'block') {
        modalResolveFn(currentRecordedKey || null);
      } else if (modalDomActionSec.style.display === 'block') {
        modalResolveFn(getDomActionConfig());
      } else {
        modalResolveFn(customSelectorInput.value.trim() || null);
      }
    } else {
      modalResolveFn(null);
    }
    modalResolveFn = null;
  }
}

function parseDomAction(action) {
  if (!action.startsWith('dom_action:')) return null;
  try {
    const config = JSON.parse(decodeURIComponent(action.substring('dom_action:'.length)));
    return isValidDomActionConfig(config) ? config : null;
  } catch (_) {
    return null;
  }
}

function getDomActionConfig() {
  const operation = domOperationSelect.value;
  const selector = customSelectorInput.value.trim();
  const value = domValueInput.value;
  const config = { operation, selector };

  if (operation === 'set-value' || operation === 'toggle-attribute') {
    config.value = value;
  }

  return isValidDomActionConfig(config) ? config : null;
}

function isValidDomActionConfig(config) {
  if (!config || !DOM_ACTION_LABELS[config.operation]) return false;
  if (typeof config.selector !== 'string' || !config.selector || config.selector.length > 2000) return false;
  if (config.operation === 'set-value') return typeof config.value === 'string' && config.value.length <= 2000;
  if (config.operation === 'toggle-attribute') return typeof config.value === 'string' && isToggleableDomAttribute(config.value);
  return true;
}

function isToggleableDomAttribute(attribute) {
  return TOGGLEABLE_DOM_ATTRIBUTES.has(attribute) || attribute.startsWith('aria-') || attribute.startsWith('data-');
}

function updateDomValueField() {
  const isSetValue = domOperationSelect.value === 'set-value';
  const isToggleAttribute = domOperationSelect.value === 'toggle-attribute';
  domValueGroup.style.display = isSetValue || isToggleAttribute ? 'block' : 'none';
  domValueLabel.textContent = isSetValue ? 'Value to set' : 'Attribute name';
  domValueInput.placeholder = isSetValue ? 'e.g. Stranger Things' : 'e.g. aria-expanded or hidden';
}

function formatDomActionLabel(action) {
  const config = parseDomAction(action);
  return config ? `${DOM_ACTION_LABELS[config.operation]}: ${config.selector}` : 'Direct DOM Action';
}

commonSelectorsSelect.addEventListener('change', () => {
  if (commonSelectorsSelect.value) {
    customSelectorInput.value = commonSelectorsSelect.value;
  }
});

domOperationSelect.addEventListener('change', updateDomValueField);

modalCloseX.addEventListener('click', () => closeConfigModal(false));
modalCancelBtn.addEventListener('click', () => closeConfigModal(false));
modalConfirmBtn.addEventListener('click', () => closeConfigModal(true));

// ─── Collection Navigation Config ─────────────────────────────────────────────

function renderCollectionConfig() {
  renderCNavSitesList();
  renderCNavEditor();
}

function renderCNavSitesList() {
  const listEl = document.getElementById('cnav-sites-list');
  if (!listEl) return;

  const sites = Object.keys(settings.siteCollections);
  if (!selectedCollectionSite || !sites.includes(selectedCollectionSite)) {
    selectedCollectionSite = sites[0] || '';
  }

  if (sites.length === 0) {
    listEl.innerHTML = `<p style="font-size:12px;color:var(--on-surface-variant);font-family:var(--font-body);text-align:center;padding:16px 0">No sites configured yet.<br>Add one below.</p>`;
    return;
  }

  listEl.innerHTML = sites.map(site => {
    const cfg = settings.siteCollections[site];
    const isConfigured = !!(cfg?.containerSelector && cfg?.itemSelector);
    const isActive = site === selectedCollectionSite;
    return `
      <button class="cnav-site-item${isActive ? ' active' : ''}" data-site="${escHtml(site)}">
        <span class="cnav-site-status${isConfigured ? ' configured' : ''}" title="${isConfigured ? 'Configured' : 'Empty — needs selectors'}"></span>
        <span class="cnav-site-label">
          <span class="cnav-site-name">${escHtml(getFriendlyLabel(site))}</span>
          <span class="cnav-site-domain">${escHtml(site)}</span>
        </span>
        <button class="btn-ghost cnav-site-delete" data-site="${escHtml(site)}" title="Remove" style="padding:2px 6px;font-size:14px;color:var(--on-surface-variant);flex-shrink:0;border:0;background:transparent;cursor:pointer;line-height:1">✕</button>
      </button>
    `;
  }).join('');

  // Wire site selection
  listEl.querySelectorAll('.cnav-site-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.cnav-site-delete')) return; // handled below
      selectedCollectionSite = btn.dataset.site;
      renderCNavSitesList();
      renderCNavEditor();
    });
  });

  // Wire delete buttons
  listEl.querySelectorAll('.cnav-site-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const site = btn.dataset.site;
      if (!confirm(`Remove collection config for ${site}?`)) return;
      delete settings.siteCollections[site];
      selectedCollectionSite = Object.keys(settings.siteCollections)[0] || '';
      unsavedChanges = true;
      renderCNavSitesList();
      renderCNavEditor();
    });
  });
}

function renderCNavEditor() {
  const editorEl = document.getElementById('cnav-editor-panel');
  if (!editorEl) return;

  if (!selectedCollectionSite) {
    editorEl.innerHTML = `
      <div class="cnav-empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        <p>Select a site from the list or add one to get started.</p>
      </div>`;
    return;
  }

  const cfg = settings.siteCollections[selectedCollectionSite] || { containerSelector: '', itemSelector: '' };

  editorEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
      <div>
        <div style="font-family:var(--font-headline);font-size:17px;font-weight:700;color:var(--on-surface)">${escHtml(getFriendlyLabel(selectedCollectionSite))}</div>
        <div style="font-size:12px;color:var(--on-surface-variant);font-family:var(--font-body);margin-top:1px">${escHtml(selectedCollectionSite)}</div>
      </div>
      <button id="cnav-delete-btn" class="btn-ghost" style="color:var(--error);font-size:12px">Remove Site</button>
    </div>

    <div style="margin-bottom:16px">
      <label class="cnav-field-label" for="cnav-container-input">Container Selector <span style="opacity:0.5;font-weight:400;text-transform:none">(rows / shelves)</span></label>
      <input type="text" id="cnav-container-input" class="cnav-input"
        placeholder="e.g. .lolomoRow, [data-testid=&quot;row&quot;]"
        value="${escHtml(cfg.containerSelector || '')}">
      <p style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);margin:4px 0 0;line-height:1.4">
        Matches each horizontal shelf or group of items.
      </p>
    </div>

    <div style="margin-bottom:16px">
      <label class="cnav-field-label" for="cnav-item-input">Item Selector <span style="opacity:0.5;font-weight:400;text-transform:none">(cards within a row)</span></label>
      <input type="text" id="cnav-item-input" class="cnav-input"
        placeholder="e.g. .title-card-container, [data-testid=&quot;card&quot;]"
        value="${escHtml(cfg.itemSelector || '')}">
      <p style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);margin:4px 0 0;line-height:1.4">
        Matches individual cards scoped inside a matched container.
      </p>
    </div>

    <div class="cnav-test-result" id="cnav-test-result"></div>

    <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)">
      <button id="cnav-test-btn" class="btn-ghost" style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        Test on Active Tab
      </button>
      <button id="cnav-save-btn" class="btn-primary" style="font-size:13px">Save</button>
    </div>
  `;

  // Delete
  document.getElementById('cnav-delete-btn')?.addEventListener('click', () => {
    if (!confirm(`Remove collection config for ${selectedCollectionSite}?`)) return;
    delete settings.siteCollections[selectedCollectionSite];
    selectedCollectionSite = Object.keys(settings.siteCollections)[0] || '';
    unsavedChanges = true;
    renderCNavSitesList();
    renderCNavEditor();
  });

  // Save (single site)
  document.getElementById('cnav-save-btn')?.addEventListener('click', () => {
    const containerSel = document.getElementById('cnav-container-input')?.value.trim() || '';
    const itemSel = document.getElementById('cnav-item-input')?.value.trim() || '';
    settings.siteCollections[selectedCollectionSite] = { containerSelector: containerSel, itemSelector: itemSel };
    unsavedChanges = true;
    saveSettings();
    renderCNavSitesList(); // refresh status dot
  });

  // Test selectors
  document.getElementById('cnav-test-btn')?.addEventListener('click', async () => {
    const containerSel = document.getElementById('cnav-container-input')?.value.trim() || '';
    const itemSel = document.getElementById('cnav-item-input')?.value.trim() || '';
    const resultEl = document.getElementById('cnav-test-result');
    if (!resultEl) return;

    resultEl.style.display = 'block';
    resultEl.style.background = 'rgba(255,255,255,0.04)';
    resultEl.style.color = 'var(--on-surface-variant)';
    resultEl.style.border = '1px solid rgba(255,255,255,0.06)';
    resultEl.textContent = 'Testing selectors on active tab…';

    try {
      const res = await api.runtime.sendMessage({
        type: 'COUNT_SELECTORS',
        containerSelector: containerSel,
        itemSelector: itemSel
      });
      if (res?.error) {
        resultEl.style.background = 'rgba(229,9,20,0.1)';
        resultEl.style.color = '#ffb4ab';
        resultEl.style.border = '1px solid rgba(229,9,20,0.2)';
        resultEl.textContent = `⚠ Error: ${res.error}`;
      } else {
        const { containerCount = 0, itemCount = 0 } = res || {};
        const ok = containerCount > 0;
        resultEl.style.background = ok ? 'rgba(74,222,128,0.08)' : 'rgba(250,204,21,0.08)';
        resultEl.style.color = ok ? '#4ade80' : '#facc15';
        resultEl.style.border = `1px solid ${ok ? 'rgba(74,222,128,0.2)' : 'rgba(250,204,21,0.2)'}`;
        resultEl.textContent = ok
          ? `✓ Found ${containerCount} row${containerCount !== 1 ? 's' : ''} with ${itemCount} total item${itemCount !== 1 ? 's' : ''} — looking good!`
          : `⚠ No rows matched. Make sure the page is loaded and you have a website tab open.`;
      }
    } catch (e) {
      resultEl.style.background = 'rgba(229,9,20,0.1)';
      resultEl.style.color = '#ffb4ab';
      resultEl.style.border = '1px solid rgba(229,9,20,0.2)';
      resultEl.textContent = `⚠ Could not reach active tab. Open the target site first.`;
    }
  });
}

function parseDomain(rawInput) {
  let domain = rawInput.trim().toLowerCase();
  try {
    domain = new URL(domain.includes('://') ? domain : 'https://' + domain).hostname;
  } catch (e) {
    domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
  return domain.replace(/^www\./, '');
}

// ─── Tab Switching ─────────────────────────────────────────────────────────────

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPanelId = btn.getAttribute('aria-controls');
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(p => p.hidden = true);

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const panel = document.getElementById(targetPanelId);
      if (panel) {
        panel.hidden = false;
        if (targetPanelId === 'tab-panel-collection') {
          renderCollectionConfig();
        }
        if (targetPanelId === 'tab-panel-navigation') {
          renderNavConfig();
        }
      }
    });
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

window.addEventListener('gamepadconnected', () => startPolling());
window.addEventListener('gamepaddisconnected', () => pollGamepads());

muteActivationToggle?.addEventListener('change', () => {
  settings.muteActivation = muteActivationToggle.checked;
  saveSettings();
});

// Add-site button (Collection Nav tab)
document.getElementById('collection-add-site-btn')?.addEventListener('click', () => {
  const rawInput = document.getElementById('collection-new-site-input')?.value || '';
  const domain = parseDomain(rawInput);

  if (!domain || !domain.includes('.')) {
    alert('Please enter a valid website domain (e.g. disneyplus.com).');
    return;
  }

  if (!settings.siteCollections[domain]) {
    settings.siteCollections[domain] = { containerSelector: '', itemSelector: '' };
  }
  selectedCollectionSite = domain;
  unsavedChanges = true;

  const input = document.getElementById('collection-new-site-input');
  if (input) input.value = '';

  renderCNavSitesList();
  renderCNavEditor();
  showToast(`Added ${domain} — fill in the selectors and save.`, 'success');
});

// Save All button
document.getElementById('cnav-save-all-btn')?.addEventListener('click', () => {
  saveSettings();
});

(async () => {
  await loadSettings();
  initTabs();
  bindNavInputs();
  startPolling();
})();
