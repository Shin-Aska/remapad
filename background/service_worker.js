/**
 * Remapad — Service Worker (Background Broker)
 * Compatible with Chrome and Firefox MV3.
 */

'use strict';

const api = typeof chrome !== 'undefined' ? chrome : browser;

const REMAPAD_SCRIPT_IDS = Object.freeze({
  blocker: 'remapad-mapped-gamepad-blocker',
  controller: 'remapad-mapped-controller'
});

const REMAPAD_CONTROLLER_FILES = Object.freeze([
  'shared/language-detector.js',
  'shared/keyboard.js',
  'content/modules/constants.js',
  'content/modules/utils.js',
  'content/modules/messaging-client.js',
  'content/modules/controller-style.js',
  'content/modules/settings-store.js',
  'content/modules/site-policy.js',
  'content/modules/dom-simulator.js',
  'content/modules/cursor-controller.js',
  'content/modules/autoplay-service.js',
  'content/modules/modal-focus-manager.js',
  'content/modules/navigation-controller.js',
  'content/modules/overlay-styles.js',
  'content/modules/hud-controller.js',
  'content/modules/tutorial-controller.js',
  'content/content_script.js'
]);
const DEFAULT_WEBSITE_MAPPINGS = Object.freeze({
  'netflix.com': true,
  'primevideo.com': true
});
let contentScriptSyncQueue = Promise.resolve();
const notificationSourceCache = new Map();

function normalizeMappedHostname(value) {
  if (typeof value !== 'string') return null;
  const hostname = value.trim().toLowerCase().replace(/^www\./, '');
  if (!hostname || hostname === '__remapad_options__') return null;
  if (hostname.includes('/') || hostname.includes(':') || hostname.includes('*')) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname)) return null;
  return hostname;
}

function buildMappedMatchPatterns(websiteMappings, enabledSites, globalEnabled) {
  if (!globalEnabled || !websiteMappings || typeof websiteMappings !== 'object') return [];

  const hostnames = new Set();
  for (const key of Object.keys(websiteMappings)) {
    const hostname = normalizeMappedHostname(key);
    if (!hostname || enabledSites?.[hostname] === false) continue;
    hostnames.add(hostname);
  }

  return [...hostnames].sort().flatMap(hostname => [
    `*://${hostname}/*`,
    `*://www.${hostname}/*`
  ]);
}

async function filterGrantedMatchPatterns(matches) {
  const granted = [];
  for (const pattern of matches) {
    if (await api.permissions.contains({ origins: [pattern] })) {
      granted.push(pattern);
    }
  }
  return granted;
}

async function syncMappedContentScripts() {
  if (!api.scripting?.registerContentScripts) {
    console.error('[Remapad BG] Dynamic content scripts are unavailable; refusing wildcard injection.');
    return;
  }

  const data = await api.storage.local.get(['websiteMappings', 'enabledSites', 'globalEnabled']);
  const websiteMappings = data.websiteMappings === undefined
    ? DEFAULT_WEBSITE_MAPPINGS
    : data.websiteMappings;
  const requestedMatches = buildMappedMatchPatterns(
    websiteMappings,
    data.enabledSites,
    data.globalEnabled !== false
  );
  const matches = await filterGrantedMatchPatterns(requestedMatches);
  const ids = Object.values(REMAPAD_SCRIPT_IDS);

  const registered = await api.scripting.getRegisteredContentScripts({ ids });
  const registeredIds = registered.map(script => script.id);
  if (registeredIds.length) {
    await api.scripting.unregisterContentScripts({ ids: registeredIds });
  }

  if (!matches.length) return;

  await api.scripting.registerContentScripts([
    {
      id: REMAPAD_SCRIPT_IDS.blocker,
      matches,
      js: ['content/gamepad_blocker.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: REMAPAD_SCRIPT_IDS.controller,
      matches,
      js: REMAPAD_CONTROLLER_FILES,
      runAt: 'document_idle'
    }
  ]);
}

function queueMappedContentScriptSync() {
  contentScriptSyncQueue = contentScriptSyncQueue
    .catch(() => {})
    .then(syncMappedContentScripts);
  return contentScriptSyncQueue;
}

async function loadNotificationSources(preset) {
  if (preset !== 'access_point' && preset !== 'protocol') return [];
  if (notificationSourceCache.has(preset)) return notificationSourceCache.get(preset);

  const sourcePromise = Promise.all([
    { extension: 'ogg', mime: 'audio/ogg' },
    { extension: 'mp3', mime: 'audio/mpeg' }
  ].map(async ({ extension, mime }) => {
    const url = api.runtime.getURL(`assets/notifications/${preset}.${extension}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load ${preset}.${extension}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return `data:${mime};base64,${btoa(binary)}`;
  })).catch(error => {
    notificationSourceCache.delete(preset);
    throw error;
  });

  notificationSourceCache.set(preset, sourcePromise);
  return sourcePromise;
}

async function isActiveMappedTabSender(sender) {
  let hostname;
  try {
    const url = new URL(sender.tab?.url || '');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    hostname = normalizeMappedHostname(url.hostname);
  } catch (_) {
    return false;
  }
  if (!hostname) return false;

  const data = await api.storage.local.get(['websiteMappings', 'enabledSites', 'globalEnabled']);
  if (data.globalEnabled === false || data.enabledSites?.[hostname] === false) return false;
  const websiteMappings = data.websiteMappings === undefined
    ? DEFAULT_WEBSITE_MAPPINGS
    : data.websiteMappings;
  return Object.keys(websiteMappings || {}).some(key => normalizeMappedHostname(key) === hostname);
}

api.runtime.onInstalled.addListener(() => {
  queueMappedContentScriptSync().catch(error => {
    console.error('[Remapad BG] Unable to register mapped content scripts:', error);
  });
});

api.runtime.onStartup.addListener(() => {
  queueMappedContentScriptSync().catch(error => {
    console.error('[Remapad BG] Unable to refresh mapped content scripts:', error);
  });
});

api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes.websiteMappings && !changes.enabledSites && !changes.globalEnabled) return;
  queueMappedContentScriptSync().catch(error => {
    console.error('[Remapad BG] Unable to update mapped content scripts:', error);
  });
});

api.permissions.onAdded.addListener(() => {
  queueMappedContentScriptSync().catch(error => {
    console.error('[Remapad BG] Unable to apply added site permission:', error);
  });
});

api.permissions.onRemoved.addListener(() => {
  queueMappedContentScriptSync().catch(error => {
    console.error('[Remapad BG] Unable to apply removed site permission:', error);
  });
});

// Also reconcile on service-worker wake in case storage changed while a
// previous worker instance was unavailable.
queueMappedContentScriptSync().catch(error => {
  console.error('[Remapad BG] Unable to initialize mapped content scripts:', error);
});

// Listen for messages from content scripts, popups, or options page
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_NOTIFICATION_SOURCES') {
    if (sender.id !== api.runtime.id) {
      sendResponse({ sources: [] });
      return false;
    }
    loadNotificationSources(message.preset)
      .then(sources => sendResponse({ sources }))
      .catch(error => sendResponse({ sources: [], error: error.message }));
    return true;
  }

  if (message && message.type === 'BROWSER_ACTION') {
    isActiveMappedTabSender(sender)
      .then(active => active
        ? handleBrowserAction(message.action, sender)
        : { error: 'Remapad is inactive on this site.' })
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keeps channel open for async response
  }

  if (message && message.type === 'GET_AUTOPLAY_STATUS') {
    getActiveTab().then(tab => {
      if (!tab?.id) {
        sendResponse({ error: 'No active tab found.' });
        return;
      }
      api.tabs.sendMessage(tab.id, message)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ error: err.message }));
    });
    return true;
  }

  if (message && message.type === 'COUNT_SELECTORS') {
    getActiveTab().then(tab => {
      if (!tab?.id) {
        sendResponse({ error: 'No active tab found.' });
        return;
      }
      api.tabs.sendMessage(tab.id, message)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ error: err.message }));
    });
    return true;
  }

  if (message && message.type === 'OPEN_SITE_MAPPING') {
    isActiveMappedTabSender(sender)
      .then(async active => {
        if (!active) return { error: 'Remapad is inactive on this site.' };
        const hostname = normalizeMappedHostname(new URL(sender.tab.url).hostname);
        const url = api.runtime.getURL('options/options.html') + '?site=' + encodeURIComponent(hostname);
        await api.tabs.create({ url });
        return { success: true };
      })
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

/**
 * Handle browser actions requested by tab or popup
 */
async function handleBrowserAction(action, sender) {
  console.log('[Remapad BG] Action requested:', action);

  switch (action) {
    case 'next_tab': {
      const activeTab = await getActiveTab();
      if (!activeTab) return { success: false };
      const allTabs = await api.tabs.query({ currentWindow: true });
      if (allTabs.length <= 1) return { success: true };

      allTabs.sort((a, b) => a.index - b.index);
      const activeIndex = allTabs.findIndex(t => t.id === activeTab.id);
      const nextIndex = (activeIndex + 1) % allTabs.length;
      await api.tabs.update(allTabs[nextIndex].id, { active: true });
      return { success: true };
    }

    case 'prev_tab': {
      const activeTab = await getActiveTab();
      if (!activeTab) return { success: false };
      const allTabs = await api.tabs.query({ currentWindow: true });
      if (allTabs.length <= 1) return { success: true };

      allTabs.sort((a, b) => a.index - b.index);
      const activeIndex = allTabs.findIndex(t => t.id === activeTab.id);
      const prevIndex = (activeIndex - 1 + allTabs.length) % allTabs.length;
      await api.tabs.update(allTabs[prevIndex].id, { active: true });
      return { success: true };
    }

    case 'close_tab': {
      const activeTab = await getActiveTab();
      if (activeTab && activeTab.id) {
        await api.tabs.remove(activeTab.id);
        return { success: true };
      }
      return { success: false };
    }

    case 'open_options': {
      await api.runtime.openOptionsPage();
      return { success: true };
    }

    case 'toggle_window_fullscreen': {
      const windowId = sender.tab?.windowId || (await getActiveTab())?.windowId || api.windows.WINDOW_ID_CURRENT;
      const currentWindow = await api.windows.get(windowId);
      const nextState = currentWindow.state === 'fullscreen' ? 'normal' : 'fullscreen';
      await api.windows.update(windowId, { state: nextState });
      return { success: true };
    }

    default:
      return { error: 'Unknown browser action: ' + action };
  }
}

/**
 * Helper to get active tab in current window
 */
async function getActiveTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}
