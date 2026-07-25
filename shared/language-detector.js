// Remapad Language Detector: built-in i18n API, no dependencies, MV3-compatible.

(function (global) {
  'use strict';

  const api = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  const LANG_TO_LAYOUT = {
    'ja': 'japanese',
    'ko': 'korean',
    'zh': 'chinese',
    'zh-CN': 'chinese',
    'zh-TW': 'chinese',
    'zh-HK': 'chinese',
    'ru': 'russian',
    'de': 'german',
    'es': 'spanish',
    'fr': 'azerty'
  };

  const CJK_UNICODE = {
    japanese: /[\u3040-\u309F\u30A0-\u30FF]/,
    korean: /[\uAC00-\uD7AF]/,
    chinese: /[\u4E00-\u9FFF]/
  };

  async function detectLanguage(text, minConfidence = 50) {
    if (!text || text.trim().length < 10) {
      return { language: 'und', isReliable: false, confidence: 0 };
    }
    if (!api || !api.i18n || !api.i18n.detectLanguage) {
      return { language: 'und', isReliable: false, confidence: 0 };
    }
    try {
      const result = await api.i18n.detectLanguage(text);
      if (!result || !result.languages || result.languages.length === 0) {
        return { language: 'und', isReliable: false, confidence: 0 };
      }
      const top = result.languages[0];
      return {
        language: top.language,
        isReliable: !!result.isReliable && top.percentage >= minConfidence,
        confidence: top.percentage
      };
    } catch (e) {
      console.warn('[Remapad] Language detection failed:', e);
      return { language: 'und', isReliable: false, confidence: 0 };
    }
  }

  function getHtmlLangHint() {
    const raw = (document.documentElement.lang || '').toLowerCase().trim();
    if (!raw) return null;
    const base = raw.split(/[-_]/)[0];
    return LANG_TO_LAYOUT[raw] || LANG_TO_LAYOUT[base] || null;
  }

  async function detectPageLanguage(maxChars = 500) {
    const htmlHint = getHtmlLangHint();
    if (htmlHint) return { layout: htmlHint, source: 'html-lang', confidence: 100 };

    const selectors = ['h1', 'h2', 'h3', 'title', 'p', 'article'];
    let text = '';
    for (const sel of selectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        if (el.closest('.remapad-hud-container, .remapad-quick-map, .remapad-keyboard-overlay')) continue;
        const visible = el.offsetParent !== null || el.tagName === 'TITLE';
        if (!visible) continue;
        text += ' ' + (el.textContent || '').trim();
        if (text.length >= maxChars) break;
      }
      if (text.length >= maxChars) break;
    }

    if (text.length < 50 && document.body) {
      text = (document.body.innerText || '').slice(0, maxChars);
    }

    const result = await detectLanguage(text.slice(0, maxChars));
    const detectedLang = result.language.split(/[-_]/)[0];
    if (result.isReliable && LANG_TO_LAYOUT[detectedLang]) {
      return { layout: LANG_TO_LAYOUT[detectedLang], source: 'detection', confidence: result.confidence };
    }

    const bodySample = (document.body?.innerText || '').slice(0, 1000);
    for (const [layout, regex] of Object.entries(CJK_UNICODE)) {
      if (regex.test(bodySample)) {
        return { layout, source: 'unicode-heuristic', confidence: 0 };
      }
    }

    return { layout: 'qwerty', source: 'fallback', confidence: 0 };
  }

  global.RemapadLanguageDetector = {
    detectPageLanguage,
    getHtmlLangHint
  };
})(typeof window !== 'undefined' ? window : globalThis);
