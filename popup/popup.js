/**
 * Remapad Popup — Dashboard Controller JS
 */

'use strict';

const api = typeof chrome !== 'undefined' ? chrome : browser;

// ─── Constants & Default Settings ────────────────────────────────────────────

const DEFAULT_PROFILE = {
  "0": "click",
  "1": "back",
  "2": "fullscreen",
  "3": "search",
  "4": "seek_backward",
  "5": "seek_forward",
  "6": "volume_down",
  "7": "volume_up",
  "8": "toggle_play",
  "9": "open_options",
  "12": "scroll_up",
  "13": "scroll_down",
  "14": "scroll_left",
  "15": "scroll_right"
};

const WEBSITE_MAPPINGS_DEFAULT = {
  'netflix.com':    { ...DEFAULT_PROFILE },
  'primevideo.com': { ...DEFAULT_PROFILE },
};

// ─── State ────────────────────────────────────────────────────────────────────

let currentHostname = '';
let settings = {
  iconStyle: 'playstation',
  websiteMappings: { ...WEBSITE_MAPPINGS_DEFAULT },
  defaultMapping: { ...DEFAULT_PROFILE },
  enabledSites: {}, // host -> bool
  globalEnabled: true
};

// ─── DOM Elements ─────────────────────────────────────────────────────────────

const globalToggle        = document.getElementById('global-toggle');
const siteToggle          = document.getElementById('site-toggle');
const mappingStatusBadge  = document.getElementById('mapping-status-badge');
const customizeSiteBtn    = document.getElementById('customize-site-btn');
const siteDomainEl        = document.getElementById('site-domain');
const controllerNameEl    = document.getElementById('controller-name');
const batteryInfoEl       = document.getElementById('battery-info');
const batteryTextEl       = document.getElementById('battery-text');
const statusBadgeEl      = document.getElementById('status-badge');
const statusDotEl        = document.getElementById('status-dot');
const statusTextEl       = document.getElementById('status-text');
const openOptionsBtn     = document.getElementById('open-options-btn');
const goToEditorBtn      = document.getElementById('go-to-editor-btn');
const activeIndicator    = document.getElementById('global-active-indicator');
const activeTabCard      = document.getElementById('active-tab-card');

// ─── Load Settings & Active Tab ────────────────────────────────────────────────

async function init() {
  try {
    // 1. Get active tab
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.startsWith('http')) {
      currentHostname = new URL(tab.url).hostname.replace('www.', '');
      siteDomainEl.textContent = currentHostname;
    } else {
      currentHostname = '';
      siteDomainEl.textContent = 'No active streaming site';
      siteToggle.disabled = true;
      customizeSiteBtn.disabled = true;
      activeTabCard.style.opacity = '0.5';
    }

    // 2. Load storage settings
    const data = await api.storage.local.get([
      'iconStyle', 'websiteMappings', 'defaultMapping', 'enabledSites', 'globalEnabled'
    ]);

    if (data.iconStyle) settings.iconStyle = data.iconStyle;
    if (data.websiteMappings && Object.keys(data.websiteMappings).length > 0) {
      settings.websiteMappings = data.websiteMappings;
    } else {
      settings.websiteMappings = { ...WEBSITE_MAPPINGS_DEFAULT };
    }
    if (data.defaultMapping) settings.defaultMapping = data.defaultMapping;
    if (data.enabledSites) settings.enabledSites = data.enabledSites;
    if (data.globalEnabled !== undefined) settings.globalEnabled = data.globalEnabled;

    // 3. Render Shortcuts
    renderShortcuts();

    // 4. Update UI checkboxes
    globalToggle.checked = settings.globalEnabled;
    if (currentHostname) {
      siteToggle.checked = settings.enabledSites[currentHostname] !== false;
    }

    updateActiveIndicators();
  } catch (e) {
    console.error('[Remapad Popup] Init error:', e);
  }
}

function updateActiveIndicators() {
  const siteActive = currentHostname && settings.enabledSites[currentHostname] !== false;
  const totalActive = settings.globalEnabled && siteActive;

  if (totalActive) {
    activeIndicator.classList.add('active');
    activeIndicator.title = 'Active on this page';
  } else {
    activeIndicator.classList.remove('active');
    activeIndicator.title = settings.globalEnabled ? 'Disabled on this site' : 'Disabled globally';
  }

  // Update Mapping Status Badge
  if (currentHostname) {
    const hasCustom = settings.websiteMappings[currentHostname] !== undefined;
    if (hasCustom) {
      mappingStatusBadge.textContent = 'Site-specific Mapping';
      mappingStatusBadge.style.background = 'rgba(0, 168, 225, 0.15)';
      mappingStatusBadge.style.color = '#00a8e1';
    } else {
      mappingStatusBadge.textContent = 'Default Mapping';
      mappingStatusBadge.style.background = 'rgba(255,255,255,0.06)';
      mappingStatusBadge.style.color = 'var(--on-surface)';
    }
  }
}

// ─── UI Actions / Listeners ───────────────────────────────────────────────────

globalToggle.addEventListener('change', async () => {
  settings.globalEnabled = globalToggle.checked;
  await api.storage.local.set({ globalEnabled: settings.globalEnabled });
  updateActiveIndicators();
});

siteToggle.addEventListener('change', async () => {
  if (!currentHostname) return;
  settings.enabledSites[currentHostname] = siteToggle.checked;
  await api.storage.local.set({ enabledSites: settings.enabledSites });
  updateActiveIndicators();
});

customizeSiteBtn.addEventListener('click', () => {
  const url = api.runtime.getURL('options/options.html') + (currentHostname ? '?site=' + encodeURIComponent(currentHostname) : '');
  api.tabs.create({ url });
  window.close();
});

// Configure Options
const triggerOptions = () => {
  api.runtime.openOptionsPage();
  window.close();
};

openOptionsBtn.addEventListener('click', triggerOptions);
goToEditorBtn.addEventListener('click', triggerOptions);

// Dynamic Shortcut Launching
function renderShortcuts() {
  const grid = document.getElementById('shortcuts-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const domains = Object.keys(settings.websiteMappings);
  if (domains.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:12px 0;color:var(--on-surface-variant);font-size:12px;font-family:var(--font-body)">
        No shortcuts configured.
      </div>
    `;
    return;
  }

  domains.forEach(domain => {
    const badge = document.createElement('div');
    badge.className = 'shortcut-badge';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.padding = '0';
    badge.style.overflow = 'hidden';
    badge.title = domain;

    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

    badge.innerHTML = `
      <img src="${faviconUrl}" style="width:20px;height:20px;border-radius:2px;display:block" onerror="this.style.display='none'; this.nextElementSibling.style.display='block'">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;display:none;color:var(--on-surface-variant)"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
    `;

    badge.addEventListener('click', () => {
      const url = domain.startsWith('http') ? domain : `https://${domain}`;
      api.tabs.create({ url });
      window.close();
    });

    grid.appendChild(badge);
  });
}

// ─── Gamepad Polling & Visual Input Tester ───────────────────────────────────

let pollInterval = null;

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(pollGamepads, 50);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function pollGamepads() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...gamepads].find(g => g && g.connected);

  if (gp) {
    // 1. Update Connection Info
    const rawName = gp.id.split('(')[0].trim() || 'Controller';
    controllerNameEl.textContent = rawName.length > 20 ? rawName.slice(0, 20) + '…' : rawName;
    
    statusBadgeEl.className = 'status-badge connected';
    statusDotEl.className   = 'status-dot pulse';
    statusTextEl.textContent = 'CONNECTED';

    // 2. Poll inputs & trigger live tags highlight
    gp.buttons.forEach((btn, idx) => {
      const tag = document.querySelector(`.input-tag[data-btn="${idx}"]`);
      if (tag) {
        if (btn.pressed || btn.value > 0.5) {
          tag.classList.add('active');
        } else {
          tag.classList.remove('active');
        }
      }
    });
  } else {
    // Disconnected state
    controllerNameEl.textContent = 'No Controller Detected';
    statusBadgeEl.className = 'status-badge disconnected';
    statusDotEl.className   = 'status-dot';
    statusTextEl.textContent = 'DISCONNECTED';
    batteryInfoEl.style.display = 'none';

    // Clear all highlights
    document.querySelectorAll('.input-tag').forEach(tag => tag.classList.remove('active'));
  }
}

// Listen to standard connection events
window.addEventListener('gamepadconnected', () => {
  startPolling();
});

window.addEventListener('gamepaddisconnected', () => {
  pollGamepads(); // will clear state
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

(async () => {
  await init();
  startPolling(); // poll gamepad immediately
})();
