/**
 * Replace an element's children from extension-owned, static markup without
 * using an HTML injection sink. Add dynamic values afterwards with textContent
 * or DOM properties.
 */
(function (global) {
  'use strict';

  function replaceStaticChildren(target, markup) {
    if (!(target instanceof Element) || typeof markup !== 'string') {
      throw new TypeError('replaceStaticChildren requires an Element and static markup');
    }

    const parsed = new DOMParser().parseFromString(markup, 'text/html');
    const blockedElement = parsed.body.querySelector('script, iframe, object, embed, link, meta, base');
    if (blockedElement) {
      throw new Error(`Unsafe element in static markup: ${blockedElement.localName}`);
    }

    for (const element of parsed.body.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src' || name === 'xlink:href') && value.startsWith('javascript:'))) {
          throw new Error(`Unsafe attribute in static markup: ${attribute.name}`);
        }
      }
    }

    target.replaceChildren(...parsed.body.childNodes);
  }

  global.RemapadDOM = Object.freeze({ replaceStaticChildren });
})(globalThis);
