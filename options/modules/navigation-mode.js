// options/modules/navigation-mode.js
(function(global) {
  "use strict";
  function create({ api, state, showToast, refresh, saveSettings, getShortcutLayout }) {
    const shared = global.RemapadNavigationMode;
    const { OPTIONS_MAPPING_KEY, PROFILE_SHORTCUTS } = shared;
    const holdSeconds = shared.HOLD_MS / 1000;
    const holdDuration = `${holdSeconds} ${holdSeconds === 1 ? "second" : "seconds"}`;
    const shortcutButtonNames = {
      playstation: { 0: "Cross (✕)", 8: "Select", 9: "Start" },
      xbox: { 0: "A", 8: "View", 9: "Menu" },
      nintendo: { 0: "B", 8: "Minus (−)", 9: "Plus (+)" },
      steamdeck: { 0: "A", 8: "View", 9: "Options" },
      retro8bitdo: { 0: "B", 10: "Select", 11: "Start" },
      n64: { 5: "A", 8: "Z", 9: "Start" }
    };
    const requested = new URLSearchParams(global.location.search);
    const requestedNavigation = requested.get("environment") === "navigation";
    const requestedSite = global.RemapadOptions.Utils.parseDomain(requested.get("site") || "");
    let editing = requestedNavigation, profileId = null, pendingEnable = false, initialized = false;
    let draft = { navigationModeEnabled: false, navigationModeInitialized: false, navigationModeWebsiteMappings: {}, navigationModeDefaultMapping: {} };
    let baseline = null, dirty = false, captureTimer = null, acquiredBroad = false, hadBroad = false, effectiveEnabled = false, neutralTimer = null, restoreOrigins = [], saveMessage = null;
    let savedWebsiteMappings = {};
    let permissionPending = false;
    let disposed = false;
    let permissionDraftToken = null;
    let permissionDraftPort = null;
    let preparingPermissionDraft = null;
    let permissionLeaseExpiresAt = 0;
    let selectedProfileSite = null;
    let hasHistory = false;
    const virtualSites = new Map();
    const editor = document.getElementById("navigation-mode-editor");
    const unavailable = document.getElementById("navigation-mode-unavailable");
    const controls = document.getElementById("navigation-mode-controls");
    const shortcuts = document.getElementById("navigation-mode-shortcuts");
    const setupButton = document.getElementById("navigation-mode-setup-btn");
    function element(tag, text, parent) {
      const el = document.createElement(tag);
      if (text)
        el.textContent = text;
      if (parent)
        parent.append(el);
      return el;
    }
    function button(text, parent, fn) {
      const el = element("button", text, parent);
      el.type = "button";
      el.className = "btn-secondary";
      el.dataset.focusKey = `${parent.dataset.focusKey || parent.id || 'navigation'}:${text}`;
      el.addEventListener("click", (event) => {
        if (permissionPending) {
          showToast("Finish the browser permission prompt first.");
          return;
        }
        fn(event);
      });
      return el;
    }
    function site() {
      const key = state.getSelectedSiteKey();
      if (selectedProfileSite !== key) { profileId = null; selectedProfileSite = key; }
      return key;
    }
    function fallbackBindings(key) {
      return key === OPTIONS_MAPPING_KEY
        ? shared.optionsNavigationBindings(state.getSettings().websiteMappings[key])
        : draft.navigationModeDefaultMapping;
    }
    function setForSite() {
      const key = site();
      if (draft.navigationModeWebsiteMappings[key]) return draft.navigationModeWebsiteMappings[key];
      const bindings = fallbackBindings(key);
      const fallback = JSON.stringify(bindings);
      let virtual = virtualSites.get(key);
      if (!virtual || virtual.fallback !== fallback) {
        virtual = {fallback,set:shared.createProfileSet(bindings)};
        virtualSites.set(key,virtual);
      }
      return virtual.set;
    }
    function selectedProfile() {
      const set = setForSite();
      return set.profiles.find((p) => p.profileId === profileId) || set.profiles[0];
    }
    function canEditMappings() {
      return editing && effectiveEnabled && draft.navigationModeInitialized;
    }
    function getMapping() {
      if (!canEditMappings())
        return null;
      return site() === "default" ? draft.navigationModeDefaultMapping : selectedProfile().bindings;
    }
    function touch(mappingSpecific = true) {
      if (mappingSpecific && canEditMappings() && site() !== "default") {
        draft.navigationModeWebsiteMappings[site()] = setForSite();
      }
      dirty = true;
      state.markUnsaved();
    }
    async function load() {
      const wasEnabled = effectiveEnabled;
      const live = await api.runtime.sendMessage({ type: "NAVIGATION_MODE_STATUS" });
      effectiveEnabled = !!live.enabled;
      hasHistory = !!live.hasHistory;
      restoreOrigins = live.restoreOrigins || [];
      if (!initialized || (!wasEnabled && effectiveEnabled)) {
        editing = requestedNavigation || effectiveEnabled;
        profileId = null;
      }
      if (!initialized && requestedNavigation && requestedSite && requestedSite.includes("."))
        state.setSelectedSiteKey(requestedSite);
      hadBroad = await api.permissions.contains({ origins: [shared.BROAD_ORIGIN] });
      const data = await api.storage.local.get(Object.keys(draft));
      Object.assign(draft, data);
      savedWebsiteMappings = data.navigationModeWebsiteMappings || {};
      draft.navigationModeWebsiteMappings = Object.fromEntries(Object.entries(savedWebsiteMappings).map(([host, value]) => [host, shared.normalizeProfileSet(value, fallbackBindings(host))]));
      if (!draft.navigationModeInitialized)
        draft.navigationModeDefaultMapping = { ...state.getSettings().defaultMapping, 6: "prev_tab", 7: "next_tab" };
      virtualSites.clear();
      initialized = true;
      baseline = structuredClone(draft);
      render();
    }
    function stopCapture() {
      const wasCapturing = !!captureTimer;
      clearInterval(captureTimer);
      captureTimer = null;
      if (wasCapturing) {
        global.RemapadOptions.navigationCaptureActive = true;
        clearInterval(neutralTimer);
        neutralTimer = setInterval(() => {
          if (Array.from(navigator.getGamepads?.() || []).filter(Boolean).every((p) => pressedButtons(p).length === 0)) {
            clearInterval(neutralTimer);
            neutralTimer = null;
            global.RemapadOptions.navigationCaptureActive = false;
          }
        }, 50);
      }
    }
    function pressedButtons(pad) {
      return shared.sampleShortcutButtons(pad, shared.shortcutLayout(pad)).flatMap((pressed, id) => pressed ? [id] : []);
    }
    function buttonNames(ids, layout) {
      return ids.map(id => shortcutButtonNames[layout]?.[id] ||
        document.querySelector(`.editor-callout[data-btn="${id}"] .callout-btn-name`)?.textContent || `Button ${id}`).join(" + ");
    }
    function record(action, status) {
      stopCapture();
      clearInterval(neutralTimer);
      neutralTimer = null;
      global.RemapadOptions.navigationCaptureActive = true;
      const originalSite = site(), originalProfile = profileId, originalSet = setForSite();
      let neutral = false, padIndex = null, padId = null, held = "", since = 0;
      status.textContent = `Release all buttons, then hold at least two buttons on one controller for ${holdDuration}.`;
      captureTimer = setInterval(() => {
        if (site() !== originalSite || profileId !== originalProfile || document.hidden) {
          stopCapture();
          return;
        }
        const pads = Array.from(navigator.getGamepads?.() || []).filter(Boolean);
        const pressed = pressedButtons;
        if (!neutral) {
          if (pads.every((p) => pressed(p).length === 0))
            neutral = true;
          return;
        }
        const pad = padIndex === null ? pads.find((p) => pressed(p).length >= 2) : pads.find((p) => p.index === padIndex);
        if (padIndex !== null && (!pad || pad.id !== padId || pad.connected === false)) {
          stopCapture();
          status.textContent = "Recording cancelled: controller changed.";
          return;
        }
        const ids = pad ? pressed(pad) : [];
        const signature = ids.join(",");
        if (ids.length < 2) {
          held = "";
          since = 0;
          status.textContent = "Hold at least two distinct buttons together.";
          return;
        }
        if (signature !== held) {
          held = signature;
          since = performance.now();
          padIndex = pad.index;
          padId = pad.id;
        }
        const remaining = Math.max(0, Math.ceil((shared.HOLD_MS - (performance.now() - since)) / 100) / 10);
        status.textContent = `${buttonNames(ids, getShortcutLayout(pad))} — hold ${remaining}s`;
        if (remaining === 0) {
          const set = originalSet;
          const shortcuts = { ...set.profileShortcuts, [action]: ids };
          const result = shared.validateShortcuts(shortcuts);
          stopCapture();
          if (!result.valid) {
            status.textContent = result.error;
            return;
          }
          set.profileShortcuts = shortcuts;
          touch();
          render();
          refresh();
        }
      }, 50);
    }
    async function preparePermissionDraft() {
      if (disposed || permissionPending || hadBroad) return;
      if (preparingPermissionDraft) return preparingPermissionDraft;
      if (permissionDraftToken && Date.now() < permissionLeaseExpiresAt) return;
      preparingPermissionDraft = (async () => {
        // Renew an unused lease before the click, never a grant or prompt in progress.
        if (permissionDraftToken) await cancelPermissionDraft();
        if (disposed || permissionPending || hadBroad) return;
        const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const port = api.runtime.connect({name:"remapad-navigation-permission-draft:"+token});
        let disconnected = false;
        port.onDisconnect.addListener(() => {
          disconnected = true;
          if (permissionDraftPort !== port) return;
          permissionDraftPort = null;
          if (!permissionPending) { permissionDraftToken = null; permissionLeaseExpiresAt = 0; }
        });
        try {
          const owner = api.tabs?.getCurrent ? await api.tabs.getCurrent() : null;
          const response = await api.runtime.sendMessage({type:"BEGIN_NAVIGATION_MODE_PERMISSION_DRAFT",token,ownerTabId:owner?.id});
          if (!response?.success || disconnected) throw new Error(response?.error || "Website access setup was interrupted. Try the access button again.");
          permissionDraftToken = token;
          permissionLeaseExpiresAt = response.expiresAt || Date.now() + 15000;
          permissionDraftPort = port;
          if (disposed) await cancelPermissionDraft();
        } catch (error) {
          port.disconnect();
          throw error;
        }
      })();
      try { await preparingPermissionDraft; } finally { preparingPermissionDraft = null; }
    }
    function setPermissionPending(pending) {
      permissionPending = pending;
      if (!disposed) {
        document.getElementById("editor-site-select").disabled = pending;
        setupButton.disabled = pending;
      }
    }
    function grantButton(label, parent, status, dialog = null, onChange, declinedMessage) {
      const grant = button(label, parent, () => requestBroadAccess(status, dialog, onChange, declinedMessage));
      function prepare() {
        // Hover/focus only warms the lease. Report failures after an actual click.
        preparePermissionDraft().catch(() => {});
      }
      grant.addEventListener("pointerenter", prepare);
      grant.addEventListener("focus", prepare);
      if (dialog && !hadBroad) prepare();
      return grant;
    }
    async function cancelPermissionDraft() {
      const token = permissionDraftToken;
      if (!token)
        return null;
      permissionDraftToken = null;
      permissionLeaseExpiresAt = 0;
      const pending = api.runtime.sendMessage({ type: "CANCEL_NAVIGATION_MODE_PERMISSION_DRAFT", token });
      permissionDraftPort?.disconnect();
      permissionDraftPort = null;
      const response = await pending;
      if (response?.restoreOrigins)
        restoreOrigins = response.restoreOrigins;
      return response;
    }
    function requestBroadAccess(status, dialog, onChange, declinedMessage = "Access declined. You can still save the site binding.") {
      if (permissionPending || disposed)
        return;
      const originalSite = site();
      const originallyGranted = hadBroad;
      if (!permissionDraftToken) {
        status.textContent = "Preparing website access. Please try again shortly.";
        preparePermissionDraft().catch((error) => {
          status.textContent = error.message;
        });
        return;
      }
      if (Date.now() >= permissionLeaseExpiresAt) {
        status.textContent = "Website access setup expired. Preparing it again; click the access button once ready.";
        cancelPermissionDraft().then(() => preparePermissionDraft()).then(() => { status.textContent = "Website access setup is ready. Click the access button again."; }).catch(error => { status.textContent = error.message; });
        return;
      }
      try {
        permissionDraftPort.postMessage({type:"REQUEST_STARTED",token:permissionDraftToken});
      } catch (error) {
        permissionDraftPort = null;
        permissionDraftToken = null;
        status.textContent = "Website access setup was interrupted. Try the access button again.";
        return;
      }
      setPermissionPending(true);
      const token = permissionDraftToken;
      let grantedResult = false;
      status.textContent = "Waiting for the browser permission prompt. Finish it before continuing.";
      onChange?.();
      api.permissions.request({ origins: [shared.BROAD_ORIGIN] }).then(async (granted) => {
        grantedResult = granted;
        const abandoned = disposed || site() !== originalSite || dialog && (!dialog.open || !dialog.isConnected);
        acquiredBroad = acquiredBroad || granted && !originallyGranted;
        hadBroad = granted;
        if (abandoned) {
          await cancelPermissionDraft();
          acquiredBroad = false;
          if (!disposed)
            render();
          return;
        }
        const nextStep = dialog ? "" : "You can now enable the mode on Save.";
        status.textContent = granted ? nextStep : declinedMessage;
      }).catch(async (error) => {
        await cancelPermissionDraft();
        if (!disposed)
          status.textContent = error.message;
      }).finally(async () => {
        await api.runtime.sendMessage({ type: "FINISH_NAVIGATION_MODE_PERMISSION_DRAFT", token }).catch((error) => {
          if (!disposed)
            showToast(error.message);
        });
        setPermissionPending(false);
        if (!grantedResult && permissionDraftToken === token) {
          permissionDraftPort?.disconnect();
          permissionDraftPort = null;
          permissionDraftToken = null;
        }
        if (!disposed) onChange?.();
      });
    }
    async function requestHistoryAccess(status, onStart) {
      if (permissionPending || disposed) return false;
      setPermissionPending(true);
      status.textContent = "Respond to the browser prompt.";
      onStart?.();
      try {
        const granted = await api.permissions.request({ permissions: ["history"] });
        status.textContent = granted ? "History suggestions are available." : "History access declined. You can still browse and switch tabs.";
        return granted;
      } catch (error) {
        status.textContent = error.message;
        return false;
      } finally {
        setPermissionPending(false);
      }
    }
    function render() {
      document.dispatchEvent(new Event("remapad:mapping-context-change"));
      const focusKey = document.activeElement?.dataset.focusKey;
      const focusContainer = controls.contains(document.activeElement) ? controls : shortcuts.contains(document.activeElement) ? shortcuts : editor;
      renderContent();
      if (focusKey) {
        const replacement = [...document.querySelectorAll('[data-focus-key]')].find(el => el.dataset.focusKey === focusKey && !el.disabled && !el.hidden);
        (replacement || focusContainer).focus?.({preventScroll:true});
      }
    }
    function renderContent() {
      if (!initialized)
        return;
      if (captureTimer)
        stopCapture();
      document.getElementById("editor-site-select").disabled = permissionPending;
      editor.replaceChildren();
      controls.replaceChildren();
      shortcuts.replaceChildren();
      shortcuts.hidden = true;
      const blocked = editing && !canEditMappings();
      const canvas = document.querySelector(".gamepad-canvas");
      canvas.inert = blocked;
      canvas.hidden = blocked;
      unavailable.hidden = !blocked;
      document.getElementById("mapping-context-status").hidden = blocked;
      document.getElementById("reset-btn").disabled = blocked || permissionPending;
      editor.tabIndex = -1;
      controls.tabIndex = -1;
      shortcuts.tabIndex = -1;
      const heading = element("div", "", controls);
      heading.className = "navigation-mode-heading";
      element("h3", "Gamepad Browser Navigation Mode", heading);
      const modeState = element("span", effectiveEnabled ? "On" : "Off", heading);
      modeState.id = "navigation-mode-state";
      modeState.className = "navigation-mode-state";
      modeState.dataset.enabled = String(effectiveEnabled);
      modeState.setAttribute("role", "status");
      element("p", draft.navigationModeInitialized ? "Use your saved Navigation mappings across supported websites." : "Start with LT / RT for browser tabs and keep your Start action. Standard mappings stay separate.", controls);
      element("p", "Remapad may intercept site gamepads. Per-site Off and Report Issues remain available.", controls).className = "navigation-mode-caption";
      const status = element("p", "", controls);
      status.className = "navigation-mode-feedback";
      status.setAttribute("aria-live", "polite");
      function controlRow(title, description) {
        const row = element("div", "", controls);
        row.className = "navigation-mode-row";
        const copy = element("div", "", row);
        element("strong", title, copy);
        element("p", description, copy);
        const actions = element("div", "", row);
        actions.className = "navigation-mode-row-actions";
        return actions;
      }
      const accessRow = controlRow("Website access", "Required to use Navigation Mode across websites.");
      const access = grantButton("Allow website access", accessRow, status, null, updateControls);
      access.id = "navigation-mode-access-btn";
      const accessAllowed = element("span", "Allowed", accessRow);
      accessAllowed.className = "navigation-mode-allowed";
      const modeRow = controlRow("Navigation Mode", "Mode changes apply when you save.");
      const enable = button("Turn on Navigation Mode", modeRow, () => {
        if (!hadBroad) return;
        pendingEnable = true;
        touch(false);
        render();
      });
      enable.id = "navigation-mode-enable-btn";
      const disable = button("Turn mode off", modeRow, () => {
        draft.navigationModeEnabled = false;
        pendingEnable = false;
        touch(false);
        render();
      });
      disable.id = "navigation-mode-off-btn";
      const staged = element("p", "", controls);
      staged.className = "navigation-mode-staged";
      staged.id = "navigation-mode-staged-status";
      staged.setAttribute("role", "status");
      if (restoreOrigins.length || (effectiveEnabled && !draft.navigationModeEnabled)) {
        const restore = element("div", "", controls);
        restore.className = "navigation-mode-restore";
        element("p", "Turning off preserves your mappings. If the browser asks to restore previous site access, allow it.", restore);
        if (restoreOrigins.length) button("Restore previous site access", restore, () => {
          api.permissions.request({ origins: restoreOrigins }).then(async () => {
            const status2 = await api.runtime.sendMessage({ type: "NAVIGATION_MODE_STATUS" });
            restoreOrigins = status2.restoreOrigins || [];
            effectiveEnabled = !!status2.enabled;
            render();
          }).catch((error) => showToast(error.message));
        });
      }
      const historyRow = controlRow("History suggestions · Optional", "Suggest destinations from history on this device. This permission applies immediately.");
      const historyAllow = button("Allow history suggestions", historyRow, async () => {
        hasHistory = await requestHistoryAccess(status, updateControls);
        updateControls();
      });
      historyAllow.id = "navigation-history-allow-btn";
      const historyRemove = button("Remove history access", historyRow, () => {
        api.permissions.remove({ permissions: ["history"] }).then(() => {
          hasHistory = false;
          status.textContent = "History access removed.";
          updateControls();
        }).catch((e) => { status.textContent = e.message; });
      });
      historyRemove.id = "navigation-history-remove-btn";
      const footer = element("div", "", controls);
      footer.className = "navigation-mode-footer";
      const modeSave = button("Save Changes", footer, saveSettings);
      modeSave.id = "navigation-mode-save-btn";
      modeSave.classList.add("navigation-mode-primary");
      const undo = button("Undo staged Navigation changes", footer, () => {
        stopCapture();
        draft = structuredClone(baseline);
        virtualSites.clear();
        pendingEnable = false;
        dirty = false;
        releaseUnusedGrant().catch((error) => showToast(error.message));
        render();
        refresh();
      });
      undo.id = "navigation-mode-undo-btn";
      function updateControls() {
        access.hidden = hadBroad;
        accessAllowed.hidden = !hadBroad;
        access.disabled = permissionPending;
        const stagedOn = pendingEnable;
        const stagedOff = !pendingEnable && draft.navigationModeEnabled !== baseline?.navigationModeEnabled;
        enable.hidden = pendingEnable || (effectiveEnabled && !stagedOff);
        enable.disabled = permissionPending || !hadBroad;
        disable.hidden = !effectiveEnabled || stagedOff || pendingEnable;
        disable.disabled = permissionPending;
        undo.disabled = permissionPending || !(dirty || acquiredBroad);
        modeSave.disabled = permissionPending || !dirty;
        footer.hidden = !(dirty || acquiredBroad);
        staged.textContent = stagedOn ? "Enable staged. Save Changes to turn on Navigation Mode." : stagedOff ? "Turn off staged. Save Changes to apply." : dirty ? "Navigation mapping changes are staged. Save Changes to apply." : !hadBroad ? "Allow website access above before enabling the mode." : "";
        historyAllow.hidden = hasHistory;
        historyAllow.disabled = permissionPending;
        historyRemove.hidden = !hasHistory;
        historyRemove.disabled = permissionPending;
      }
      updateControls();
      const environmentRow = element("div", "", editor);
      environmentRow.className = "navigation-editor-context";
      const environmentLabel = element("label", "Mapping environment", environmentRow);
      environmentLabel.htmlFor = "mapping-environment-select";
      const env = element("select", "", environmentRow);
      env.id = "mapping-environment-select";
      env.setAttribute("aria-label", "Mapping environment");
      env.dataset.focusKey = "mapping-environment";
      for (const [value, label] of [["standard", "Standard site mappings"], ["navigation", "Browser Navigation Mode mappings"]]) {
        const opt = element("option", label, env);
        opt.value = value;
      }
      env.value = editing ? "navigation" : "standard";
      env.addEventListener("change", () => {
        if (permissionPending) {
          env.value = editing ? "navigation" : "standard";
          return;
        }
        stopCapture();
        editing = env.value === "navigation";
        if (!editing && !state.getSettings().websiteMappings[site()] && site() !== "default")
          state.setSelectedSiteKey("default");
        profileId = null;
        render();
        refresh();
      });
      if (!editing) return;
      if (blocked) return;
      if (site() === "default") {
        element("p", "Navigation Mode defaults apply to sites without their own profiles.", editor);
        return;
      }
      const set = setForSite(), current = selectedProfile();
      profileId = current.profileId;
      const profileRow = element("div", "", editor);
      profileRow.className = "navigation-editor-context navigation-editor-profile";
      const profileLabel = element("label", site() === OPTIONS_MAPPING_KEY ? "Settings profile" : "Site profile", profileRow);
      profileLabel.htmlFor = "navigation-site-profile";
      const select = element("select", "", profileRow);
      select.id = "navigation-site-profile";
      select.setAttribute("aria-label", profileLabel.textContent);
      select.dataset.focusKey = "site-profile";
      set.profiles.forEach((p) => {
        const opt = element("option", p.name, select);
        opt.value = p.profileId;
      });
      select.value = profileId;
      select.addEventListener("change", () => {
        profileId = Number(select.value);
        render();
        refresh();
      });
      const actions = element("div", "", profileRow);
      actions.className = "navigation-profile-actions";
      button("Add profile", actions, () => {
        const name = prompt("Profile name");
        if (!name?.trim())
          return;
        const id = set.nextProfileId++;
        set.profiles.push({ profileId: id, name: name.trim(), bindings: structuredClone(current.bindings) });
        profileId = id;
        touch();
        render();
        refresh();
      });
      button("Rename", actions, () => {
        const name = prompt("Profile name", current.name);
        if (name?.trim()) {
          current.name = name.trim();
          touch();
          render();
          refresh();
        }
      });
      const deleteProfile = button("Delete", actions, () => {
        if (set.profiles.length === 1) {
          showToast("Keep at least one site profile.");
          return;
        }
        if (!confirm(`Delete ${current.name}?`))
          return;
        set.profiles.splice(set.profiles.indexOf(current), 1);
        profileId = null;
        touch();
        render();
        refresh();
      });
      deleteProfile.disabled = set.profiles.length === 1;
      for (const [label, offset] of [["Move earlier", -1], ["Move later", 1]]) {
        const move = button(label, actions, () => {
          const i = set.profiles.indexOf(current), j = i + offset;
          if (j < 0 || j >= set.profiles.length)
            return;
          [set.profiles[i], set.profiles[j]] = [set.profiles[j], set.profiles[i]];
          touch();
          render();
          refresh();
        });
        move.disabled = set.profiles.indexOf(current) + offset < 0 || set.profiles.indexOf(current) + offset >= set.profiles.length;
      }
      shortcuts.hidden = false;
      element("h4", "Profile Shortcuts", shortcuts);
      element("p", `Hold at least two buttons together for ${holdDuration} to record or use a shortcut here.`, shortcuts);
      const captureStatus = element("p", "", shortcuts);
      captureStatus.setAttribute("aria-live", "polite");
      const layout = getShortcutLayout();
      const combinations = shared.resolveProfileShortcuts(set.profileShortcuts, layout);
      for (const [action, label] of Object.entries(PROFILE_SHORTCUTS)) {
        const row = element("div", "", shortcuts);
        row.className = "navigation-shortcut-row";
        row.dataset.focusKey = `shortcut-${action}`;
        element("span", `${label}: ${buttonNames(combinations[action], layout) || "Not assigned"} `, row);
        button("Record combination", row, () => { record(action, captureStatus); cancelRecording.disabled = false; });
        const setOverride = (value) => {
          stopCapture();
          set.profileShortcuts[action] = value;
          touch();
          render();
          refresh();
        };
        const clear = button("Clear", row, () => setOverride([]));
        clear.disabled = !combinations[action].length;
        if (Array.isArray(set.profileShortcuts[action])) button("Use Default", row, () => setOverride(null));
      }
      const cancelRecording = button("Cancel recording", shortcuts, () => {
        stopCapture();
        captureStatus.textContent = "Recording cancelled.";
        cancelRecording.disabled = true;
      });
      cancelRecording.disabled = !captureTimer;
    }
    function openSetup() {
      document.getElementById("tab-btn-keyboard")?.click();
      controls.scrollIntoView({block:"start"});
      controls.focus({preventScroll:true});
    }
    async function releaseUnusedGrant(onRestore) {
      if (!acquiredBroad && !permissionDraftToken)
        return;
      const response = permissionDraftToken ? await cancelPermissionDraft() : await api.runtime.sendMessage({ type: "SET_NAVIGATION_MODE", enabled: false, releaseDraft: true });
      if (!response?.success)
        throw new Error(response?.error || "Unable to release unused website access.");
      acquiredBroad = false;
      hadBroad = !!response.hasBroad;
      effectiveEnabled = !!response.enabled;
      restoreOrigins = response.restoreOrigins || [];
      if (restoreOrigins.length) {
        onRestore?.();
        try {
          await api.permissions.request({ origins: restoreOrigins });
          const status = await api.runtime.sendMessage({ type: "NAVIGATION_MODE_STATUS" });
          restoreOrigins = status.restoreOrigins || [];
        } catch (_) {}
        if (restoreOrigins.length) showToast("Use Restore previous site access in Miscellaneous Options.");
      }
      render();
    }
    async function enableNavigationMode() {
      const response = await api.runtime.sendMessage({ type: "SET_NAVIGATION_MODE", enabled: true, draftToken: permissionDraftToken, acquiredBroad });
      if (response?.success) {
        permissionDraftPort?.disconnect();
        permissionDraftPort = null;
        permissionDraftToken = null;
      }
      return response;
    }
    async function save() {
      if (permissionPending)
        return { ok: false, error: new Error("Finish the browser permission prompt before saving.") };
      saveMessage = null;
      if (!dirty && !pendingEnable)
        return { ok: true };
      try {
        if (pendingEnable) {
          const response = await enableNavigationMode();
          if (!response?.success) {
            pendingEnable = false;
            await releaseUnusedGrant();
            saveMessage = "Site binding saved. Browser Navigation Mode remains off because website access was not granted.";
            return { ok: true };
          }
          draft.navigationModeEnabled = response.enabled;
          draft.navigationModeInitialized = response.initialized;
          if (!baseline.navigationModeInitialized) {
            const seeded = await api.storage.local.get(["navigationModeWebsiteMappings", "navigationModeDefaultMapping"]);
            baseline.navigationModeWebsiteMappings = structuredClone(seeded.navigationModeWebsiteMappings || {});
            draft.navigationModeWebsiteMappings = structuredClone(baseline.navigationModeWebsiteMappings);
            baseline.navigationModeDefaultMapping = structuredClone(seeded.navigationModeDefaultMapping || {});
            draft.navigationModeDefaultMapping = structuredClone(baseline.navigationModeDefaultMapping);
          }
        } else if (draft.navigationModeEnabled !== baseline.navigationModeEnabled) {
          const response = await api.runtime.sendMessage({ type: "SET_NAVIGATION_MODE", enabled: draft.navigationModeEnabled });
          if (!response?.success)
            throw new Error(response?.error || "Unable to change mode.");
          restoreOrigins = response.restoreOrigins || [];
          effectiveEnabled = !!response.enabled;
          if (restoreOrigins.length) {
            try {
              await api.permissions.request({ origins: restoreOrigins });
            } catch (error) {
              showToast("Use Restore previous site access to finish restoring site permissions.");
            }
          }
        }
        const websiteChanges = {};
        for (const key of new Set([...Object.keys(baseline.navigationModeWebsiteMappings), ...Object.keys(draft.navigationModeWebsiteMappings)])) {
          const before = baseline.navigationModeWebsiteMappings[key] || null;
          const value = draft.navigationModeWebsiteMappings[key] || null;
          if (JSON.stringify(before) !== JSON.stringify(value))
            websiteChanges[key] = { expected: savedWebsiteMappings[key] ?? null, value };
        }
        const message = { type: "SAVE_NAVIGATION_MODE_MAPPINGS", websiteChanges };
        if (JSON.stringify(baseline.navigationModeDefaultMapping) !== JSON.stringify(draft.navigationModeDefaultMapping))
          message.defaultChange = { expected: baseline.navigationModeDefaultMapping, value: draft.navigationModeDefaultMapping };
        if (Object.keys(websiteChanges).length || message.defaultChange) {
          const response = await api.runtime.sendMessage(message);
          if (!response?.success)
            throw new Error(typeof response?.error === "string" ? response.error : response?.error?.message || "Mappings changed elsewhere. Reload before saving.");
        }
        acquiredBroad = false;
        dirty = false;
        pendingEnable = false;
        await load();
        return { ok: true };
      } catch (error) {
        return { ok: false, error };
      }
    }
    function renderInitialMappings(parent, hostname) {
      const standard = state.getSettings();
      const { ACTION_OPTIONS, RESERVED_OPTIONS_KEY } = global.RemapadOptions.Constants;
      const label = value => ACTION_OPTIONS.find(option => option.value === value)?.label || value || "Unmapped";
      const preview = element("section", "", parent);
      preview.className = "navigation-mode-dialog__preview";
      element("h4", "Initial mapping changes", preview);

      function mappingRow(name, bindings, container) {
        const row = element("div", "", container);
        row.className = "navigation-mode-dialog__mapping";
        const source = element("div", "", row);
        element("strong", name, source);
        const start = element("p", "Start keeps ", source);
        element("span", label(bindings[9]), start);
        const changes = element("dl", "", row);
        for (const [trigger, index, destination] of [["LT", 6, "Previous Browser Tab"], ["RT", 7, "Next Browser Tab"]]) {
          const change = element("div", "", changes);
          element("kbd", trigger, element("dt", "", change));
          const values = element("dd", "", change);
          element("span", label(bindings[index]), values);
          element("strong", `→ ${destination}`, values);
        }
      }

      const siteBindings = hostname ? standard.websiteMappings[hostname] || standard.defaultMapping : null;
      const samePreview = siteBindings && [6, 7, 9].every(index => siteBindings[index] === standard.defaultMapping[index]);
      if (samePreview) {
        mappingRow(`Site Mapping Defaults and ${hostname}`, siteBindings, preview);
      } else {
        mappingRow("Site Mapping Defaults", standard.defaultMapping, preview);
        if (siteBindings) mappingRow(hostname, siteBindings, preview);
      }
      const others = Object.entries(standard.websiteMappings).filter(([host]) => host !== hostname && host !== RESERVED_OPTIONS_KEY);
      if (others.length) {
        const details = element("details", "", preview);
        element("summary", `Other website mappings (${others.length})`, details);
        for (const [host, bindings] of others) mappingRow(host, bindings, details);
      }
    }
    function permissionMouseNote(parent, id) {
      const note = element("p", "", parent);
      note.id = id;
      element("strong", "Use your mouse for permissions.", note);
      note.append(" Click the permission button here, then respond to your browser’s prompt. The browser handles that prompt outside Remapad’s gamepad controls.");
      return note;
    }

    function permissionRow(parent, title, qualifier, description) {
      const row = element("div", "", parent);
      row.className = "navigation-mode-dialog__permission";
      const copy = element("div", "", row);
      const heading = element("h4", `${title} `, copy);
      element("span", qualifier, heading);
      element("p", description, copy);
      const status = element("p", "", copy);
      status.className = "navigation-mode-dialog__status";
      status.setAttribute("role", "status");
      return { row, status };
    }

    function historyPermissionButton(parent, mouseNote, onChange) {
      const history = permissionRow(parent, "History suggestions", "Optional",
        "Browser address bar access is limited. Browse with Remapad can suggest destinations from history on this device.");
      const control = button("Allow history suggestions", history.row, async () => {
        hasHistory = await requestHistoryAccess(history.status, onChange);
        onChange(control);
      });
      control.setAttribute("aria-describedby", mouseNote.id);
      return control;
    }

    function updateHistoryPermissionButton(control, busy) {
      control.textContent = hasHistory ? "History allowed" : "Allow history suggestions";
      control.disabled = busy || permissionPending || hasHistory;
      control.toggleAttribute("data-allowed", hasHistory);
    }

    async function showMappingMigration(nextTab) {
      if (effectiveEnabled || draft.navigationModeInitialized) return false;
      const type = nextTab ? "CLAIM_NEXT_TAB_MIGRATION" : "CLAIM_SAVED_MAPPINGS_MIGRATION";
      const result = await api.runtime.sendMessage({ type });
      if (!result?.success) throw new Error(result?.error || "Unable to check saved mappings.");
      if (!result.offer || disposed || document.querySelector("dialog[open]")) return false;
      await showModeSetup(result.offer, { nextTab });
      return true;
    }

    async function showNavigationModeSetup() {
      if (effectiveEnabled) return true;
      const result = await api.runtime.sendMessage({ type: "GET_NAVIGATION_MODE_SETUP_MAPPINGS" });
      if (!result?.success) throw new Error(result?.error || "Unable to check saved mappings.");
      return showModeSetup(result.offer, { onboarding: true });
    }

    function showModeSetup(offer, { nextTab = false, onboarding = false } = {}) {
      const enableOnGrant = onboarding && !offer;
      const hadAccess = hadBroad;
      let busy = false;
      let enabled = false;
      const dialog = element("dialog");
      dialog.id = nextTab ? "next-tab-migration" : onboarding ? "navigation-mode-onboarding" : "saved-mappings-migration";
      dialog.className = "navigation-mode-dialog";
      dialog.setAttribute("aria-labelledby", `${dialog.id}-title`);
      dialog.setAttribute("aria-describedby", `${dialog.id}-summary`);

      const header = element("header", "", dialog);
      header.className = "navigation-mode-dialog__header";
      const titleText = nextTab ? "Move tab switching to Navigation Mode"
        : offer ? "Bring your mappings to Navigation Mode" : "Set up Gamepad Browser Navigation Mode";
      const title = element("h2", titleText, header);
      title.id = `${dialog.id}-title`;
      title.tabIndex = -1;
      const summary = element("p", "", header);
      summary.id = `${dialog.id}-summary`;
      if (offer) {
        const sources = [];
        if (offer.includesDefaults) sources.push("Site Mapping Defaults");
        if (offer.hostnames.length === 1) sources.push(offer.hostnames[0]);
        if (offer.hostnames.length > 1) sources.push(`${offer.hostnames.length} websites`);
        if (nextTab) {
          element("strong", "Next Browser Tab", summary);
          summary.append(` is already mapped in ${sources.join(" and ")}.`);
        } else {
          summary.textContent = `Remapad found saved mappings in ${sources.join(" and ")}.`;
        }
      } else {
        summary.textContent = "Switch tabs and open websites with your controller.";
      }

      const body = element("div", "", dialog);
      body.className = "navigation-mode-dialog__body";
      if (offer) {
        element("p", "Navigation Mode copies all your saved website mappings and Site Mapping Defaults into its own set. You can return to your current mappings by turning the mode off in Miscellaneous Options.", body);
        renderInitialMappings(body, offer.hostnames[0]);
      } else {
        element("p", draft.navigationModeInitialized
          ? "Turning on Navigation Mode resumes your saved Navigation profiles."
          : "LT and RT switch between browser tabs. Open Browse with Remapad from the Navigation Guide to enter an address or choose a suggestion.", body);
      }
      const mouseNote = permissionMouseNote(body, nextTab ? "migration-permission-mouse-note" : `${dialog.id}-mouse-note`);
      // Offer history first because granting website access can finish setup.
      const historyButton = onboarding ? historyPermissionButton(body, mouseNote, updateControls) : null;
      const access = permissionRow(body, "All-sites access", offer ? "Required to migrate" : "Required for this mode",
        "Remapad needs access to supported websites for controller shortcuts across tabs. This can affect sites with their own gamepad controls.");
      const grantLabel = enableOnGrant ? "Allow access and turn on" : "Allow all-sites access";
      const grant = grantButton(grantLabel, access.row, access.status, dialog, () => {
        updateControls();
        if (!dialog.open || permissionPending) return;
        if (enableOnGrant && hadBroad) turnOn();
        else (hadBroad ? enableButton : grant).focus({ preventScroll: true });
      }, "Access declined. You can keep using Remapad on your mapped websites.");
      grant.setAttribute("aria-describedby", mouseNote.id);
      element("p", "After turning on Navigation Mode, restart your browser (recommended) or reload your open tabs. Use the browser’s tab controls to leave restricted pages such as browser settings.", body);

      const footer = element("footer", "", dialog);
      footer.className = "navigation-mode-dialog__footer";
      const status = element("p", "", footer);
      status.className = "navigation-mode-dialog__save-status";
      status.setAttribute("role", "status");
      const actions = element("div", "", footer);
      actions.className = "navigation-mode-dialog__actions";
      const enableLabel = nextTab ? "Migrate to Navigation Mode" : offer ? "Copy Mappings and Turn On" : "Turn On Navigation Mode";
      const enableButton = button(enableLabel, actions, turnOn);
      enableButton.classList.add("navigation-mode-dialog__primary");
      const keepButton = button(onboarding ? "Keep Site-Only Controls" : "Keep Current Mappings", actions, keepCurrent);

      function updateControls(trigger) {
        mouseNote.hidden = hadBroad && (!historyButton || hasHistory);
        grant.textContent = hadBroad ? "Access allowed" : grantLabel;
        grant.disabled = busy || permissionPending || hadBroad;
        grant.toggleAttribute("data-allowed", hadBroad);
        grant.classList.toggle("navigation-mode-dialog__primary", enableOnGrant && !hadBroad);
        enableButton.hidden = onboarding && !hadBroad;
        enableButton.disabled = busy || permissionPending || !hadBroad;
        keepButton.disabled = busy || permissionPending;
        if (historyButton) updateHistoryPermissionButton(historyButton, busy);
        if (trigger && dialog.open && !permissionPending) {
          const target = trigger.disabled ? (hadBroad ? enableButton : grant) : trigger;
          target.focus({ preventScroll: true });
        }
      }

      async function turnOn() {
        if (busy || permissionPending || !hadBroad) return;
        busy = true;
        status.textContent = "";
        updateControls();
        try {
          const response = await enableNavigationMode();
          if (!response?.success || !response.enabled) throw new Error(response?.error || "Could not turn on Navigation Mode.");
          acquiredBroad = false;
          enabled = true;
          await load();
          refresh();
          dialog.close();
          document.getElementById("mapping-environment-select").focus({ preventScroll: true });
          showToast("Navigation Mode is on. Restart your browser or reload open tabs.", "success");
        } catch (error) {
          status.textContent = error.message;
          busy = false;
          updateControls();
          (hadBroad ? enableButton : grant).focus({ preventScroll: true });
        }
      }

      async function keepCurrent() {
        if (busy || permissionPending) return;
        busy = true;
        updateControls();
        if (!hadAccess && !effectiveEnabled) {
          await releaseUnusedGrant(() => {
            status.textContent = "Allow the browser prompt to restore your previous site access.";
            updateControls();
          }).catch(error => showToast(error.message));
        }
        dialog.close();
      }

      dialog.addEventListener("cancel", event => {
        event.preventDefault();
        keepCurrent();
      });
      const dismissed = new Promise(resolve => dialog.addEventListener("close", () => {
        dialog.remove();
        resolve(enabled);
      }, { once: true }));
      updateControls();
      document.body.append(dialog);
      dialog.showModal();
      title.focus({ preventScroll: true });
      return dismissed;
    }

    async function scopeDialog(action, saveBinding) {
      const hostname = site();
      const live = await api.runtime.sendMessage({ type: "NAVIGATION_MODE_STATUS" });
      hadBroad = !!live.hasBroad;
      effectiveEnabled = !!live.enabled;
      hasHistory = !!live.hasHistory;
      const hadWebsiteAccess = hadBroad;
      const enableWasStaged = pendingEnable;

      return new Promise((resolve) => {
        let saving = false;
        let bindingSaved = false;
        const dialog = element("dialog");
        dialog.className = "navigation-mode-dialog";
        dialog.setAttribute("aria-labelledby", "navigation-dialog-title");
        dialog.setAttribute("aria-describedby", "navigation-dialog-binding navigation-dialog-scope");

        const header = element("header", "", dialog);
        header.className = "navigation-mode-dialog__header";
        const title = element("h2", "Set up tab switching", header);
        title.id = "navigation-dialog-title";
        title.tabIndex = -1;
        const binding = element("p", "", header);
        binding.id = "navigation-dialog-binding";
        element("strong", action === "prev_tab" ? "Previous Browser Tab" : "Next Browser Tab", binding);
        binding.append(" on ");
        element("strong", hostname, binding);
        const scope = element("p", "After you switch tabs, this shortcut only works if Remapad is active in the new tab and that button has the same assignment there.", header);
        scope.id = "navigation-dialog-scope";

        const body = element("div", "", dialog);
        body.className = "navigation-mode-dialog__body";
        const mode = element("div", "", body);
        element("h3", "Gamepad Browser Navigation Mode", mode);
        if (effectiveEnabled || draft.navigationModeInitialized) {
          element("p", effectiveEnabled ? "Your saved Navigation mappings are active." : "Enable the mode to resume your saved Navigation mappings.", mode);
        } else {
          const description = element("p", "Remapad runs on supported websites by default in this mode, so you can switch tabs with your controller. The initial mappings assign ", mode);
          element("strong", "LT", description);
          description.append(" to ");
          element("strong", "Previous Browser Tab", description);
          description.append(" and ");
          element("strong", "RT", description);
          description.append(" to ");
          element("strong", "Next Browser Tab", description);
          description.append(".");
        }
        if (!effectiveEnabled) {
          const reload = element("p", "After turning on Navigation Mode, ", mode);
          reload.className = "navigation-mode-dialog__reload";
          element("strong", "restart your browser (recommended)", reload);
          reload.append(" or reload each open tab to apply the changes there.");
        }
        if (!draft.navigationModeInitialized) renderInitialMappings(body, hostname);

        const permissions = element("section", "", body);
        permissions.className = "navigation-mode-dialog__permissions";
        const permissionsHeading = element("h3", "Permissions", permissions);
        permissionsHeading.id = "navigation-dialog-permissions";
        permissions.setAttribute("aria-labelledby", permissionsHeading.id);
        const mouseNote = permissionMouseNote(permissions, "setup-permission-mouse-note");
        const website = permissionRow(permissions, "All-sites access", "Required for this mode", "Remapad needs access to supported sites to keep switching tabs. It may intercept site gamepad controls. Use per-site Off or Report Issues if needed.");
        const websiteButton = grantButton("Allow all-sites access", website.row, website.status, dialog, () => updatePermissionControls(websiteButton));
        const historyButton = historyPermissionButton(permissions, mouseNote, updatePermissionControls);
        websiteButton.setAttribute("aria-describedby", mouseNote.id);

        const footer = element("footer", "", dialog);
        footer.className = "navigation-mode-dialog__footer";
        const saveStatus = element("p", "", footer);
        saveStatus.className = "navigation-mode-dialog__save-status";
        saveStatus.setAttribute("role", "status");
        const restriction = element("div", "", footer);
        restriction.className = "navigation-mode-dialog__restriction";
        element("strong", "Restricted tabs", restriction);
        const restrictionDetails = element("p", "Remapad shortcuts stop working on browser settings pages and protected sites like Firefox Add-ons (", restriction);
        element("code", "addons.mozilla.org", restrictionDetails);
        restrictionDetails.append("). If you land on one of these tabs, use your browser’s tab controls to switch away.");
        const actions = element("div", "", footer);
        actions.className = "navigation-mode-dialog__actions";
        const enableButton = button("Save and Turn On Navigation Mode", actions, () => finish(true));
        enableButton.classList.add("navigation-mode-dialog__primary");
        const siteButton = button("Save Site Binding Only", actions, () => finish(false));
        const cancelButton = button("Cancel", actions, cancel);
        cancelButton.classList.add("navigation-mode-dialog__cancel");

        function updatePermissionControls(trigger) {
          mouseNote.hidden = hadBroad && hasHistory;
          websiteButton.textContent = hadBroad ? "Access allowed" : "Allow all-sites access";
          websiteButton.disabled = saving || permissionPending || hadBroad;
          websiteButton.toggleAttribute("data-allowed", hadBroad);
          updateHistoryPermissionButton(historyButton, saving);
          enableButton.hidden = effectiveEnabled || !hadBroad;
          siteButton.hidden = bindingSaved;
          siteButton.classList.toggle("navigation-mode-dialog__primary", enableButton.hidden);
          cancelButton.textContent = bindingSaved ? "Close" : "Cancel";
          for (const choice of [enableButton, siteButton, cancelButton]) {
            choice.disabled = saving || permissionPending;
          }
          if (trigger && dialog.open && !permissionPending) {
            const next = [enableButton, siteButton, cancelButton].find(choice => !choice.hidden);
            (trigger.disabled || trigger.hidden ? next : trigger).focus({ preventScroll: true });
          }
        }

        async function discardDialogGrant() {
          if (!hadWebsiteAccess && !effectiveEnabled) {
            await releaseUnusedGrant(() => {
              saveStatus.textContent = "Allow the browser prompt to restore your previous site access.";
              updatePermissionControls();
            }).catch(error => showToast(error.message));
          }
        }

        function dismiss(activated = false) {
          dialog.close();
          dialog.remove();
          refresh();
          resolve(activated);
        }

        async function cancel() {
          if (saving || permissionPending) return;
          saving = true;
          updatePermissionControls();
          await discardDialogGrant();
          dismiss();
        }

        async function finish(enable) {
          if (saving || permissionPending || (enable && enableButton.hidden)) return;
          saving = true;
          saveStatus.textContent = "";
          updatePermissionControls();
          try {
            if (!bindingSaved) {
              await saveBinding();
              bindingSaved = true;
            }
            if (enable) {
              pendingEnable = true;
              if (!await saveSettings()) throw new Error("Could not finish saving changes. Try again.");
              if (!effectiveEnabled) {
                throw new Error(hadBroad ? "Could not confirm Navigation Mode is on. Try again." : "Allow all-sites access to turn on Navigation Mode.");
              }
            } else {
              showToast("Site binding saved.", "success");
              await discardDialogGrant();
            }
          } catch (error) {
            pendingEnable = enableWasStaged && hadBroad && !effectiveEnabled;
            saving = false;
            const retry = enable ? enableButton : siteButton;
            updatePermissionControls(bindingSaved && !hadBroad ? websiteButton : retry);
            saveStatus.textContent = bindingSaved ? `Site binding saved. ${error.message}` : error.message;
            return;
          }
          dismiss(enable);
        }

        dialog.addEventListener("cancel", event => {
          event.preventDefault();
          cancel();
        });
        dialog.addEventListener("close", () => {
          if (permissionPending) cancelPermissionDraft().catch(error => showToast(error.message));
        });
        updatePermissionControls();
        document.body.append(dialog);
        dialog.showModal();
        title.focus({ preventScroll: true });
      });
    }
    setupButton.addEventListener("click", openSetup);
    global.addEventListener("blur", stopCapture);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden)
        stopCapture();
    });
    global.addEventListener("gamepaddisconnected", stopCapture);
    document.getElementById("tab-btn-keyboard")?.addEventListener("click", () => {
      preparePermissionDraft().catch(() => {});
    });
    api.permissions.onRemoved?.addListener(() => {
      api.runtime.sendMessage({ type: "NAVIGATION_MODE_STATUS" }).then((status) => {
        effectiveEnabled = !!status.enabled;
        hadBroad = !!status.hasBroad;
        hasHistory = !!status.hasHistory;
        render();
      }).catch((error) => showToast(error.message));
    });
    global.addEventListener("pagehide", () => {
      disposed = true;
      const tracked = !!permissionDraftToken;
      cancelPermissionDraft().catch(() => {});
      stopCapture();
      if (!tracked)
        releaseUnusedGrant().catch(() => {});
    });
    return { load, save, render, getMapping, touch, scopeDialog, showMappingMigration, showNavigationModeSetup, getProfileId: () => canEditMappings() && site() !== "default" ? selectedProfile().profileId : null, getProfileName: () => canEditMappings() && site() !== "default" ? selectedProfile().name : null, isPermissionPending: () => permissionPending, getSaveMessage: () => saveMessage, getSiteKeys: () => editing ? [...new Set([...Object.keys(draft.navigationModeWebsiteMappings), ...requestedNavigation && requestedSite ? [requestedSite] : []])] : [], isEditing: () => editing, stopCapture, isDirty: () => dirty, isPendingEnable: () => pendingEnable, markSaved(value) {
      if (value)
        draft = structuredClone(value);
      baseline = structuredClone(draft);
      dirty = false;
      pendingEnable = false;
      render();
    } };
  }
  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.NavigationMode = { create };
})(globalThis);
