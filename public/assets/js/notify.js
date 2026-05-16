/**
 * EduNex Notify - Modern toast & modal sistemi
 * window.notify.toast(msg, type)          -> kısa bildirim (success | error | info | warning)
 * window.notify.success(msg) / .error(msg) / .info(msg) / .warning(msg)
 * window.notify.confirm({ title, text, confirmText, cancelText, type }) -> Promise<boolean>
 * window.notify.alert({ title, text, type, confirmText })               -> Promise<void>
 *
 * SweetAlert2 yüklüyse onu kullanır; değilse projeye özel custom modal/toast'a düşer.
 */
(function (global) {
    'use strict';

    if (global.notify && global.notify.__edunex) return;

    const SWAL_CDN = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js';
    const COLORS = {
        success: '#10b981',
        error:   '#ef4444',
        info:    '#2563eb',
        warning: '#f59e0b'
    };
    const ICONS = {
        success: 'fa-circle-check',
        error:   'fa-circle-xmark',
        info:    'fa-circle-info',
        warning: 'fa-triangle-exclamation'
    };

    let swalLoading = null;
    function ensureSwal() {
        if (global.Swal) return Promise.resolve(global.Swal);
        if (swalLoading) return swalLoading;
        swalLoading = new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = SWAL_CDN;
            s.async = true;
            s.onload = () => resolve(global.Swal);
            s.onerror = () => resolve(null);
            document.head.appendChild(s);
        });
        return swalLoading;
    }

    function ensureToastContainer() {
        let c = document.getElementById('edunex-toast-container');
        if (c) return c;
        c = document.createElement('div');
        c.id = 'edunex-toast-container';
        c.style.cssText = [
            'position:fixed', 'top:20px', 'right:20px', 'z-index:99999',
            'display:flex', 'flex-direction:column', 'gap:10px',
            'pointer-events:none', 'max-width:380px'
        ].join(';');
        document.body.appendChild(c);
        return c;
    }

    function toast(message, type = 'success', duration = 3500) {
        const t = (type in COLORS) ? type : 'info';
        const container = ensureToastContainer();
        const el = document.createElement('div');
        el.setAttribute('role', 'status');
        el.style.cssText = [
            'pointer-events:auto',
            'display:flex', 'align-items:center', 'gap:10px',
            'background:#fff',
            `border-left:4px solid ${COLORS[t]}`,
            'color:#0f172a',
            'padding:12px 16px',
            'border-radius:10px',
            'box-shadow:0 10px 30px rgba(15,23,42,0.15)',
            'font-size:0.92rem',
            'font-weight:500',
            'min-width:260px',
            'transform:translateX(120%)',
            'transition:transform .25s ease, opacity .25s ease',
            'opacity:0'
        ].join(';');
        el.innerHTML = `
            <i class="fas ${ICONS[t]}" style="color:${COLORS[t]};font-size:1.1rem;"></i>
            <span style="flex:1;line-height:1.35;"></span>
            <button type="button" aria-label="Kapat"
                style="background:none;border:0;color:#94a3b8;cursor:pointer;font-size:1rem;padding:0 2px;">
                <i class="fas fa-times"></i>
            </button>
        `;
        el.querySelector('span').textContent = String(message ?? '');
        const close = () => {
            el.style.opacity = '0';
            el.style.transform = 'translateX(120%)';
            setTimeout(() => el.remove(), 250);
        };
        el.querySelector('button').addEventListener('click', close);
        container.appendChild(el);
        requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateX(0)';
        });
        if (duration > 0) setTimeout(close, duration);
        return { close };
    }

    function fallbackModal({ title, text, type = 'info', confirmText = 'Tamam', cancelText, showCancel = false }) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText = [
                'position:fixed', 'inset:0', 'background:rgba(15,23,42,0.55)',
                'display:flex', 'align-items:center', 'justify-content:center',
                'z-index:99998', 'padding:20px', 'opacity:0', 'transition:opacity .2s ease'
            ].join(';');
            const t = (type in COLORS) ? type : 'info';
            const modal = document.createElement('div');
            modal.style.cssText = [
                'background:#fff', 'max-width:420px', 'width:100%',
                'border-radius:14px', 'box-shadow:0 20px 60px rgba(0,0,0,0.3)',
                'padding:28px', 'text-align:center',
                'transform:scale(.95)', 'transition:transform .2s ease'
            ].join(';');
            modal.innerHTML = `
                <div style="width:64px;height:64px;border-radius:50%;background:${COLORS[t]}1A;
                            display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                    <i class="fas ${ICONS[t]}" style="color:${COLORS[t]};font-size:1.8rem;"></i>
                </div>
                <h3 style="margin:0 0 8px;color:#0f172a;font-size:1.2rem;"></h3>
                <p style="margin:0 0 22px;color:#475569;line-height:1.5;font-size:0.95rem;"></p>
                <div style="display:flex;gap:10px;justify-content:center;">
                    ${showCancel ? `<button type="button" data-act="cancel"
                        style="padding:10px 22px;border-radius:8px;border:1px solid #e2e8f0;
                               background:#fff;color:#334155;font-weight:600;cursor:pointer;">
                        ${escapeHtml(cancelText || 'İptal')}
                    </button>` : ''}
                    <button type="button" data-act="confirm"
                        style="padding:10px 22px;border-radius:8px;border:0;
                               background:${COLORS[t]};color:#fff;font-weight:600;cursor:pointer;">
                        ${escapeHtml(confirmText)}
                    </button>
                </div>
            `;
            modal.querySelector('h3').textContent = title || '';
            modal.querySelector('p').textContent = text || '';
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                modal.style.transform = 'scale(1)';
            });

            const cleanup = (result) => {
                overlay.style.opacity = '0';
                modal.style.transform = 'scale(.95)';
                setTimeout(() => overlay.remove(), 200);
                document.removeEventListener('keydown', onKey);
                resolve(result);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') cleanup(false);
                if (e.key === 'Enter') cleanup(true);
            };
            document.addEventListener('keydown', onKey);
            modal.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', () => cleanup(btn.dataset.act === 'confirm'));
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) cleanup(false);
            });
        });
    }

    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    async function confirmDialog(opts = {}) {
        const {
            title = 'Onaylıyor musunuz?',
            text = '',
            confirmText = 'Evet',
            cancelText = 'İptal',
            type = 'warning'
        } = (typeof opts === 'string') ? { text: opts } : opts;

        const Swal = await ensureSwal();
        if (Swal) {
            const r = await Swal.fire({
                title, text,
                icon: type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'info' ? 'info' : 'warning',
                showCancelButton: true,
                confirmButtonText: confirmText,
                cancelButtonText: cancelText,
                confirmButtonColor: COLORS[type] || COLORS.info,
                cancelButtonColor: '#94a3b8',
                reverseButtons: true
            });
            return !!r.isConfirmed;
        }
        return fallbackModal({ title, text, type, confirmText, cancelText, showCancel: true });
    }

    async function alertDialog(opts = {}) {
        const {
            title = 'Bilgi',
            text = '',
            type = 'info',
            confirmText = 'Tamam'
        } = (typeof opts === 'string') ? { text: opts } : opts;

        const Swal = await ensureSwal();
        if (Swal) {
            await Swal.fire({
                title, text,
                icon: type === 'error' ? 'error' : type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'info',
                confirmButtonText: confirmText,
                confirmButtonColor: COLORS[type] || COLORS.info
            });
            return;
        }
        await fallbackModal({ title, text, type, confirmText, showCancel: false });
    }

    const api = {
        __edunex: true,
        toast,
        success: (m, d) => toast(m, 'success', d),
        error:   (m, d) => toast(m, 'error', d),
        info:    (m, d) => toast(m, 'info', d),
        warning: (m, d) => toast(m, 'warning', d),
        confirm: confirmDialog,
        alert:   alertDialog
    };

    global.notify = api;
})(window);
