/**
 * Remapad Options — Mapping Editor
 * MV3-compatible classic script; exposed via window.RemapadOptions.MappingEditor.
 * Owns website rows, controller labels, icon layouts, and action-dropdown flows.
 */

(function (global) {
  'use strict';

  function create({ api, state, constants, utils, dom, modal, renderAll, saveSettings, showToast, activateSiteMapping, onDocumentClick }) {
    const {
      RESERVED_OPTIONS_KEY,
      FRIENDLY_NAMES,
      OPTIONS_PAGE_PROFILE,
      RETRO_8BITDO_OPTIONS_PAGE_PROFILE,
      DEFAULT_PROFILE,
      RETRO_8BITDO_DEFAULT_PROFILE,
      ICON_STYLES,
      CONTROLLER_STYLE_PATTERNS,
      ACTION_OPTIONS,
      BUTTON_NAMES
    } = constants;
    const { getFriendlyLabel, parseDomain, ensureSitePermission, removeSitePermission } = utils;
    let activeCalloutBtn = null;
    let activeControllerId = null;

    function clearSiteAddPrompt() {
      if (dom.siteAddGuidance) dom.siteAddGuidance.hidden = true;
      if (dom.websiteMappingsCard) dom.websiteMappingsCard.classList.remove('site-add-prompt');
    }

    function profilesMatch(left, right) {
      if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
      return Object.keys(right).every(button => left[button] === right[button]);
    }

    function getStoredActiveMapping() {
      const settings = state.getSettings();
      return state.getSelectedSiteKey() === 'default'
        ? settings.defaultMapping
        : settings.websiteMappings[state.getSelectedSiteKey()] || DEFAULT_PROFILE;
    }

    function getActiveMapping() {
      const stored = getStoredActiveMapping();
      if (getEditorControllerStyle() !== 'retro8bitdo') return stored;

      if (state.getSelectedSiteKey() === RESERVED_OPTIONS_KEY) {
        return profilesMatch(stored, OPTIONS_PAGE_PROFILE)
          ? RETRO_8BITDO_OPTIONS_PAGE_PROFILE
          : stored;
      }
      return profilesMatch(stored, DEFAULT_PROFILE)
        ? RETRO_8BITDO_DEFAULT_PROFILE
        : stored;
    }

    function getMutableActiveMapping() {
      const settings = state.getSettings();
      const selected = state.getSelectedSiteKey();
      const stored = getStoredActiveMapping();
      const effective = getActiveMapping();
      if (stored === effective) return stored;

      // Materialize compact defaults only when the user edits them. Until
      // then, the stored universal profile remains untouched for other pads.
      const editable = { ...effective };
      if (selected === 'default') settings.defaultMapping = editable;
      else settings.websiteMappings[selected] = editable;
      return editable;
    }

    function renderEditorSiteSelect() {
      const previousValue = state.getSelectedSiteKey();
      const settings = state.getSettings();
      dom.editorSiteSelect.replaceChildren();
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
      dom.mappingsListEl.replaceChildren();
      const domains = Object.keys(settings.websiteMappings);
      if (domains.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.style.cssText = 'text-align:center;padding:16px 0;color:var(--on-surface-variant);font-size:13px;font-family:var(--font-body)';
        emptyState.textContent = 'No website mappings configured. Add a site below to start.';
        dom.mappingsListEl.appendChild(emptyState);
        return;
      }
      domains.forEach(domain => {
        const isSelected = state.getSelectedSiteKey() === domain;
        const siteLayout = settings.siteKeyboardLayouts[domain] || 'auto';
        const siteMode = settings.siteKeyboardTriggerModes[domain];
        const siteSelectors = settings.siteKeyboardTriggerSelectors[domain] || [];
        const row = document.createElement('div');
        row.className = 'mapping-row' + (isSelected ? ' selected-site' : '');
        RemapadDOM.replaceStaticChildren(row, `
          <div class="mapping-row-main" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden;width:100%;box-sizing:border-box">
            <div class="mapping-row-left" tabindex="-1" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;overflow:hidden">
              <svg class="fallback-globe-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;display:block;color:var(--on-surface-variant);flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              <div style="display:flex;align-items:baseline;gap:4px;min-width:0;overflow:hidden;flex:1">
                <span class="mapping-site-name" style="font-family:var(--font-body);font-size:13px;font-weight:500;color:var(--on-surface);flex-shrink:0;white-space:nowrap"></span>
                <span class="mapping-site-domain" style="font-family:var(--font-body);font-size:11px;color:var(--on-surface-variant);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1"></span>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <button class="delete-site-btn" style="background:none;border:none;color:var(--error);cursor:pointer;padding:4px;display:flex;align-items:center;opacity:0.7;transition:opacity 0.2s" title="Remove site mapping"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
            </div>
          </div>
          <div class="mapping-row-keyboard" style="flex-direction:column;gap:10px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);width:100%;box-sizing:border-box">
            <div style="display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box"><span style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);white-space:nowrap;flex-shrink:0">Layout:</span><select class="site-keyboard-layout-select" style="flex:1;min-width:0;width:0;box-sizing:border-box;background:var(--surface-container);color:var(--on-surface);border:1px solid rgba(255,255,255,0.1);border-radius:var(--radius-sm);padding:4px 8px;font-size:11px;outline:none;font-family:var(--font-body);cursor:pointer"><option value="auto">Auto-detect</option><option value="qwerty">QWERTY</option><option value="dvorak">Dvorak</option><option value="azerty">AZERTY</option><option value="german">German (QWERTZ)</option><option value="spanish">Spanish</option><option value="russian">Russian (ЙЦУКЕН)</option><option value="korean">Korean (Dubeolsik)</option><option value="chinese">Chinese (Pinyin)</option><option value="japanese">Japanese (Hiragana / Katakana)</option></select></div>
            <div style="display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box"><span style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body);white-space:nowrap;flex-shrink:0">Trigger:</span><select class="site-keyboard-trigger-mode-select" style="flex:1;min-width:0;width:0;box-sizing:border-box;background:var(--surface-container);color:var(--on-surface);border:1px solid rgba(255,255,255,0.1);border-radius:var(--radius-sm);padding:4px 8px;font-size:11px;outline:none;font-family:var(--font-body);cursor:pointer"><option value="">Use global</option><option value="both">On focus and click</option><option value="focus">On focus only</option><option value="click">On click only</option><option value="disabled">Disabled</option></select></div>
            <div style="display:flex;flex-direction:column;gap:6px;width:100%;box-sizing:border-box"><span style="font-size:11px;color:var(--on-surface-variant);font-family:var(--font-body)">Custom selectors (one per line):</span><textarea class="site-keyboard-trigger-selectors-input" rows="3" style="width:100%;max-width:100%;box-sizing:border-box;background:var(--surface-container);color:var(--on-surface);border:1px solid rgba(255,255,255,0.1);border-radius:var(--radius-sm);padding:6px 8px;font-size:11px;outline:none;font-family:var(--font-label);resize:vertical" placeholder="e.g. .search-box, [contenteditable]"></textarea><button class="btn-secondary site-keyboard-trigger-selectors-save" style="align-self:flex-start;font-size:11px;padding:5px 12px;margin-top:2px">Save Selectors</button></div>
          </div>`);

        row.querySelector('.mapping-site-name').textContent = getFriendlyLabel(domain, FRIENDLY_NAMES);
        const siteDomain = row.querySelector('.mapping-site-domain');
        siteDomain.textContent = `(${domain})`;
        siteDomain.title = domain;
        row.querySelector('.mapping-row-keyboard').style.display = isSelected ? 'flex' : 'none';
        row.querySelector('.mapping-row-main').addEventListener('click', () => {
          state.setSelectedSiteKey(domain);
          dom.editorSiteSelect.value = domain;
          populateVisualLabels();
          closeDropdown();
          renderWebsiteMappings();
        });
        const layoutSelect = row.querySelector('.site-keyboard-layout-select');
        if (layoutSelect) {
          layoutSelect.dataset.site = domain;
          layoutSelect.value = siteLayout;
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
          triggerModeSelect.dataset.site = domain;
          triggerModeSelect.value = siteMode || '';
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
        selectorsInput.dataset.site = domain;
        selectorsInput.value = siteSelectors.join('\n');
        selectorsSave.dataset.site = domain;
        if (selectorsSave && selectorsInput) selectorsSave.addEventListener('click', event => {
          event.stopPropagation();
          settings.siteKeyboardTriggerSelectors[domain] = selectorsInput.value.split('\n').map(selector => selector.trim()).filter(Boolean);
          state.markUnsaved();
          saveSettings();
        });
        const deleteButton = row.querySelector('.delete-site-btn');
        deleteButton.dataset.site = domain;
        if (domain === RESERVED_OPTIONS_KEY) {
          deleteButton.style.display = 'none';
          deleteButton.disabled = true;
        }
        deleteButton.addEventListener('click', async event => {
          event.stopPropagation();
          if (domain === RESERVED_OPTIONS_KEY) return;
          if (!confirm(`Remove mapping for ${domain}?`)) return;
          delete settings.websiteMappings[domain];
          delete settings.siteKeyboardLayouts[domain];
          delete settings.siteKeyboardTriggerModes[domain];
          delete settings.siteKeyboardTriggerSelectors[domain];
          if (state.getSelectedSiteKey() === domain) state.setSelectedSiteKey('default');
          state.markUnsaved();
          if (await saveSettings()) {
            await removeSitePermission(api, domain);
          }
        });
        dom.mappingsListEl.appendChild(row);
      });
    }

    function detectControllerStyle(gamepadId) {
      const id = (gamepadId || '').toLowerCase();
      for (const { test, style } of CONTROLLER_STYLE_PATTERNS) {
        if (test.test(id)) return style;
      }
      return null;
    }

    function resolveIconStyle() {
      const stored = state.getSettings().iconStyle || 'auto';
      if (stored !== 'auto') return stored;
      const activeStyle = detectControllerStyle(activeControllerId);
      if (activeStyle) return activeStyle;
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gamepad = [...gamepads].find(item => item && item.connected);
      return detectControllerStyle(gamepad?.id) || 'playstation';
    }

    function getEditorControllerStyle() {
      const activeStyle = detectControllerStyle(activeControllerId);
      if (activeStyle === 'retro8bitdo') return activeStyle;
      if (activeControllerId !== null) return resolveIconStyle();
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected = [...gamepads].find(item => item && item.connected);
      const detected = detectControllerStyle(connected?.id);
      // Compact hardware capabilities take precedence over a cosmetic icon
      // override so phantom D-pad/stick controls never become editable.
      return detected === 'retro8bitdo' ? detected : resolveIconStyle();
    }

    function renderIconStyles() {
      const settings = state.getSettings();
      dom.iconStyleListEl.replaceChildren();
      const detected = resolveIconStyle();
      const detectedName = {
        playstation: 'PlayStation',
        xbox: 'Xbox',
        nintendo: 'Nintendo',
        steamdeck: 'Steam Deck',
        retro8bitdo: '8BitDo FC30 / NES30',
        n64: 'N64'
      }[detected] || detected;
      ICON_STYLES.forEach(style => {
        const isSelected = settings.iconStyle === style.id;
        const isAuto = style.id === 'auto';
        const subtitle = isAuto && settings.iconStyle === 'auto'
          ? `Detected: ${detectedName}`
          : style.sub;
        const item = document.createElement('div');
        item.className = 'icon-style-item' + (isSelected ? ' selected' : '');
        item.setAttribute('tabindex', '-1');
        const left = document.createElement('div');
        left.className = 'icon-style-left';
        const glyphs = document.createElement('div');
        glyphs.className = 'button-glyphs';
        style.btns.forEach(button => {
          const badge = document.createElement('span');
          badge.className = 'btn-glyph-badge';
          badge.textContent = button;
          glyphs.appendChild(badge);
        });
        const labels = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'icon-style-name';
        name.textContent = style.name;
        const sub = document.createElement('div');
        sub.className = `icon-style-sub ${isSelected ? 'profile-active' : 'profile-default'}`;
        sub.textContent = isSelected ? 'Active Layout' : subtitle;
        labels.append(name, sub);
        left.append(glyphs, labels);

        const namespace = 'http://www.w3.org/2000/svg';
        const indicator = document.createElementNS(namespace, 'svg');
        indicator.setAttribute('viewBox', '0 0 24 24');
        indicator.setAttribute('fill', 'none');
        indicator.setAttribute('stroke', isSelected ? 'var(--primary)' : 'var(--on-surface-variant)');
        indicator.setAttribute('stroke-width', isSelected ? '3' : '2');
        indicator.setAttribute('stroke-linecap', 'round');
        indicator.setAttribute('stroke-linejoin', 'round');
        indicator.style.cssText = `width:20px;height:20px;display:block;flex-shrink:0${isSelected ? '' : ';opacity:0.5'}`;
        const circle = document.createElementNS(namespace, 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');
        indicator.appendChild(circle);
        if (isSelected) {
          const check = document.createElementNS(namespace, 'polyline');
          check.setAttribute('points', '20 6 9 17 4 12');
          indicator.appendChild(check);
        }
        item.append(left, indicator);
        item.addEventListener('click', async () => {
          const previousStyle = settings.iconStyle;
          settings.iconStyle = style.id;
          renderIconStyles();
          populateVisualLabels();
          try {
            await api.storage.local.set({ iconStyle: style.id });
            showToast('Controller layout updated.', 'success');
          } catch (error) {
            if (settings.iconStyle === style.id) settings.iconStyle = previousStyle;
            renderIconStyles();
            populateVisualLabels();
            showToast('Unable to save controller layout: ' + error.message);
          }
        });
        dom.iconStyleListEl.appendChild(item);
      });
    }

    function updateSvgTextLabels() {
      const style = getEditorControllerStyle();
      const canvasEl = document.querySelector('.gamepad-canvas');
      if (canvasEl) {
        canvasEl.classList.toggle('n64-layout-active', style === 'n64');
        canvasEl.classList.toggle('retro8bitdo-layout-active', style === 'retro8bitdo');
        canvasEl.dataset.controllerStyle = style;
        const activeSvgId = style === 'playstation'
          ? 'controller-svg-default'
          : `controller-svg-${style}`;
        canvasEl.querySelectorAll('.controller-svg').forEach(svg => {
          svg.style.display = svg.id === activeSvgId ? 'block' : 'none';
        });
      }
      const crossText = document.querySelector('text[x="340"][y="163"]');
      const circleText = document.querySelector('text[x="360"][y="143"]');
      const squareText = document.querySelector('text[x="320"][y="143"]');
      const triangleText = document.querySelector('text[x="340"][y="123"]');
      const crossCallout = document.querySelector('.callout-cross .callout-btn-name');
      const circleCallout = document.querySelector('.callout-circle .callout-btn-name');
      const squareCallout = document.querySelector('.callout-square .callout-btn-name');
      const triangleCallout = document.querySelector('.callout-triangle .callout-btn-name');
      const l1Callout = document.querySelector('.callout-l1 .callout-btn-name');
      const r1Callout = document.querySelector('.callout-r1 .callout-btn-name');
      const l2Callout = document.querySelector('.callout-l2 .callout-btn-name');
      const r2Callout = document.querySelector('.callout-r2 .callout-btn-name');
      const l3Callout = document.querySelector('.callout-l3 .callout-btn-name');
      const r3Callout = document.querySelector('.callout-r3 .callout-btn-name');
      const selectCallout = document.querySelector('.callout-select .callout-btn-name');
      const startCallout = document.querySelector('.callout-start .callout-btn-name');

      if (style === 'n64') {
        if (crossCallout) crossCallout.textContent = 'C-Up';
        if (circleCallout) circleCallout.textContent = 'C-Right';
        if (squareCallout) squareCallout.textContent = 'C-Down';
        if (triangleCallout) triangleCallout.textContent = 'C-Left';
        if (l1Callout) l1Callout.textContent = 'Button B';
        if (r1Callout) r1Callout.textContent = 'Button A';
        if (l2Callout) l2Callout.textContent = 'L Bumper';
        if (r2Callout) r2Callout.textContent = 'R Bumper';
        if (selectCallout) selectCallout.textContent = 'Z Trigger';
        if (startCallout) startCallout.textContent = 'Start Button';
        if (l3Callout) l3Callout.textContent = 'L3 Click';
        if (r3Callout) r3Callout.textContent = 'R3 Click';
      } else if (style === 'retro8bitdo') {
        if (crossCallout) crossCallout.textContent = 'Button B';
        if (circleCallout) circleCallout.textContent = 'Button A';
        if (squareCallout) squareCallout.textContent = 'Button 2';
        if (triangleCallout) triangleCallout.textContent = 'Button X';
        if (l1Callout) l1Callout.textContent = 'Button Y (as L1)';
        if (r1Callout) r1Callout.textContent = 'Button 5';
        if (l2Callout) l2Callout.textContent = 'Left Shoulder';
        if (r2Callout) r2Callout.textContent = 'Right Shoulder';
        if (l3Callout) l3Callout.textContent = 'Select Button';
        if (r3Callout) r3Callout.textContent = 'Start Button';
        if (selectCallout) selectCallout.textContent = 'Button 8';
        if (startCallout) startCallout.textContent = 'Button 9';
      } else if (style === 'nintendo') {
        if (crossCallout) crossCallout.textContent = 'Button B';
        if (circleCallout) circleCallout.textContent = 'Button A';
        if (squareCallout) squareCallout.textContent = 'Button Y';
        if (triangleCallout) triangleCallout.textContent = 'Button X';
        if (l1Callout) l1Callout.textContent = 'L Bumper';
        if (r1Callout) r1Callout.textContent = 'R Bumper';
        if (l2Callout) l2Callout.textContent = 'ZL Trigger';
        if (r2Callout) r2Callout.textContent = 'ZR Trigger';
        if (l3Callout) l3Callout.textContent = 'L3 Click';
        if (r3Callout) r3Callout.textContent = 'R3 Click';
        if (selectCallout) selectCallout.textContent = 'Minus (-)';
        if (startCallout) startCallout.textContent = 'Plus (+)';
      } else if (style === 'steamdeck') {
        if (crossCallout) crossCallout.textContent = 'Button A';
        if (circleCallout) circleCallout.textContent = 'Button B';
        if (squareCallout) squareCallout.textContent = 'Button X';
        if (triangleCallout) triangleCallout.textContent = 'Button Y';
        if (l1Callout) l1Callout.textContent = 'L1 Bumper';
        if (r1Callout) r1Callout.textContent = 'R1 Bumper';
        if (l2Callout) l2Callout.textContent = 'L2 Trigger';
        if (r2Callout) r2Callout.textContent = 'R2 Trigger';
        if (l3Callout) l3Callout.textContent = 'L3 Click';
        if (r3Callout) r3Callout.textContent = 'R3 Click';
        if (selectCallout) selectCallout.textContent = 'View Button';
        if (startCallout) startCallout.textContent = 'Options Button';
      } else {
        if (crossCallout) crossCallout.textContent = style === 'xbox' ? 'Button A' : 'Cross (✕)';
        if (circleCallout) circleCallout.textContent = style === 'xbox' ? 'Button B' : 'Circle (○)';
        if (squareCallout) squareCallout.textContent = style === 'xbox' ? 'Button X' : 'Square (□)';
        if (triangleCallout) triangleCallout.textContent = style === 'xbox' ? 'Button Y' : 'Triangle (△)';
        if (l1Callout) l1Callout.textContent = style === 'xbox' ? 'LB Bumper' : 'L1 Bumper';
        if (r1Callout) r1Callout.textContent = style === 'xbox' ? 'RB Bumper' : 'R1 Bumper';
        if (l2Callout) l2Callout.textContent = style === 'xbox' ? 'LT Trigger' : 'L2 Trigger';
        if (r2Callout) r2Callout.textContent = style === 'xbox' ? 'RT Trigger' : 'R2 Trigger';
        if (l3Callout) l3Callout.textContent = 'L3 Click';
        if (r3Callout) r3Callout.textContent = 'R3 Click';
        if (selectCallout) selectCallout.textContent = style === 'xbox' ? 'View Button' : 'Select Button';
        if (startCallout) startCallout.textContent = style === 'xbox' ? 'Menu Button' : 'Start Button';
      }
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
        const mapping = getMutableActiveMapping();
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
      dom.addSiteBtn.addEventListener('click', async () => {
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
          if (await ensureSitePermission(api, domain)) {
            state.setSelectedSiteKey(domain);
            dom.newSiteInput.value = '';
            clearSiteAddPrompt();
            renderAll();
            const activation = await activateSiteMapping(domain);
            showToast(activation.reloaded
              ? `${domain} has site access and is being refreshed.`
              : activation.success
                ? `${domain} is already mapped and has site access.`
                : `${domain} has site access. Reload the site to activate it.`, 'success');
          } else {
            showToast(`Site access was not granted for ${domain}.`);
          }
          return;
        }
        if (!await ensureSitePermission(api, domain)) {
          showToast(`Site access was not granted for ${domain}.`);
          return;
        }
        settings.websiteMappings[domain] = { ...settings.defaultMapping };
        settings.siteKeyboardLayouts[domain] = 'auto';
        state.setSelectedSiteKey(domain);
        state.markUnsaved();

        const saveResult = await state.save();
        if (!saveResult.ok) {
          delete settings.websiteMappings[domain];
          delete settings.siteKeyboardLayouts[domain];
          state.setSelectedSiteKey('default');
          await removeSitePermission(api, domain);
          showToast(`Unable to save the mapping for ${domain}: ${saveResult.error.message}`);
          return;
        }

        dom.newSiteInput.value = '';
        clearSiteAddPrompt();
        renderAll();
        const activation = await activateSiteMapping(domain);
        showToast(activation.reloaded
          ? `Added ${domain}. The site is being refreshed.`
          : `Added mapping for ${domain}. Reload the site to activate it.`, 'success');
      });
    }

    return {
      renderEditorSiteSelect,
      renderWebsiteMappings,
      renderIconStyles,
      updateSvgTextLabels,
      populateVisualLabels,
      detectControllerStyle,
      setActiveControllerId: value => { activeControllerId = value || null; },
      closeDropdown,
      isDropdownOpen: () => dom.actionDropdown.style.display !== 'none',
      bind
    };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.MappingEditor = { create };
})(typeof window !== 'undefined' ? window : globalThis);
