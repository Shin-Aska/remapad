/**
 * Remapad — Service Worker (Background Broker)
 * Compatible with Chrome and Firefox MV3.
 */

'use strict';

const api = typeof chrome !== 'undefined' ? chrome : browser;

// Listen for messages from content scripts, popups, or options page
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'BROWSER_ACTION') {
    handleBrowserAction(message.action, sender)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ error: err.message }));
    return true; // Keeps channel open for async response
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
