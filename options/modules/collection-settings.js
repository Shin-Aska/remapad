/**
 * Remapad Options — Collection Navigation Settings
 * MV3-compatible classic script; exposed via window.RemapadOptions.CollectionSettings.
 */

(function (global) {
  'use strict';

  function create({ api, state, constants, utils, showToast, saveSettings }) {
    const { getFriendlyLabel, parseDomain, ensureSitePermission } = utils;
    const { FRIENDLY_NAMES } = constants;

    function render() {
      renderSitesList();
      renderEditor();
    }

    function renderSitesList() {
      const listEl = document.getElementById('cnav-sites-list');
      if (!listEl) return;
      const settings = state.getSettings();
      const sites = Object.keys(settings.siteCollections);
      let selectedSite = state.getSelectedCollectionSite();
      if (!selectedSite || !sites.includes(selectedSite)) {
        selectedSite = sites[0] || '';
        state.setSelectedCollectionSite(selectedSite);
      }
      if (sites.length === 0) {
        listEl.innerHTML = '<p style="font-size:12px;color:var(--on-surface-variant);font-family:var(--font-body);text-align:center;padding:16px 0">No sites configured yet.<br>Add one below.</p>';
        return;
      }
      listEl.replaceChildren();
      sites.forEach(site => {
        const config = settings.siteCollections[site];
        const hasCollection = !!(config?.containerSelector && config?.itemSelector);
        const hasSearch = !!(config?.searchTriggerSelector || config?.searchInputSelector);
        const isConfigured = hasCollection || hasSearch;
        const isActive = site === selectedSite;
        const item = document.createElement('div');
        item.className = `cnav-site-item${isActive ? ' active' : ''}`;
        item.dataset.site = site;
        item.setAttribute('role', 'button');
        item.tabIndex = 0;

        const status = document.createElement('span');
        status.className = `cnav-site-status${isConfigured ? ' configured' : ''}`;
        status.title = isConfigured ? 'Configured' : 'Empty — needs selectors';
        const label = document.createElement('span');
        label.className = 'cnav-site-label';
        const name = document.createElement('span');
        name.className = 'cnav-site-name';
        name.textContent = getFriendlyLabel(site, FRIENDLY_NAMES);
        const domain = document.createElement('span');
        domain.className = 'cnav-site-domain';
        domain.textContent = site;
        label.append(name, domain);
        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn-ghost cnav-site-delete';
        deleteButton.dataset.site = site;
        deleteButton.title = 'Remove';
        deleteButton.style.cssText = 'padding:2px 6px;font-size:14px;color:var(--on-surface-variant);flex-shrink:0;border:0;background:transparent;cursor:pointer;line-height:1';
        deleteButton.textContent = '✕';
        item.append(status, label, deleteButton);
        listEl.appendChild(item);
      });
      listEl.querySelectorAll('.cnav-site-item').forEach(button => {
        const selectSite = event => {
          if (event.target.closest('.cnav-site-delete')) return;
          state.setSelectedCollectionSite(button.dataset.site);
          renderSitesList();
          renderEditor();
        };
        button.addEventListener('click', selectSite);
        button.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectSite(event);
          }
        });
      });
      listEl.querySelectorAll('.cnav-site-delete').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          const site = button.dataset.site;
          if (!confirm(`Remove navigation and search config for ${site}?`)) return;
          delete settings.siteCollections[site];
          state.setSelectedCollectionSite(Object.keys(settings.siteCollections)[0] || '');
          state.markUnsaved();
          renderSitesList();
          renderEditor();
        });
      });
    }

    function renderEditor() {
      const editorEl = document.getElementById('cnav-editor-panel');
      if (!editorEl) return;
      const settings = state.getSettings();
      const selectedSite = state.getSelectedCollectionSite();
      if (!selectedSite) {
        editorEl.innerHTML = `
          <div class="cnav-empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            <p>Select a site from the list or add one to get started.</p>
          </div>`;
        return;
      }
      const config = settings.siteCollections[selectedSite] || {
        containerSelector: '',
        itemSelector: '',
        searchTriggerSelector: '',
        searchInputSelector: ''
      };
      editorEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div>
            <div id="cnav-site-title" style="font-family:var(--font-headline);font-size:17px;font-weight:700;color:var(--on-surface)"></div>
            <div id="cnav-site-domain" style="font-size:12px;color:var(--on-surface-variant);font-family:var(--font-body);margin-top:1px"></div>
          </div>
          <button id="cnav-delete-btn" class="btn-ghost" style="color:var(--error);font-size:12px">Remove Site</button>
        </div>
        <div style="margin-bottom:16px">
          <label class="cnav-field-label" for="cnav-container-input">Container Selector <span style="opacity:0.5;font-weight:400;text-transform:none">(rows / shelves)</span></label>
          <input type="text" id="cnav-container-input" class="cnav-input" placeholder="e.g. .lolomoRow, [data-testid=&quot;row&quot;]">
          <p style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);margin:4px 0 0;line-height:1.4">Matches each horizontal shelf or group of items.</p>
        </div>
        <div style="margin-bottom:16px">
          <label class="cnav-field-label" for="cnav-item-input">Item Selector <span style="opacity:0.5;font-weight:400;text-transform:none">(cards within a row)</span></label>
          <input type="text" id="cnav-item-input" class="cnav-input" placeholder="e.g. .title-card-container, [data-testid=&quot;card&quot;]">
          <p style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);margin:4px 0 0;line-height:1.4">Matches individual cards scoped inside a matched container.</p>
        </div>
        <div style="margin:22px 0 14px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08)">
          <div style="font-family:var(--font-headline);font-size:14px;font-weight:700;color:var(--on-surface)">Open Search</div>
          <p style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);margin:4px 0 0;line-height:1.4">Optional per-site overrides for the controller’s Open Search action.</p>
        </div>
        <div style="margin-bottom:16px">
          <label class="cnav-field-label" for="cnav-search-trigger-input">Search Trigger Selector <span style="opacity:0.5;font-weight:400;text-transform:none">(icon / button)</span></label>
          <input type="text" id="cnav-search-trigger-input" class="cnav-input" placeholder="e.g. button[aria-label*=&quot;search&quot; i]">
          <p style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);margin:4px 0 0;line-height:1.4">Clicked when the search input is initially hidden. Leave empty when the input is always visible.</p>
        </div>
        <div style="margin-bottom:16px">
          <label class="cnav-field-label" for="cnav-search-input-input">Search Input Selector <span style="opacity:0.5;font-weight:400;text-transform:none">(text field)</span></label>
          <input type="text" id="cnav-search-input-input" class="cnav-input" placeholder="e.g. input[type=&quot;search&quot;], [role=&quot;searchbox&quot;]">
          <p style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);margin:4px 0 0;line-height:1.4">Focused after the trigger opens search; Remapad’s virtual keyboard can then appear.</p>
        </div>
        <div class="cnav-test-result" id="cnav-test-result"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)">
          <button id="cnav-test-btn" class="btn-ghost" style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Test on Active Tab</button>
          <button id="cnav-save-btn" class="btn-primary" style="font-size:13px">Save</button>
        </div>
      `;
      document.getElementById('cnav-site-title').textContent = getFriendlyLabel(selectedSite, FRIENDLY_NAMES);
      document.getElementById('cnav-site-domain').textContent = selectedSite;
      document.getElementById('cnav-container-input').value = config.containerSelector || '';
      document.getElementById('cnav-item-input').value = config.itemSelector || '';
      document.getElementById('cnav-search-trigger-input').value = config.searchTriggerSelector || '';
      document.getElementById('cnav-search-input-input').value = config.searchInputSelector || '';
      document.getElementById('cnav-delete-btn')?.addEventListener('click', () => {
        if (!confirm(`Remove navigation and search config for ${selectedSite}?`)) return;
        delete settings.siteCollections[selectedSite];
        state.setSelectedCollectionSite(Object.keys(settings.siteCollections)[0] || '');
        state.markUnsaved();
        renderSitesList();
        renderEditor();
      });
      document.getElementById('cnav-save-btn')?.addEventListener('click', () => {
        const containerSelector = document.getElementById('cnav-container-input')?.value.trim() || '';
        const itemSelector = document.getElementById('cnav-item-input')?.value.trim() || '';
        const searchTriggerSelector = document.getElementById('cnav-search-trigger-input')?.value.trim() || '';
        const searchInputSelector = document.getElementById('cnav-search-input-input')?.value.trim() || '';
        settings.siteCollections[selectedSite] = {
          containerSelector,
          itemSelector,
          searchTriggerSelector,
          searchInputSelector
        };
        state.markUnsaved();
        saveSettings();
        renderSitesList();
      });
      document.getElementById('cnav-test-btn')?.addEventListener('click', () => testSelectors());
    }

    async function testSelectors() {
      const containerSelector = document.getElementById('cnav-container-input')?.value.trim() || '';
      const itemSelector = document.getElementById('cnav-item-input')?.value.trim() || '';
      const searchTriggerSelector = document.getElementById('cnav-search-trigger-input')?.value.trim() || '';
      const searchInputSelector = document.getElementById('cnav-search-input-input')?.value.trim() || '';
      const resultEl = document.getElementById('cnav-test-result');
      if (!resultEl) return;
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(255,255,255,0.04)';
      resultEl.style.color = 'var(--on-surface-variant)';
      resultEl.style.border = '1px solid rgba(255,255,255,0.06)';
      resultEl.textContent = 'Testing selectors on active tab…';
      try {
        const response = await api.runtime.sendMessage({
          type: 'COUNT_SELECTORS',
          containerSelector,
          itemSelector,
          searchTriggerSelector,
          searchInputSelector
        });
        if (response?.error) {
          resultEl.style.background = 'rgba(229,9,20,0.1)';
          resultEl.style.color = '#ffb4ab';
          resultEl.style.border = '1px solid rgba(229,9,20,0.2)';
          resultEl.textContent = `⚠ Error: ${response.error}`;
        } else {
          const {
            containerCount = 0,
            itemCount = 0,
            searchTriggerCount = 0,
            searchInputCount = 0
          } = response || {};
          const collectionConfigured = Boolean(containerSelector || itemSelector);
          const collectionComplete = Boolean(containerSelector && itemSelector);
          const searchConfigured = Boolean(searchTriggerSelector || searchInputSelector);
          const collectionOk = !collectionConfigured || (collectionComplete && containerCount > 0);
          const searchOk = !searchConfigured || (
            searchTriggerSelector
              ? searchTriggerCount > 0
              : searchInputSelector && searchInputCount > 0
          );
          const ok = (collectionConfigured || searchConfigured) && collectionOk && searchOk;
          const parts = [];
          if (collectionConfigured) {
            parts.push(collectionComplete
              ? `Rows: ${containerCount}; items: ${itemCount}`
              : 'Collection selectors are incomplete');
          }
          if (searchConfigured) {
            parts.push(`Search triggers: ${searchTriggerCount}; inputs: ${searchInputCount}`);
          }
          resultEl.style.background = ok ? 'rgba(74,222,128,0.08)' : 'rgba(250,204,21,0.08)';
          resultEl.style.color = ok ? '#4ade80' : '#facc15';
          resultEl.style.border = `1px solid ${ok ? 'rgba(74,222,128,0.2)' : 'rgba(250,204,21,0.2)'}`;
          resultEl.textContent = `${ok ? '✓' : '⚠'} ${parts.join(' · ') || 'Add collection or search selectors before testing.'}`;
        }
      } catch (error) {
        resultEl.style.background = 'rgba(229,9,20,0.1)';
        resultEl.style.color = '#ffb4ab';
        resultEl.style.border = '1px solid rgba(229,9,20,0.2)';
        resultEl.textContent = '⚠ Could not reach active tab. Open the target site first.';
      }
    }

    function bind({ addButton, input, saveAllButton }) {
      addButton?.addEventListener('click', async () => {
        const domain = parseDomain(input?.value || '');
        if (!domain || !domain.includes('.')) {
          alert('Please enter a valid website domain (e.g. disneyplus.com).');
          return;
        }
        const settings = state.getSettings();
        if (!await ensureSitePermission(api, domain)) {
          showToast(`Site access was not granted for ${domain}.`);
          return;
        }
        if (!settings.websiteMappings[domain]) {
          settings.websiteMappings[domain] = { ...settings.defaultMapping };
          settings.siteKeyboardLayouts[domain] = 'auto';
        }
        if (!settings.siteCollections[domain]) {
          settings.siteCollections[domain] = {
            containerSelector: '',
            itemSelector: '',
            searchTriggerSelector: '',
            searchInputSelector: ''
          };
        }
        state.setSelectedCollectionSite(domain);
        state.markUnsaved();
        if (input) input.value = '';
        renderSitesList();
        renderEditor();
        showToast(`Added ${domain} — fill in the selectors and save.`, 'success');
      });
      saveAllButton?.addEventListener('click', saveSettings);
    }

    return { render, renderSitesList, renderEditor, bind };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.CollectionSettings = { create };
})(typeof window !== 'undefined' ? window : globalThis);
