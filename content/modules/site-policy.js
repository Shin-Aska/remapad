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
    const { SITE_SEARCH_SELECTORS, SITE_COLLECTIONS_DEFAULT } = constants;

    function getCollectionConfig(settings) {
      return settings.siteCollections?.[hostname] || null;
    }

    function findSearchTarget() {
      let selector = SITE_SEARCH_SELECTORS[hostname];
      let input = selector ? document.querySelector(selector) : null;

      // If the known site selector misses, fall back to generic search inputs.
      if (!input) {
        input = document.querySelector('input[type="search"], input[placeholder*="Search" i]');
      }
      return input;
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
      findSearchTarget,
      shouldHandleBack,
      navigateNetflixHome,
      hostname
    };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.SitePolicy = { create };
})(typeof window !== 'undefined' ? window : globalThis);