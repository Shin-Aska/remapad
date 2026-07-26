/**
 * Remapad Options — Utilities
 * MV3-compatible classic script; exposed via window.RemapadOptions.Utils.
 */

(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function getFriendlyLabel(domain, friendlyNames) {
    if (friendlyNames[domain]) return friendlyNames[domain];
    const parts = domain.split('.');
    return parts.length > 0 ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : domain;
  }

  function parseDomain(rawInput) {
    let domain = rawInput.trim().toLowerCase();
    try {
      domain = new URL(domain.includes('://') ? domain : 'https://' + domain).hostname;
    } catch (error) {
      domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    }
    return domain.replace(/^www\./, '');
  }

  function getSiteOriginPatterns(domain) {
    return [`*://${domain}/*`, `*://www.${domain}/*`];
  }

  function ensureSitePermission(api, domain) {
    // Call request directly from the click handler so Chrome and Firefox retain
    // the transient user gesture required by the permissions API. Browsers
    // resolve true without another prompt when access is already granted.
    return api.permissions.request({ origins: getSiteOriginPatterns(domain) });
  }

  async function removeSitePermission(api, domain) {
    return api.permissions.remove({ origins: getSiteOriginPatterns(domain) });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(0, 0, 0, ${alpha})`;
    const short = /^#([a-f\d])([a-f\d])([a-f\d])$/i.exec(hex);
    if (short) {
      const r = Number.parseInt(short[1] + short[1], 16);
      const g = Number.parseInt(short[2] + short[2], 16);
      const b = Number.parseInt(short[3] + short[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    const full = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (full) {
      const r = Number.parseInt(full[1], 16);
      const g = Number.parseInt(full[2], 16);
      const b = Number.parseInt(full[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(0, 0, 0, ${alpha})`;
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.Utils = {
    escapeHtml,
    getFriendlyLabel,
    parseDomain,
    getSiteOriginPatterns,
    ensureSitePermission,
    removeSitePermission,
    clamp,
    hexToRgba
  };
})(typeof window !== 'undefined' ? window : globalThis);
