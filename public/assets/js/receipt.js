/**
 * EduNex - Dekont (PDF Receipt) İndirme Modülü
 *
 * Tek bir global obje sunar: `window.ReceiptDownloader`.
 *
 * Public API
 * ──────────
 *   ReceiptDownloader.download(orderId, options?)
 *       Tek bir indirme tetikler. UI durumunu kendin yönetiyorsan bunu kullan.
 *
 *   ReceiptDownloader.bindButtons(root?, options?)
 *       Verilen DOM ağacındaki tüm `[data-order-id]` veya `[data-receipt-id]`
 *       butonlarına otomatik bağlanır. Spinner + buton disable durumu modül
 *       tarafından yönetilir. Bir butona iki kez bağlanmaz.
 *
 * Backend sözleşmesi
 * ──────────────────
 *   GET /api/receipts/download/:orderId   (Authorization: Bearer <token>)
 *   200 -> application/pdf, Content-Disposition: attachment; filename=...
 *   400/401/403/404/409/500 -> application/json { success:false, message:'...' }
 */

(function (global) {
    'use strict';

    // ─────────────────────────── Sabitler ───────────────────────────

    const ENDPOINT_BASE = '/api/receipts/download/';
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    const STATUS_MESSAGES = {
        400: 'Geçersiz sipariş bilgisi. Lütfen sayfayı yenileyip tekrar deneyin.',
        401: 'Oturumunuzun süresi dolmuş. Lütfen tekrar giriş yapın.',
        403: 'Bu dekontu indirme yetkiniz yok.',
        404: 'Aradığınız sipariş bulunamadı.',
        409: 'Bu sipariş henüz tamamlanmadığı için dekont oluşturulamaz.',
        500: 'Sunucu tarafında bir sorun oluştu. Birkaç dakika sonra tekrar deneyin.',
    };

    // ──────────────────────── Yardımcı Yöntemler ────────────────────

    /**
     * Aktif oturum token'ını çözer. Admin token user token'a göre önceliklidir
     * çünkü admin paneli her iki yi de aynı anda barındırabilir.
     */
    function _getToken() {
        if (typeof ApiService !== 'undefined' &&
            typeof ApiService.getActiveToken === 'function') {
            return ApiService.getActiveToken();
        }
        return (
            localStorage.getItem('edunex_admin_token') ||
            localStorage.getItem('edunex_token') ||
            null
        );
    }

    /**
     * Content-Disposition header'ından dosya adını çeker.
     * Önce RFC 5987 (UTF-8) varyantı, sonra ASCII filename, en son fallback.
     */
    function _parseFilename(header, orderId) {
        const fallback = `EduNex_Dekont_${String(orderId).replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`;
        if (!header) return fallback;

        const utf8 = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
        if (utf8) {
            try { return decodeURIComponent(utf8[1]); } catch (_) { /* yutuldu */ }
        }
        const ascii = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
        if (ascii) return ascii[1];

        return fallback;
    }

    /**
     * Blob'u tarayıcının indirme akışına verir. ObjectURL bellek sızıntısını
     * engellemek için indirme tetiklenir tetiklenmez (~1.5 sn) revoke edilir.
     */
    function _saveBlobAsFile(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Bazı tarayıcılar (Chrome) URL'i hemen revoke edersek dosyayı yarıda keser.
        setTimeout(() => window.URL.revokeObjectURL(url), 1500);
    }

    /**
     * Sunucu hata gönderdiyse PDF yerine JSON döner — Blob'u text olarak
     * okuyup içerideki anlamlı `message` alanını çıkarmaya çalışır.
     */
    async function _readServerErrorMessage(response) {
        try {
            const text = await response.text();
            if (!text) return null;
            try {
                const obj = JSON.parse(text);
                return obj?.message || obj?.error || null;
            } catch (_) {
                // JSON değilse text'i ham döndür (kısa bir HTML hatası olabilir)
                return text.length < 200 ? text : null;
            }
        } catch (_) {
            return null;
        }
    }

    /**
     * Modül ne notifier verilirse onu kullanır. Hiç verilmemişse:
     *   1) `window.showOrdersToast` varsa onu çağırır (öğrenci orders sayfası).
     *   2) Yoksa `window.toast?.error` / `.success` denenir (genel toast servisi).
     *   3) En son çare olarak `alert()` çalışır.
     */
    function _defaultNotify(message, type) {
        if (typeof window.showOrdersToast === 'function') {
            window.showOrdersToast(message, type);
            return;
        }
        if (window.toast && typeof window.toast[type] === 'function') {
            window.toast[type](message);
            return;
        }
        // Son çare — hata için alert, başarı için sessiz (tarayıcı zaten dosya iniyor diye gösteriyor).
        if (type === 'error') window.alert(message);
    }

    // ─────────────────────────── Çekirdek ───────────────────────────

    /**
     * Asıl indirme akışı. Düşük seviye — UI dokunması yok.
     * @returns {Promise<{filename:string}>}
     */
    async function _doDownload(orderId) {
        if (!orderId || !UUID_RE.test(orderId)) {
            const err = new Error('Geçersiz sipariş kimliği.');
            err.statusCode = 400;
            throw err;
        }

        const token = _getToken();
        if (!token) {
            const err = new Error(STATUS_MESSAGES[401]);
            err.statusCode = 401;
            throw err;
        }

        const response = await fetch(`${ENDPOINT_BASE}${encodeURIComponent(orderId)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/pdf',
                'Authorization': `Bearer ${token}`,
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            const serverMsg = await _readServerErrorMessage(response);
            const err = new Error(
                serverMsg || STATUS_MESSAGES[response.status] || `İndirme başarısız (HTTP ${response.status}).`
            );
            err.statusCode = response.status;
            throw err;
        }

        const blob = await response.blob();
        if (!blob || !blob.type || !blob.type.toLowerCase().includes('pdf')) {
            const err = new Error('Sunucu beklenen PDF dosyasını döndürmedi.');
            err.statusCode = 502;
            throw err;
        }

        const filename = _parseFilename(
            response.headers.get('Content-Disposition'),
            orderId
        );
        _saveBlobAsFile(blob, filename);
        return { filename };
    }

    // ─────────────────────────── Public API ─────────────────────────

    /**
     * Tek bir dekont indirme akışı tetikler. Tüm UI durumu opts callback'leri
     * üzerinden raporlanır — modül DOM'a otomatik dokunmaz.
     *
     * @param {string} orderId
     * @param {object} [opts]
     * @param {()=>void}             [opts.onStart]
     * @param {(info:{filename})=>void} [opts.onSuccess]
     * @param {(err:Error)=>void}    [opts.onError]
     * @param {()=>void}             [opts.onFinish]
     * @param {(msg:string, type:'success'|'error'|'info')=>void} [opts.notify]
     *        İndirme başarılı/başarısız mesajını göstermek için. Verilmezse
     *        modül kendi fallback'ini kullanır (showOrdersToast → toast.error → alert).
     * @param {boolean} [opts.silent=false]
     *        true ise modül kendi notify'ını çağırmaz, sadece callback'leri tetikler.
     */
    async function download(orderId, opts = {}) {
        opts.onStart?.();
        try {
            const info = await _doDownload(orderId);
            if (!opts.silent) {
                (opts.notify || _defaultNotify)('Dekont indirildi.', 'success');
            }
            opts.onSuccess?.(info);
        } catch (err) {
            console.warn('[Receipt] indirme hatası:', err.message);
            if (!opts.silent) {
                (opts.notify || _defaultNotify)(err.message, 'error');
            }
            opts.onError?.(err);
        } finally {
            opts.onFinish?.();
        }
    }

    /**
     * Bir buton üzerinde spinner + disable döngüsünü yönetir.
     * Buton içeriği önce saklanır, indirme bitince geri yüklenir.
     */
    function _runWithButtonUx(btn, orderId, externalOpts = {}) {
        const original = btn.innerHTML;
        const labelMatch = original.match(/>([^<]+)</);
        const baseLabel = labelMatch ? labelMatch[1].trim() : 'Dekont İndir';

        return download(orderId, {
            ...externalOpts,
            onStart: () => {
                btn.disabled = true;
                btn.setAttribute('aria-busy', 'true');
                btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>İndiriliyor...</span>`;
                externalOpts.onStart?.();
            },
            onFinish: () => {
                btn.disabled = false;
                btn.removeAttribute('aria-busy');
                btn.innerHTML = original;
                externalOpts.onFinish?.();
            },
        });
    }

    /**
     * DOM'daki butonlara tek seferde event bağlar. Hem `data-order-id` hem
     * `data-receipt-id` desteklenir (geriye dönük uyum).
     *
     * @param {Element|Document} [root=document]
     * @param {object} [opts] - `download()` ile aynı opts; her butona uygulanır.
     */
    function bindButtons(root = document, opts = {}) {
        const selector = '[data-order-id],[data-receipt-id]';
        root.querySelectorAll(selector).forEach((btn) => {
            if (btn._receiptBound) return;
            btn._receiptBound = true;
            btn.addEventListener('click', (ev) => {
                ev.preventDefault();
                const orderId = btn.dataset.orderId || btn.dataset.receiptId;
                if (!orderId) return;
                _runWithButtonUx(btn, orderId, opts);
            });
        });
    }

    /**
     * Tek bir butonu indirme akışına bağlamak için kolaylık helper'ı.
     * UI durum yönetimini buton üzerinde otomatik yapar.
     */
    function attach(btn, orderId, opts = {}) {
        if (!btn) return;
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            _runWithButtonUx(btn, orderId, opts);
        });
    }

    global.ReceiptDownloader = {
        download,
        bindButtons,
        attach,
    };
})(window);
