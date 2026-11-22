/**
 * Remapad — Service Worker (Background Broker)
 * Compatible with Chrome and Firefox MV3.
 */

'use strict';

if (typeof importScripts === 'function') importScripts('../shared/navigation-mode.js');

const api = typeof chrome !== 'undefined' ? chrome : browser;
const { OPTIONS_MAPPING_KEY } = RemapadNavigationMode;
const OPTIONS_PAGE = 'options/options.html';
const BROWSE_PAGE = 'browse/browse.html';

const REMAPAD_SCRIPT_IDS = Object.freeze({
  blocker: 'remapad-mapped-gamepad-blocker',
  controller: 'remapad-mapped-controller'
});

const REMAPAD_CONTROLLER_FILES = Object.freeze([
  'shared/language-detector.js',
  'shared/safe-dom.js',
  'shared/keyboard.js',
  'shared/navigation-mode.js',
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
const DEFAULT_SITE_BINDINGS = Object.freeze({
  0: 'click', 1: 'back', 2: 'fullscreen', 3: 'search', 4: 'seek_backward', 5: 'seek_forward',
  6: 'volume_down', 7: 'volume_up', 8: 'toggle_play', 9: 'toggle_hud', 10: 'none', 11: 'none',
  12: 'scroll_up', 13: 'scroll_down', 14: 'scroll_left', 15: 'scroll_right'
});
const NEXT_TAB_MIGRATION = { key: 'nextTabMigration', popupParam: 'nextTabMigrationPopup' };
const SAVED_MAPPINGS_MIGRATION = { key: 'savedMappingsMigration', popupParam: 'savedMappingsMigrationPopup' };
let contentScriptSyncQueue = Promise.resolve();
const notificationSourceCache = new Map();

function normalizeMappedHostname(value) {
  if (typeof value !== 'string') return null;
  const hostname = value.trim().toLowerCase().replace(/^www\./, '');
  if (!hostname || hostname === OPTIONS_MAPPING_KEY) return null;
  if (hostname.includes('/') || hostname.includes(':') || hostname.includes('*')) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname)) return null;
  return hostname;
}

function getSiteOriginPatterns(hostname) {
  const origin = `*://${hostname}/*`;
  return /^(?:\d+\.){3}\d+$/.test(hostname) ? [origin] : [origin, `*://www.${hostname}/*`];
}

function buildMappedMatchPatterns(websiteMappings, enabledSites, globalEnabled) {
  if (!globalEnabled || !websiteMappings || typeof websiteMappings !== 'object') return [];

  const hostnames = new Set();
  for (const key of Object.keys(websiteMappings)) {
    const hostname = normalizeMappedHostname(key);
    if (!hostname || enabledSites?.[hostname] === false) continue;
    hostnames.add(hostname);
  }

  return [...hostnames].sort().flatMap(getSiteOriginPatterns);
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

  const data = await api.storage.local.get(['websiteMappings', 'enabledSites', 'globalEnabled', 'navigationModeEnabled']);
  const websiteMappings = data.websiteMappings === undefined
    ? DEFAULT_WEBSITE_MAPPINGS
    : data.websiteMappings;
  const requestedMatches = buildMappedMatchPatterns(
    websiteMappings,
    data.enabledSites,
    data.globalEnabled !== false
  );
  const broad = data.navigationModeEnabled === true && await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
  const matches = broad && data.globalEnabled !== false ? [RemapadNavigationMode.BROAD_ORIGIN] : await filterGrantedMatchPatterns(requestedMatches);
  const excludeMatches = broad ? Object.keys(data.enabledSites || {}).filter(host => data.enabledSites[host] === false && normalizeMappedHostname(host)).flatMap(getSiteOriginPatterns) : [];
  const ids = Object.values(REMAPAD_SCRIPT_IDS);

  const registered = await api.scripting.getRegisteredContentScripts({ ids });
  const desired = matches.length ? [
    {
      id: REMAPAD_SCRIPT_IDS.blocker,
      matches,
      excludeMatches,
      js: ['content/gamepad_blocker.js'],
      runAt: 'document_start',
      world: 'MAIN'
    },
    {
      id: REMAPAD_SCRIPT_IDS.controller,
      matches,
      excludeMatches,
      js: REMAPAD_CONTROLLER_FILES,
      runAt: 'document_idle'
    }
  ] : [];
  const sameList = (a = [], b = []) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const unchanged = registered.length === desired.length && desired.every(script => {
    const current = registered.find(item => item.id === script.id);
    return current && sameList(current.matches, script.matches) && sameList(current.excludeMatches, script.excludeMatches) && JSON.stringify(current.js) === JSON.stringify(script.js) && current.runAt === script.runAt && (current.world || 'ISOLATED') === (script.world || 'ISOLATED');
  });
  if (!unchanged) {
    if (registered.length) await api.scripting.unregisterContentScripts({ ids: registered.map(script => script.id) });
    if (desired.length) await api.scripting.registerContentScripts(desired);
  }
  await reconcileLoadedTabs();
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

function sameHttpOrigin(senderUrl, currentUrl) {
  try {
    const source = new URL(senderUrl);
    const current = new URL(currentUrl);
    return (source.protocol === 'http:' || source.protocol === 'https:') &&
      (current.protocol === 'http:' || current.protocol === 'https:') &&
      source.origin === current.origin;
  } catch (_) {
    return false;
  }
}

function isExtensionPage(url, path) {
  return typeof url === 'string' && url.split(/[?#]/)[0] === api.runtime.getURL(path);
}

function isExtensionTabSender(sender, path) {
  return sender.id === api.runtime.id && sender.frameId === 0 && Number.isInteger(sender.tab?.id) && isExtensionPage(sender.url, path);
}

async function isOptionsNavigationEnabled() {
  const data = await api.storage.local.get(['navigationModeEnabled', 'globalEnabled']);
  return data.navigationModeEnabled === true && data.globalEnabled !== false && await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
}

async function getExtensionTab(sender, path, requireFocus) {
  const source = await api.tabs.get(sender.tab.id);
  if (!isExtensionPage(source.url, path) || (requireFocus && (!source.active || !(await api.windows.get(source.windowId)).focused))) {
    throw new Error('The source tab is no longer active.');
  }
  return source;
}

async function isActiveMappedTabSender(sender) {
  if (sender.id !== api.runtime.id || sender.frameId !== 0 || !sender.tab?.id) return false;
  let hostname;
  let actualUrl;
  try {
    const currentTab = await api.tabs.get(sender.tab.id);
    if (!sameHttpOrigin(sender.url || sender.tab.url, currentTab.url)) return false;
    const url = new URL(currentTab.url || '');
    actualUrl = url;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    hostname = normalizeMappedHostname(url.hostname);
  } catch (_) {
    return false;
  }
  if (!hostname) return false;

  const data = await api.storage.local.get(['websiteMappings', 'enabledSites', 'globalEnabled', 'navigationModeEnabled']);
  if (data.globalEnabled === false || data.enabledSites?.[hostname] === false) return false;
  const websiteMappings = data.websiteMappings === undefined
    ? DEFAULT_WEBSITE_MAPPINGS
    : data.websiteMappings;
  const broad = data.navigationModeEnabled === true && await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
  const mapped = Object.keys(websiteMappings || {}).some(key => normalizeMappedHostname(key) === hostname);
  const actual = actualUrl;
  return broad || (mapped && await api.permissions.contains({ origins: [`${actual.protocol}//${actual.hostname}/*`] }));
}

async function getFocusedMappedTab(sender) {
  if (!await isActiveMappedTabSender(sender)) return null;
  const tab = await api.tabs.get(sender.tab.id);
  return tab.active && sameHttpOrigin(sender.url || sender.tab.url, tab.url) && (await api.windows.get(tab.windowId)).focused
    ? tab
    : null;
}

async function activateMappedSiteTab(hostnameValue, tabId) {
  const hostname = normalizeMappedHostname(hostnameValue);
  if (!hostname || !Number.isInteger(tabId) || tabId < 0) {
    return { success: false, reloaded: false, error: 'Invalid site activation request.' };
  }

  const tab = await api.tabs.get(tabId);
  let tabHostname;
  try {
    const url = new URL(tab?.url || '');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { success: false, reloaded: false, error: 'The source tab is not a website.' };
    }
    tabHostname = normalizeMappedHostname(url.hostname);
  } catch (_) {
    return { success: false, reloaded: false, error: 'The source tab URL is unavailable.' };
  }
  if (tabHostname !== hostname) {
    return { success: false, reloaded: false, error: 'The source tab does not match the mapped site.' };
  }

  const data = await api.storage.local.get(['websiteMappings', 'enabledSites', 'globalEnabled', 'navigationModeEnabled']);
  const mapped = Object.keys(data.websiteMappings || {})
    .some(key => normalizeMappedHostname(key) === hostname);
  if (!mapped || data.globalEnabled === false || data.enabledSites?.[hostname] === false) {
    return { success: false, reloaded: false, error: 'The site mapping is not active.' };
  }

  const patterns = getSiteOriginPatterns(hostname);
  if (!await api.permissions.contains({ origins: patterns })) {
    return { success: false, reloaded: false, error: 'Site access has not been granted.' };
  }

  await queueMappedContentScriptSync();
  await api.tabs.reload(tabId);
  return { success: true, reloaded: true };
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
  if (!changes.websiteMappings && !changes.enabledSites && !changes.globalEnabled && !changes.navigationModeEnabled) return;
  queueMappedContentScriptSync().catch(error => {
    console.error('[Remapad BG] Unable to update mapped content scripts:', error);
  });
});

api.permissions.onAdded.addListener(() => {
  reconcilePermissionLifecycle().catch(error => {
    console.error('[Remapad BG] Unable to apply added site permission:', error);
  });
});

api.permissions.onRemoved.addListener(() => {
  reconcilePermissionLifecycle().catch(error => {
    console.error('[Remapad BG] Unable to apply removed site permission:', error);
  });
});

// Also reconcile on service-worker wake in case storage changed while a
// previous worker instance was unavailable.
Promise.resolve().then(reconcilePermissionLifecycle).catch(error => {
  console.error('[Remapad BG] Unable to initialize mapped content scripts:', error);
});

// Listen for messages from content scripts, popups, or options page
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_NAVIGATION_STATUS') {
    getNavigationStatus(sender).then(sendResponse).catch(error => sendResponse({ active: false, error: error.message }));
    return true;
  }
  if (message?.type === 'OPEN_BROWSE') {
    openBrowse(sender).then(sendResponse).catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message?.type === 'ACTIVATE_SITE_MAPPING') {
    if (sender.id !== api.runtime.id) {
      sendResponse({ success: false, reloaded: false, error: 'Invalid sender.' });
      return false;
    }
    activateMappedSiteTab(message.hostname, message.tabId)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, reloaded: false, error: error.message }));
    return true;
  }

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
    handleBrowserAction(message.action, sender)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
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
        .catch(err => sendResponse({ success: false, error: err.message }));
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
        .catch(err => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (message && message.type === 'OPEN_SITE_MAPPING') {
    isActiveMappedTabSender(sender)
      .then(async active => {
        if (!active) return { error: 'Remapad is inactive on this site.' };
        const hostname = normalizeMappedHostname(new URL(sender.tab.url).hostname);
        const status = await getNavigationStatus(sender);
        const url = api.runtime.getURL('options/options.html') + '?site=' + encodeURIComponent(hostname) + (status.navigationMode ? '&environment=navigation' : '');
        await api.tabs.create({ url });
        return { success: true };
      })
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

/**
 * Handle browser actions requested by an active Remapad-controlled tab.
 */
async function handleBrowserAction(action, sender) {
  let source;
  if (isExtensionTabSender(sender, OPTIONS_PAGE)) {
    if (!['next_tab', 'prev_tab', 'close_tab'].includes(action) || !await isOptionsNavigationEnabled()) {
      return { success: false, error: 'This action requires Navigation Mode in Settings.' };
    }
    source = await getExtensionTab(sender, OPTIONS_PAGE, true);
  } else if (isExtensionTabSender(sender, BROWSE_PAGE)) {
    if (!['next_tab', 'prev_tab'].includes(action)) return { success: false, error: 'Invalid Browse tab action.' };
    source = await getExtensionTab(sender, BROWSE_PAGE, true);
  } else {
    if (!await isActiveMappedTabSender(sender)) return { success: false, error: 'Remapad is inactive on this site.' };
    source = await api.tabs.get(sender.tab.id);
    if (!source.active || !sameHttpOrigin(sender.url || sender.tab.url, source.url)) return { success: false, error: 'The source page is no longer active.' };
  }
  console.log('[Remapad BG] Action requested:', action);

  switch (action) {
    case 'next_tab':
    case 'prev_tab': {
      const tabs = (await api.tabs.query({ windowId: source.windowId })).filter(tab => !tab.hidden);
      if (tabs.length <= 1) return { success: true, switched: false };

      tabs.sort((a, b) => a.index - b.index);
      const activeIndex = tabs.findIndex(tab => tab.id === source.id);
      if (activeIndex < 0) return { success: false, error: 'The source tab is no longer active.' };
      const step = action === 'next_tab' ? 1 : -1;
      const targetIndex = (activeIndex + step + tabs.length) % tabs.length;
      await api.tabs.update(tabs[targetIndex].id, { active: true });
      return { success: true, switched: true };
    }

    case 'close_tab': {
      const activeTab = source;
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
      const windowId = source.windowId;
      const currentWindow = await api.windows.get(windowId);
      const nextState = currentWindow.state === 'fullscreen' ? 'normal' : 'fullscreen';
      await api.windows.update(windowId, { state: nextState });
      return { success: true };
    }

    default:
      return { success: false, error: 'Unknown browser action: ' + action };
  }
}

/**
 * Helper to get active tab in current window
 */
async function getActiveTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function getNavigationStatus(sender) {
  const active = await isActiveMappedTabSender(sender);
  const data = await api.storage.local.get('navigationModeEnabled');
  const navigationMode = active && data.navigationModeEnabled === true && await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
  return { active, navigationMode };
}
async function reconcileLoadedTabs() {
  const tabs = await api.tabs.query({});
  await Promise.all(tabs.map(async tab => {
    // Permission loss may redact URL from tabs.query. Still notify every tab:
    // an already loaded isolated script must restore the MAIN-world blocker.
    const status = await getNavigationStatus({ id: api.runtime.id, frameId: 0, tab });
    try {
      await api.tabs.sendMessage(tab.id, { type: 'REMAPAD_RUNTIME_STATUS', ...status }, { frameId: 0 });
    } catch (_) {
      // Existing pages need a refresh to load the document-start blocker.
    }
  }));
}

async function openBrowse(sender) {
  let source;
  if (isExtensionTabSender(sender, OPTIONS_PAGE)) source = await getExtensionTab(sender, OPTIONS_PAGE, true);
  else if (await isActiveMappedTabSender(sender)) source = await api.tabs.get(sender.tab.id);
  else if (sender.id === api.runtime.id && sender.url === api.runtime.getURL('popup/popup.html')) source = await getActiveTab();
  else return { success: false, error: 'Invalid Browse launcher source.' };
  const url = api.runtime.getURL(BROWSE_PAGE) + (source?.id ? '?sourceTabId=' + source.id : '');
  const tab = await api.tabs.create({ url, ...(source?.windowId !== undefined ? { windowId: source.windowId } : {}) });
  if (source?.id) {
    browseSources.set(tab.id, source.id);
    if (api.storage.session) await api.storage.session.set({ ['remapadBrowseSource:' + tab.id]: { sourceTabId: source.id, windowId: source.windowId } });
  }
  return { success: true, tabId: tab.id };
}

const navigationSessions = new Map();
const browseSources = new Map();
const navigationDraftPorts = new Map();
const navigationPreparedDrafts = new Map();
let navigationWriteQueue = Promise.resolve();
function queueNavigationWrite(work) {
  const task = navigationWriteQueue.catch(() => {}).then(work);
  navigationWriteQueue = task;
  return task;
}

queueNavigationWrite(initializeMappingMigrations).catch(error => {
  console.warn('[Remapad BG] Unable to check saved mappings for Navigation Mode:', error);
});

async function getMappingMigrationOffer(migration) {
  const data = await api.storage.local.get([
    'navigationModeEnabled', 'navigationModeInitialized', 'defaultMapping', 'websiteMappings', 'profiles'
  ]);
  if (data.navigationModeEnabled || data.navigationModeInitialized) return null;

  const matches = (bindings, hostname) => {
    if (migration === NEXT_TAB_MIGRATION) {
      return Object.entries(bindings || {}).some(([button, action]) =>
        Object.hasOwn(DEFAULT_SITE_BINDINGS, button) && action === 'next_tab');
    }
    return Boolean(hostname && !Object.hasOwn(DEFAULT_WEBSITE_MAPPINGS, hostname)) ||
      Object.entries(bindings || {}).some(([button, action]) =>
        Object.hasOwn(DEFAULT_SITE_BINDINGS, button) && action !== DEFAULT_SITE_BINDINGS[button]);
  };
  const defaults = data.profiles?.default ?? data.defaultMapping;
  const includesDefaults = matches(defaults);
  const hostnames = [];
  for (const [hostname, mapping] of Object.entries(data.websiteMappings || {})) {
    const normalized = normalizeMappedHostname(hostname);
    if (!normalized) continue;
    const bindings = typeof mapping === 'string' ? data.profiles?.[mapping] ?? defaults : mapping;
    if (matches(bindings, normalized)) hostnames.push(hostname);
  }
  return includesDefaults || hostnames.length ? { includesDefaults, hostnames } : null;
}

async function initializeMappingMigrations() {
  const data = await api.storage.local.get([
    NEXT_TAB_MIGRATION.key, SAVED_MAPPINGS_MIGRATION.key, 'siteTutorialVersion', 'siteTutorialVersions'
  ]);
  if (data[NEXT_TAB_MIGRATION.key] !== undefined && data[SAVED_MAPPINGS_MIGRATION.key] !== undefined) return;

  // Snapshot existing mappings, and give the dedicated tab-switching offer precedence.
  const nextTabOffer = await getMappingMigrationOffer(NEXT_TAB_MIGRATION);
  const update = {};
  if (data[NEXT_TAB_MIGRATION.key] === undefined) {
    update[NEXT_TAB_MIGRATION.key] = nextTabOffer ? 'pending' : 'handled';
  }
  if (data[SAVED_MAPPINGS_MIGRATION.key] === undefined) {
    const finishedTutorial = data.siteTutorialVersion > 0 ||
      Object.values(data.siteTutorialVersions || {}).some(version => version > 0);
    const offer = finishedTutorial && !nextTabOffer && await getMappingMigrationOffer(SAVED_MAPPINGS_MIGRATION);
    update[SAVED_MAPPINGS_MIGRATION.key] = offer ? 'pending' : 'handled';
  }
  await api.storage.local.set(update);
}

async function claimMappingMigration(migration, fromPopup) {
  const data = await api.storage.local.get(migration.key);
  const expectedState = fromPopup ? 'popup' : 'pending';
  if (data[migration.key] !== expectedState) return { success: true, offer: null };

  const offer = await getMappingMigrationOffer(migration);
  await api.storage.local.set({ [migration.key]: 'handled' });
  return { success: true, offer };
}

async function offerMappingMigrationOnSite(sender) {
  const data = await api.storage.local.get([NEXT_TAB_MIGRATION.key, SAVED_MAPPINGS_MIGRATION.key]);
  const migration = [NEXT_TAB_MIGRATION, SAVED_MAPPINGS_MIGRATION].find(item => data[item.key] === 'pending');
  if (!migration) return { success: true };
  if (!await getFocusedMappedTab(sender)) {
    return { success: true, deferred: true };
  }

  if (!await getMappingMigrationOffer(migration)) {
    await api.storage.local.set({ [migration.key]: 'handled' });
    return { success: true };
  }

  // Reserve the same one-time offer before opening the extension window.
  await api.storage.local.set({ [migration.key]: 'popup' });
  try {
    await api.windows.create({
      url: api.runtime.getURL(OPTIONS_PAGE) + '?' + migration.popupParam + '=1',
      type: 'popup',
      width: 760,
      height: 720,
      focused: true
    });
  } catch (error) {
    await api.storage.local.set({ [migration.key]: 'pending' });
    throw error;
  }
  return { success: true };
}

async function openNavigationModeSetup(sender) {
  const source = await getFocusedMappedTab(sender);
  if (!source) return { success: false, error: 'Return to the active website to continue setup.' };
  await api.tabs.create({
    windowId: source.windowId,
    url: api.runtime.getURL(OPTIONS_PAGE) + '?navigationModeSetup=1'
  });
  return { success: true };
}

function reconcilePermissionLifecycle() {
  // Start the authoritative query when the event arrives, before a subsequent
  // grant can overtake this queued write. Event origins may be partial or empty.
  const observedBroad = api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
  return queueNavigationWrite(async () => {
    if (!await observedBroad) {
      const data = await api.storage.local.get(['navigationModeEnabled', 'navigationModeOwnsBroadAccess']);
      if (data.navigationModeEnabled || data.navigationModeOwnsBroadAccess) {
        await api.storage.local.set({ navigationModeEnabled: false, navigationModeOwnsBroadAccess: false });
      }
    }
    await reconcileNavigationPermissionDraft();
    await queueMappedContentScriptSync();
  });
}

function trustedExtensionPage(sender) {
  if (sender.id !== api.runtime.id) return false;
  try { const url = new URL(sender.url); return ['options/options.html', 'popup/popup.html', 'browse/browse.html'].some(path => sender.url.split('?')[0].split('#')[0] === api.runtime.getURL(path)); } catch (_) { return false; }
}
async function navigationDraftOwnerIsLive(draft) {
  if (!Number.isInteger(draft.ownerTabId)) return false;
  try {
    const tab = await api.tabs.get(draft.ownerTabId);
    if (tab.url?.split('?')[0] !== api.runtime.getURL('options/options.html')) return false;
    if (draft.ownerDocumentId && api.runtime.getContexts) {
      const contexts = await api.runtime.getContexts({ documentIds: [draft.ownerDocumentId] });
      return contexts.some(context => context.tabId === draft.ownerTabId);
    }
    return true;
  } catch (_) {
    return false;
  }
}

async function reconcileNavigationPermissionDraft() {
  const data = await api.storage.local.get(['navigationModePermissionDraft', 'navigationModeEnabled']);
  const draft = data.navigationModePermissionDraft;
  if (!draft) return;
  // Older builds persisted idle preparation. It never launched a native
  // request and therefore cannot own a later wildcard grant.
  if (!draft.started) {
    await api.storage.local.set({ navigationModePermissionDraft: null });
    return;
  }
  const hasBroad = await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
  if (data.navigationModeEnabled || draft.hadBroad) {
    if (draft.cancelled || data.navigationModeEnabled || !hasBroad) await api.storage.local.set({ navigationModePermissionDraft: null });
    return;
  }
  if (draft.settled && !hasBroad) {
    await api.storage.local.set({ navigationModePermissionDraft: null });
    return;
  }
  const abandoned = draft.cancelled || (!navigationDraftPorts.has(draft.token) && !await navigationDraftOwnerIsLive(draft));
  if (!abandoned) return;
  if (hasBroad) {
    await setNavigationMode({ enabled: false, releaseDraft: true });
    await api.storage.local.set({ navigationModePermissionDraft: null });
  } else if (draft.settled) {
    await api.storage.local.set({ navigationModePermissionDraft: null });
  } else if (!draft.cancelled) {
    await api.storage.local.set({ navigationModePermissionDraft: { ...draft, cancelled: true } });
  }
}

async function navigationPermissionDraft(message) {
  if (typeof message.token !== 'string' || !/^[a-zA-Z0-9:_-]{8,160}$/.test(message.token)) throw new Error('Invalid permission draft.');
  const data = await api.storage.local.get(['navigationModePermissionDraft', 'navigationModeEnabled']);
  let draft = data.navigationModePermissionDraft;
  if (message.type === 'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT') {
    const port = navigationDraftPorts.get(message.token);
    if (!port) throw new Error('The Options permission connection is unavailable. Reopen the access dialog.');
    await reconcileNavigationPermissionDraft();
    const latest = await api.storage.local.get('navigationModePermissionDraft');
    const pending = latest.navigationModePermissionDraft;
    if (pending?.started && pending.token !== message.token && !pending.cancelled &&
        (navigationDraftPorts.has(pending.token) || await navigationDraftOwnerIsLive(pending))) {
      throw new Error('Finish the website access request in the other Options window first.');
    }
    const now = Date.now();
    for (const [token, prepared] of navigationPreparedDrafts) {
      if (prepared.expiresAt <= now || !navigationDraftPorts.has(token)) navigationPreparedDrafts.delete(token);
      else if (token !== message.token) throw new Error('Another Options window is preparing website access. Try again in a moment.');
    }
    let ownerTabId = port.sender.tab?.id ?? message.ownerTabId;
    if (Number.isInteger(ownerTabId)) {
      const owner = await api.tabs.get(ownerTabId);
      if (owner.url?.split('?')[0] !== api.runtime.getURL('options/options.html')) throw new Error('Invalid Options permission owner.');
    } else ownerTabId = null;
    const prepared = {
      token: message.token,
      hadBroad: await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] }),
      ownerTabId,
      ownerDocumentId: port.sender.documentId || null,
      started: false,
      expiresAt: now + 15000,
      cancelled: false,
      settled: false
    };
    // Preparation is document-local and has no grant ownership. Multiple
    // Options windows may independently prepare without blocking one another.
    navigationPreparedDrafts.set(message.token, prepared);
    return { success: true, hasBroad: prepared.hadBroad, expiresAt: prepared.expiresAt };
  }
  navigationPreparedDrafts.delete(message.token);
  if (!draft || draft.token !== message.token) return { success: true };
  draft = { ...draft, ...(message.type === 'CANCEL_NAVIGATION_MODE_PERMISSION_DRAFT' ? { cancelled: true } : { settled: true }) };
  await api.storage.local.set({ navigationModePermissionDraft: draft });
  await reconcileNavigationPermissionDraft();
  return navigationModeStatus();
}

if (api.runtime.onConnect) api.runtime.onConnect.addListener(port => {
  const prefix = 'remapad-navigation-permission-draft:';
  if (!port.name?.startsWith(prefix) || !trustedExtensionPage(port.sender) || port.sender.url?.split('?')[0] !== api.runtime.getURL('options/options.html')) return;
  const token = port.name.slice(prefix.length);
  navigationDraftPorts.set(token, port);
  port.onMessage?.addListener(message => {
    if (message?.type !== 'REQUEST_STARTED' || message.token !== token) return;
    const prepared = navigationPreparedDrafts.get(token);
    if (!prepared) return;
    queueNavigationWrite(async () => {
      const data = await api.storage.local.get('navigationModePermissionDraft');
      const current = data.navigationModePermissionDraft;
      const maySupersede = current?.cancelled && !await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
      if (current?.started && current.token !== token && !maySupersede) {
        // BEGIN's preparation lease prevents overlapping enabled request UIs.
        // Retain this guard for an obsolete or deliberately bypassed client.
        try { port.postMessage({ type: 'REQUEST_BLOCKED', error: 'Finish the existing website access request first.' }); } catch (_) {}
        return;
      }
      await api.storage.local.set({ navigationModePermissionDraft: { ...prepared, started: true } });
      navigationPreparedDrafts.delete(token);
    }).catch(error => console.error('[Remapad BG] Unable to track website access request:', error));
  });
  port.onDisconnect.addListener(() => {
    if (navigationDraftPorts.get(token) !== port) return;
    navigationDraftPorts.delete(token);
    navigationPreparedDrafts.delete(token);
    queueNavigationWrite(async () => {
      const data = await api.storage.local.get('navigationModePermissionDraft');
      const draft = data.navigationModePermissionDraft;
      if (draft?.token === token) await reconcileNavigationPermissionDraft();
    }).catch(error => console.error('[Remapad BG] Unable to release abandoned permission draft:', error));
  });
});

async function navigationModeStatus() {
  const data = await api.storage.local.get(['navigationModeEnabled', 'navigationModeInitialized', 'navigationModeRestoreOrigins']);
  const hasBroad = await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
  const [hasHistory, hasBookmarks, hasSearch] = await Promise.all(['history', 'bookmarks', 'search'].map(permission => api.permissions.contains({ permissions: [permission] })));
  const restoreOrigins = [];
  for (const origin of data.navigationModeRestoreOrigins || []) {
    if (!await api.permissions.contains({ origins: [origin] })) restoreOrigins.push(origin);
  }
  // Once a narrow grant is restored, forget its restoration request. A later
  // browser-initiated revoke is the user's decision and must stay revoked.
  if (!hasBroad && restoreOrigins.length !== (data.navigationModeRestoreOrigins || []).length) {
    await api.storage.local.set({ navigationModeRestoreOrigins: restoreOrigins });
  }
  return { success: true, restoreOrigins, enabled: data.navigationModeEnabled === true && hasBroad, requestedEnabled: data.navigationModeEnabled === true, initialized: data.navigationModeInitialized === true, hasBroad, hasHistory, hasBookmarks, hasSearch };
}
async function setNavigationMode(message) {
  if (typeof message.enabled !== 'boolean') throw new Error('Choose whether Navigation Mode is enabled.');
  const data = await api.storage.local.get(null);
  const hasBroad = await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
  if (message.enabled && !hasBroad) throw new Error('Allow access to all websites before enabling Navigation Mode.');
  if (message.enabled) {
    const draft = data.navigationModePermissionDraft;
    if (draft && (draft.cancelled || (message.draftToken && message.draftToken !== draft.token))) {
      throw new Error('This website access request was cancelled or replaced. Reopen the access dialog before saving.');
    }
    const update = { navigationModeEnabled: true, navigationModeOwnsBroadAccess: data.navigationModeOwnsBroadAccess === true || (data.navigationModeEnabled !== true && message.acquiredBroad === true) };
    if (!data.navigationModeInitialized) {
      const standard = { ...DEFAULT_SITE_BINDINGS, ...(data.profiles?.default ?? data.defaultMapping) };
      update.navigationModeDefaultMapping = { ...standard, 6: 'prev_tab', 7: 'next_tab' };
      update.navigationModeWebsiteMappings = {};
      for (const [hostname, value] of Object.entries(data.websiteMappings || DEFAULT_WEBSITE_MAPPINGS)) {
        if (!normalizeMappedHostname(hostname)) continue;
        const bindings = typeof value === 'string' ? data.profiles?.[value] || standard : value && typeof value === 'object' ? value : standard;
        update.navigationModeWebsiteMappings[hostname] = RemapadNavigationMode.createProfileSet({ ...standard, ...bindings, 6: 'prev_tab', 7: 'next_tab' });
      }
      update.navigationModeInitialized = true;
    }
    if (draft && (!message.draftToken || message.draftToken === draft.token)) {
      update.navigationModePermissionDraft = null;
      if (!draft.hadBroad && !draft.cancelled) update.navigationModeOwnsBroadAccess = true;
    }
    await api.storage.local.set(update);
  } else {
    if (message.releaseDraft && data.navigationModeEnabled === true) {
      throw new Error('An active Navigation Mode session cannot be cancelled as a draft.');
    }
    await api.storage.local.set({ navigationModeEnabled: false });
    await queueMappedContentScriptSync();
    const ownsBroad = data.navigationModeOwnsBroadAccess === true || message.releaseDraft === true;
    if (ownsBroad && hasBroad) {
      const granted = await api.permissions.getAll();
      const origins = (granted.origins || []).filter(origin => origin !== RemapadNavigationMode.BROAD_ORIGIN && /^(?:https?|\*):\/\//.test(origin));
      // Chromium's wildcard removal can revoke separately granted narrower
      // origins too. Persist exact grants before removal, even if it throws.
      const backup = [...new Set([...(data.navigationModeRestoreOrigins || []), ...origins])];
      await api.storage.local.set({ navigationModeRestoreOrigins: backup, navigationModeOwnsBroadAccess: true });
      const removed = await api.permissions.remove({ origins: [RemapadNavigationMode.BROAD_ORIGIN] });
      if (!removed || await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] })) {
        throw new Error('Navigation Mode is off, but broad site access could not be released. Retry disabling to release it.');
      }
    }
    await api.storage.local.set({ navigationModeOwnsBroadAccess: false });
  }
  await queueMappedContentScriptSync();
  return navigationModeStatus();
}
async function getNavigationProfile(sender, direction) {
  const options = isExtensionTabSender(sender, OPTIONS_PAGE);
  const enabled = options ? await isOptionsNavigationEnabled() : (await getNavigationStatus(sender)).navigationMode;
  if (!enabled) throw new Error('Navigation Mode is inactive on this page.');
  const source = options ? await getExtensionTab(sender, OPTIONS_PAGE, Boolean(direction)) : await api.tabs.get(sender.tab.id);
  if (direction && !source.active) throw new Error('The source tab is no longer active.');
  const hostname = options ? OPTIONS_MAPPING_KEY : normalizeMappedHostname(new URL(source.url).hostname);
  const data = await api.storage.local.get(['navigationModeWebsiteMappings', 'navigationModeDefaultMapping', 'websiteMappings']);
  const fallback = options ? RemapadNavigationMode.optionsNavigationBindings(data.websiteMappings?.[hostname]) : data.navigationModeDefaultMapping;
  const set = RemapadNavigationMode.normalizeProfileSet(data.navigationModeWebsiteMappings?.[hostname], fallback);
  const key = `navigationProfile:${sender.tab.id}:${hostname}`;
  const session = api.storage.session ? await api.storage.session.get(key) : {};
  let index = set.profiles.findIndex(profile => profile.profileId === (session[key] ?? navigationSessions.get(key)));
  if (index < 0) index = 0;
  if (direction) index = (index + (direction === 'next' ? 1 : -1) + set.profiles.length) % set.profiles.length;
  const profile = set.profiles[index];
  navigationSessions.set(key, profile.profileId);
  if (api.storage.session) await api.storage.session.set({ [key]: profile.profileId });
  return { success: true, profileId: profile.profileId, profile, hostname, profileSet: set };
}
function equalNavigationValue(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
      a.every((value, index) => equalNavigationValue(value, b[index]));
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(b, key) && equalNavigationValue(a[key], b[key]));
}

async function saveNavigationMappings(message) {
  const data = await api.storage.local.get(['navigationModeWebsiteMappings', 'navigationModeDefaultMapping', 'websiteMappings']);
  const mappings = { ...(data.navigationModeWebsiteMappings || {}) };
  const equal = equalNavigationValue;
  for (const [host, change] of Object.entries(message.websiteChanges || {})) {
    if (host !== OPTIONS_MAPPING_KEY && normalizeMappedHostname(host) !== host) throw new Error('Invalid website hostname.');
    if (!equal(mappings[host] ?? null, change.expected)) throw new Error('These mappings changed in another page. Reload before saving.');
    if (change.value === null) delete mappings[host];
    else {
      if (!RemapadNavigationMode.validateShortcuts(change.value?.profileShortcuts).valid) throw new Error('Invalid profile shortcuts.');
      const fallback = host === OPTIONS_MAPPING_KEY ? RemapadNavigationMode.optionsNavigationBindings(data.websiteMappings?.[host]) : data.navigationModeDefaultMapping;
      mappings[host] = RemapadNavigationMode.normalizeProfileSet(change.value, fallback);
    }
  }
  const update = { navigationModeWebsiteMappings: mappings };
  if (message.defaultChange) {
    if (!equal(data.navigationModeDefaultMapping, message.defaultChange.expected)) throw new Error('The default mapping changed in another page. Reload before saving.');
    update.navigationModeDefaultMapping = message.defaultChange.value;
  }
  await api.storage.local.set(update);
  return { success: true };
}
async function getBrowseContext(sender) {
  if (!isExtensionTabSender(sender, BROWSE_PAGE)) throw new Error('Invalid Browse page.');
  const key = 'remapadBrowseSource:' + sender.tab.id;
  const session = api.storage.session ? await api.storage.session.get(key) : {};
  const link = session[key];
  const id = link?.sourceTabId ?? browseSources.get(sender.tab.id);
  let source = Number.isInteger(id) && id !== sender.tab.id ? await api.tabs.get(id).catch(() => null) : null;
  if (link && source?.windowId !== link.windowId) source = null;
  const sourceTab = source ? { id: source.id, url: source.url } : null;
  let profileShortcuts = null;
  let hostname;
  if (isExtensionPage(source?.url, OPTIONS_PAGE)) hostname = OPTIONS_MAPPING_KEY;
  else if (/^https?:\/\//.test(source?.url || '')) hostname = normalizeMappedHostname(new URL(source.url).hostname);
  if (hostname) {
    const data = await api.storage.local.get(['navigationModeEnabled', 'globalEnabled', 'enabledSites', 'navigationModeWebsiteMappings']);
    if (data.navigationModeEnabled === true && data.globalEnabled !== false && data.enabledSites?.[hostname] !== false &&
        await api.permissions.contains({ origins: [RemapadNavigationMode.BROAD_ORIGIN] })) {
      profileShortcuts = RemapadNavigationMode.normalizeProfileSet(data.navigationModeWebsiteMappings?.[hostname]).profileShortcuts;
    }
  }
  return { success: true, sourceTab, profileShortcuts };
}
api.runtime.onMessage.addListener((message, sender, respond) => {
  let work;
  if (message?.type === 'GET_BROWSE_CONTEXT') {
    work = getBrowseContext(sender);
  } else if (message?.type === 'OFFER_MAPPING_MIGRATION_ON_SITE' || message?.type === 'OFFER_NEXT_TAB_MIGRATION_ON_SITE') {
    work = queueNavigationWrite(() => offerMappingMigrationOnSite(sender));
  } else if (message?.type === 'OPEN_NAVIGATION_MODE_SETUP') {
    work = openNavigationModeSetup(sender);
  } else if (['CLAIM_NEXT_TAB_MIGRATION', 'CLAIM_SAVED_MAPPINGS_MIGRATION', 'GET_NAVIGATION_MODE_SETUP_MAPPINGS'].includes(message?.type)) {
    if (sender.id !== api.runtime.id || !isExtensionPage(sender.url, OPTIONS_PAGE)) {
      respond({ success: false, error: 'Only Settings can review saved mappings for Navigation Mode.' });
      return false;
    }
    if (message.type === 'GET_NAVIGATION_MODE_SETUP_MAPPINGS') {
      work = queueNavigationWrite(async () => ({ success: true, offer: await getMappingMigrationOffer(SAVED_MAPPINGS_MIGRATION) }));
    } else {
      const migration = message.type === 'CLAIM_NEXT_TAB_MIGRATION' ? NEXT_TAB_MIGRATION : SAVED_MAPPINGS_MIGRATION;
      const fromPopup = new URL(sender.url).searchParams.get(migration.popupParam) === '1';
      work = queueNavigationWrite(() => claimMappingMigration(migration, fromPopup));
    }
  } else if (['NAVIGATION_MODE_STATUS', 'NAVIGATION_MODE_RECONCILE', 'SET_NAVIGATION_MODE', 'SAVE_NAVIGATION_MODE_MAPPINGS', 'BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT', 'FINISH_NAVIGATION_MODE_PERMISSION_DRAFT', 'CANCEL_NAVIGATION_MODE_PERMISSION_DRAFT'].includes(message?.type)) {
    if (!trustedExtensionPage(sender)) { respond({ success: false, error: 'Invalid extension page.' }); return false; }
    if (message.type === 'SET_NAVIGATION_MODE' || message.type === 'SAVE_NAVIGATION_MODE_MAPPINGS' || message.type.endsWith('_NAVIGATION_MODE_PERMISSION_DRAFT')) {
      if (sender.url?.split('?')[0] !== api.runtime.getURL('options/options.html')) { respond({ success: false, error: 'Only Options may change Navigation Mode.' }); return false; }
      work = queueNavigationWrite(() => message.type.endsWith('_NAVIGATION_MODE_PERMISSION_DRAFT') ? navigationPermissionDraft(message) : message.type === 'SET_NAVIGATION_MODE' ? setNavigationMode(message) : saveNavigationMappings(message));
    } else {
      work = queueNavigationWrite(async () => {
        if (message.type === 'NAVIGATION_MODE_RECONCILE') await queueMappedContentScriptSync();
        return navigationModeStatus();
      });
    }
  } else if (message?.type === 'GET_NAVIGATION_PROFILE' || message?.type === 'SWITCH_NAVIGATION_PROFILE') {
    if (message.type === 'SWITCH_NAVIGATION_PROFILE' && !['next', 'previous'].includes(message.direction)) { respond({ success: false, error: 'Invalid profile direction.' }); return false; }
    work = queueNavigationWrite(() => getNavigationProfile(sender, message.type === 'SWITCH_NAVIGATION_PROFILE' ? message.direction : null));
  } else if (message?.type === 'SAVE_NAVIGATION_BUTTON') {
    work = queueNavigationWrite(async () => {
      if (!Number.isInteger(message.button) || message.button < 0 || message.button > 15 || typeof message.actionValue !== 'string') throw new Error('Invalid button mapping.');
      const current = await getNavigationProfile(sender);
      const data = await api.storage.local.get('navigationModeWebsiteMappings');
      const mappings = { ...(data.navigationModeWebsiteMappings || {}) };
      const set = current.profileSet;
      const profile = set.profiles.find(item => item.profileId === current.profileId);
      if (message.profileId !== current.profileId || !equalNavigationValue(message.expectedBindings, profile.bindings)) {
        throw new Error('This profile changed in another page. Reload before saving the mapping.');
      }
      let bindings = profile.bindings;
      if (message.profileTemplate !== null && message.profileTemplate !== undefined) {
        if (!message.profileTemplate || typeof message.profileTemplate !== 'object' || Array.isArray(message.profileTemplate) ||
            Object.entries(message.profileTemplate).some(([key, value]) => !/^(?:[0-9]|1[0-5])$/.test(key) || typeof value !== 'string')) {
          throw new Error('Invalid effective controller mapping.');
        }
        bindings = { ...bindings, ...message.profileTemplate };
      }
      profile.bindings = { ...bindings, [message.button]: message.actionValue };
      mappings[current.hostname] = set;
      await api.storage.local.set({ navigationModeWebsiteMappings: mappings });
      return { success: true, bindings: profile.bindings };
    });
  }
  if (!work) return false;
  work.then(respond).catch(error => respond({ success: false, error: error.message }));
  return true;
});

api.tabs.onRemoved.addListener(tabId => {
  queueNavigationWrite(async () => {
    const data = await api.storage.local.get('navigationModePermissionDraft');
    const draft = data.navigationModePermissionDraft;
    if (draft?.ownerTabId === tabId) {
      await api.storage.local.set({ navigationModePermissionDraft: { ...draft, cancelled: true } });
      await reconcileNavigationPermissionDraft();
    }
  }).catch(() => {});
  browseSources.delete(tabId);
  for (const key of navigationSessions.keys()) if (key.startsWith('navigationProfile:' + tabId + ':')) navigationSessions.delete(key);
  if (api.storage.session) api.storage.session.get(null).then(data => { const keys = Object.keys(data).filter(key => key === 'remapadBrowseSource:' + tabId || key.startsWith('navigationProfile:' + tabId + ':') || (key.startsWith('remapadBrowseSource:') && data[key]?.sourceTabId === tabId)); if (keys.length) return api.storage.session.remove(keys); }).catch(() => {});
});
