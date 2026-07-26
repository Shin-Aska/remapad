/**
 * Remapad Content Script — Shared Constants
 * MV3-compatible classic script; exposed via window.RemapadCS.Constants.
 * Default timings, profiles, glyph maps, DOM action allow-lists, and site
 * selectors used across the content-script modules.
 */

(function (global) {
  'use strict';

  const POLL_INTERVAL_MS = 50;
  const DEADZONE = 0.3;
  const AXIS_REPEAT_DELAY_MS = 150;
  const CURSOR_SPEED_PX_PER_SEC = 360;
  const MAX_DOM_ACTION_PAYLOAD_LENGTH = 12000;

  const DEFAULT_NAV_SETTINGS = {
    enabled: true,
    strategy: 'auto', // 'auto' | 'spatial' | 'collection' | 'dom-order'
    rightStick: {
      enabled: true,
      mode: 'scroll', // 'cursor' | 'navigate' | 'scroll' | 'disabled'
      deadzone: 0.3,
      repeatDelayMs: 150,
      repeatAcceleration: true,
      directionMode: 'dominant-axis', // 'dominant-axis' | '8-way'
      scrollAmountPx: 150,
      cursorSpeed: 800,
      cursorColor: '#e50914'
    },
    leftStick: {
      enabled: true,
      mode: 'cursor', // 'scroll' | 'navigate' | 'cursor' | 'disabled'
      deadzone: 0.3,
      scrollAmountPx: 150,
      cursorSpeed: 800,
      cursorColor: '#00a8e1'
    },
    axisMap: {
      up:    { stick: 'right', direction: 'up',    action: 'scroll_up' },
      down:  { stick: 'right', direction: 'down',  action: 'scroll_down' },
      left:  { stick: 'right', direction: 'left',  action: 'scroll_left' },
      right: { stick: 'right', direction: 'right', action: 'scroll_right' }
    },
    collectionGrid: {
      wrapRows: false,
      wrapItems: false,
      lateralPenalty: 3,
      rowOverlapThreshold: 0.5
    }
  };

  const DEFAULT_PROFILE = {
    '0': 'click',          // A / Cross
    '1': 'back',           // B / Circle
    '2': 'fullscreen',     // X / Square
    '3': 'search',         // Y / Triangle
    '4': 'seek_backward',  // L1
    '5': 'seek_forward',   // R1
    '6': 'volume_down',    // L2
    '7': 'volume_up',      // R2
    '8': 'toggle_play',    // Select
    '9': 'toggle_hud',     // Start
    '10': 'none',          // L3 Click
    '11': 'none',          // R3 Click
    '12': 'scroll_up',     // D-Pad Up
    '13': 'scroll_down',   // D-Pad Down
    '14': 'scroll_left',   // D-Pad Left
    '15': 'scroll_right'   // D-Pad Right
  };

  const GLYPHS = {
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
    }
  };

  const ACTION_LABELS = {
    click: 'Select',
    back: 'Back',
    search: 'Open Search',
    fullscreen: 'Fullscreen',
    toggle_play: 'Play/Pause',
    scroll_up: 'Scroll Up',
    scroll_down: 'Scroll Down',
    scroll_left: 'Scroll Left',
    scroll_right: 'Scroll Right',
    volume_up: 'Volume Up',
    volume_down: 'Volume Down',
    seek_forward: 'Forward',
    seek_backward: 'Rewind',
    open_options: 'Options',
    next_tab: 'Next Tab',
    prev_tab: 'Prev Tab',
    close_tab: 'Close Tab',
    focus_next: 'Focus Next',
    focus_prev: 'Focus Previous',
    toggle_hud: 'Toggle Navigation Guide',
    dom_action: 'DOM Action',
    nav_next_collection: 'Next Row',
    nav_prev_collection: 'Prev Row',
    nav_next_item: 'Next Item',
    nav_prev_item: 'Prev Item',
    nav_up: 'Navigate Up',
    nav_down: 'Navigate Down',
    nav_left: 'Navigate Left',
    nav_right: 'Navigate Right'
  };

  const DOM_ACTION_OPERATIONS = new Set([
    'click',
    'focus',
    'scroll',
    'set-value',
    'toggle-attribute',
    'toggle-media'
  ]);

  const TOGGLEABLE_DOM_ATTRIBUTES = new Set([
    'hidden',
    'disabled',
    'open',
    'checked',
    'selected',
    'muted',
    'controls',
    'loop',
    'autoplay'
  ]);

  const SITE_SEARCH_CONFIGS = {
    'youtube.com': {
      inputSelector: '#search-input input, input#search'
    },
    'netflix.com': {
      triggerSelector: '.searchTab, [data-uia="search-tab"]',
      inputSelector: 'input[type="search"], input[data-uia*="search" i]'
    },
    'primevideo.com': {
      triggerSelector: 'button[aria-label*="search" i], [data-testid*="search" i][role="button"]',
      inputSelector: '[data-testid="search-field"] input, .nav-search-field input, input[type="search"]'
    },
    'twitch.tv': {
      inputSelector: '[data-a-target="search-input"]'
    },
    'disneyplus.com': {
      triggerSelector: '[data-testid="search-icon"], button[aria-label*="search" i]',
      inputSelector: 'input[type="search"], [role="searchbox"]'
    },
    'hulu.com': {
      inputSelector: '.NavSearch-searchInput, input[placeholder*="Search" i]'
    },
    'max.com': {
      triggerSelector: 'button[aria-label*="search" i]',
      inputSelector: '[data-testid="search-bar-input"], input[type="search"]'
    }
  };

  const FULLSCREEN_CONTROL_SELECTOR = [
    '[data-uia="control-fullscreen-enter"]',
    '[data-uia="control-fullscreen-exit"]',
    '[data-uia*="fullscreen" i]',
    '[data-testid="player-fullscreen-button"]',
    '[data-testid*="fullscreen" i]',
    '[data-testid*="full-screen" i]',
    '[data-a-target="player-fullscreen-button"]',
    '[data-a-target*="fullscreen" i]',
    '.ytp-fullscreen-button',
    '.ff-fullscreen-button',
    '.fullscreen-button',
    '.button-fullscreen',
    'button.fullscreen',
    '[aria-label*="fullscreen" i]',
    '[aria-label*="full screen" i]',
    '[aria-label*="Full screen" i]',
    '[title*="fullscreen" i]',
    '[title*="full screen" i]',
    '.vjs-fullscreen-control',
    '.jw-icon-fullscreen',
    '.media-control-input[data-fullscreen]'
  ].join(', ');

  const WEBSITE_MAPPINGS_DEFAULT = {
    'netflix.com':    { ...DEFAULT_PROFILE },
    'primevideo.com': { ...DEFAULT_PROFILE }
  };

  const SITE_COLLECTIONS_DEFAULT = {
    'netflix.com': {
      containerSelector: '.lolomoRow',
      itemSelector: '.title-card-container',
      searchTriggerSelector: '.searchTab, [data-uia="search-tab"]',
      searchInputSelector: 'input[type="search"], input[data-uia*="search" i]'
    },
    'primevideo.com': {
      containerSelector: '[data-testid="grid-lockup"], ._1h3rtFr, .wv_A6',
      itemSelector: '[data-testid="card"], ._1t8qyG2, .P2TLe',
      searchTriggerSelector: 'button[aria-label*="search" i], [data-testid*="search" i][role="button"]',
      searchInputSelector: '[data-testid="search-field"] input, .nav-search-field input, input[type="search"]'
    }
  };

  const CONTROLLER_STYLE_PATTERNS = [
    { test: /xbox|microsoft|xinput|generic x/, style: 'xbox' },
    { test: /dualsense|dualshock|sony|playstation|ps4|ps5/, style: 'playstation' },
    { test: /nintendo|switch|pro controller/, style: 'nintendo' }
  ];

  const Constants = {
    POLL_INTERVAL_MS,
    DEADZONE,
    AXIS_REPEAT_DELAY_MS,
    CURSOR_SPEED_PX_PER_SEC,
    MAX_DOM_ACTION_PAYLOAD_LENGTH,
    DEFAULT_NAV_SETTINGS,
    DEFAULT_PROFILE,
    GLYPHS,
    ACTION_LABELS,
    DOM_ACTION_OPERATIONS,
    TOGGLEABLE_DOM_ATTRIBUTES,
    SITE_SEARCH_CONFIGS,
    FULLSCREEN_CONTROL_SELECTOR,
    WEBSITE_MAPPINGS_DEFAULT,
    SITE_COLLECTIONS_DEFAULT,
    CONTROLLER_STYLE_PATTERNS
  };

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.Constants = Constants;
})(typeof window !== 'undefined' ? window : globalThis);
