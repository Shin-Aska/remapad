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
  "9": "toggle_hud",
  "10": "none",
  "11": "none",
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
let legacyProfiles = {};
let settings = {
  iconStyle: 'auto',
  websiteMappings: { ...WEBSITE_MAPPINGS_DEFAULT },
  defaultMapping: { ...DEFAULT_PROFILE },
  enabledSites: {}, // host -> bool
  globalEnabled: true
};

// ─── DOM Elements ─────────────────────────────────────────────────────────────

const globalToggle        = document.getElementById('global-toggle');
const siteToggle          = document.getElementById('site-toggle');
const mappingStatusBadge  = document.getElementById('mapping-status-badge');
const autoplayStatusBadge = document.getElementById('autoplay-status-badge');
const customizeSiteBtn    = document.getElementById('customize-site-btn');
const siteDomainEl        = document.getElementById('site-domain');
const controllerNameEl    = document.getElementById('controller-name');
const batteryInfoEl       = document.getElementById('battery-info');
const batteryTextEl       = document.getElementById('battery-text');
const statusBadgeEl      = document.getElementById('status-badge');
const statusDotEl        = document.getElementById('status-dot');
const statusTextEl       = document.getElementById('status-text');
const openOptionsBtn     = document.getElementById('open-options-btn');
const activeIndicator    = document.getElementById('global-active-indicator');
const activeTabCard      = document.getElementById('active-tab-card');

// ─── Load Settings & Active Tab ────────────────────────────────────────────────

async function init() {
  try {
    // 1. Get active tab
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.startsWith('http')) {
      currentHostname = new URL(tab.url).hostname.replace(/^www\./, '');
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
      'iconStyle', 'websiteMappings', 'defaultMapping', 'profiles', 'enabledSites', 'globalEnabled'
    ]);

    if (data.iconStyle) settings.iconStyle = data.iconStyle;
    if (data.websiteMappings && Object.keys(data.websiteMappings).length > 0) {
      settings.websiteMappings = data.websiteMappings;
    } else {
      settings.websiteMappings = { ...WEBSITE_MAPPINGS_DEFAULT };
    }
    if (data.defaultMapping) settings.defaultMapping = data.defaultMapping;
    if (data.profiles) legacyProfiles = data.profiles;
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
    loadAutoplayStatus();
  } catch (e) {
    console.error('[Remapad Popup] Init error:', e);
  }
}

async function loadAutoplayStatus() {
  try {
    const response = await new Promise(resolve => {
      api.runtime.sendMessage({ type: 'GET_AUTOPLAY_STATUS' }, resolve);
    });
    if (!response || response.error || !response.status) {
      renderAutoplayStatus(null);
      return;
    }
    renderAutoplayStatus(response.status);
  } catch (e) {
    console.error('[Remapad Popup] Autoplay status error:', e);
    renderAutoplayStatus(null);
  }
}

function renderAutoplayStatus(status) {
  if (!status) {
    autoplayStatusBadge.textContent = 'Unavailable';
    autoplayStatusBadge.style.background = 'rgba(255,255,255,0.06)';
    autoplayStatusBadge.style.color = 'var(--on-surface-variant)';
    return;
  }

  const audioBlocked = status.audio === 'blocked' || status.mediaelement === 'disallowed';
  const videoBlocked = status.video === 'blocked' || status.mediaelement === 'disallowed';
  const anyBlocked = audioBlocked || videoBlocked;
  const mutedOnly = status.mediaelement === 'allowed-muted' && !anyBlocked;

  if (anyBlocked) {
    autoplayStatusBadge.textContent = audioBlocked && videoBlocked ? 'Audio + Video blocked' : audioBlocked ? 'Audio blocked' : 'Video blocked';
    autoplayStatusBadge.style.background = 'rgba(229, 9, 20, 0.15)';
    autoplayStatusBadge.style.color = '#e50914';
  } else if (mutedOnly) {
    autoplayStatusBadge.textContent = 'Muted only';
    autoplayStatusBadge.style.background = 'rgba(255, 193, 7, 0.15)';
    autoplayStatusBadge.style.color = '#ffc107';
  } else {
    autoplayStatusBadge.textContent = 'Allowed';
    autoplayStatusBadge.style.background = 'rgba(76, 175, 80, 0.15)';
    autoplayStatusBadge.style.color = '#4caf50';
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
      const storedMapping = settings.websiteMappings[currentHostname];
      const mapping = typeof storedMapping === 'string'
        ? legacyProfiles[storedMapping] || settings.defaultMapping
        : storedMapping;
      const mappedCount = mapping && typeof mapping === 'object'
        ? Object.values(mapping).filter(action => action && action !== 'none').length
        : 0;
      mappingStatusBadge.textContent = `${mappedCount} mapped controls`;
      mappingStatusBadge.style.background = 'rgba(0, 168, 225, 0.15)';
      mappingStatusBadge.style.color = '#00a8e1';
      customizeSiteBtn.textContent = `Edit mapping for ${currentHostname}`;
      customizeSiteBtn.setAttribute('aria-label', `Edit mapping for ${currentHostname}`);
    } else {
      mappingStatusBadge.textContent = 'No site mapping yet';
      mappingStatusBadge.style.background = 'rgba(255,255,255,0.06)';
      mappingStatusBadge.style.color = 'var(--on-surface)';
      customizeSiteBtn.textContent = `Create mapping for ${currentHostname}`;
      customizeSiteBtn.setAttribute('aria-label', `Create mapping for ${currentHostname}`);
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
      <img src="${faviconUrl}" style="width:20px;height:20px;border-radius:2px;display:block">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;display:none;color:var(--on-surface-variant)"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
    `;

    const faviconImg = badge.querySelector('img');
    const fallbackSvg = badge.querySelector('svg');
    if (faviconImg && fallbackSvg) {
      faviconImg.addEventListener('error', () => {
        faviconImg.style.display = 'none';
        fallbackSvg.style.display = 'block';
      });
    }

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
