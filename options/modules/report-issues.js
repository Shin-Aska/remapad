/**
 * Remapad Options — Report Issues Module
 * MV3-compatible classic script; exposed via window.RemapadOptions.ReportIssues.
 */

(function (global) {
  'use strict';

  function create({ dom, showToast }) {
    let currentGamepadInfo = 'Not detected';

    function updateControllerStatus(gamepad) {
      if (!dom.reportIssueControllerStatus) return;

      if (gamepad && gamepad.connected) {
        const rawId = gamepad.id || 'Controller';
        const cleanId = rawId.split('(')[0].trim() || 'Controller';
        currentGamepadInfo = `${cleanId} (${rawId})`;

        dom.reportIssueControllerStatus.innerHTML = `
          <div class="report-controller-card connected" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(76,175,80,0.08);border:1px solid rgba(76,175,80,0.25);border-radius:8px">
            <div style="display:flex;align-items:center;gap:12px">
              <span class="status-badge connected" style="font-size:11px;padding:2px 8px;border-radius:9999px;background:rgba(76,175,80,0.2);color:#4caf50;font-weight:600">
                <span class="status-dot pulse" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#4caf50;margin-right:4px"></span>
                CONNECTED
              </span>
              <div>
                <div style="font-family:var(--font-label);font-size:13px;font-weight:600;color:var(--on-surface)">${cleanId}</div>
                <div style="font-family:var(--font-body);font-size:11px;color:var(--on-surface-variant);margin-top:2px">${rawId}</div>
              </div>
            </div>
          </div>
        `;
      } else {
        currentGamepadInfo = 'Not detected';
        dom.reportIssueControllerStatus.innerHTML = `
          <div class="report-controller-card disconnected" style="display:flex;flex-direction:column;gap:8px;padding:12px 16px;background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.25);border-radius:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="status-badge disconnected" style="font-size:11px;padding:2px 8px;border-radius:9999px;background:rgba(255,193,7,0.2);color:#ffc107;font-weight:600">
                <span class="status-dot" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#ffc107;margin-right:4px"></span>
                NOT DETECTED
              </span>
            </div>
            <div style="font-family:var(--font-body);font-size:12px;color:var(--on-surface-variant);line-height:1.4">
              No controller detected. Please press any button on the controller being used that has this issue so Remapad can detect it.
            </div>
          </div>
        `;
      }
    }

    function prefillFromUrl() {
      try {
        const params = new URLSearchParams(window.location.search);
        const page = params.get('page');
        const controller = params.get('controller');
        const description = params.get('description');

        if (page && dom.reportIssuePageInput) {
          dom.reportIssuePageInput.value = page;
        }
        if (controller && currentGamepadInfo === 'Not detected') {
          currentGamepadInfo = controller;
        }
        if (description && dom.reportIssueDescriptionInput) {
          dom.reportIssueDescriptionInput.value = description;
        }
      } catch (e) {
        console.error('[Remapad Options] Error prefilling report issue fields:', e);
      }
    }

    function submitToGitLab() {
      const page = dom.reportIssuePageInput ? dom.reportIssuePageInput.value.trim() : '';
      const description = dom.reportIssueDescriptionInput ? dom.reportIssueDescriptionInput.value.trim() : '';

      const title = page ? `[Issue Report] Problem on ${page}` : '[Issue Report] Controller / Remapad Issue';

      const bodyLines = [
        '### Environment & Details',
        `- **Page / URL:** ${page || 'Not specified'}`,
        `- **Controller:** ${currentGamepadInfo}`,
        `- **User Agent:** ${navigator.userAgent}`,
        '',
        '### Issue Description',
        description || '_No description provided._'
      ];

      const body = bodyLines.join('\n');
      const gitlabUrl = `https://gitlab.com/ShinAska/remapad/-/issues/new?issue[title]=${encodeURIComponent(title)}&issue[description]=${encodeURIComponent(body)}`;

      window.open(gitlabUrl, '_blank');
      if (showToast) {
        showToast('Opening GitLab issue creation page...', 'success');
      }
    }

    function bind() {
      if (dom.reportIssueGitLabBtn) {
        dom.reportIssueGitLabBtn.addEventListener('click', (e) => {
          e.preventDefault();
          submitToGitLab();
        });
      }
    }

    return {
      bind,
      prefillFromUrl,
      updateControllerStatus,
      submitToGitLab
    };
  }

  global.RemapadOptions = global.RemapadOptions || {};
  global.RemapadOptions.ReportIssues = { create };
})(typeof window !== 'undefined' ? window : globalThis);
