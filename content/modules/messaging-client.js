(function (global) {
  'use strict';

  function createClient(api) {
    function browserAction(action) {
      try {
        api.runtime.sendMessage({ type: 'BROWSER_ACTION', action }).catch(() => {});
      } catch (_) {}
    }

    function openSiteMapping() {
      try {
        api.runtime.sendMessage({ type: 'OPEN_SITE_MAPPING' }).catch(() => {});
      } catch (_) {}
    }

    function requestTrustedClick(x, y) {
      try {
        api.runtime.sendMessage({ type: 'TRUSTED_CLICK', x, y }, () => {});
      } catch (_) {}
    }

    return { browserAction, openSiteMapping, requestTrustedClick };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.MessagingClient = { create: createClient };
})(typeof window !== 'undefined' ? window : globalThis);
