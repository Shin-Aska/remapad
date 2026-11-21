/* Pure Navigation Mode schema and input helpers, shared by extension contexts. */
(function (global) {
  'use strict';
  const BROAD_ORIGIN = '*://*/*';
  const HOLD_MS = 600;
  const ASSEMBLY_MS = 200;
  const OPTIONS_MAPPING_KEY = '__remapad_options__';
  const OPTIONS_PAGE_PROFILE = Object.freeze({
    0: 'select', 1: 'back', 2: 'none', 3: 'none',
    4: 'prev_tab', 5: 'next_tab', 6: 'none', 7: 'none',
    8: 'none', 9: 'none', 10: 'none', 11: 'none',
    12: 'scroll_up', 13: 'scroll_down', 14: 'scroll_left', 15: 'scroll_right'
  });
  const SETTINGS_SECTION_ACTIONS = Object.freeze({
    prev_settings_section: 'Previous Settings Section',
    next_settings_section: 'Next Settings Section'
  });
  const PROFILE_SHORTCUTS = Object.freeze({
    next: 'Swap to Next Profile',
    previous: 'Swap to Previous Profile',
    browse: 'Browse with Remapad',
    closeTab: 'Close Browser Tab'
  });
  const PROFILE_SHORTCUT_KEYS = Object.keys(PROFILE_SHORTCUTS);
  const CONTROLLER_STYLE_PATTERNS = [
    // Match the original FC30 USB identifier before generic browser names.
    { test: /\b1235[-:]ab11\b/, style: 'retro8bitdo' },
    { test: /8bitdo.*(?:fc30|nes30)(?![\s_-]*(?:pro|arcade))|(?:^|[-_\s])(?:fc30|nes30)(?![\s_-]*(?:pro|arcade))/, style: 'retro8bitdo' },
    { test: /steam deck|steam controller|valve software|028e.*11ff|28de.*11ff|28de-11ff|28de/, style: 'steamdeck' },
    { test: /0079.*0006|dragonrise|n64|dragon rise/, style: 'n64' },
    { test: /xbox|microsoft|xinput|generic x/, style: 'xbox' },
    { test: /dualsense|dualshock|sony|playstation|ps4|ps5/, style: 'playstation' },
    { test: /nintendo|switch|pro controller/, style: 'nintendo' }
  ];
  const CONTROLLER_GLYPHS = {
    playstation: {
      '0': '✕', '1': '○', '2': '□', '3': '△',
      '4': 'L1', '5': 'R1', '6': 'L2', '7': 'R2',
      '8': 'Share', '9': '☰', '10': 'L3', '11': 'R3', '12': '↑', '13': '↓', '14': '←', '15': '→'
    },
    xbox: {
      '0': 'A', '1': 'B', '2': 'X', '3': 'Y',
      '4': 'LB', '5': 'RB', '6': 'LT', '7': 'RT',
      '8': 'View', '9': '☰', '10': 'L3', '11': 'R3', '12': '↑', '13': '↓', '14': '←', '15': '→'
    },
    nintendo: {
      '0': 'B', '1': 'A', '2': 'Y', '3': 'X',
      '4': 'L', '5': 'R', '6': 'ZL', '7': 'ZR',
      '8': 'Minus', '9': 'Plus', '10': 'L3', '11': 'R3', '12': '↑', '13': '↓', '14': '←', '15': '→'
    },
    steamdeck: {
      '0': 'A', '1': 'B', '2': 'X', '3': 'Y',
      '4': 'L1', '5': 'R1', '6': 'L2', '7': 'R2',
      '8': 'View', '9': 'Options', '10': 'L3', '11': 'R3', '12': '↑', '13': '↓', '14': '←', '15': '→'
    },
    retro8bitdo: {
      '0': 'B', '1': 'A', '2': '2', '3': 'X',
      '4': 'Y', '5': '5', '6': 'L', '7': 'R',
      '8': '8', '9': '9', '10': 'Select', '11': 'Start', '12': '↑', '13': '↓', '14': '←', '15': '→'
    },
    n64: {
      '0': 'C-Up', '1': 'C-Right', '2': 'C-Down', '3': 'C-Left',
      '4': 'B', '5': 'A', '6': 'L', '7': 'R',
      '8': 'Z', '9': 'Start', '10': 'L3', '11': 'R3', '12': '↑', '13': '↓', '14': '←', '15': '→'
    }
  };

  function detectControllerStyle(id) {
    const name = (id || '').toLowerCase();
    return CONTROLLER_STYLE_PATTERNS.find(({ test }) => test.test(name))?.style || null;
  }

  function shortcutLayout(gamepad) {
    const style = detectControllerStyle(gamepad?.id) || 'playstation';
    if (gamepad?.mapping === 'standard' && (style === 'retro8bitdo' || style === 'n64')) return 'playstation';
    return style;
  }

  function sampleShortcutButtons(gamepad, layout) {
    const buttons = Array.from({ length: 16 }, (_, id) => {
      const button = gamepad.buttons[id];
      return Boolean(button?.pressed || button?.value > 0.5);
    });
    if (gamepad.mapping === 'standard') return buttons;
    const axes = gamepad.axes || [];
    let x;
    let y;
    if (layout === 'retro8bitdo') {
      // The original FC30/NES30 reports its D-pad through the left stick axes.
      [x, y] = axes;
    } else if (layout === 'n64') {
      // DragonRise adapters expose a separate HAT pair.
      if (axes.length >= 6) [y, x] = axes.slice(4, 6);
      else if (axes.length >= 4) [x, y] = axes.slice(2, 4);
    }
    buttons[12] ||= y >= -1 && y < -0.8;
    buttons[13] ||= y <= 1 && y > 0.8;
    buttons[14] ||= x >= -1 && x < -0.8;
    buttons[15] ||= x <= 1 && x > 0.8;
    return buttons;
  }

  function bufferedDpadStick(gamepad, layout, buttons, detector) {
    if (!buttons.slice(12, 16).some((pressed, index) => pressed && detector.isBuffered(index + 12))) return null;
    if (layout === 'retro8bitdo') return 'left';
    if (layout === 'n64' && gamepad.axes.length >= 4 && gamepad.axes.length < 6) return 'right';
    return null;
  }

  function optionsNavigationBindings(standard) {
    const bindings = {};
    const saved = standard && typeof standard === 'object' && !Array.isArray(standard) ? standard : {};
    for (const [button, defaultAction] of Object.entries(OPTIONS_PAGE_PROFILE)) {
      const action = typeof saved[button] === 'string' ? saved[button] : defaultAction;
      bindings[button] = action === 'prev_tab' ? 'prev_settings_section' : action === 'next_tab' ? 'next_settings_section' : action;
    }
    return { ...bindings, 6: 'prev_tab', 7: 'next_tab' };
  }

  function normalizeChord(value) {
    return Array.isArray(value) ? [...new Set(value.filter(id => Number.isInteger(id) && id >= 0 && id < 16))].sort((a, b) => a - b) : [];
  }
  function chordsOverlap(first, second) {
    return first.length > 0 && second.length > 0 &&
      (first.every(id => second.includes(id)) || second.every(id => first.includes(id)));
  }
  function validateShortcuts(shortcuts = {}) {
    const assigned = [];
    for (const key of PROFILE_SHORTCUT_KEYS) {
      const value = shortcuts[key] || [];
      if (!Array.isArray(value) || value.length === 1 || value.some(id => !Number.isInteger(id) || id < 0 || id > 15) || new Set(value).size !== value.length) return { valid: false, error: 'Choose at least two distinct controller buttons from 0 through 15, or leave the shortcut empty.' };
      if (value.length) assigned.push(value);
    }
    const overlaps = assigned.some((keys, index) => assigned.slice(index + 1).some(other => chordsOverlap(keys, other)));
    if (overlaps) return { valid: false, error: 'Profile shortcuts cannot be equal or contain one another.' };
    return { valid: true, error: null };
  }
  function normalizeShortcutOverrides(value) {
    const shortcuts = value || {};
    // Older untouched sets stored empty placeholders for just the two profile switches.
    const oldPlaceholders = Object.keys(shortcuts).length === 2 &&
      Array.isArray(shortcuts.next) && !shortcuts.next.length &&
      Array.isArray(shortcuts.previous) && !shortcuts.previous.length;
    const useSaved = !oldPlaceholders && validateShortcuts(shortcuts).valid;
    // null inherits the controller's default. [] explicitly clears the shortcut.
    return Object.fromEntries(PROFILE_SHORTCUT_KEYS.map(key => [key,
      useSaved && Array.isArray(shortcuts[key]) ? normalizeChord(shortcuts[key]) : null
    ]));
  }

  function resolveProfileShortcuts(overrides, layout) {
    const start = layout === 'retro8bitdo' ? 11 : 9;
    const select = layout === 'retro8bitdo' ? 10 : 8;
    const primary = layout === 'n64' ? 5 : 0;
    const defaults = {
      next: [start, 15],
      previous: [start, 14],
      browse: [select, start],
      closeTab: [primary, select]
    };
    const saved = PROFILE_SHORTCUT_KEYS.map(key => overrides?.[key]).filter(Array.isArray);
    return Object.fromEntries(PROFILE_SHORTCUT_KEYS.map(key => {
      if (Array.isArray(overrides?.[key])) return [key, overrides[key]];
      const chord = defaults[key];
      return [key, saved.some(other => chordsOverlap(chord, other)) ? [] : chord];
    }));
  }

  function createProfileSet(bindings = {}) {
    return { profiles: [{ profileId: 1, name: 'Navigation', bindings: { ...bindings } }], profileShortcuts: normalizeShortcutOverrides(), nextProfileId: 2 };
  }
  function normalizeProfileSet(value, fallbackBindings = {}) {
    if (!value || !Array.isArray(value.profiles)) return createProfileSet(fallbackBindings);
    const seen = new Set();
    const profiles = value.profiles.filter(profile => profile && Number.isInteger(profile.profileId) && profile.profileId > 0 && !seen.has(profile.profileId) && seen.add(profile.profileId)).map(profile => ({ profileId: profile.profileId, name: typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : 'Profile', bindings: { ...fallbackBindings, ...(profile.bindings && typeof profile.bindings === 'object' ? profile.bindings : {}) } }));
    if (!profiles.length) return createProfileSet(fallbackBindings);
    const profileShortcuts = normalizeShortcutOverrides(value.profileShortcuts);
    return { profiles, profileShortcuts, nextProfileId: Math.max(Number.isInteger(value.nextProfileId) ? value.nextProfileId : 1, ...profiles.map(profile => profile.profileId + 1)) };
  }
  function areInputsNeutral(buttons, gamepad, navSettings, controllerStyle, deadzone = 0.3) {
    if (buttons.some(Boolean)) return false;
    if (!navSettings?.enabled) return true;
    const hatAxes = gamepad.mapping !== 'standard' && controllerStyle === 'n64'
      ? new Set(gamepad.axes.length >= 6 ? [4, 5] : gamepad.axes.length >= 4 ? [2, 3] : [])
      : new Set();
    for (const [name, indices] of [['leftStick', [0, 1]], ['rightStick', [2, 3]]]) {
      const stick = navSettings[name];
      if (!stick?.enabled || !stick.mode || stick.mode === 'disabled') continue;
      const threshold = Number.isFinite(stick.deadzone) ? stick.deadzone : deadzone;
      for (const index of indices) {
        if (hatAxes.has(index)) continue;
        const value = gamepad.axes[index];
        // Unavailable axes and adapter sentinel values are not stick movement.
        if (Number.isFinite(value) && Math.abs(value) <= 1 && Math.abs(value) > threshold) return false;
      }
    }
    return true;
  }

  function createChordDetector() {
    let previous = new Set();
    let pending = new Map();
    let chord = null;
    let neutral = false;

    function reset(requireNeutral = false) {
      previous.clear();
      pending.clear();
      chord = null;
      neutral = requireNeutral;
    }

    function sample(buttons, shortcuts, now) {
      const pressed = new Set(buttons.flatMap((value, id) => value ? [id] : []));
      const actions = [];
      const releases = [];
      const result = { actions, releases, direction: null, openBrowse: false, closeTab: false };
      if (neutral) {
        if (!pressed.size) reset(false);
        return result;
      }

      const candidates = PROFILE_SHORTCUT_KEYS
        .map(action => ({ action, keys: normalizeChord(shortcuts?.[action]) }))
        .filter(item => item.keys.length >= 2);
      const shortcutKeys = new Set(candidates.flatMap(item => item.keys));
      for (const id of pressed) {
        if (previous.has(id)) continue;
        if (shortcutKeys.has(id)) pending.set(id, now);
        else actions.push(id);
      }

      const complete = candidates.filter(item => item.keys.every(id => pressed.has(id)));
      // Two complete candidates have no unambiguous action. Consume the
      // attempt and require release, including when ambiguity appears mid-hold.
      if (complete.length > 1) {
        reset(true);
        return { ...result, actions: [], releases: [] };
      }
      if (!chord && complete.length === 1) {
        const candidate = complete[0];
        const times = candidate.keys.map(id => pending.get(id));
        if (times.every(time => time !== undefined) && Math.max(...times) - Math.min(...times) <= ASSEMBLY_MS) {
          chord = { ...candidate, since: now };
          candidate.keys.forEach(id => pending.delete(id));
        }
      }
      if (chord) {
        if (!chord.keys.every(id => pressed.has(id))) {
          reset(true);
          return { ...result, actions: [], releases: [] };
        }
        if (now - chord.since >= HOLD_MS) {
          const action = chord.action;
          reset(true);
          return {
            actions: [],
            releases: [],
            direction: action === 'next' || action === 'previous' ? action : null,
            openBrowse: action === 'browse',
            closeTab: action === 'closeTab'
          };
        }
      }

      for (const [id, since] of pending) {
        if (!pressed.has(id) || now - since >= ASSEMBLY_MS) {
          actions.push(id);
          pending.delete(id);
          if (!pressed.has(id)) releases.push(id);
        }
      }
      for (const id of previous) {
        if (!pressed.has(id) && !releases.includes(id) && !chord?.keys.includes(id)) releases.push(id);
      }
      previous = pressed;
      return result;
    }
    return { sample, reset, isBuffered: id => neutral || pending.has(id) || Boolean(chord?.keys.includes(id)) };
  }
  global.RemapadNavigationMode = {
    BROAD_ORIGIN, HOLD_MS, ASSEMBLY_MS, OPTIONS_MAPPING_KEY, OPTIONS_PAGE_PROFILE, SETTINGS_SECTION_ACTIONS,
    PROFILE_SHORTCUTS, CONTROLLER_STYLE_PATTERNS, CONTROLLER_GLYPHS, shortcutLayout, sampleShortcutButtons, bufferedDpadStick,
    optionsNavigationBindings, areInputsNeutral, normalizeChord, validateShortcuts, resolveProfileShortcuts,
    createProfileSet, normalizeProfileSet, createChordDetector
  };
})(globalThis);
