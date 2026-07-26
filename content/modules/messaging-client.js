/**
 * Remapad — Messaging Client
 * MV3-compatible classic script; exposed via window.RemapadCS.MessagingClient.
 * Thin wrapper around extension runtime messaging. Calls silently tolerate a
 * missing or disconnected runtime so content-script code keeps running in
 * isolated / incognito contexts.
 */

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

    return { browserAction, openSiteMapping };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.MessagingClient = { create: createClient };
})(typeof window !== 'undefined' ? window : globalThis);
