/**
 * Remapad — Autoplay Policy Probe
 * MV3-compatible classic script; exposed via window.RemapadCS.AutoplayService.
 * Probes native autoplay restrictions and supplements them with a tiny
 * in-memory WAV probe. Can show at most one blocked-policy warning, including
 * during proactive initialization; later checkAutoplayAndWarn attempts call
 * playFn and remain subject to browser policy.
 */

(function (global) {
  'use strict';

  function create({ utils, getSettings }) {
    const { createWavProbeDataUrl, escapeHtml } = utils;

    let autoplayCheckPromise = null;
    let autoplayStatus = { supported: false, mediaelement: 'unknown', audiocontext: 'unknown', audio: 'unknown', video: 'unknown', timestamp: 0 };
    let autoplayWarningShown = false;

    // Only one probe runs at a time; the cached promise is returned on every
    // subsequent call. Native `navigator.getAutoplayPolicy` is consulted first,
    // but WAV probes still supplement its audio/video results. A non-
    // NotAllowedError remains treated as allowed to avoid false warnings.
    async function checkAutoplayPolicy() {
      if (autoplayCheckPromise) return autoplayCheckPromise;
      autoplayCheckPromise = (async () => {
        const result = { supported: false, mediaelement: 'unknown', audiocontext: 'unknown', audio: 'unknown', video: 'unknown', timestamp: Date.now() };

        if (typeof navigator.getAutoplayPolicy === 'function') {
          try {
            result.supported = true;
            result.mediaelement = navigator.getAutoplayPolicy('mediaelement');
            result.audiocontext = navigator.getAutoplayPolicy('audiocontext');
          } catch (e) {
            result.supported = false;
          }
        }

        result.audio = await probeAudioAutoplay();
        result.video = await probeVideoAutoplay();
        if (result.mediaelement === 'unknown') {
          if (result.audio === 'blocked' || result.video === 'blocked') result.mediaelement = 'disallowed';
          else if (result.audio === 'allowed-muted' || result.video === 'allowed-muted') result.mediaelement = 'allowed-muted';
          else if (result.audio === 'allowed' && result.video === 'allowed') result.mediaelement = 'allowed';
        }

        autoplayStatus = result;
        console.log('[Remapad] Autoplay status:', result);
        return result;
      })();
      return autoplayCheckPromise;
    }

    function probeAudioAutoplay() {
      return new Promise(resolve => {
        try {
          const audio = document.createElement('audio');
          const isMuted = !!getSettings().muteActivation;
          const soundPreset = getSettings().notificationSound || 'probe';
          audio.muted = false;
          audio.volume = isMuted ? 0.001 : 1.0;
          audio.src = createWavProbeDataUrl(isMuted, soundPreset);

          let settled = false;
          const cleanup = () => {
            try { audio.pause(); } catch (_) {}
            try { audio.remove(); } catch (_) {}
          };

          const finish = (state) => {
            if (settled) return;
            settled = true;
            if (state !== 'allowed') {
              cleanup();
            } else {
              audio.addEventListener('ended', cleanup, { once: true });
              setTimeout(cleanup, 600);
            }
            resolve(state);
          };

          const promise = audio.play();
          if (promise !== undefined) {
            promise.then(() => finish('allowed')).catch(err => finish(err?.name === 'NotAllowedError' ? 'blocked' : 'allowed'));
          } else {
            finish('allowed');
          }
          setTimeout(() => finish('allowed'), 600);
        } catch (e) {
          resolve('unknown');
        }
      });
    }

    function probeVideoAutoplay() {
      return new Promise(resolve => {
        try {
          const video = document.createElement('video');
          video.setAttribute('playsinline', '');
          const isMuted = !!getSettings().muteActivation;
          const soundPreset = getSettings().notificationSound || 'probe';
          video.muted = false;
          video.volume = isMuted ? 0.001 : 1.0;
          video.src = createWavProbeDataUrl(isMuted, soundPreset);

          let settled = false;
          const cleanup = () => {
            try { video.pause(); } catch (_) {}
            try { video.remove(); } catch (_) {}
          };

          const finish = (state) => {
            if (settled) return;
            settled = true;
            if (state !== 'allowed') {
              cleanup();
            } else {
              video.addEventListener('ended', cleanup, { once: true });
              setTimeout(cleanup, 600);
            }
            resolve(state);
          };

          const promise = video.play();
          if (promise !== undefined) {
            promise.then(() => finish('allowed')).catch(err => finish(err?.name === 'NotAllowedError' ? 'blocked' : 'allowed'));
          } else {
            finish('allowed');
          }
          setTimeout(() => finish('allowed'), 600);
        } catch (e) {
          resolve('unknown');
        }
      });
    }

    async function checkAutoplayAndWarn(playFn, injectOverlayStyles) {
      const status = await checkAutoplayPolicy();
      const blocked = status.mediaelement !== 'allowed';
      console.log('[Remapad] checkAutoplayAndWarn blocked:', blocked, status);

      // Surface one warning on the first blocked attempt; after that, call
      // playFn and let the browser's autoplay policy determine the outcome.
      if (blocked && !autoplayWarningShown) {
        autoplayWarningShown = true;
        showAutoplayWarning(formatAutoplayWarning(status), injectOverlayStyles);
        return;
      }
      playFn();
    }

    function formatAutoplayWarning(status) {
      if (status.audio === 'blocked' && status.video === 'blocked') {
        return { title: 'Autoplay blocked', message: 'Audio and video autoplay are blocked on this site. Remapad cannot override autoplay permissions. Enable autoplay for this site in your browser settings to use controller playback.' };
      }
      if (status.audio === 'blocked') {
        return { title: 'Audio autoplay blocked', message: 'Audio autoplay is blocked on this site. Remapad cannot override autoplay permissions. Enable audio autoplay for this site in your browser settings to use controller playback.' };
      }
      if (status.video === 'blocked') {
        return { title: 'Video autoplay blocked', message: 'Video autoplay is blocked on this site. Remapad cannot override autoplay permissions. Enable video autoplay for this site in your browser settings to use controller playback.' };
      }
      if (status.mediaelement === 'allowed-muted') {
        return { title: 'Muted autoplay only', message: 'This site only allows muted autoplay. Video with audio requires a real click. Remapad cannot override autoplay permissions. Enable audio autoplay for this site in your browser settings to use controller playback with sound.' };
      }
      return { title: 'Autoplay restricted', message: 'Autoplay is restricted on this site. Some video controls may require a real click. Remapad cannot override autoplay permissions. Enable autoplay for this site in your browser settings for full controller playback.' };
    }

    function showAutoplayWarning({ title, message }, injectOverlayStyles) {
      autoplayWarningShown = true;
      if (typeof injectOverlayStyles === 'function') injectOverlayStyles();
      const id = 'remapad-autoplay-warning';
      let el = document.getElementById(id);
      if (el) el.remove();

      el = document.createElement('div');
      el.id = id;
      el.className = 'remapad-autoplay-warning';
      el.setAttribute('role', 'alert');

      el.innerHTML = `
        <div class="remapad-autoplay-warning__inner">
          <svg class="remapad-autoplay-warning__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <div class="remapad-autoplay-warning__text">
            <strong>${escapeHtml(title)}</strong> — ${escapeHtml(message)}
          </div>
          <button class="remapad-autoplay-warning__close" aria-label="Dismiss">×</button>
        </div>
      `;
      document.body.appendChild(el);

      el.querySelector('.remapad-autoplay-warning__close').addEventListener('click', () => {
        el.classList.remove('visible');
        setTimeout(() => el.remove(), 350);
      });

      requestAnimationFrame(() => el.classList.add('visible'));

      // Auto-dismiss after a short delay; the user can also dismiss manually.
      setTimeout(() => {
        if (el.parentElement) {
          el.classList.remove('visible');
          setTimeout(() => el.remove(), 350);
        }
      }, 7000);
    }

    function getStatus() { return autoplayStatus; }
    function isWarningShown() { return autoplayWarningShown; }

    return {
      checkAutoplayPolicy,
      checkAutoplayAndWarn,
      showAutoplayWarning,
      formatAutoplayWarning,
      getStatus,
      isWarningShown
    };
  }

  global.RemapadCS = global.RemapadCS || {};
  global.RemapadCS.AutoplayService = { create };
})(typeof window !== 'undefined' ? window : globalThis);
