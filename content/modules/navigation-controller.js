/**
 * Remapad — Navigation Controller
 * MV3-compatible classic script; exposed via window.RemapadCS.NavigationController.
 * Manages collection-aware and spatial DOM navigation, the collection HUD,
 * candidate scoring/beam geometry, and strategy selection/reset.
 */

(function (global) {
  'use strict';

  function create({ utils, domSimulator, modalFocusManager, sitePolicy, callbacks }) {
    const {
      clampIndex,
      rectCenter,
      centerDistance,
      isDirectionalMove,
      isInBeam,
      primaryEdgeDistance,
      orthogonalEdgeDistance,
      anchorDistance,
      isVisibleElement
    } = utils;

    // Private collection navigation state. `activeCollectionIndex` and
    // `activeItemIndex` are indices into the live DOM query; reset clears the
    // outline class and the collection HUD.
    let activeCollectionIndex = -1;
    let activeItemIndex = -1;
    let activeCollectionEl = null;
    let preferredInlineX = null;
    let cnavHudElement = null;
    let cnavHudTimeout = null;

    function getCollectionConfig() {
      return sitePolicy.getCollectionConfig(callbacks.getSettings());
    }

    function getCollectionContainers() {
      const config = getCollectionConfig();
      if (!config?.containerSelector) return [];
      try {
        // Ignore Remapad overlays and validate the selector so a bad config
        // cannot break navigation elsewhere on the page.
        return Array.from(document.querySelectorAll(config.containerSelector)).filter(
          el => !el.closest('.remapad-hud-container, .remapad-quick-map, .remapad-tutorial') && isVisibleElement(el)
        );
      } catch (e) {
        console.warn('[Remapad CS] Invalid containerSelector:', config.containerSelector, e);
        return [];
      }
    }

    function getCollectionItems(containerEl) {
      const config = getCollectionConfig();
      if (!config?.itemSelector || !containerEl) return [];
      try {
        return Array.from(containerEl.querySelectorAll(config.itemSelector)).filter(
          el => isVisibleElement(el)
        );
      } catch (e) {
        console.warn('[Remapad CS] Invalid itemSelector:', config.itemSelector, e);
        return [];
      }
    }

    function setActiveCollectionEl(el) {
      if (activeCollectionEl === el) return;
      activeCollectionEl?.classList.remove('remapad-active-collection');
      activeCollectionEl = el;
      activeCollectionEl?.classList.add('remapad-active-collection');
    }

    function findClosestCollectionIndex(containers) {
      const viewportMid = global.innerHeight / 2;
      let closestIdx = 0;
      let closestDist = Infinity;
      containers.forEach((c, i) => {
        const rect = c.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - viewportMid);
        if (dist < closestDist) { closestDist = dist; closestIdx = i; }
      });
      return closestIdx;
    }

    function isActiveCollectionValid() {
      if (!activeCollectionEl) return false;
      const containers = getCollectionContainers();
      const idx = containers.indexOf(activeCollectionEl);
      if (idx === -1) return false;
      activeCollectionIndex = idx;
      return true;
    }

    function computeNextItemIndex(items, currentIndex, direction, wrap) {
      const next = direction === 'right' ? currentIndex + 1 : currentIndex - 1;
      if (wrap) {
        return (next + items.length) % items.length;
      }
      return clampIndex(next, 0, items.length - 1);
    }

    function findNearestItemInRow(targetItems, preferredX) {
      let bestIndex = 0;
      let bestScore = Infinity;

      targetItems.forEach((item, idx) => {
        const rect = item.getBoundingClientRect();
        const center = rectCenter(rect);
        const score = Math.abs(center.x - preferredX);
        if (score < bestScore) {
          bestScore = score;
          bestIndex = idx;
        }
      });

      return bestIndex;
    }

    function getCollectionLabel(containerEl) {
      if (!containerEl) return '';
      const labelEl = containerEl.querySelector(
        '[aria-label], h2, h3, h4, [data-title], .row-header, .lolomoRowHeader, .title'
      );
      const text = (labelEl?.getAttribute('aria-label') || labelEl?.textContent || '').trim();
      return text.length > 40 ? text.slice(0, 40) + '…' : text;
    }

    // The collection HUD is created lazily, updated in place while active, and
    // auto-hidden after a short idle delay. It relies on overlay styles for
    // its CSS classes.
    function showCNavHUD(collectionIndex, collectionCount, itemIndex, itemCount, collectionLabel) {
      callbacks.injectOverlayStyles();

      if (!cnavHudElement) {
        cnavHudElement = document.createElement('div');
        cnavHudElement.className = 'remapad-cnav-hud';
        cnavHudElement.setAttribute('role', 'status');
        cnavHudElement.setAttribute('aria-live', 'polite');
        document.body.appendChild(cnavHudElement);
        requestAnimationFrame(() => cnavHudElement?.classList.add('visible'));
      }

      cnavHudElement.innerHTML = `
        <div class="remapad-cnav-left">
          <svg class="remapad-cnav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </div>
        <div class="remapad-cnav-right"></div>
      `;
      const left = cnavHudElement.querySelector('.remapad-cnav-left');
      const right = cnavHudElement.querySelector('.remapad-cnav-right');

      const rowPosition = document.createElement('span');
      rowPosition.className = 'remapad-cnav-pos';
      rowPosition.append(
        document.createTextNode(`Row ${collectionIndex + 1} `),
        Object.assign(document.createElement('span'), { className: 'remapad-cnav-of', textContent: 'of' }),
        document.createTextNode(` ${collectionCount}`)
      );
      left.appendChild(rowPosition);
      if (collectionLabel) {
        const label = document.createElement('span');
        label.className = 'remapad-cnav-label';
        label.textContent = collectionLabel;
        left.appendChild(label);
      }

      const MAX_DOTS = 12;
      if (itemCount > 0 && itemIndex >= 0) {
        const dotCount = Math.min(itemCount, MAX_DOTS);
        const dotActive = itemCount <= MAX_DOTS
          ? itemIndex
          : Math.round((itemIndex / (itemCount - 1)) * (MAX_DOTS - 1));
        const dots = document.createElement('div');
        dots.className = 'remapad-cnav-dots';
        for (let i = 0; i < dotCount; i++) {
          const dot = document.createElement('span');
          dot.className = `remapad-cnav-dot${i === dotActive ? ' active' : ''}`;
          dots.appendChild(dot);
        }
        right.appendChild(dots);
      }

      if (itemIndex >= 0 && itemCount > 0) {
        const itemPosition = document.createElement('span');
        itemPosition.className = 'remapad-cnav-item';
        itemPosition.append(
          document.createTextNode(`Item ${itemIndex + 1} `),
          Object.assign(document.createElement('span'), { className: 'remapad-cnav-of', textContent: 'of' }),
          document.createTextNode(` ${itemCount}`)
        );
        right.appendChild(itemPosition);
      } else if (itemCount > 0) {
        const itemHint = document.createElement('span');
        itemHint.className = 'remapad-cnav-item remapad-cnav-item--hint';
        itemHint.textContent = `${itemCount} item${itemCount !== 1 ? 's' : ''}`;
        right.appendChild(itemHint);
      }

      clearTimeout(cnavHudTimeout);
      cnavHudTimeout = setTimeout(() => hideCNavHUD(), 2500);
    }

    function hideCNavHUD(immediate = false) {
      clearTimeout(cnavHudTimeout);
      cnavHudTimeout = null;
      if (!cnavHudElement) return;
      if (immediate) {
        cnavHudElement.remove();
        cnavHudElement = null;
        return;
      }
      cnavHudElement.classList.remove('visible');
      const el = cnavHudElement;
      cnavHudElement = null;
      setTimeout(() => el.remove(), 400);
    }

    function clearPrevCollectionHover(items) {
      items.forEach(item => {
        item.classList.remove('remapad-hover');
        domSimulator.dispatchHoverEvents(item, false);
      });
    }

    function activateCollectionItem(container, items, index, showHud = true) {
      const item = items[index];
      if (!item) return;

      const rect = item.getBoundingClientRect();
      preferredInlineX = rect.left + rect.width / 2;

      clearPrevCollectionHover(items);
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

      const focusTarget = item.matches('a,button,[tabindex]') ? item
        : item.querySelector('a,button,[tabindex]:not([tabindex="-1"])');
      if (focusTarget) {
        callbacks.focusElement(focusTarget);
      } else {
        domSimulator.dispatchHoverEvents(item, true);
        item.classList.add('remapad-hover');
      }

      if (showHud) {
        const allContainers = getCollectionContainers();
        showCNavHUD(
          activeCollectionIndex,
          allContainers.length,
          activeItemIndex,
          items.length,
          getCollectionLabel(container)
        );
      }
    }

    function pickInitialItemIndex(items, direction) {
      if (direction === 'left' || direction === 'up') {
        return items.length - 1;
      }
      return 0;
    }

    function executeCollectionNav(action) {
      const nav = callbacks.getSettings().navSettings;
      const config = getCollectionConfig();

      // Strategy: explicit collection wins; auto uses a collection config if one
      // exists for the site, otherwise falls back to DOM-order focus movement.
      const useCollection = nav.strategy === 'collection' || (nav.strategy === 'auto' && config);

      if (!useCollection) {
        if (action === 'nav_next_collection' || action === 'nav_next_item') {
          callbacks.moveFocus(1);
        } else {
          callbacks.moveFocus(-1);
        }
        return;
      }

      if (!config) {
        console.warn('[Remapad CS] No collection config for:', sitePolicy.hostname);
        return;
      }

      if (action === 'nav_next_collection' || action === 'nav_prev_collection') {
        const containers = getCollectionContainers();
        if (!containers.length) return;

        const direction = action === 'nav_next_collection' ? 1 : -1;

        if (activeCollectionIndex === -1) {
          activeCollectionIndex = findClosestCollectionIndex(containers);
        } else {
          activeCollectionIndex = clampIndex(activeCollectionIndex + direction, 0, containers.length - 1);
        }

        activeItemIndex = -1;

        const activeContainer = containers[activeCollectionIndex];
        setActiveCollectionEl(activeContainer);
        activeContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

        showCNavHUD(
          activeCollectionIndex,
          containers.length,
          -1,
          getCollectionItems(activeContainer).length,
          getCollectionLabel(activeContainer)
        );
        return;
      }

      if (action === 'nav_next_item' || action === 'nav_prev_item') {
        if (activeCollectionIndex === -1 || !isActiveCollectionValid()) {
          executeCollectionNav('nav_next_collection');
          if (activeCollectionIndex === -1) return;
        }

        const containers = getCollectionContainers();
        const container = containers[activeCollectionIndex];
        if (!container) return;

        const items = getCollectionItems(container);
        if (!items.length) return;

        const direction = action === 'nav_next_item' ? 1 : -1;

        if (activeItemIndex === -1) {
          activeItemIndex = direction > 0 ? 0 : items.length - 1;
        } else {
          activeItemIndex = clampIndex(activeItemIndex + direction, 0, items.length - 1);
        }

        activateCollectionItem(container, items, activeItemIndex);
      }
    }

    function executeCollectionSpatialNav(direction) {
      const nav = callbacks.getSettings().navSettings;
      const config = getCollectionConfig();
      if (!config) return;

      let containers = getCollectionContainers();
      if (!containers.length) return;

      if (activeCollectionIndex === -1 || !isActiveCollectionValid()) {
        activeCollectionIndex = findClosestCollectionIndex(containers);
        activeItemIndex = -1;
      }

      const container = containers[activeCollectionIndex];
      const items = container ? getCollectionItems(container) : [];

      if (activeItemIndex === -1 || !items[activeItemIndex]) {
        if (!items.length) return;
        activeItemIndex = pickInitialItemIndex(items, direction);
        activateCollectionItem(container, items, activeItemIndex, false);
        return;
      }

      const currentItem = items[activeItemIndex];
      const currentRect = currentItem.getBoundingClientRect();

      if (direction === 'left' || direction === 'right') {
        const nextIndex = computeNextItemIndex(items, activeItemIndex, direction, nav.collectionGrid.wrapItems);
        if (nextIndex !== activeItemIndex) {
          activeItemIndex = nextIndex;
          activateCollectionItem(container, items, activeItemIndex);
        }
        return;
      }

      if (direction === 'up' || direction === 'down') {
        const rowDelta = direction === 'down' ? 1 : -1;
        let targetIndex = activeCollectionIndex + rowDelta;
        if (nav.collectionGrid.wrapRows) {
          targetIndex = (targetIndex + containers.length) % containers.length;
        }
        if (targetIndex < 0 || targetIndex >= containers.length) return;

        const targetContainer = containers[targetIndex];
        const targetItems = getCollectionItems(targetContainer);
        if (!targetItems.length) return;

        const inlineX = preferredInlineX ?? (currentRect.left + currentRect.width / 2);
        const nextItemIndex = findNearestItemInRow(targetItems, inlineX);
        activeCollectionIndex = targetIndex;
        activeItemIndex = nextItemIndex;
        setActiveCollectionEl(targetContainer);
        activateCollectionItem(targetContainer, targetItems, activeItemIndex);
      }
    }

    function getSpatialCandidates(scopeSource) {
      const focusables = domSimulator.getFocusableElements();
      const mediaCards = Array.from(document.querySelectorAll(
        '[data-testid="card"], [data-testid*="title" i], .title-card, .title-card-container'
      )).filter(el => isVisibleElement(el) && !el.closest('.remapad-hud-container, .remapad-quick-map, .remapad-tutorial'));

      const modal = modalFocusManager.getOpenModals()[0];
      let all = [...focusables, ...mediaCards];
      if (modal) {
        all = all.filter(el => modal.contains(el) || el === modal);
      }

      const seen = new Set();
      const candidates = [];
      for (const el of all) {
        if (seen.has(el) || el === scopeSource) continue;
        seen.add(el);
        candidates.push(el);
      }
      return candidates;
    }

    function pickInitialCandidate(sourceRect, candidates, direction) {
      const viewportMidX = global.innerWidth / 2;
      const viewportMidY = global.innerHeight / 2;
      let best = null;
      let bestScore = Infinity;

      candidates.forEach(candidate => {
        const rect = candidate.getBoundingClientRect();
        const center = rectCenter(rect);
        const dx = center.x - viewportMidX;
        const dy = center.y - viewportMidY;

        const inRequestedHalf =
          (direction === 'up' && dy < 0) ||
          (direction === 'down' && dy > 0) ||
          (direction === 'left' && dx < 0) ||
          (direction === 'right' && dx > 0);

        let score = Math.hypot(dx, dy);
        if (inRequestedHalf) score -= 200;

        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      });

      return best;
    }

    function pickBestCandidate(sourceRect, candidates, direction, preferredInline) {
      const nav = callbacks.getSettings().navSettings;
      const penalty = nav.collectionGrid.lateralPenalty ?? 3;
      const orthogonalWeight = 2;
      let best = null;
      let bestScore = Infinity;

      candidates.forEach(candidate => {
        const rect = candidate.getBoundingClientRect();
        if (!isDirectionalMove(direction, sourceRect, rect)) return;

        const inBeam = isInBeam(direction, sourceRect, rect);
        const primaryGap = primaryEdgeDistance(direction, sourceRect, rect);
        const orthogonalGap = orthogonalEdgeDistance(direction, sourceRect, rect);
        const anchorOffset = preferredInline !== null && preferredInline !== undefined
          ? anchorDistance(direction, rect, preferredInline)
          : 0;
        const cDist = centerDistance(sourceRect, rect);

        let score;
        if (inBeam) {
          score = primaryGap * 1000 + anchorOffset * 100 + cDist;
        } else {
          score = (primaryGap + orthogonalWeight * orthogonalGap) * 1000 + cDist;
        }
        score += penalty * orthogonalGap;

        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      });

      return best;
    }

    function executeDomSpatialNav(direction) {
      const controllerFocusedElement = callbacks.getControllerFocusedElement();
      const source = controllerFocusedElement || document.activeElement || document.body;
      const sourceIsBody = source === document.body || source === document.documentElement;
      const sourceRect = source.getBoundingClientRect();
      const candidates = getSpatialCandidates(source);
      if (!candidates.length) return;

      let best;
      if (sourceIsBody) {
        best = pickInitialCandidate(sourceRect, candidates, direction);
      } else {
        best = pickBestCandidate(sourceRect, candidates, direction, null);
      }
      if (!best) return;

      const focusTarget = best.matches('a,button,[tabindex]')
        ? best
        : best.querySelector('a,button,[tabindex]:not([tabindex="-1"])');
      if (focusTarget) {
        callbacks.focusElement(focusTarget);
      } else {
        const previousFocusedElement = callbacks.getControllerFocusedElement();
        previousFocusedElement?.classList.remove('remapad-controller-focus');
        domSimulator.dispatchHoverEvents(previousFocusedElement, false);
        domSimulator.dispatchHoverEvents(best, true);
        best.classList.add('remapad-controller-focus');
        best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        callbacks.setControllerFocusedElement(best);
      }
    }

    function executeSpatialNav(direction) {
      const nav = callbacks.getSettings().navSettings;
      const config = getCollectionConfig();
      const useCollection = nav.strategy === 'collection' ||
        (nav.strategy === 'auto' && config);

      // Strategy selection mirrors executeCollectionNav: collection first, then
      // explicit DOM-order, then spatial beam scoring over all focusable + card
      // candidates.
      if (useCollection && config) {
        executeCollectionSpatialNav(direction);
      } else if (nav.strategy === 'dom-order') {
        callbacks.moveFocus(direction === 'down' || direction === 'right' ? 1 : -1);
      } else {
        executeDomSpatialNav(direction);
      }
    }

    function resetCollectionNavState() {
      // Clear collection outline, hover states, indices, and the HUD. Safe to
      // call from teardown or when focus leaves the collection context.
      const config = getCollectionConfig();
      if (config && activeCollectionEl) {
        const items = getCollectionItems(activeCollectionEl);
        clearPrevCollectionHover(items);
      }
      setActiveCollectionEl(null);
      activeCollectionIndex = -1;
      activeItemIndex = -1;
      preferredInlineX = null;
      hideCNavHUD(true);
    }

    return {
      executeCollectionNav,
      executeSpatialNav,
      resetCollectionNavState,
      hideCNavHUD,
      getCollectionConfig,
      getCollectionContainers,
      getCollectionItems,
      isActiveCollectionValid,
      activeCollectionIndex: () => activeCollectionIndex,
      activeItemIndex: () => activeItemIndex
    };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.NavigationController = { create };
})(typeof window !== 'undefined' ? window : globalThis);
