// ===== PUP-CRS Custom Modal System =====
// Replaces native browser alert() with styled modals matching the CRS design system.

(function () {
  'use strict';

  // ── Icon SVG templates ──
  const ICONS = {
    success: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
    </svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
    </svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
    </svg>`,
    info: `<svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z"/>
    </svg>`,
  };

  // ── Theme definitions matching PUP Brand & CRS design system ──
  const THEMES = {
    success: {
      iconColor: '#15803d',
      iconBg: '#f0fdf4',
      iconBorder: '#bbf7d0',
      badgeClass: 'crs-modal-icon-success',
      btnClass: 'crs-modal-btn-primary'
    },
    error: {
      iconColor: '#b91c1c',
      iconBg: '#fef2f2',
      iconBorder: '#fecaca',
      badgeClass: 'crs-modal-icon-error',
      btnClass: 'crs-modal-btn-primary'
    },
    warning: {
      iconColor: '#b45309',
      iconBg: '#fffbeb',
      iconBorder: '#fde68a',
      badgeClass: 'crs-modal-icon-warning',
      btnClass: 'crs-modal-btn-primary'
    },
    info: {
      iconColor: '#1d4ed8',
      iconBg: '#eff6ff',
      iconBorder: '#bfdbfe',
      badgeClass: 'crs-modal-icon-info',
      btnClass: 'crs-modal-btn-primary'
    },
  };

  // ── Title defaults per type ──
  const TITLES = {
    success: 'Success',
    error: 'Notice',
    warning: 'Attention Needed',
    info: 'System Information',
  };

  /**
   * Show a styled CRS modal dialog matching the PUP Canlalay CRS theme.
   * @param {string} message  — the body text
   * @param {object} [opts]   — optional overrides
   * @param {'success'|'error'|'warning'|'info'} [opts.type='info']
   * @param {string}   [opts.title]       — custom title
   * @param {string}   [opts.buttonText]  — label for the button (default: "Acknowledge" or "OK")
   * @param {function} [opts.onClose]     — callback after modal is dismissed
   * @returns {Promise<void>}             — resolves when user clicks the button or presses Esc
   */
  function crsModal(message, opts) {
    const o = Object.assign({ type: 'info', buttonText: 'OK' }, opts);
    const type = THEMES[o.type] ? o.type : 'info';
    const theme = THEMES[type];
    const title = o.title || TITLES[type];

    return new Promise(function (resolve) {
      const targetParent = document.body || document.documentElement;

      // Overlay
      const overlay = document.createElement('div');
      overlay.className = 'crs-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', title);

      // Safe HTML escaping for message & title
      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      // Dialog panel
      overlay.innerHTML = `
        <div class="crs-modal-panel">
          <div class="crs-modal-header-strip"></div>
          <div class="crs-modal-body">
            <div class="crs-modal-icon-wrap ${theme.badgeClass}" style="color:${theme.iconColor}; background:${theme.iconBg}; border: 1.5px solid ${theme.iconBorder};">
              ${ICONS[type]}
            </div>
            <div class="crs-modal-pup-tag">PUP CANLALAY CAMPUS CRS</div>
            <h3 class="crs-modal-title">${escapeHtml(title)}</h3>
            <p class="crs-modal-message">${escapeHtml(message)}</p>
            <button type="button" class="crs-modal-btn ${theme.btnClass}">
              <span>${escapeHtml(o.buttonText)}</span>
            </button>
          </div>
        </div>
      `;

      targetParent.appendChild(overlay);

      // Trigger animation smoothly
      requestAnimationFrame(function () {
        overlay.classList.add('crs-modal-visible');
      });

      const okBtn = overlay.querySelector('.crs-modal-btn');

      let closed = false;
      function close() {
        if (closed) return;
        closed = true;

        document.removeEventListener('keydown', keyHandler);
        overlay.classList.remove('crs-modal-visible');

        overlay.addEventListener('transitionend', function handler() {
          overlay.removeEventListener('transitionend', handler);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (typeof o.onClose === 'function') o.onClose();
          resolve();
        });

        // Fallback cleanup if transition doesn't fire
        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (typeof o.onClose === 'function') o.onClose();
          resolve();
        }, 320);
      }

      function keyHandler(e) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          close();
        }
      }

      if (okBtn) {
        okBtn.addEventListener('click', close);
        // Focus the button immediately
        setTimeout(function () {
          try { okBtn.focus(); } catch (_) {}
        }, 50);
      }

      document.addEventListener('keydown', keyHandler);

      // Close if user clicks background outside panel
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          close();
        }
      });
    });
  }

  // ── Convenience helpers ──
  crsModal.success = function (msg, opts) { return crsModal(msg, Object.assign({ type: 'success' }, opts)); };
  crsModal.error   = function (msg, opts) { return crsModal(msg, Object.assign({ type: 'error' }, opts)); };
  crsModal.warning = function (msg, opts) { return crsModal(msg, Object.assign({ type: 'warning' }, opts)); };
  crsModal.info    = function (msg, opts) { return crsModal(msg, Object.assign({ type: 'info' }, opts)); };

  /**
   * Show a styled CRS confirmation dialog matching the PUP Canlalay CRS theme.
   * @param {string} message  — the body text / question
   * @param {object} [opts]   — optional overrides
   * @param {'warning'|'error'|'info'|'success'} [opts.type='warning']
   * @param {string}   [opts.title]        — custom title
   * @param {string}   [opts.confirmText]  — label for confirm button (default: "Confirm")
   * @param {string}   [opts.cancelText]   — label for cancel button (default: "Cancel")
   * @param {boolean}  [opts.danger]       — if true, uses danger red button for confirm
   * @returns {Promise<boolean>}           — resolves to true if confirmed, false if cancelled
   */
  function crsConfirm(message, opts) {
    const o = Object.assign({
      type: 'warning',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      danger: false
    }, opts);

    const type = THEMES[o.type] ? o.type : 'warning';
    const theme = THEMES[type];
    const title = o.title || 'Confirm Action';

    return new Promise(function (resolve) {
      const targetParent = document.body || document.documentElement;

      const overlay = document.createElement('div');
      overlay.className = 'crs-modal-overlay';
      overlay.setAttribute('role', 'alertdialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', title);

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      const confirmBtnClass = o.danger ? 'crs-modal-btn-danger' : 'crs-modal-btn-primary';

      overlay.innerHTML = `
        <div class="crs-modal-panel">
          <div class="crs-modal-header-strip"></div>
          <div class="crs-modal-body">
            <div class="crs-modal-icon-wrap ${theme.badgeClass}" style="color:${theme.iconColor}; background:${theme.iconBg}; border: 1.5px solid ${theme.iconBorder};">
              ${ICONS[type]}
            </div>
            <div class="crs-modal-pup-tag">PUP CANLALAY CAMPUS CRS</div>
            <h3 class="crs-modal-title">${escapeHtml(title)}</h3>
            <p class="crs-modal-message">${escapeHtml(message)}</p>
            <div class="crs-modal-btn-group">
              <button type="button" class="crs-modal-btn crs-modal-btn-secondary crs-modal-cancel-btn">
                <span>${escapeHtml(o.cancelText)}</span>
              </button>
              <button type="button" class="crs-modal-btn ${confirmBtnClass} crs-modal-confirm-btn">
                <span>${escapeHtml(o.confirmText)}</span>
              </button>
            </div>
          </div>
        </div>
      `;

      targetParent.appendChild(overlay);

      requestAnimationFrame(function () {
        overlay.classList.add('crs-modal-visible');
      });

      const confirmBtn = overlay.querySelector('.crs-modal-confirm-btn');
      const cancelBtn = overlay.querySelector('.crs-modal-cancel-btn');

      let closed = false;
      function close(result) {
        if (closed) return;
        closed = true;

        document.removeEventListener('keydown', keyHandler);
        overlay.classList.remove('crs-modal-visible');

        overlay.addEventListener('transitionend', function handler() {
          overlay.removeEventListener('transitionend', handler);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(result);
        });

        setTimeout(function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(result);
        }, 320);
      }

      function keyHandler(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        }
      }

      if (confirmBtn) {
        confirmBtn.addEventListener('click', function () { close(true); });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () { close(false); });
      }

      // Default focus on confirm button
      setTimeout(function () {
        try {
          if (confirmBtn) confirmBtn.focus();
        } catch (_) {}
      }, 50);

      document.addEventListener('keydown', keyHandler);

      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          close(false);
        }
      });
    });
  }

  crsModal.confirm = crsConfirm;
  window.crsConfirm = crsConfirm;

  // ── Polyfill / Override window.alert as safety net ──
  const _nativeAlert = window.alert;
  window.crsModal = crsModal;
  window.alert = function (message) {
    return crsModal(String(message));
  };
})();
