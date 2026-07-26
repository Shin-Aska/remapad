/**
 * Remapad — Site Policy
 * MV3-compatible classic script; exposed via window.RemapadCS.SitePolicy.
 * Provides site-specific collection/search config and special back behavior.
 * Netflix uses `location.replace` to the origin instead of `history.back` so
 * the SPA reloads its home state cleanly.
 */

(function (global) {
  'use strict';

  function create({ constants, hostname }) {
    const { SITE_SEARCH_CONFIGS } = constants;

    function getCollectionConfig(settings) {
      return settings.siteCollections?.[hostname] || null;
    }

    function safeQueryVisible(selector) {
      if (!selector || typeof selector !== 'string') return null;
      try {
        return Array.from(document.querySelectorAll(selector)).find(element => (
          element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
        )) || null;
      } catch (error) {
        console.warn('[Remapad CS] Invalid search selector:', selector, error);
        return null;
      }
    }

    function isSearchInput(element) {
      if (!(element instanceof Element)) return false;
      if (element.matches('textarea, [contenteditable="true"], [role="searchbox"]')) return true;
      if (!element.matches('input')) return false;
      return !element.matches('input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"], input[type="range"], input[type="color"], input[type="file"], input[type="hidden"]');
    }

    async function focusSearchInput(element, interactions = {}) {
      if (!isSearchInput(element)) return false;
      if (typeof interactions.pointAt === 'function') {
        await interactions.pointAt(element);
      }
      element.focus({ preventScroll: false });
      if (typeof element.select === 'function') {
        try { element.select(); } catch (_) {}
      }
      return true;
    }

    function getSearchConfig(settings) {
      const custom = settings.siteCollections?.[hostname] || {};
      const builtIn = SITE_SEARCH_CONFIGS[hostname] || {};
      return {
        triggerSelector: custom.searchTriggerSelector || builtIn.triggerSelector || '',
        inputSelector: custom.searchInputSelector || builtIn.inputSelector || ''
      };
    }

    function findSearchInput(config) {
      const configured = safeQueryVisible(config.inputSelector);
      if (configured && isSearchInput(configured)) return configured;
      return safeQueryVisible(
        'input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i], [role="searchbox"], [contenteditable="true"][aria-label*="search" i]'
      );
    }

    function waitForSearchInput(config, timeoutMs = 1200) {
      const immediate = findSearchInput(config);
      if (immediate) return Promise.resolve(immediate);
      return new Promise(resolve => {
        let settled = false;
        const finish = element => {
          if (settled) return;
          settled = true;
          observer.disconnect();
          clearTimeout(timer);
          resolve(element || null);
        };
        const observer = new MutationObserver(() => {
          const element = findSearchInput(config);
          if (element) finish(element);
        });
        observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
        const timer = setTimeout(() => finish(findSearchInput(config)), timeoutMs);
      });
    }

    async function openSearch(settings, interactions = {}) {
      const config = getSearchConfig(settings);
      const existingInput = findSearchInput(config);
      if (existingInput) return focusSearchInput(existingInput, interactions);

      const configuredTrigger = safeQueryVisible(config.triggerSelector);
      const fallbackTrigger = safeQueryVisible(
        'button[aria-label*="search" i], [role="button"][aria-label*="search" i], button[title*="search" i], a[aria-label*="search" i]'
      );
      const trigger = configuredTrigger || fallbackTrigger;
      if (!trigger) return false;
      if (isSearchInput(trigger)) return focusSearchInput(trigger, interactions);

      const point = typeof interactions.pointAt === 'function'
        ? await interactions.pointAt(trigger)
        : null;
      if (typeof interactions.press === 'function') {
        await interactions.press(trigger, point);
      } else {
        trigger.click();
      }
      const revealedInput = await waitForSearchInput(config);
      return revealedInput ? focusSearchInput(revealedInput, interactions) : false;
    }

    function shouldHandleBack() {
      if (hostname !== 'netflix.com') return false;
      const url = new URL(location.href);
      const isTitleRoute = /^\/(?:title|watch)\//.test(url.pathname);
      if (!url.searchParams.has('jbv') && !isTitleRoute) return false;
      return true;
    }

    function navigateNetflixHome() {
      if (!shouldHandleBack()) return false;
      const url = new URL(location.href);
      location.replace(`${url.origin}/`);
      return true;
    }

    return {
      getCollectionConfig,
      getSearchConfig,
      openSearch,
      shouldHandleBack,
      navigateNetflixHome,
      hostname
    };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.SitePolicy = { create };
})(typeof window !== 'undefined' ? window : globalThis);
