/**
 * Remapad Options — Shared Constants
 * MV3-compatible classic script; exposed via window.RemapadOptions.Constants.
 */

(function (global) {
  'use strict';

  const RESERVED_OPTIONS_KEY = '__remapad_options__';

  const WEBSITE_MAPPINGS_DEFAULT = {
    'netflix.com': 'default',
    'primevideo.com': 'default'
  };

  const FRIENDLY_NAMES = {
    [RESERVED_OPTIONS_KEY]: 'Remapad Settings',
    'netflix.com': 'Netflix',
    'primevideo.com': 'Prime Video',
    'youtube.com': 'YouTube',
    'twitch.tv': 'Twitch',
    'disneyplus.com': 'Disney+',
    'hulu.com': 'Hulu',
    'max.com': 'Max'
  };

  const OPTIONS_PAGE_PROFILE = {
    '0': 'select',
    '1': 'back',
    '2': 'none',
    '3': 'none',
    '4': 'prev_tab',
    '5': 'next_tab',
    '6': 'none',
    '7': 'none',
    '8': 'none',
    '9': 'none',
    '10': 'none',
    '11': 'none',
    '12': 'scroll_up',
    '13': 'scroll_down',
    '14': 'scroll_left',
    '15': 'scroll_right'
  };

  // The original, non-Pro FC30 and NES30 expose their D-pad as axes and use
  // non-standard button slots for the remaining physical controls. Keep this
  // profile separate so newer 8BitDo controllers retain the standard layout.
  const RETRO_8BITDO_OPTIONS_PAGE_PROFILE = {
    '0': 'select',
    '1': 'back',
    '2': 'none',
    '3': 'none',
    '4': 'none',
    '5': 'none',
    '6': 'prev_tab',
    '7': 'next_tab',
    '8': 'none',
    '9': 'none',
    '10': 'none',
    '11': 'none',
    '12': 'none',
    '13': 'none',
    '14': 'none',
    '15': 'none'
  };

  const DEFAULT_PROFILE = {
    '0': 'click',
    '1': 'back',
    '2': 'fullscreen',
    '3': 'search',
    '4': 'seek_backward',
    '5': 'seek_forward',
    '6': 'volume_down',
    '7': 'volume_up',
    '8': 'toggle_play',
    '9': 'toggle_hud',
    '10': 'none',
    '11': 'none',
    '12': 'scroll_up',
    '13': 'scroll_down',
    '14': 'scroll_left',
    '15': 'scroll_right'
  };

  const RETRO_8BITDO_DEFAULT_PROFILE = {
    '0': 'click',
    '1': 'back',
    '2': 'none',
    '3': 'search',
    '4': 'fullscreen',     // Physical Y is reported as L1
    '5': 'none',
    '6': 'scroll_left',    // Physical left shoulder is reported as L2
    '7': 'scroll_right',   // Physical right shoulder is reported as R2
    '8': 'none',
    '9': 'none',
    '10': 'fullscreen',    // Physical Select is reported as L3
    '11': 'toggle_play',   // Physical Start is reported as R3
    '12': 'none',          // D-pad directions are axes, not mappable buttons
    '13': 'none',
    '14': 'none',
    '15': 'none'
  };

  const DEFAULT_NAV_SETTINGS = {
    enabled: true,
    strategy: 'auto',
    rightStick: {
      enabled: true,
      mode: 'scroll',
      deadzone: 0.3,
      repeatDelayMs: 150,
      repeatAcceleration: true,
      directionMode: 'dominant-axis',
      scrollAmountPx: 150,
      cursorSpeed: 800,
      cursorColor: '#e50914'
    },
    leftStick: {
      enabled: true,
      mode: 'cursor',
      deadzone: 0.3,
      scrollAmountPx: 150,
      cursorSpeed: 800,
      cursorColor: '#00a8e1'
    },
    axisMap: {
      up: { stick: 'right', direction: 'up', action: 'scroll_up' },
      down: { stick: 'right', direction: 'down', action: 'scroll_down' },
      left: { stick: 'right', direction: 'left', action: 'scroll_left' },
      right: { stick: 'right', direction: 'right', action: 'scroll_right' }
    },
    collectionGrid: {
      wrapRows: false,
      wrapItems: false,
      lateralPenalty: 3,
      rowOverlapThreshold: 0.5
    }
  };

  const ICON_STYLES = [
    { id: 'auto', name: 'Auto-detect', sub: 'Detect from connected controller', btns: ['?'] },
    { id: 'playstation', name: 'PlayStation (DualSense)', sub: '✕ and ○ Layout', btns: ['✕', '○'] },
    { id: 'xbox', name: 'Xbox (Series X/S)', sub: 'A and B Layout', btns: ['A', 'B'] },
    { id: 'nintendo', name: 'Nintendo (Switch)', sub: 'Inverted Layout', btns: ['A', 'B'] },
    { id: 'steamdeck', name: 'Steam Deck', sub: 'SteamOS Layout', btns: ['A', 'B'] },
    { id: 'retro8bitdo', name: '8BitDo FC30 / NES30', sub: 'Compact retro layout', btns: ['B', 'A'] },
    { id: 'n64', name: 'N64 (DragonRise)', sub: 'A, B & C-Pad Layout', btns: ['A', 'B'] }
  ];

  const CONTROLLER_STYLE_PATTERNS = [
    // Original FC30 USB mode. Match the complete VID/PID pair before names so
    // browser-supplied Xbox/generic suffixes cannot override the device model.
    { test: /\b1235[-:]ab11\b/, style: 'retro8bitdo' },
    { test: /8bitdo.*(?:fc30|nes30)(?![\s_-]*(?:pro|arcade))|(?:^|[-_\s])(?:fc30|nes30)(?![\s_-]*(?:pro|arcade))/, style: 'retro8bitdo' },
    { test: /steam deck|steam controller|valve software|028e.*11ff|28de.*11ff|28de-11ff|28de/, style: 'steamdeck' },
    { test: /0079.*0006|dragonrise|n64|dragon rise/, style: 'n64' },
    { test: /xbox|microsoft|xinput|generic x/, style: 'xbox' },
    { test: /dualsense|dualshock|sony|playstation|ps4|ps5/, style: 'playstation' },
    { test: /nintendo|switch|pro controller/, style: 'nintendo' }
  ];

  const ACTION_OPTIONS = [
    { value: 'none', label: '-- Unmapped --' },
    { value: 'click', label: 'Select / Click' },
    { value: 'back', label: 'Go Back' },
    { value: 'search', label: 'Open Search' },
    { value: 'fullscreen', label: 'Toggle Fullscreen' },
    { value: 'toggle_play', label: 'Play / Pause' },
    { value: 'scroll_up', label: 'Scroll Up' },
    { value: 'scroll_down', label: 'Scroll Down' },
    { value: 'scroll_left', label: 'Scroll Left' },
    { value: 'scroll_right', label: 'Scroll Right' },
    { value: 'focus_next', label: 'Focus Next Element' },
    { value: 'focus_prev', label: 'Focus Previous Element' },
    { value: 'toggle_hud', label: 'Toggle Navigation Guide' },
    { value: 'volume_up', label: 'Volume Up' },
    { value: 'volume_down', label: 'Volume Down' },
    { value: 'seek_forward', label: 'Seek Forward' },
    { value: 'seek_backward', label: 'Seek Backward' },
    { value: 'next_tab', label: 'Next Tab' },
    { value: 'prev_tab', label: 'Previous Tab' },
    { value: 'close_tab', label: 'Close Active Tab' },
    { value: 'open_options', label: 'Open Options Editor' },
    { value: 'nav_next_collection', label: '⬇ Next Row (Collection Nav)' },
    { value: 'nav_prev_collection', label: '⬆ Prev Row (Collection Nav)' },
    { value: 'nav_next_item', label: '➡ Next Item (Collection Nav)' },
    { value: 'nav_prev_item', label: '⬅ Prev Item (Collection Nav)' },
    { value: 'nav_up', label: 'Navigate Up' },
    { value: 'nav_down', label: 'Navigate Down' },
    { value: 'nav_left', label: 'Navigate Left' },
    { value: 'nav_right', label: 'Navigate Right' },
    { value: 'select', label: 'Select / Activate' },
    { value: 'back', label: 'Back / Cancel' },
    { value: 'prev_tab', label: 'Previous Tab' },
    { value: 'next_tab', label: 'Next Tab' },
    { value: 'focus_up', label: 'Focus Up' },
    { value: 'focus_down', label: 'Focus Down' },
    { value: 'focus_left', label: 'Focus Left' },
    { value: 'focus_right', label: 'Focus Right' },
    { value: 'click_element', label: 'Click CSS Element...' },
    { value: 'hover_element', label: 'Hover CSS Element...' },
    { value: 'focus_element', label: 'Focus CSS Element...' },
    { value: 'dom_action', label: 'Direct DOM Action...' },
    { value: 'press_key', label: 'Press Keyboard Key... (Legacy)' }
  ];

  const DOM_ACTION_LABELS = {
    click: 'Click',
    focus: 'Focus',
    scroll: 'Scroll to',
    'set-value': 'Set value',
    'toggle-attribute': 'Toggle attribute',
    'toggle-media': 'Play/Pause media'
  };

  const TOGGLEABLE_DOM_ATTRIBUTES = new Set([
    'hidden', 'disabled', 'open', 'checked', 'selected', 'muted', 'controls', 'loop', 'autoplay'
  ]);

  const BUTTON_NAMES = {
    '0': 'Cross (A)', '1': 'Circle (B)', '2': 'Square (X)', '3': 'Triangle (Y)',
    '4': 'L1 Bumper', '5': 'R1 Bumper', '6': 'L2 Trigger', '7': 'R2 Trigger',
    '8': 'Select Button', '9': 'Start Button', '10': 'L3 Click', '11': 'R3 Click',
    '12': 'D-Pad Up', '13': 'D-Pad Down', '14': 'D-Pad Left', '15': 'D-Pad Right'
  };

  const ACTION_LABEL_MAP = Object.fromEntries(ACTION_OPTIONS.map(option => [option.value, option.label]));
  const COLOR_PRESETS = ['#e50914', '#00a8e1', '#ff6b35', '#4caf50', '#9c27b0', '#ffeb3b', '#ffffff', '#000000', '#ff4081', '#00bcd4', '#8bc34a', '#ffc107'];
  const OPTIONS_NAV_REPEAT_MS = 350;

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.Constants = {
    RESERVED_OPTIONS_KEY,
    WEBSITE_MAPPINGS_DEFAULT,
    FRIENDLY_NAMES,
    OPTIONS_PAGE_PROFILE,
    RETRO_8BITDO_OPTIONS_PAGE_PROFILE,
    DEFAULT_PROFILE,
    RETRO_8BITDO_DEFAULT_PROFILE,
    DEFAULT_NAV_SETTINGS,
    ICON_STYLES,
    CONTROLLER_STYLE_PATTERNS,
    ACTION_OPTIONS,
    DOM_ACTION_LABELS,
    TOGGLEABLE_DOM_ATTRIBUTES,
    BUTTON_NAMES,
    ACTION_LABEL_MAP,
    COLOR_PRESETS,
    OPTIONS_NAV_REPEAT_MS
  };
})(typeof window !== 'undefined' ? window : globalThis);
