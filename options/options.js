/**
 * Remapad Options — Visual Controller & Profiles Mapping Editor
 */

'use strict';

const api = typeof chrome !== 'undefined' ? chrome : browser;

// ─── Constants & Default Settings ────────────────────────────────────────────

const WEBSITE_MAPPINGS_DEFAULT = {
  'netflix.com':    'default',
  'primevideo.com': 'default',
};

const FRIENDLY_NAMES = {
  'netflix.com': 'Netflix',
  'primevideo.com': 'Prime Video',
  'youtube.com': 'YouTube',
  'twitch.tv': 'Twitch',
  'disneyplus.com': 'Disney+',
  'hulu.com': 'Hulu',
  'max.com': 'Max'
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
  "9": "quick_map",      // Start
  "12": "scroll_up",     // D-Pad Up
  "13": "scroll_down",   // D-Pad Down
  "14": "scroll_left",   // D-Pad Left
  "15": "scroll_right"   // D-Pad Right
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
  { value: 'quick_map',            label: 'Quick Map on Page'            },
  { value: 'open_options',         label: 'Open Options Editor'          },
  // Collection navigation
  { value: 'nav_next_collection',  label: '⬇ Next Row (Collection Nav)'  },
  { value: 'nav_prev_collection',  label: '⬆ Prev Row (Collection Nav)'  },
  { value: 'nav_next_item',        label: '➡ Next Item (Collection Nav)' },
  { value: 'nav_prev_item',        label: '⬅ Prev Item (Collection Nav)' },
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
  "8": "Select Button", "9": "Start Button", "12": "D-Pad Up", "13": "D-Pad Down",
  "14": "D-Pad Left", "15": "D-Pad Right"
};

// ─── State ────────────────────────────────────────────────────────────────────

let settings = {
  iconStyle:       'playstation',
  websiteMappings: {
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
  }
};

let selectedSiteKey  = 'default';
let selectedCollectionSite = '';
let activeCalloutBtn = null;
let unsavedChanges   = false;

// ─── DOM Elements ─────────────────────────────────────────────────────────────

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

// ─── Load Settings ────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const data = await api.storage.local.get([
      'iconStyle', 'websiteMappings', 'defaultMapping', 'profiles', 'enabledSites', 'globalEnabled', 'siteCollections'
    ]);

    if (data.iconStyle) settings.iconStyle = data.iconStyle;
    if (data.enabledSites) settings.enabledSites = data.enabledSites;
    if (data.globalEnabled !== undefined) settings.globalEnabled = data.globalEnabled;
    if (data.siteCollections && typeof data.siteCollections === 'object') {
      settings.siteCollections = data.siteCollections;
    }

    if (data.profiles && Object.keys(data.profiles).length > 0) {
      const profiles = data.profiles;
      const defaultProfile = profiles['default'] || DEFAULT_PROFILE;
      settings.defaultMapping = { ...defaultProfile };
      settings.websiteMappings = {};
      if (data.websiteMappings) {
        Object.keys(data.websiteMappings).forEach(domain => {
          const val = data.websiteMappings[domain];
          if (typeof val === 'string') {
            settings.websiteMappings[domain] = { ...(profiles[val] || defaultProfile) };
          } else if (val && typeof val === 'object') {
            settings.websiteMappings[domain] = val;
          }
        });
      }
      await api.storage.local.set({
        defaultMapping: settings.defaultMapping,
        websiteMappings: settings.websiteMappings
      });
      await api.storage.local.remove('profiles');
    } else {
      if (data.defaultMapping) {
        settings.defaultMapping = data.defaultMapping;
      } else {
        settings.defaultMapping = { ...DEFAULT_PROFILE };
      }
      if (data.websiteMappings && Object.keys(data.websiteMappings).length > 0) {
        settings.websiteMappings = data.websiteMappings;
      } else {
        settings.websiteMappings = {
          'netflix.com':    { ...DEFAULT_PROFILE },
          'primevideo.com': { ...DEFAULT_PROFILE }
        };
      }
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

// ─── Save Settings ────────────────────────────────────────────────────────────

async function saveSettings() {
  try {
    await api.storage.local.set({
      iconStyle:       settings.iconStyle,
      websiteMappings: settings.websiteMappings,
      defaultMapping:  settings.defaultMapping,
      enabledSites:    settings.enabledSites,
      globalEnabled:   settings.globalEnabled,
      siteCollections: settings.siteCollections
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
  renderEditorSiteSelect();
  renderWebsiteMappings();
  renderIconStyles();
  populateVisualLabels();
  renderCollectionConfig();
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
      <div class="mapping-row-left" style="display:flex;align-items:center;gap:8px;flex:1;overflow:hidden">
        <img class="site-favicon-img" src="https://www.google.com/s2/favicons?sz=32&domain=${domain}" style="width:16px;height:16px;border-radius:2px;display:block;flex-shrink:0" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
        <svg class="fallback-globe-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:none;color:var(--on-surface-variant);flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span class="mapping-row-label" style="font-family:var(--font-body);font-size:13px;color:var(--on-surface);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${friendlyName} (${domain})">${friendlyName} <span style="font-size:11px;color:var(--on-surface-variant);margin-left:4px">(${domain})</span></span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <button class="delete-site-btn" data-site="${domain}" style="background:none;border:none;color:var(--error);cursor:pointer;padding:4px;display:flex;align-items:center;opacity:0.7;transition:opacity 0.2s" title="Remove site mapping">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    `;

    const rowLeft = row.querySelector('.mapping-row-left');
    rowLeft.addEventListener('click', () => {
      selectedSiteKey = domain;
      editorSiteSelect.value = domain;
      populateVisualLabels();
      closeDropdown();
      renderWebsiteMappings();
    });

    const deleteBtn = row.querySelector('.delete-site-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
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
      const displayAction = btnKey === '9' && action === 'open_options' ? 'quick_map' : action;
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
    } else if (activeCalloutBtn === '9' && currentVal === 'open_options') {
      actionSelect.value = 'quick_map';
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

    statusBadgeEl.className = 'status-badge connected';
    statusDotEl.className   = 'status-dot pulse';
    statusTextEl.textContent = 'CONNECTED';

    // 1. Highlight visual buttons inside SVG in real-time
    gp.buttons.forEach((btn, idx) => {
      const isPressed = btn.pressed || btn.value > 0.5;
      const wasPressed = prevPressed[idx] || false;
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
    const leftStickThumb = document.getElementById('svg-axis-L-thumb');
    const rightStickThumb = document.getElementById('svg-axis-R-thumb');

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

  } else {
    deviceNameEl.textContent = 'No Controller Detected';
    navControllerNameEl.textContent = 'No Controller';
    statusBadgeEl.className = 'status-badge disconnected';
    statusDotEl.className   = 'status-dot';
    statusTextEl.textContent = 'DISCONNECTED';
    deviceBatteryEl.style.display = 'none';

    // Clear highlights
    document.querySelectorAll('.svg-btn').forEach(btn => btn.classList.remove('highlighted'));
  }
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
        // Render collection config when switching to that tab
        if (targetPanelId === 'tab-panel-collection') {
          renderCollectionConfig();
        }
      }
    });
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

window.addEventListener('gamepadconnected', () => startPolling());
window.addEventListener('gamepaddisconnected', () => pollGamepads());

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
  startPolling();
})();

