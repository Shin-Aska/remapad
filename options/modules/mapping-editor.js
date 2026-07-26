/**
 * Remapad Options — Mapping Editor
 * MV3-compatible classic script; exposed via window.RemapadOptions.MappingEditor.
 * Owns website rows, controller labels, icon layouts, and action-dropdown flows.
 */

(function (global) {
  'use strict';

  function create({ state, constants, utils, dom, modal, renderAll, saveSettings, showToast, onDocumentClick }) {
    const {
      RESERVED_OPTIONS_KEY,
      FRIENDLY_NAMES,
      OPTIONS_PAGE_PROFILE,
      DEFAULT_PROFILE,
      ICON_STYLES,
      ACTION_OPTIONS,
      BUTTON_NAMES
    } = constants;
    const { escapeHtml, getFriendlyLabel, parseDomain } = utils;
    let activeCalloutBtn = null;

    function getActiveMapping() {
      const settings = state.getSettings();
      return state.getSelectedSiteKey() === 'default'
        ? settings.defaultMapping
        : settings.websiteMappings[state.getSelectedSiteKey()] || DEFAULT_PROFILE;
    }

    function renderEditorSiteSelect() {
      const previousValue = state.getSelectedSiteKey();
      const settings = state.getSettings();
      dom.editorSiteSelect.innerHTML = '';
      const defaultOption = document.createElement('option');
      defaultOption.value = 'default';
      defaultOption.textContent = 'Default (All Other Sites)';
      dom.editorSiteSelect.appendChild(defaultOption);
      Object.keys(settings.websiteMappings).forEach(domain => {
        const option = document.createElement('option');
        option.value = domain;
        option.textContent = `${getFriendlyLabel(domain, FRIENDLY_NAMES)} (${domain})`;
        dom.editorSiteSelect.appendChild(option);
      });
      state.setSelectedSiteKey(Array.from(dom.editorSiteSelect.options).some(option => option.value === previousValue)
        ? previousValue
        : 'default');
      dom.editorSiteSelect.value = state.getSelectedSiteKey();
    }

    function renderWebsiteMappings() {
      const settings = state.getSettings();
      dom.mappingsListEl.innerHTML = '';
      const domains = Object.keys(settings.websiteMappings);
      if (domains.length === 0) {
        dom.mappingsListEl.innerHTML = '<div style="text-align:center;padding:16px 0;color:var(--on-surface-variant);font-size:13px;font-family:var(--font-body)">No website mappings configured. Add a site below to start.</div>';
        return;
      }
      domains.forEach(domain => {
        const isSelected = state.getSelectedSiteKey() === domain;
        const siteLayout = settings.siteKeyboardLayouts[domain] || 'auto';
        const siteMode = settings.siteKeyboardTriggerModes[domain];
        const siteSelectors = settings.siteKeyboardTriggerSelectors[domain] || [];
        const selectStyle = 'flex:1;min-width:0;width:0;box-sizing:border-box;background:var(--surface-container);color:var(--on-surface);border:1px solid rgba(255,255,255,0.1);border-radius:var(--radius-sm);padding:4px 8px;font-size:11px;outline:none;font-family:var(--font-body);cursor:pointer';
        const textareaStyle = 'width:100%;max-width:100%;box-sizing:border-box;background:var(--surface-container);color:var(--on-surface);border:1px solid rgba(255,255,255,0.1);border-radius:var(--radius-sm);padding:6px 8px;font-size:11px;outline:none;font-family:var(--font-label);resize:vertical';
        const row = document.createElement('div');
        row.className = 'mapping-row' + (isSelected ? ' selected-site' : '');
        row.innerHTML = `
          <div class="mapping-row-main" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden;width:100%;box-sizing:border-box">
            <div class="mapping-row-left" tabindex="-1" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden">
              <img class="site-favicon-img" src="https://www.google.com/s2/favicons?sz=32&domain=${domain}" style="width:16px;height:16px;border-radius:2px;display:block;flex-shrink:0">
              <svg class="fallback-globe-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:none;color:var(--on-surface-variant);flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <div style="display:flex;align-items:baseline;gap:4px;min-width:0;overflow:hidden;flex:1">
                <span style="font-family:var(--font-body);font-size:13px;font-weight:500;color:var(--on-surface);flex-shrink:0;white-space:nowrap">${escapeHtml(getFriendlyLabel(domain, FRIENDLY_NAMES))}</span>
                <span style="font-family:var(--font-body);font-size:11px;color:var(--on-surface-variant);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1" title="${escapeHtml(domain)}">(${escapeHtml(domain)})</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <button class="delete-site-btn" data-site="${domain}" style="background:none;border:none;color:var(--error);cursor:pointer;padding:4px;display:flex;align-items:center;opacity:0.7;transition:opacity 0.2s" title="Remove site mapping"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
            </div>
          </div>
          <div class="mapping-row-keyboard" style="display:${isSelected ? 'flex' : 'none'};flex-direction:column;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);width:100%;box-sizing:border-box">
            <div style="display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box"><span style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);white-space:nowrap;flex-shrink:0">Layout:</span><select class="site-keyboard-layout-select" data-site="${domain}" style="${selectStyle}"><option value="auto" ${siteLayout === 'auto' ? 'selected' : ''}>Auto-detect</option><option value="qwerty" ${siteLayout === 'qwerty' ? 'selected' : ''}>QWERTY</option><option value="dvorak" ${siteLayout === 'dvorak' ? 'selected' : ''}>Dvorak</option><option value="azerty" ${siteLayout === 'azerty' ? 'selected' : ''}>AZERTY</option><option value="german" ${siteLayout === 'german' ? 'selected' : ''}>German (QWERTZ)</option><option value="spanish" ${siteLayout === 'spanish' ? 'selected' : ''}>Spanish</option><option value="russian" ${siteLayout === 'russian' ? 'selected' : ''}>Russian (ЙЦУКЕН)</option><option value="korean" ${siteLayout === 'korean' ? 'selected' : ''}>Korean (Dubeolsik)</option><option value="chinese" ${siteLayout === 'chinese' ? 'selected' : ''}>Chinese (Pinyin)</option><option value="japanese" ${siteLayout === 'japanese' ? 'selected' : ''}>Japanese (Hiragana / Katakana)</option></select></div>
            <div style="display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box"><span style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);white-space:nowrap;flex-shrink:0">Trigger:</span><select class="site-keyboard-trigger-mode-select" data-site="${domain}" style="${selectStyle}"><option value="" ${!siteMode ? 'selected' : ''}>Use global</option><option value="both" ${siteMode === 'both' ? 'selected' : ''}>On focus and click</option><option value="focus" ${siteMode === 'focus' ? 'selected' : ''}>On focus only</option><option value="click" ${siteMode === 'click' ? 'selected' : ''}>On click only</option><option value="disabled" ${siteMode === 'disabled' ? 'selected' : ''}>Disabled</option></select></div>
            <div style="display:flex;flex-direction:column;gap:6px;width:100%;box-sizing:border-box"><span style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body)">Custom selectors (one per line):</span><textarea class="site-keyboard-trigger-selectors-input" data-site="${domain}" rows="3" style="${textareaStyle}" placeholder="e.g. .search-box, [contenteditable]">${escapeHtml(siteSelectors.join('\n'))}</textarea><button class="btn-secondary site-keyboard-trigger-selectors-save" data-site="${domain}" style="align-self:flex-start;font-size:11px;padding:5px 12px;margin-top:2px">Save Selectors</button></div>
          </div>`;

        const favicon = row.querySelector('.site-favicon-img');
        const fallback = row.querySelector('.fallback-globe-svg');
        if (favicon && fallback) favicon.addEventListener('error', () => {
          favicon.style.display = 'none';
          fallback.style.display = 'block';
        });
        row.querySelector('.mapping-row-main').addEventListener('click', () => {
          state.setSelectedSiteKey(domain);
          dom.editorSiteSelect.value = domain;
          populateVisualLabels();
          closeDropdown();
          renderWebsiteMappings();
        });
        const layoutSelect = row.querySelector('.site-keyboard-layout-select');
        if (layoutSelect) {
          layoutSelect.addEventListener('change', event => {
            event.stopPropagation();
            settings.siteKeyboardLayouts[domain] = layoutSelect.value;
            state.markUnsaved();
            if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.setLayout) {
              const layout = layoutSelect.value === 'auto' ? settings.keyboardLayout || 'qwerty' : layoutSelect.value;
              RemapadKeyboard.setLayout(layout);
            }
            saveSettings();
          });
          layoutSelect.addEventListener('click', event => event.stopPropagation());
        }
        const triggerModeSelect = row.querySelector('.site-keyboard-trigger-mode-select');
        if (triggerModeSelect) {
          triggerModeSelect.addEventListener('change', event => {
            event.stopPropagation();
            if (triggerModeSelect.value === '') delete settings.siteKeyboardTriggerModes[domain];
            else settings.siteKeyboardTriggerModes[domain] = triggerModeSelect.value;
            state.markUnsaved();
            saveSettings();
          });
          triggerModeSelect.addEventListener('click', event => event.stopPropagation());
        }
        const selectorsInput = row.querySelector('.site-keyboard-trigger-selectors-input');
        const selectorsSave = row.querySelector('.site-keyboard-trigger-selectors-save');
        if (selectorsSave && selectorsInput) selectorsSave.addEventListener('click', event => {
          event.stopPropagation();
          settings.siteKeyboardTriggerSelectors[domain] = selectorsInput.value.split('\n').map(selector => selector.trim()).filter(Boolean);
          state.markUnsaved();
          saveSettings();
        });
        const deleteButton = row.querySelector('.delete-site-btn');
        if (domain === RESERVED_OPTIONS_KEY) {
          deleteButton.style.display = 'none';
          deleteButton.disabled = true;
        }
        deleteButton.addEventListener('click', event => {
          event.stopPropagation();
          if (domain === RESERVED_OPTIONS_KEY) return;
          if (!confirm(`Remove mapping for ${domain}?`)) return;
          delete settings.websiteMappings[domain];
          delete settings.siteKeyboardLayouts[domain];
          delete settings.siteKeyboardTriggerModes[domain];
          delete settings.siteKeyboardTriggerSelectors[domain];
          if (state.getSelectedSiteKey() === domain) state.setSelectedSiteKey('default');
          state.markUnsaved();
          renderAll();
        });
        dom.mappingsListEl.appendChild(row);
      });
    }

    function detectControllerStyle(gamepadId) {
      const id = (gamepadId || '').toLowerCase();
      if (/xbox|microsoft|xinput|generic x/.test(id)) return 'xbox';
      if (/dualsense|dualshock|sony|playstation|ps4|ps5/.test(id)) return 'playstation';
      if (/nintendo|switch|pro controller/.test(id)) return 'nintendo';
      return null;
    }

    function resolveIconStyle() {
      const stored = state.getSettings().iconStyle || 'auto';
      if (stored !== 'auto') return stored;
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gamepad = [...gamepads].find(item => item && item.connected);
      return detectControllerStyle(gamepad?.id) || 'playstation';
    }

    function renderIconStyles() {
      const settings = state.getSettings();
      dom.iconStyleListEl.innerHTML = '';
      const detected = resolveIconStyle();
      ICON_STYLES.forEach(style => {
        const isSelected = settings.iconStyle === style.id;
        const isAuto = style.id === 'auto';
        const subtitle = isAuto && settings.iconStyle === 'auto'
          ? `Detected: ${detected.charAt(0).toUpperCase() + detected.slice(1)}`
          : style.sub;
        const item = document.createElement('div');
        item.className = 'icon-style-item' + (isSelected ? ' selected' : '');
        item.setAttribute('tabindex', '-1');
        item.innerHTML = `<div class="icon-style-left"><div class="button-glyphs">${style.btns.map(button => `<span class="btn-glyph-badge">${button}</span>`).join('')}</div><div><div class="icon-style-name">${escapeHtml(style.name)}</div><div class="icon-style-sub ${isSelected ? 'profile-active' : 'profile-default'}">${isSelected ? 'Active Layout' : escapeHtml(subtitle)}</div></div></div>${isSelected ? '<svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;display:block;flex-shrink:0"><circle cx="12" cy="12" r="10"/><polyline points="20 6 9 17 4 12"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="var(--on-surface-variant)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;display:block;flex-shrink:0;opacity:0.5"><circle cx="12" cy="12" r="10"/></svg>'}`;
        item.addEventListener('click', () => {
          settings.iconStyle = style.id;
          state.markUnsaved();
          renderIconStyles();
          updateSvgTextLabels();
        });
        dom.iconStyleListEl.appendChild(item);
      });
    }

    function updateSvgTextLabels() {
      const style = resolveIconStyle();
      const crossText = document.querySelector('text[x="340"][y="163"]');
      const circleText = document.querySelector('text[x="360"][y="143"]');
      const squareText = document.querySelector('text[x="320"][y="143"]');
      const triangleText = document.querySelector('text[x="340"][y="123"]');
      const crossCallout = document.querySelector('.callout-cross .callout-btn-name');
      const circleCallout = document.querySelector('.callout-circle .callout-btn-name');
      const squareCallout = document.querySelector('.callout-square .callout-btn-name');
      const triangleCallout = document.querySelector('.callout-triangle .callout-btn-name');
      const values = style === 'xbox'
        ? [['A', 'B', 'X', 'Y'], ['Button A', 'Button B', 'Button X', 'Button Y']]
        : style === 'nintendo'
          ? [['B', 'A', 'Y', 'X'], ['Button B', 'Button A', 'Button Y', 'Button X']]
          : [['✕', '○', '□', '△'], ['Cross (✕)', 'Circle (○)', 'Square (□)', 'Triangle (△)']];
      [crossText, circleText, squareText, triangleText].forEach((element, index) => { if (element) element.textContent = values[0][index]; });
      [crossCallout, circleCallout, squareCallout, triangleCallout].forEach((element, index) => { if (element) element.textContent = values[1][index]; });
    }

    function populateVisualLabels() {
      const mapping = getActiveMapping();
      Object.keys(BUTTON_NAMES).forEach(button => {
        const label = document.getElementById(`label-btn-${button}`);
        if (!label) return;
        const action = mapping[button] || 'none';
        let actionLabel;
        if (action.startsWith('click_element:')) actionLabel = `Click: ${action.substring('click_element:'.length)}`;
        else if (action.startsWith('hover_element:')) actionLabel = `Hover: ${action.substring('hover_element:'.length)}`;
        else if (action.startsWith('press_key:')) actionLabel = `Key: ${action.substring('press_key:'.length)}`;
        else if (action.startsWith('focus_element:')) actionLabel = `Focus: ${action.substring('focus_element:'.length)}`;
        else if (action.startsWith('dom_action:')) actionLabel = modal.formatDomActionLabel(action);
        else actionLabel = ACTION_OPTIONS.find(option => option.value === action)?.label || action;
        label.textContent = actionLabel;
        label.title = actionLabel;
      });
      updateSvgTextLabels();
    }

    function closeDropdown() {
      dom.actionDropdown.style.display = 'none';
      activeCalloutBtn = null;
    }

    function openDropdownForCallout(callout) {
      if (!callout) return;
      activeCalloutBtn = callout.dataset.btn;
      const currentAction = getActiveMapping()[activeCalloutBtn] || 'none';
      dom.actionSelect.value = currentAction.startsWith('click_element:') ? 'click_element'
        : currentAction.startsWith('hover_element:') ? 'hover_element'
          : currentAction.startsWith('press_key:') ? 'press_key'
            : currentAction.startsWith('focus_element:') ? 'focus_element'
              : currentAction.startsWith('dom_action:') ? 'dom_action'
                : currentAction;
      const rect = callout.getBoundingClientRect();
      const parentRect = callout.offsetParent.getBoundingClientRect();
      dom.actionDropdown.style.top = `${rect.top - parentRect.top + callout.offsetHeight + 6}px`;
      dom.actionDropdown.style.left = `${rect.left - parentRect.left}px`;
      dom.actionDropdown.style.display = 'block';
    }

    function bind() {
      ACTION_OPTIONS.forEach(option => {
        const element = document.createElement('option');
        element.value = option.value;
        element.textContent = option.label;
        dom.actionSelect.appendChild(element);
      });
      dom.editorSiteSelect.addEventListener('change', () => {
        state.setSelectedSiteKey(dom.editorSiteSelect.value);
        populateVisualLabels();
        closeDropdown();
        renderWebsiteMappings();
      });
      document.querySelectorAll('.editor-callout').forEach(callout => {
        callout.setAttribute('role', 'button');
        callout.setAttribute('tabindex', '0');
        callout.setAttribute('aria-label', `Remap ${callout.querySelector('.callout-btn-name')?.textContent || `button ${callout.dataset.btn}`}`);
        callout.addEventListener('click', event => {
          event.stopPropagation();
          openDropdownForCallout(callout);
        });
        callout.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          event.stopPropagation();
          openDropdownForCallout(callout);
        });
      });
      dom.actionSelect.addEventListener('change', async () => {
        if (!activeCalloutBtn) return;
        const mapping = getActiveMapping();
        const currentValue = mapping[activeCalloutBtn] || '';
        let action = dom.actionSelect.value;
        const customAction = async (prefix, mode) => {
          const initialValue = currentValue.startsWith(prefix) ? currentValue.substring(prefix.length) : '';
          const value = await modal.open(mode, initialValue);
          if (value && value.trim()) return `${prefix}${value.trim()}`;
          dom.actionSelect.value = currentValue.startsWith(prefix) ? mode === 'keyboard' ? 'press_key' : `${mode}_element` : 'none';
          return null;
        };
        if (action === 'click_element') action = await customAction('click_element:', 'click');
        else if (action === 'hover_element') action = await customAction('hover_element:', 'hover');
        else if (action === 'focus_element') action = await customAction('focus_element:', 'focus');
        else if (action === 'press_key') action = await customAction('press_key:', 'keyboard');
        else if (action === 'dom_action') {
          const config = await modal.open('dom', modal.parseDomAction(currentValue));
          if (config) action = `dom_action:${encodeURIComponent(JSON.stringify(config))}`;
          else {
            dom.actionSelect.value = currentValue.startsWith('dom_action:') ? 'dom_action' : 'none';
            return;
          }
        }
        if (!action) return;
        mapping[activeCalloutBtn] = action;
        state.markUnsaved();
        populateVisualLabels();
        closeDropdown();
      });
      document.addEventListener('click', event => {
        if (!dom.actionDropdown.contains(event.target)) closeDropdown();
        onDocumentClick(event);
        if (typeof RemapadKeyboard !== 'undefined' && RemapadKeyboard.isOpen()) RemapadKeyboard.close(false);
      });
      dom.saveBtn.addEventListener('click', saveSettings);
      dom.resetBtn.addEventListener('click', () => {
        if (!confirm('Revert all bindings in this mapping to defaults?')) return;
        const settings = state.getSettings();
        const selected = state.getSelectedSiteKey();
        if (selected === 'default') settings.defaultMapping = { ...DEFAULT_PROFILE };
        else if (selected === RESERVED_OPTIONS_KEY) settings.websiteMappings[selected] = { ...OPTIONS_PAGE_PROFILE };
        else settings.websiteMappings[selected] = { ...settings.defaultMapping };
        state.markUnsaved();
        populateVisualLabels();
        showToast('Mapping reset to default.');
      });
      dom.addSiteBtn.addEventListener('click', () => {
        const domain = parseDomain(dom.newSiteInput.value);
        if (!domain) return;
        if (!domain.includes('.')) {
          alert('Please enter a valid website domain (e.g. twitch.tv).');
          return;
        }
        if (domain === RESERVED_OPTIONS_KEY) {
          alert('That name is reserved for the Remapad Settings mapping.');
          return;
        }
        const settings = state.getSettings();
        if (settings.websiteMappings[domain]) {
          alert('This website is already mapped!');
          return;
        }
        settings.websiteMappings[domain] = { ...settings.defaultMapping };
        settings.siteKeyboardLayouts[domain] = 'auto';
        state.setSelectedSiteKey(domain);
        state.markUnsaved();
        dom.newSiteInput.value = '';
        renderAll();
        showToast(`Added mapping for ${domain}`, 'success');
      });
    }

    return {
      renderEditorSiteSelect,
      renderWebsiteMappings,
      renderIconStyles,
      updateSvgTextLabels,
      populateVisualLabels,
      detectControllerStyle,
      closeDropdown,
      isDropdownOpen: () => dom.actionDropdown.style.display !== 'none',
      bind
    };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.MappingEditor = { create };
})(typeof window !== 'undefined' ? window : globalThis);
