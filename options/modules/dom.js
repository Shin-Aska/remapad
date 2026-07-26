/**
 * Remapad Options — DOM Registry
 * MV3-compatible classic script; exposed via window.RemapadOptions.Dom.
 */

(function (global) {
  'use strict';

  function create() {
    const get = id => document.getElementById(id);
    const navAxisInputs = {
      up: { stick: get('nav-axis-up-stick'), action: get('nav-axis-up-action') },
      down: { stick: get('nav-axis-down-stick'), action: get('nav-axis-down-action') },
      left: { stick: get('nav-axis-left-stick'), action: get('nav-axis-left-action') },
      right: { stick: get('nav-axis-right-stick'), action: get('nav-axis-right-action') }
    };
    const directionMetaEls = {
      up: { assigned: get('nav-direction-assigned-up'), action: get('nav-direction-action-up') },
      down: { assigned: get('nav-direction-assigned-down'), action: get('nav-direction-action-down') },
      left: { assigned: get('nav-direction-assigned-left'), action: get('nav-direction-action-left') },
      right: { assigned: get('nav-direction-assigned-right'), action: get('nav-direction-action-right') }
    };

    return {
      muteActivationToggle: get('mute-activation-toggle'),
      editorSiteSelect: get('editor-site-select'),
      mappingsListEl: get('website-mappings-list'),
      iconStyleListEl: get('icon-style-list'),
      statusBadgeEl: get('status-badge'), statusDotEl: get('status-dot'), statusTextEl: get('status-text'),
      deviceNameEl: get('device-name'), deviceBatteryEl: get('device-battery'), batteryTextEl: get('battery-text'),
      resetBtn: get('reset-btn'), saveBtn: get('save-btn'),
      actionDropdown: get('action-dropdown'), actionSelect: get('action-select'),
      testInputBtn: get('test-input-btn'), toastEl: get('toast'), navControllerNameEl: get('nav-controller-name'),
      configModal: get('config-modal'), modalTitle: get('modal-title'), modalCloseX: get('modal-close-x'),
      modalKeyboardSec: get('modal-keyboard-sec'), keyboardCaptureBox: get('keyboard-capture-box'),
      detectedKeyDisplay: get('detected-key-display'), modalSelectorSec: get('modal-selector-sec'),
      modalDomActionSec: get('modal-dom-action-sec'), commonSelectorsSelect: get('common-selectors-select'),
      customSelectorInput: get('custom-selector-input'), domOperationSelect: get('dom-operation-select'),
      domValueGroup: get('dom-value-group'), domValueLabel: get('dom-value-label'), domValueInput: get('dom-value-input'),
      modalCancelBtn: get('modal-cancel-btn'), modalConfirmBtn: get('modal-confirm-btn'),
      newSiteInput: get('new-site-input'), addSiteBtn: get('add-site-btn'),
      navEnabledInput: get('nav-enabled'), navStrategyInput: get('nav-strategy'),
      navRightEnabled: get('nav-right-enabled'), navRightMode: get('nav-right-mode'),
      navRightDeadzone: get('nav-right-deadzone'), navRightDeadzoneVal: get('nav-right-deadzone-val'),
      navRightRepeatDelay: get('nav-right-repeat-delay'), navRightRepeatDelayVal: get('nav-right-repeat-delay-val'),
      navRightCursorSpeed: get('nav-right-cursor-speed'), navRightCursorSpeedVal: get('nav-right-cursor-speed-val'),
      navRightScrollAmount: get('nav-right-scroll-amount'), navRightScrollAmountVal: get('nav-right-scroll-amount-val'),
      navRightAccel: get('nav-right-accel'), navRightDirectionMode: get('nav-right-direction-mode'),
      navLeftEnabled: get('nav-left-enabled'), navLeftMode: get('nav-left-mode'),
      navLeftDeadzone: get('nav-left-deadzone'), navLeftDeadzoneVal: get('nav-left-deadzone-val'),
      navLeftScrollAmount: get('nav-left-scroll-amount'), navLeftScrollAmountVal: get('nav-left-scroll-amount-val'),
      navLeftCursorSpeed: get('nav-left-cursor-speed'), navLeftCursorSpeedVal: get('nav-left-cursor-speed-val'),
      navLeftRepeatDelay: get('nav-left-repeat-delay'), navLeftRepeatDelayVal: get('nav-left-repeat-delay-val'),
      navLeftDirectionMode: get('nav-left-direction-mode'), navRightCursorColor: get('nav-right-cursor-color'),
      navLeftCursorColor: get('nav-left-cursor-color'), navAxisInputs,
      navWrapRows: get('nav-wrap-rows'), navWrapItems: get('nav-wrap-items'),
      navLateralPenalty: get('nav-lateral-penalty'), navLateralPenaltyVal: get('nav-lateral-penalty-val'),
      navRowOverlap: get('nav-row-overlap'), navRowOverlapVal: get('nav-row-overlap-val'),
      navSaveBtn: get('nav-save-btn'), navResetBtn: get('nav-reset-btn'),
      navStatusName: get('nav-status-name'), navStatusBadge: get('nav-status-badge'),
      navStatusDot: get('nav-status-dot'), navStatusText: get('nav-status-text'),
      leftStickDot: get('left-stick-dot'), leftStickDeadzone: get('left-stick-deadzone'),
      leftAxisX: get('left-axis-x'), leftAxisY: get('left-axis-y'),
      leftAxisXBottom: get('left-axis-x-bottom'), leftAxisYBottom: get('left-axis-y-bottom'),
      rightStickDot: get('right-stick-dot'), rightStickDeadzone: get('right-stick-deadzone'),
      rightAxisX: get('right-axis-x'), rightAxisY: get('right-axis-y'),
      rightAxisXBottom: get('right-axis-x-bottom'), rightAxisYBottom: get('right-axis-y-bottom'),
      directionMetaEls,
      gamepadSelectOverlay: get('gamepad-select-overlay'),
      keyboardLayoutSelect: get('keyboard-layout-select'), keyboardAutodetectToggle: get('keyboard-autodetect-toggle'),
      keyboardEnabledToggle: get('keyboard-enabled-toggle'), keyboardTriggerModeSelect: get('keyboard-trigger-mode-select'),
      keyboardTriggerSelectorsSave: get('keyboard-trigger-selectors-save'),
      collectionAddSiteBtn: get('collection-add-site-btn'), collectionNewSiteInput: get('collection-new-site-input'),
      collectionSaveAllBtn: get('cnav-save-all-btn')
    };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.Dom = { create };
})(typeof window !== 'undefined' ? window : globalThis);
