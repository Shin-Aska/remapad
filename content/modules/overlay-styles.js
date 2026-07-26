/**
 * Remapad — Shared Overlay Styles
 * MV3-compatible classic script; exposed via window.RemapadCS.OverlayStyles.
 * Single idempotent stylesheet injected into the page head. It carries CSS for
 * the HUD, tutorial, Quick Map, collection HUD/navigation/focus styles, and autoplay
 * warning. Removal is owned by aggregate teardown only.
 */

(function (global) {
  'use strict';

  function create() {
    let styleElement = null;

    function inject() {
      if (styleElement) return;

      styleElement = document.createElement('style');
      styleElement.textContent = `
       .remapad-hud-container {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(120px);
        z-index: 2147483647;
        background: rgba(19, 19, 19, 0.85) !important;
        backdrop-filter: blur(16px) !important;
        -webkit-backdrop-filter: blur(16px) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
        border-radius: 9999px !important;
         width: calc(100vw - 32px) !important;
         box-sizing: border-box !important;
         padding: 12px 16px !important;
         display: grid !important;
         grid-template-columns: minmax(0, 1fr) auto auto !important;
         align-items: center !important;
         gap: 16px !important;
         max-width: calc(100vw - 32px) !important;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7) !important;
        transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease !important;
        opacity: 0;
        pointer-events: none;
        user-select: none !important;
        font-family: 'Geist', 'Inter', -apple-system, sans-serif !important;
      }
      .remapad-hud-container.visible {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
        pointer-events: auto;
      }
       .remapad-hud-item {
         display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        color: #e5e2e1 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        letter-spacing: 0.03em !important;
         text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
       }
       .remapad-hud-sticks {
         display: flex !important;
         align-items: center !important;
         gap: 12px !important;
         padding-left: 12px !important;
         border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
       }
       .remapad-hud-stick {
         display: flex !important;
         align-items: center !important;
         gap: 8px !important;
         color: #e5e2e1 !important;
         font-size: 13px !important;
         font-weight: 600 !important;
         letter-spacing: 0.03em !important;
         text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
         white-space: nowrap !important;
       }
       .remapad-hud-row {
         display: flex !important;
         align-items: center !important;
         gap: 16px !important;
         overflow-x: auto !important;
          flex: 1 1 auto !important;
          max-width: none !important;
          min-width: 0 !important;
          width: 100% !important;
         scrollbar-width: none !important;
       }
       .remapad-hud-row::-webkit-scrollbar { display: none !important; }
        .remapad-hud-item--unmapped { opacity: 0.4 !important; }
         .remapad-hud-item.highlighted,
         .remapad-hud-stick.highlighted,
         .remapad-hud-edit.highlighted {
           background: rgba(229, 9, 20, 0.25) !important;
           outline: 2px solid #e50914 !important;
           outline-offset: 4px !important;
           border-radius: 4px !important;
           box-shadow: 0 0 10px rgba(229, 9, 20, 0.5) !important;
         }
      .remapad-hud-glyph {
        width: 20px !important;
        height: 20px !important;
        border-radius: 50% !important;
        background: #393939 !important;
        border: 1px solid rgba(255, 255, 255, 0.15) !important;
        color: #fff !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-size: 10px !important;
        font-weight: 800 !important;
      }
      .remapad-hud-label {
        font-size: 12px !important;
        font-weight: 600 !important;
        color: #e9bcb6 !important;
      }
      .remapad-hud-close {
        cursor: pointer !important;
        color: rgba(255, 255, 255, 0.4) !important;
        font-size: 16px !important;
        font-weight: bold !important;
        padding-left: 8px !important;
        border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
         transition: color 0.2s !important;
         pointer-events: auto !important;
          background: transparent !important;
          border: 0 !important;
          flex: 0 0 auto !important;
      }
      .remapad-hud-close:hover {
        color: #ffb4ab !important;
      }
       .remapad-hover {
        outline: 3px solid #00a8e1 !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 12px rgba(0, 168, 225, 0.7) !important;
        transition: outline 0.15s ease, box-shadow 0.15s ease !important;
       }
       .remapad-controller-focus {
         outline: 3px solid #00a8e1 !important;
         outline-offset: 3px !important;
         box-shadow: 0 0 12px rgba(0, 168, 225, 0.7) !important;
       }
       .remapad-hud-edit {
         border: 0 !important;
         border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
         background: transparent !important;
         color: #00a8e1 !important;
         cursor: pointer !important;
         font: inherit !important;
         font-size: 12px !important;
          font-weight: 700 !important;
          padding: 4px 0 4px 16px !important;
           flex: 0 0 auto !important;
        }
       .remapad-quick-map {
         --remapad-surface: rgba(30, 30, 30, 0.88);
         --remapad-surface-high: #353534;
         --remapad-on-surface: #e5e2e1;
         --remapad-on-surface-variant: #e9bcb6;
         --remapad-primary: #e50914;
         --remapad-secondary: #00a7df;
         position: fixed !important;
         right: 24px !important;
         bottom: 24px !important;
         z-index: 2147483647 !important;
         width: min(360px, calc(100vw - 32px)) !important;
         box-sizing: border-box !important;
         padding: 24px !important;
         background: var(--remapad-surface) !important;
         color: var(--remapad-on-surface) !important;
         backdrop-filter: blur(16px) !important;
         -webkit-backdrop-filter: blur(16px) !important;
         border: 1px solid rgba(255, 255, 255, 0.08) !important;
         border-radius: 16px !important;
         box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7) !important;
         font-family: 'Geist', 'Inter', -apple-system, sans-serif !important;
       }
       .remapad-quick-map *, .remapad-quick-map *::before, .remapad-quick-map *::after {
         box-sizing: border-box !important;
       }
       .remapad-quick-map-header, .remapad-quick-map-footer {
         display: flex !important;
         align-items: center !important;
         justify-content: space-between !important;
         gap: 12px !important;
       }
       .remapad-quick-map-header { align-items: flex-start !important; }
       .remapad-quick-map-kicker {
         margin: 0 0 4px !important;
         color: var(--remapad-on-surface-variant) !important;
         font-family: 'Geist', Consolas, monospace !important;
         font-size: 10px !important;
         font-weight: 700 !important;
         letter-spacing: 0.08em !important;
       }
       .remapad-quick-map h2 {
         margin: 0 !important;
         color: var(--remapad-on-surface) !important;
         font-size: 18px !important;
         font-weight: 700 !important;
         line-height: 24px !important;
       }
       .remapad-quick-map-close {
         width: 32px !important;
         height: 32px !important;
         padding: 0 !important;
         border: 0 !important;
         border-radius: 9999px !important;
         background: transparent !important;
         color: var(--remapad-on-surface-variant) !important;
         cursor: pointer !important;
         font: 24px/1 sans-serif !important;
       }
       .remapad-quick-map-close:hover, .remapad-quick-map-close:focus-visible {
         background: var(--remapad-surface-high) !important;
         color: var(--remapad-on-surface) !important;
       }
       .remapad-quick-map-body {
         min-height: 84px !important;
         padding: 24px 0 !important;
       }
       .remapad-quick-map-instruction, .remapad-quick-map-hint, .remapad-quick-map-live {
         margin: 0 !important;
         line-height: 20px !important;
       }
       .remapad-quick-map-instruction {
         color: var(--remapad-on-surface) !important;
         font-size: 14px !important;
       }
       .remapad-quick-map-hint, .remapad-quick-map-live {
         margin-top: 8px !important;
         color: var(--remapad-on-surface-variant) !important;
         font-size: 12px !important;
       }
       .remapad-quick-map-button {
         display: inline-flex !important;
         align-items: center !important;
         justify-content: center !important;
         min-width: 24px !important;
         height: 24px !important;
         margin-right: 4px !important;
         padding: 0 4px !important;
         border: 1px solid rgba(255, 255, 255, 0.15) !important;
         border-radius: 9999px !important;
         background: var(--remapad-surface-high) !important;
         color: #fff !important;
         font-family: 'Geist', Consolas, monospace !important;
         font-size: 11px !important;
         font-weight: 800 !important;
         vertical-align: middle !important;
       }
       .remapad-quick-map-actions {
         display: grid !important;
         grid-template-columns: repeat(3, 1fr) !important;
         gap: 8px !important;
       }
       .remapad-quick-map-action, .remapad-quick-map-cancel, .remapad-quick-map-save {
         min-height: 36px !important;
         border-radius: 8px !important;
         font-family: 'Geist', Consolas, monospace !important;
         font-size: 12px !important;
         font-weight: 700 !important;
         cursor: pointer !important;
       }
       .remapad-quick-map-action, .remapad-quick-map-cancel {
         border: 1px solid rgba(255, 255, 255, 0.1) !important;
         background: var(--remapad-surface-high) !important;
         color: var(--remapad-on-surface) !important;
       }
       .remapad-quick-map-action:hover, .remapad-quick-map-action:focus-visible,
       .remapad-quick-map-cancel:hover, .remapad-quick-map-cancel:focus-visible {
         border-color: var(--remapad-secondary) !important;
         box-shadow: 0 0 12px rgba(0, 167, 223, 0.35) !important;
       }
       .remapad-quick-map-selector {
         display: block !important;
         max-height: 60px !important;
         overflow: auto !important;
         padding: 8px !important;
         border: 1px solid rgba(255, 255, 255, 0.08) !important;
         border-radius: 4px !important;
         background: rgba(14, 14, 14, 0.9) !important;
         color: var(--remapad-on-surface-variant) !important;
         font: 11px/16px 'Geist', Consolas, monospace !important;
         white-space: pre-wrap !important;
         word-break: break-all !important;
       }
       .remapad-quick-map-footer {
         padding-top: 12px !important;
         border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
       }
       .remapad-quick-map-save {
         min-width: 84px !important;
         border: 0 !important;
         background: var(--remapad-primary) !important;
         color: #fff7f6 !important;
       }
       .remapad-quick-map-save:hover, .remapad-quick-map-save:focus-visible { filter: brightness(1.12) !important; }
       .remapad-quick-map-save:disabled {
         cursor: not-allowed !important;
         opacity: 0.45 !important;
       }
       .remapad-picker-target {
           outline: 3px solid #00a8e1 !important;
          outline-offset: 3px !important;
          box-shadow: 0 0 12px rgba(0, 167, 223, 0.7) !important;
        }
        .remapad-tutorial {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483647 !important;
          display: grid !important;
          place-items: center !important;
          box-sizing: border-box !important;
          padding: 24px !important;
          background: rgba(0, 0, 0, 0.68) !important;
          backdrop-filter: blur(8px) !important;
          -webkit-backdrop-filter: blur(8px) !important;
          font-family: 'Geist', 'Inter', -apple-system, sans-serif !important;
        }
        .remapad-tutorial *, .remapad-tutorial *::before, .remapad-tutorial *::after {
          box-sizing: border-box !important;
        }
        .remapad-tutorial-card {
          position: relative !important;
          width: min(520px, 100%) !important;
          min-height: 440px !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          padding: 44px 44px 28px !important;
          overflow: hidden !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          border-radius: 24px !important;
          background: rgba(18, 18, 18, 0.97) !important;
          color: #f7f2f1 !important;
          box-shadow: 0 28px 80px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(229, 9, 20, 0.12) !important;
          text-align: center !important;
        }
        .remapad-tutorial-skip {
          position: absolute !important;
          top: 18px !important;
          right: 20px !important;
          border: 0 !important;
          background: transparent !important;
          color: rgba(255, 255, 255, 0.58) !important;
          font: 600 12px/20px 'Geist', 'Inter', sans-serif !important;
          cursor: pointer !important;
        }
        .remapad-tutorial-visual {
          height: 112px !important;
          display: grid !important;
          place-items: center !important;
          margin-bottom: 18px !important;
          color: #fff !important;
        }
        .remapad-tutorial-visual--activation {
          width: 100% !important;
          height: 158px !important;
          margin-bottom: 8px !important;
        }
        .remapad-tutorial-activation {
          width: min(420px, 100%) !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 9px !important;
          text-align: left !important;
        }
        .remapad-tutorial-activation > label,
        .remapad-tutorial-activation-row > label {
          display: flex !important;
          flex-direction: column !important;
          gap: 5px !important;
          color: rgba(255, 255, 255, 0.58) !important;
          font-size: 10px !important;
          font-weight: 700 !important;
          letter-spacing: 0.04em !important;
          text-transform: uppercase !important;
        }
        .remapad-tutorial-activation select {
          width: 100% !important;
          height: 36px !important;
          padding: 0 34px 0 11px !important;
          border: 1px solid rgba(255, 255, 255, 0.13) !important;
          border-radius: 9px !important;
          background: #303030 !important;
          color: #fff !important;
          font: 650 12px/1 'Geist', 'Inter', sans-serif !important;
          cursor: pointer !important;
          outline: none !important;
        }
        .remapad-tutorial-activation select:focus-visible,
        .remapad-tutorial-activation button:focus-visible,
        .remapad-tutorial-activation input:focus-visible {
          outline: 2px solid #00a8e1 !important;
          outline-offset: 2px !important;
        }
        .remapad-tutorial-activation-row {
          display: grid !important;
          grid-template-columns: 104px 1fr !important;
          align-items: end !important;
          gap: 12px !important;
        }
        .remapad-tutorial-activation-row button {
          height: 34px !important;
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          border-radius: 9px !important;
          background: #303030 !important;
          color: #fff !important;
          font: 700 11px/1 'Geist', 'Inter', sans-serif !important;
          cursor: pointer !important;
        }
        .remapad-tutorial-activation-row button:disabled {
          cursor: not-allowed !important;
          opacity: 0.4 !important;
        }
        .remapad-tutorial-activation-row label > span {
          display: flex !important;
          justify-content: space-between !important;
        }
        .remapad-tutorial-activation-row output {
          color: #ff8a86 !important;
        }
        .remapad-tutorial-activation input[type="range"] {
          width: 100% !important;
          height: 5px !important;
          margin: 9px 0 7px !important;
          accent-color: #e50914 !important;
          cursor: pointer !important;
        }
        .remapad-tutorial-activation-status {
          min-height: 14px !important;
          margin: 0 !important;
          color: rgba(255, 255, 255, 0.46) !important;
          font-size: 10px !important;
          line-height: 14px !important;
          text-align: center !important;
        }
        .remapad-tutorial-action-icon {
          width: 88px !important;
          height: 88px !important;
          display: grid !important;
          place-items: center !important;
          border: 2px solid rgba(229, 9, 20, 0.72) !important;
          border-radius: 50% !important;
          background: rgba(229, 9, 20, 0.14) !important;
          box-shadow: 0 0 40px rgba(229, 9, 20, 0.24) !important;
          font-size: 40px !important;
        }
        .remapad-tutorial-sticks {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 54px !important;
        }
        .remapad-tutorial-sticks span {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 8px !important;
        }
        .remapad-tutorial-sticks i {
          width: 68px !important;
          height: 68px !important;
          display: grid !important;
          place-items: center !important;
          border: 2px solid rgba(229, 9, 20, 0.72) !important;
          border-radius: 50% !important;
          background: radial-gradient(circle, #3b3b3b 0 42%, #242424 44% 100%) !important;
          box-shadow: 0 0 32px rgba(229, 9, 20, 0.18) !important;
          font: normal 800 15px/1 'Geist', sans-serif !important;
        }
        .remapad-tutorial-sticks strong {
          color: rgba(255, 255, 255, 0.72) !important;
          font-size: 11px !important;
        }
        .remapad-tutorial-mappings {
          width: min(420px, 100%) !important;
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 10px !important;
        }
        .remapad-tutorial-mapping {
          min-width: 0 !important;
          display: flex !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 10px 12px !important;
          border: 1px solid rgba(255, 255, 255, 0.09) !important;
          border-radius: 12px !important;
          background: rgba(255, 255, 255, 0.045) !important;
          text-align: left !important;
        }
        .remapad-tutorial-mapping kbd {
          width: 30px !important;
          height: 30px !important;
          padding: 0 !important;
          flex: 0 0 30px !important;
          align-items: center !important;
          border-color: rgba(229, 9, 20, 0.55) !important;
        }
        .remapad-tutorial-mapping span {
          overflow: hidden !important;
          color: rgba(255, 255, 255, 0.82) !important;
          font-size: 11px !important;
          font-weight: 650 !important;
          line-height: 15px !important;
          text-overflow: ellipsis !important;
        }
        .remapad-tutorial-layouts {
          width: min(390px, 100%) !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 8px !important;
        }
        .remapad-tutorial-layouts span {
          display: grid !important;
          grid-template-columns: minmax(94px, 1fr) repeat(4, 30px) !important;
          align-items: center !important;
          gap: 7px !important;
          text-align: left !important;
        }
        .remapad-tutorial-layouts strong {
          color: rgba(255, 255, 255, 0.65) !important;
          font-size: 11px !important;
        }
        .remapad-tutorial-layouts i {
          width: 28px !important;
          height: 28px !important;
          display: grid !important;
          place-items: center !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
          border-radius: 50% !important;
          background: #343434 !important;
          color: #fff !important;
          font: normal 800 11px/1 'Geist', sans-serif !important;
        }
        .remapad-tutorial-edit-flow {
          width: min(430px, 100%) !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 12px !important;
        }
        .remapad-tutorial-edit-flow span {
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          gap: 7px !important;
        }
        .remapad-tutorial-edit-flow kbd {
          min-width: 48px !important;
          min-height: 34px !important;
          align-items: center !important;
        }
        .remapad-tutorial-edit-flow small {
          color: rgba(255, 255, 255, 0.55) !important;
          font-size: 9px !important;
          white-space: nowrap !important;
        }
        .remapad-tutorial-edit-flow b {
          color: rgba(255, 255, 255, 0.24) !important;
          font-size: 18px !important;
        }
        .remapad-tutorial-dpad {
          width: 104px !important;
          display: grid !important;
          grid-template-columns: repeat(3, 32px) !important;
          grid-template-rows: repeat(3, 32px) !important;
          gap: 4px !important;
        }
        .remapad-tutorial-dpad i {
          display: grid !important;
          place-items: center !important;
          border-radius: 8px !important;
          background: #343434 !important;
          color: #fff !important;
          font: normal 700 16px/1 sans-serif !important;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1) !important;
        }
        .remapad-tutorial-dpad i:nth-child(1) { grid-column: 2 !important; }
        .remapad-tutorial-dpad i:nth-child(2) { grid-column: 1 !important; grid-row: 2 !important; }
        .remapad-tutorial-dpad i:nth-child(3) { grid-column: 2 !important; grid-row: 2 !important; color: #e50914 !important; }
        .remapad-tutorial-dpad i:nth-child(4) { grid-column: 3 !important; grid-row: 2 !important; }
        .remapad-tutorial-dpad i:nth-child(5) { grid-column: 2 !important; grid-row: 3 !important; }
        .remapad-tutorial-eyebrow {
          margin: 0 0 8px !important;
          color: #ff8a86 !important;
          font: 700 11px/16px 'Geist', Consolas, monospace !important;
          letter-spacing: 0.1em !important;
          text-transform: uppercase !important;
        }
        .remapad-tutorial h2 {
          margin: 0 !important;
          color: #fff !important;
          font-size: 25px !important;
          line-height: 32px !important;
          font-weight: 750 !important;
        }
        .remapad-tutorial-copy {
          min-height: 72px !important;
          margin: 12px 0 22px !important;
          color: rgba(255, 255, 255, 0.7) !important;
          font-size: 14px !important;
          line-height: 24px !important;
        }
        .remapad-tutorial kbd {
          min-width: 24px !important;
          display: inline-flex !important;
          justify-content: center !important;
          padding: 2px 7px !important;
          border: 1px solid rgba(255, 255, 255, 0.18) !important;
          border-radius: 999px !important;
          background: #343434 !important;
          color: #fff !important;
          font: 750 11px/18px 'Geist', Consolas, monospace !important;
          box-shadow: none !important;
        }
        .remapad-tutorial-controls {
          width: 100% !important;
          display: grid !important;
          grid-template-columns: 84px 1fr 84px !important;
          align-items: center !important;
          gap: 12px !important;
        }
        .remapad-tutorial-back, .remapad-tutorial-next {
          height: 38px !important;
          border-radius: 10px !important;
          font: 700 12px/1 'Geist', 'Inter', sans-serif !important;
          cursor: pointer !important;
        }
        .remapad-tutorial-back {
          border: 1px solid rgba(255, 255, 255, 0.12) !important;
          background: #2d2d2d !important;
          color: #fff !important;
        }
        .remapad-tutorial-back:disabled { opacity: 0 !important; pointer-events: none !important; }
        .remapad-tutorial-next {
          border: 0 !important;
          background: #e50914 !important;
          color: #fff !important;
        }
        .remapad-tutorial-back:focus-visible, .remapad-tutorial-next:focus-visible,
        .remapad-tutorial-skip:focus-visible, .remapad-tutorial-dot:focus-visible {
          outline: 2px solid #00a8e1 !important;
          outline-offset: 3px !important;
        }
        .remapad-tutorial-dots {
          display: flex !important;
          justify-content: center !important;
          gap: 8px !important;
        }
        .remapad-tutorial-dot {
          width: 8px !important;
          height: 8px !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 50% !important;
          background: rgba(255, 255, 255, 0.22) !important;
          cursor: pointer !important;
        }
        .remapad-tutorial-dot.active {
          width: 22px !important;
          border-radius: 999px !important;
          background: #e50914 !important;
        }
        .remapad-tutorial-gamepad-hint {
          margin: 18px 0 0 !important;
          color: rgba(255, 255, 255, 0.38) !important;
          font: 600 10px/16px 'Geist', Consolas, monospace !important;
          letter-spacing: 0.03em !important;
        }
        @media (max-width: 560px), (max-height: 560px) {
          .remapad-tutorial { padding: 12px !important; }
          .remapad-tutorial-card { min-height: 0 !important; padding: 34px 24px 20px !important; }
          .remapad-tutorial-visual { height: 80px !important; margin-bottom: 10px !important; transform: scale(0.78) !important; }
          .remapad-tutorial-visual--activation { height: 132px !important; margin-bottom: 4px !important; transform: scale(0.88) !important; }
          .remapad-tutorial-copy { min-height: 0 !important; margin-bottom: 14px !important; }
          .remapad-tutorial-gamepad-hint { margin-top: 12px !important; }
          .remapad-tutorial-sticks { gap: 34px !important; }
          .remapad-tutorial-edit-flow { gap: 7px !important; }
          .remapad-tutorial-edit-flow b { display: none !important; }
        }
        .remapad-active-collection {
          outline: 2px solid rgba(229, 9, 20, 0.7) !important;
          outline-offset: 4px !important;
          box-shadow: 0 0 0 4px rgba(229, 9, 20, 0.12), 0 0 20px rgba(229, 9, 20, 0.25) !important;
          border-radius: 4px !important;
          transition: outline 0.2s ease, box-shadow 0.2s ease !important;
        }
         .remapad-cnav-hud {
           position: fixed !important;
           top: 20px !important;
           left: 50% !important;
           transform: translateX(-50%) translateY(-110%) !important;
           z-index: 2147483647 !important;
           background: rgba(16, 16, 16, 0.92) !important;
           backdrop-filter: blur(20px) !important;
           -webkit-backdrop-filter: blur(20px) !important;
           border: 1px solid rgba(255, 255, 255, 0.1) !important;
           border-radius: 9999px !important;
           padding: 10px 20px !important;
           display: flex !important;
           align-items: center !important;
           justify-content: space-between !important;
           gap: 20px !important;
           min-width: 280px !important;
           max-width: calc(100vw - 48px) !important;
           box-sizing: border-box !important;
           box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(229, 9, 20, 0.15) !important;
           font-family: 'Geist', 'Inter', -apple-system, sans-serif !important;
           transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease !important;
           opacity: 0 !important;
           pointer-events: none !important;
           user-select: none !important;
         }
         .remapad-cnav-hud.visible {
           transform: translateX(-50%) translateY(0) !important;
           opacity: 1 !important;
         }
         .remapad-cnav-left {
           display: flex !important;
           align-items: center !important;
           gap: 10px !important;
           overflow: hidden !important;
           min-width: 0 !important;
         }
         .remapad-cnav-right {
           display: flex !important;
           align-items: center !important;
           gap: 10px !important;
           flex-shrink: 0 !important;
         }
         .remapad-cnav-icon {
           width: 14px !important;
           height: 14px !important;
           color: rgba(229, 9, 20, 0.9) !important;
           flex-shrink: 0 !important;
         }
         .remapad-cnav-pos {
           font-size: 13px !important;
           font-weight: 700 !important;
           color: #fff !important;
           white-space: nowrap !important;
           flex-shrink: 0 !important;
         }
         .remapad-cnav-label {
           font-size: 12px !important;
           font-weight: 500 !important;
           color: rgba(255, 255, 255, 0.5) !important;
           white-space: nowrap !important;
           overflow: hidden !important;
           text-overflow: ellipsis !important;
         }
         .remapad-cnav-of {
           font-weight: 400 !important;
           opacity: 0.55 !important;
           font-size: 11px !important;
         }
         .remapad-cnav-dots {
           display: flex !important;
           align-items: center !important;
           gap: 4px !important;
         }
         .remapad-cnav-dot {
           width: 5px !important;
           height: 5px !important;
           border-radius: 50% !important;
           background: rgba(255, 255, 255, 0.2) !important;
           transition: background 0.2s, transform 0.2s !important;
           display: block !important;
         }
         .remapad-cnav-dot.active {
           background: #e50914 !important;
           transform: scale(1.4) !important;
         }
         .remapad-cnav-item {
           font-size: 12px !important;
           font-weight: 600 !important;
           color: rgba(255, 255, 255, 0.75) !important;
           white-space: nowrap !important;
         }
      .remapad-cnav-item--hint {
        color: rgba(255, 255, 255, 0.35) !important;
        font-weight: 500 !important;
      }
      .remapad-autoplay-warning {
        position: fixed !important;
        top: 20px !important;
        left: 50% !important;
        transform: translateX(-50%) translateY(-120%) !important;
        z-index: 2147483647 !important;
        max-width: calc(100vw - 48px) !important;
        width: 520px !important;
        box-sizing: border-box !important;
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .remapad-autoplay-warning.visible {
        transform: translateX(-50%) translateY(0) !important;
        opacity: 1 !important;
        pointer-events: auto !important;
      }
      .remapad-autoplay-warning__inner {
        background: rgba(16, 16, 16, 0.95) !important;
        backdrop-filter: blur(20px) !important;
        -webkit-backdrop-filter: blur(20px) !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        border-left: 4px solid #e50914 !important;
        border-radius: 12px !important;
        padding: 16px 18px !important;
        display: flex !important;
        align-items: flex-start !important;
        gap: 14px !important;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7) !important;
        font-family: 'Geist', 'Inter', -apple-system, sans-serif !important;
        color: #fff !important;
      }
      .remapad-autoplay-warning__icon {
        width: 22px !important;
        height: 22px !important;
        color: #e50914 !important;
        flex-shrink: 0 !important;
        margin-top: 1px !important;
      }
      .remapad-autoplay-warning__text {
        font-size: 13px !important;
        line-height: 1.55 !important;
        color: rgba(255, 255, 255, 0.92) !important;
        flex: 1 !important;
      }
      .remapad-autoplay-warning__text strong {
        color: #fff !important;
        font-weight: 700 !important;
        display: block !important;
        margin-bottom: 4px !important;
      }
      .remapad-autoplay-warning__close {
        background: transparent !important;
        border: 0 !important;
        color: rgba(255, 255, 255, 0.5) !important;
        font-size: 20px !important;
        font-weight: 300 !important;
        line-height: 1 !important;
        padding: 0 0 0 8px !important;
        cursor: pointer !important;
        flex-shrink: 0 !important;
        transition: color 0.2s !important;
      }
      .remapad-autoplay-warning__close:hover {
        color: #fff !important;
      }
    `;
      document.head.appendChild(styleElement);
    }

    function remove() {
      // The shared stylesheet is torn down only by aggregate teardown. Each
      // overlay injects it idempotently, so partial removal would leave other
      // Remapad UI unstyled.
      styleElement?.remove();
      styleElement = null;
    }

    return { inject, remove };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.OverlayStyles = { create };
})(typeof window !== 'undefined' ? window : globalThis);
