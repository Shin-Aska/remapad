/* Browse data stays in memory; only trusted broker context identifies the source. */
'use strict';
const api = typeof chrome !== 'undefined' ? chrome : browser;
const query = document.getElementById('query');
const results = document.getElementById('results');
const status = document.getElementById('status');
const dock = document.getElementById('keyboard-dock');
let browseTabId,
  sourceTab,
  revision = 0;
let sourceRevision = 0;
let navigationPending = false;
let sourceShortcuts = null;
let permissions = new Set();
let renderedResults = '';
let focusResultsAfterRefresh = false;
const gamepadSamples = new Map();
let activeGamepadKey = null;
let requireNeutralInput = true;
const keyboard = window.RemapadKeyboard;
const closeDetector = RemapadNavigationMode.createChordDetector();
function httpURL(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch (_) {
    return null;
  }
}
function typedURL(value) {
  if (httpURL(value)) return httpURL(value);
  // Recognized bare hosts may include a numeric port; a colon alone is not a scheme.
  return /^(localhost|(?:[a-z\d-]+\.)+[a-z\d-]+)(?::\d+)?(?:[/?#]\S*)?$/i.test(value)
    ? httpURL('https://' + value)
    : null;
}
function message(text) {
  status.textContent = text;
}
async function activateTab(id) {
  const tab = await api.tabs.get(id);
  await api.tabs.update(id, { active: true });
  if (Number.isInteger(tab.windowId)) await api.windows.update(tab.windowId, { focused: true });
}
async function refreshSource() {
  if (!Number.isInteger(browseTabId)) return;
  const generation = ++sourceRevision;
  const context = await api.runtime.sendMessage({ type: 'GET_BROWSE_CONTEXT' }).catch(() => null);
  if (generation !== sourceRevision) return;
  sourceTab = context?.sourceTab || null;
  const shortcuts = context?.profileShortcuts || null;
  if (JSON.stringify(shortcuts) !== JSON.stringify(sourceShortcuts)) {
    sourceShortcuts = shortcuts;
    baselineControllerInput();
  }
  document.getElementById('back').disabled = !sourceTab;
  document.getElementById('edit').disabled = !sourceTab || !httpURL(sourceTab.url);
}

async function leaveBrowse(openDestination, onFailure) {
  if (navigationPending || !Number.isInteger(browseTabId)) return;
  navigationPending = true;
  try {
    if (openDestination && !(await openDestination())) return;
    try {
      await api.tabs.remove(browseTabId);
    } catch (_) {
      message('Could not close Browse.');
    }
  } catch (_) {
    await onFailure?.();
  } finally {
    navigationPending = false;
  }
}

function back() {
  return leaveBrowse(async () => {
    await refreshSource();
    if (sourceTab) await activateTab(sourceTab.id);
    return true;
  }, () => message('The original tab is no longer available.'));
}

function switchBrowserTab(action) {
  return leaveBrowse(async () => {
    const result = await api.runtime.sendMessage({ type: 'BROWSER_ACTION', action });
    if (!result?.success) throw new Error(result?.error);
    if (!result.switched) message('No other tab in this window.');
    return result.switched;
  }, () => message('Could not switch tabs.'));
}
function openKeyboard() {
  const originalValue = query.value;
  focusResultsAfterRefresh = false;
  dock.hidden = false;
  keyboard.open(query, {
    dock,
    submitOnConfirm: false,
    confirmLabel: 'Done',
    onClose: (_target, confirmed) => {
      if (!confirmed) query.value = originalValue;
      dock.hidden = true;
      document.getElementById('keyboard').setAttribute('aria-expanded', 'false');
      focusResultsAfterRefresh = true;
      suggest();
    },
  });
  document.getElementById('keyboard').setAttribute('aria-expanded', 'true');
}
function permissionHelp(name, label) {
  const button = document.getElementById(`capability-${name}`);
  document.getElementById('sources').open = true;
  const help = document.getElementById('capability-help');
  help.textContent = `Press Enter or click the Allow ${label} button to open the browser permission prompt.`;
  button?.setAttribute('aria-describedby', help.id);
  button?.focus();
}
async function capabilities() {
  const current = await api.permissions.getAll();
  permissions = new Set(current.permissions || []);
  const container = document.getElementById('capabilities');
  const focusedId = container.contains(document.activeElement) ? document.activeElement.id : null;
  container.replaceChildren();
  for (const [name, label] of [
    ['bookmarks', 'Bookmarks'],
    ['history', 'Recent history'],
    ['search', 'Default search'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `capability-${name}`;
    const allowed = permissions.has(name);
    button.textContent = `${allowed ? 'Remove' : 'Allow'} ${label}`;
    button.addEventListener('click', async (event) => {
      if (!allowed && !event.isTrusted) {
        permissionHelp(name, label);
        return;
      }
      // Keep request in the direct click handler so the browser recognizes the gesture.
      try {
        const granted = allowed
          ? await api.permissions.remove({ permissions: [name] })
          : await api.permissions.request({ permissions: [name] });
        message(
          allowed
            ? `${label} access removed.`
            : granted
            ? `${label} enabled.`
            : `${label} access was not granted.`
        );
        document.getElementById('capability-help').textContent = granted
          ? '' : `${label} access was not granted. You can try its Allow button again.`;
      } catch (_) {
        message(`The browser did not complete the ${label} permission change.`);
        if (!allowed) permissionHelp(name, label);
      }
      await capabilities();
      await suggest();
    });
    container.append(button);
  }
  if (focusedId) {
    const replacement = document.getElementById(focusedId);
    if (document.getElementById('capability-help').textContent)
      replacement?.setAttribute('aria-describedby', 'capability-help');
    replacement?.focus();
  }
}
function navigate(item) {
  return leaveBrowse(async () => {
    if (item.tabId !== undefined) {
      await activateTab(item.tabId);
    } else if (item.search) {
      if (!(await api.permissions.contains({ permissions: ['search'] }))) {
        await capabilities();
        permissionHelp('search', 'Default search');
        return false;
      }
      if (!api.search) {
        message('This browser does not provide default search. You can still open a URL or choose an open tab.');
        return false;
      }
      const tab = await api.tabs.create({ url: 'about:blank', active: false });
      try {
        if (typeof api.search.query === 'function') {
          await api.search.query({ text: item.search, tabId: tab.id });
        } else if (typeof api.search.search === 'function') {
          await api.search.search({ query: item.search, tabId: tab.id });
        } else {
          throw new Error('Default browser search is unavailable');
        }
        await activateTab(tab.id);
      } catch (error) {
        await api.tabs.remove(tab.id).catch(() => {});
        throw error;
      }
    } else {
      const url = httpURL(item.url);
      if (!url) return false;
      // Recheck at selection time: a destination may have opened after rendering,
      // or its matching tab may be outside the visible suggestion limit.
      const tabs = await api.tabs.query({});
      const existing = tabs.find((tab) => tab.id !== browseTabId && httpURL(tab.url) === url);
      if (existing) await activateTab(existing.id);
      else await api.tabs.create({ url });
    }
    return true;
  }, async () => {
    message('Could not open that destination. It may have closed or access changed.');
    await capabilities().then(suggest).catch(() => {});
  });
}
function row(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'result' + (item.primary ? ' primary' : '');
  const kind = document.createElement('span');
  kind.className = 'kind';
  kind.textContent = item.kind;
  const title = document.createElement('strong');
  title.textContent = item.title;
  const detail = document.createElement('small');
  detail.textContent = item.url || (item.needsSearchPermission
    ? 'Select to enable Default search in Suggestion sources.'
    : 'Use your browser’s default search engine');
  button.dataset.resultKey =
    item.tabId !== undefined
      ? `tab:${item.tabId}`
      : item.search
      ? `search:${item.search}`
      : `url:${item.url}`;
  button.append(kind, title, detail);
  button.addEventListener('click', () => navigate(item));
  return button;
}
function renderResults(items) {
  const signature = JSON.stringify(items);
  if (signature === renderedResults) return;
  const focused = results.contains(document.activeElement) ? document.activeElement : null;
  const key = focused?.dataset.resultKey;
  const oldIndex = focused ? [...results.children].indexOf(focused) : -1;
  renderedResults = signature;
  results.replaceChildren(...items.map(row));
  document.getElementById('empty').hidden = items.length > 0;
  if (key) {
    const replacement = [...results.children].find((button) => button.dataset.resultKey === key);
    const fallback = results.children[Math.min(oldIndex, results.children.length - 1)];
    (replacement || fallback || query).focus();
  }
}
async function suggest() {
  const generation = ++revision;
  const text = query.value.trim();
  const lower = text.toLocaleLowerCase();
  const seen = new Set();
  const items = [];
  const add = (item) => {
    const url = httpURL(item.url);
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({ ...item, url });
  };
  try {
    const tabs = await api.tabs.query({});
    const eligibleTabs = tabs.filter((tab) => tab.id !== browseTabId && httpURL(tab.url));
    const openTabsByURL = new Map();
    for (const tab of eligibleTabs) {
      const url = httpURL(tab.url);
      if (!openTabsByURL.has(url)) openTabsByURL.set(url, tab);
    }
    const address = typedURL(text);
    const matchingTabs = [...openTabsByURL.values()].filter(
      (tab) =>
        !lower ||
        `${tab.title || ''} ${tab.url}`.toLocaleLowerCase().includes(lower) ||
        (address && httpURL(tab.url) === address)
    );
    // Keep an exact typed destination selectable even beyond the display cap.
    matchingTabs.sort(
      (left, right) =>
        Number(httpURL(right.url) === address) - Number(httpURL(left.url) === address)
    );
    for (const tab of matchingTabs.slice(0, 8)) {
      add({ kind: 'Open tab · switch', title: tab.title || tab.url, url: tab.url, tabId: tab.id });
    }
    // Hidden matches must still suppress duplicate bookmark/history/address rows.
    for (const tab of matchingTabs) seen.add(httpURL(tab.url));
    const addStoredDestination = (entry, kind) => {
      const tab = openTabsByURL.get(httpURL(entry.url));
      add(
        tab
          ? {
              kind: 'Open tab · switch',
              title: tab.title || entry.title || tab.url,
              url: tab.url,
              tabId: tab.id,
            }
          : { kind, title: entry.title || entry.url, url: entry.url }
      );
    };
    const granted = await api.permissions.getAll();
    const allowed = new Set(granted.permissions || []);
    // Query only after a current permission check; revoked sources disappear on change.
    if (text && allowed.has('bookmarks') && api.bookmarks) {
      try {
        const rows = await api.bookmarks.search(text);
        rows.slice(0, 6).forEach((entry) => addStoredDestination(entry, 'Bookmark · new tab'));
      } catch (_) {}
    }
    if (text && allowed.has('history') && api.history) {
      try {
        const rows = await api.history.search({
          text,
          startTime: Date.now() - 30 * 86400000,
          maxResults: 6,
        });
        rows.forEach((entry) => addStoredDestination(entry, 'Recent history · new tab'));
      } catch (_) {}
    }
    if (generation !== revision) return;
    if (text && address && !seen.has(address))
      items.push({ kind: 'Address · new tab', title: address, url: address, primary: true });
    if (text && !address)
      items.push({
        kind: allowed.has('search') ? 'Search · new tab' : 'Search · permission needed',
        title: `Search for “${text}”`,
        search: text,
        needsSearchPermission: !allowed.has('search'),
        primary: true,
      });
    renderResults(items);
    if (focusResultsAfterRefresh) {
      focusResultsAfterRefresh = false;
      (results.querySelector('button') || query).focus();
    }
  } catch (_) {
    if (generation === revision) {
      message('Suggestions are unavailable. Try entering an address.');
      if (focusResultsAfterRefresh) { focusResultsAfterRefresh = false; query.focus(); }
    }
  }
}
query.addEventListener('input', suggest);
document.getElementById('command').addEventListener('submit', (event) => {
  event.preventDefault();
  if (keyboard.isOpen()) keyboard.close(true);
  else (results.querySelector('button') || query).focus();
});
document
  .getElementById('keyboard')
  .addEventListener('click', () => (keyboard.isOpen() ? keyboard.close(true) : openKeyboard()));
document.getElementById('edit').addEventListener('click', async () => {
  await refreshSource();
  if (sourceTab && httpURL(sourceTab.url)) {
    query.value = sourceTab.url;
    await suggest();
    openKeyboard();
  }
});
document.getElementById('back').addEventListener('click', back);
document.getElementById('close').addEventListener('click', () => leaveBrowse());
api.storage.onChanged.addListener((changes, area) => {
  const sourceChanged = area === 'session' && changes[`remapadBrowseSource:${browseTabId}`];
  const mappingChanged = area === 'local' && ['navigationModeWebsiteMappings', 'navigationModeEnabled', 'globalEnabled', 'enabledSites'].some(key => changes[key]);
  if (sourceChanged || mappingChanged) refreshSource();
});
for (const event of [api.permissions.onAdded, api.permissions.onRemoved])
  event.addListener(() => {
    revision++;
    renderResults([]);
    capabilities().then(suggest);
    refreshSource();
  });
api.tabs.onRemoved.addListener((id) => {
  if (id === sourceTab?.id) refreshSource();
  suggest();
});
api.tabs.onUpdated.addListener((tabId, change) => {
  if (tabId === sourceTab?.id && 'url' in change) refreshSource();
  if ('url' in change || 'title' in change) suggest();
});
api.tabs.onCreated.addListener(() => suggest());
// This extension page owns its controller loop; website mappings remain independent.
let prior = [],
  lastMove = 0;
function baselineControllerInput() {
  requireNeutralInput = true;
  lastMove = 0;
  closeDetector.reset();
}
window.addEventListener('blur', baselineControllerInput);
window.addEventListener('focus', baselineControllerInput);
document.addEventListener('visibilitychange', baselineControllerInput);
document.addEventListener('focusin', () => {
  document
    .querySelectorAll('.controller-focus')
    .forEach((element) => element.classList.remove('controller-focus'));
  document.activeElement?.classList.add('controller-focus');
  baselineControllerInput();
});
function controllerButtons(pad) {
  return RemapadNavigationMode.sampleShortcutButtons(pad, RemapadNavigationMode.shortcutLayout(pad));
}
function selectController() {
  const connected = [...(navigator.getGamepads?.() || [])].filter((pad) => pad?.connected);
  let producing = null;
  let activity = 0;
  for (const pad of connected) {
    const key = `${pad.index}:${pad.id}`;
    const buttons = controllerButtons(pad);
    const previous = gamepadSamples.get(key);
    const score = previous && buttons.some((pressed, index) => pressed && !previous[index]) ? 1 : 0;
    gamepadSamples.set(key, buttons);
    if (score > activity || (score && score === activity && key === activeGamepadKey)) {
      producing = pad;
      activity = score;
    }
  }
  const keys = new Set(connected.map((pad) => `${pad.index}:${pad.id}`));
  for (const key of gamepadSamples.keys()) if (!keys.has(key)) gamepadSamples.delete(key);
  const selected =
    producing ||
    connected.find((pad) => `${pad.index}:${pad.id}` === activeGamepadKey) ||
    connected.find((pad) => !/^unknown gamepad/i.test(pad.id)) ||
    connected[0];
  const key = selected ? `${selected.index}:${selected.id}` : null;
  if (key !== activeGamepadKey) {
    activeGamepadKey = key;
    baselineControllerInput();
  }
  return selected;
}
function focusables() {
  return [...document.querySelectorAll('button,input,summary')].filter(
    (el) => !el.disabled && el.getClientRects().length && !dock.contains(el)
  );
}
function move(direction) {
  if (keyboard.isOpen()) {
    keyboard.moveFocus(direction);
    return;
  }
  const elements = focusables();
  if (!elements.length) return;
  const current = elements.indexOf(document.activeElement);
  if (current < 0) {
    elements[0].focus();
    return;
  }
  const r = elements[current].getBoundingClientRect();
  const cx = r.x + r.width / 2,
    cy = r.y + r.height / 2;
  let best = null,
    score = Infinity;
  for (const el of elements) {
    if (el === elements[current]) continue;
    const q = el.getBoundingClientRect();
    const dx = q.x + q.width / 2 - cx,
      dy = q.y + q.height / 2 - cy;
    const vertical = direction === 'up' || direction === 'down';
    const primary = vertical ? dy : dx,
      lateral = vertical ? dx : dy;
    if (direction === 'up' || direction === 'left' ? primary >= -2 : primary <= 2) continue;
    const next = Math.abs(primary) + Math.abs(lateral) * 4;
    if (next < score) {
      score = next;
      best = el;
    }
  }
  if (best) best.focus();
}
function controllerFrame(now) {
  const pad = selectController();
  const down = pad ? controllerButtons(pad) : [];
  if (!document.hasFocus() || document.hidden || !pad || navigationPending) baselineControllerInput();
  else if (requireNeutralInput) {
    // Focus changes and controller replacement must not carry held actions forward.
    if (!down.some(Boolean)) requireNeutralInput = false;
  } else {
    const layout = RemapadNavigationMode.shortcutLayout(pad);
    const closeShortcut = sourceShortcuts ? RemapadNavigationMode.resolveProfileShortcuts(sourceShortcuts, layout).closeTab : [];
    const input = closeDetector.sample(down, { closeTab: closeShortcut }, now);
    const previous = input.actions.includes(6);
    const next = input.actions.includes(7);
    if (input.closeTab) {
      leaveBrowse();
    } else if (previous !== next) {
      switchBrowserTab(previous ? 'prev_tab' : 'next_tab');
    } else {
      for (const [index, direction] of [
        [12, 'up'],
        [13, 'down'],
        [14, 'left'],
        [15, 'right'],
      ]) {
        const repeat = down[index] && prior[index] && !closeShortcut.includes(index) && now - lastMove > 180;
        if (input.actions.includes(index) || repeat) {
          move(direction);
          lastMove = now;
          break;
        }
      }
      if (!requireNeutralInput && input.actions.includes(layout === 'n64' ? 5 : 0)) {
        if (keyboard.isOpen()) keyboard.activateFocus();
        else if (document.activeElement === query) openKeyboard();
        else document.activeElement?.click();
      }
      if (!requireNeutralInput && !navigationPending && input.actions.includes(layout === 'n64' ? 4 : 1)) {
        if (keyboard.isOpen()) keyboard.close(false);
        else back();
      }
    }
  }
  prior = down;
  requestAnimationFrame(controllerFrame);
}
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (keyboard.isOpen()) keyboard.close(false);
    else back();
  }
});
(async () => {
  try {
    const tab = await api.tabs.getCurrent();
    browseTabId = tab?.id;
    document.getElementById('close').disabled = !Number.isInteger(browseTabId);
    await refreshSource();
    await capabilities();
    await suggest();
    openKeyboard();
    requestAnimationFrame(controllerFrame);
  } catch (_) {
    message('Browse could not initialize. Reopen it from Remapad.');
  }
})();
