/**
 * Remapad Options — Tabs
 * MV3-compatible classic script; exposed via window.RemapadOptions.Tabs.
 */

(function (global) {
  'use strict';

  function create({ collectionSettings, navigationSettings, keyboardSettings }) {
    function activate(button) {
      const tabButtons = document.querySelectorAll('.tab-btn');
      const targetPanelId = button.getAttribute('aria-controls');
      tabButtons.forEach(tab => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(panel => { panel.hidden = true; });
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');
      const panel = document.getElementById(targetPanelId);
      if (!panel) return;
      panel.hidden = false;
      if (targetPanelId === 'tab-panel-collection') collectionSettings.render();
      if (targetPanelId === 'tab-panel-navigation') navigationSettings.render();
      if (targetPanelId === 'tab-panel-keyboard') keyboardSettings.render();
    }

    function init() {
      document.querySelectorAll('.tab-btn').forEach(button => button.addEventListener('click', () => activate(button)));
    }

    function switchBy(direction) {
      const tabs = Array.from(document.querySelectorAll('.tab-btn'));
      const activeIndex = tabs.findIndex(tab => tab.classList.contains('active'));
      if (activeIndex === -1) return;
      tabs[(activeIndex + direction + tabs.length) % tabs.length].click();
    }

    return { init, switchBy };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.Tabs = { create };
})(typeof window !== 'undefined' ? window : globalThis);
