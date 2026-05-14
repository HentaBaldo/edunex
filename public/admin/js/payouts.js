/**
 * EduNex Admin - Hakedis & Odeme Yonetimi
 *
 * - GET /api/admin/payouts/summary    -> finansal widgets
 * - GET /api/admin/payouts            -> egitmen-bazli grupli liste
 * - GET /api/admin/payouts/export.csv -> banka uyumlu CSV
 * - POST /api/admin/payouts/bulk-approve { earning_ids | egitmen_id, islem_dekont_no }
 */

(function () {
    'use strict';

    // -------------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------------
    const state = {
        page: 1,
        limit: 20,
        totalPages: 1,
        total: 0,
        status: 'available',
        search: '',
        filters: { minTutar: '', from: '', to: '', ibanVarMi: '' },
        rows: [],
        selected: new Set(), // egitmen_id seti
        approveTargets: [],  // modal'da gosterim
    };

    // -------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------
    function getAdminToken() {
        return localStorage.getItem('edunex_admin_token');
    }

    async function adminFetch(path, options = {}) {
        const token = getAdminToken();
        if (!token) {
            window.location.replace('/admin/login.html');
            throw new Error('Admin token yok');
        }
        const res = await fetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {}),
            },
        });
        if (res.status === 401) {
            window.location.replace('/admin/login.html');
            throw new Error('Yetkisiz');
        }
        if (res.status === 403) {
            // Finans yetkisi yok
            throw new Error('Finans modulune erisim yetkiniz yok. Sistem yoneticisinden talep edin.');
        }
        const body = await res.json();
        if (!body.success) throw new Error(body.message || 'Sunucu hatasi');
        return body;
    }

    function fmtTRY(n) {
        return (Number(n) || 0).toLocaleString('tr-TR', {
            style: 'currency',
            currency: 'TRY',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    function fmtDate(d) {
        if (!d) return '—';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getInitials(ad, soyad) {
        const a = (ad || '').trim().charAt(0).toUpperCase();
        const b = (soyad || '').trim().charAt(0).toUpperCase();
        return (a + b) || '?';
    }

    // IBAN dogrulamasi - Turkiye formati TR + 24 hane (toplam 26 karakter)
    function validateTrIban(rawIban) {
        if (!rawIban) return { valid: false, reason: 'IBAN yok' };
        const iban = String(rawIban).replace(/\s+/g, '').toUpperCase();
        if (!/^TR\d{24}$/.test(iban)) {
            return { valid: false, reason: 'Format hatasi (TR + 24 hane bekleniyor)' };
        }
        // MOD-97: ulke + check digits arkaya tasinir, harfler sayilara cevrilir (A=10, B=11...)
        const rearranged = iban.slice(4) + iban.slice(0, 4);
        let numeric = '';
        for (const ch of rearranged) {
            numeric += /[0-9]/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
        }
        // BigInt destekli buyuk sayi mod
        let mod = 0;
        for (const d of numeric) {
            mod = (mod * 10 + Number(d)) % 97;
        }
        return mod === 1
            ? { valid: true }
            : { valid: false, reason: 'Kontrol hanesi hatali (IBAN checksum)' };
    }

    function maskIban(iban) {
        if (!iban) return '—';
        const clean = String(iban).replace(/\s+/g, '');
        if (clean.length < 10) return clean;
        const head = clean.slice(0, 4);
        const tail = clean.slice(-4);
        const mid = clean.slice(4, -4).replace(/./g, '*');
        // 4'erli grupla
        const grouped = (head + mid + tail).replace(/(.{4})/g, '$1 ').trim();
        return grouped;
    }

    function showToast(msg, type = 'success') {
        const c = document.getElementById('toastContainer');
        if (!c) return;
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        const ikon = type === 'success' ? 'circle-check' : (type === 'warning' ? 'triangle-exclamation' : 'circle-xmark');
        t.innerHTML = `<i class="fas fa-${ikon}"></i> ${escapeHtml(msg)}`;
        c.appendChild(t);
        setTimeout(() => {
            t.classList.add('toast-out');
            setTimeout(() => t.remove(), 300);
        }, 3200);
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (_e) {}
            document.body.removeChild(ta);
            return true;
        }
    }

    // -------------------------------------------------------------------
    // VERI CEKME
    // -------------------------------------------------------------------
    async function loadSummary() {
        try {
            const { data } = await adminFetch('/api/admin/payouts/summary');
            document.getElementById('sumToplamBorc').textContent = fmtTRY(data.toplamBorc);
            document.getElementById('sumToplamBorcAdet').textContent = data.toplamBorcAdet;
            document.getElementById('sumBekleyen').textContent = fmtTRY(data.bekleyen);
            document.getElementById('sumBekleyenAdet').textContent = data.bekleyenAdet;
            document.getElementById('sumBuAyOdenen').textContent = fmtTRY(data.buAyOdenen);
            document.getElementById('sumTumZamanlar').textContent =
                `Tum zamanlar: ${fmtTRY(data.tumZamanlarOdenen)}`;
            document.getElementById('sumAcil').textContent = data.acilOdemeEgitmenSayisi;
            document.getElementById('sumAcilEsigi').textContent = `${data.acilOdemeEsigi} TL`;
        } catch (err) {
            console.error('[PAYOUTS] summary hatasi:', err.message);
            showToast(err.message, 'error');
            ['sumToplamBorc', 'sumBekleyen', 'sumBuAyOdenen', 'sumAcil']
                .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
        }
    }

    async function loadList() {
        const tbody = document.getElementById('payoutsTableBody');
        const info = document.getElementById('payoutCountInfo');
        tbody.innerHTML = `
            <tr><td colspan="6" class="table-empty-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Yukleniyor...</p>
            </td></tr>`;
        info.textContent = '...';

        const params = new URLSearchParams({
            durum: state.status,
            page: state.page,
            limit: state.limit,
        });
        if (state.search) params.set('q', state.search);
        if (state.filters.minTutar)  params.set('minTutar',  state.filters.minTutar);
        if (state.filters.from)      params.set('from',      state.filters.from);
        if (state.filters.to)        params.set('to',        state.filters.to);
        if (state.filters.ibanVarMi) params.set('ibanVarMi', state.filters.ibanVarMi);

        try {
            const body = await adminFetch(`/api/admin/payouts?${params.toString()}`);
            state.rows = Array.isArray(body.data) ? body.data : [];
            state.totalPages = body.pagination?.total_pages || 1;
            state.total = body.pagination?.total || 0;

            info.innerHTML = `<strong>${state.total}</strong> egitmen
                · Sayfa ${body.pagination?.page || 1}/${state.totalPages}`;

            if (state.rows.length === 0) {
                tbody.innerHTML = `
                    <tr><td colspan="6" class="table-empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>Eslesen kayit bulunamadi.</p>
                    </td></tr>`;
                renderPagination();
                refreshBulkBar();
                return;
            }

            tbody.innerHTML = state.rows.map(buildRowHTML).join('');
            renderPagination();
            refreshBulkBar();
        } catch (err) {
            console.error('[PAYOUTS] list hatasi:', err.message);
            tbody.innerHTML = `
                <tr><td colspan="6" class="table-empty-state error">
                    <i class="fas fa-triangle-exclamation"></i>
                    <p>${escapeHtml(err.message)}</p>
                </td></tr>`;
            info.textContent = '—';
            showToast(err.message, 'error');
        }
    }

    // -------------------------------------------------------------------
    // RENDER
    // -------------------------------------------------------------------
    function buildRowHTML(r) {
        const adSoyad = `${r.egitmen?.ad || ''} ${r.egitmen?.soyad || ''}`.trim() || 'Bilinmeyen';
        const initials = getInitials(r.egitmen?.ad, r.egitmen?.soyad);
        const eposta = r.egitmen?.eposta || '';

        const ibanCheck = validateTrIban(r.iban_no);
        const ibanText = r.iban_no
            ? `<span class="iban-text" title="${escapeHtml(r.iban_no)}">${escapeHtml(maskIban(r.iban_no))}</span>
               ${ibanCheck.valid
                   ? '<i class="fas fa-circle-check iban-ok" title="IBAN gecerli"></i>'
                   : `<i class="fas fa-circle-xmark iban-bad" title="${escapeHtml(ibanCheck.reason)}"></i>`}
               <button class="iban-copy-btn" data-copy="${escapeHtml(r.iban_no)}" title="IBAN'i kopyala">
                   <i class="fas fa-copy"></i>
               </button>`
            : '<span class="iban-missing"><i class="fas fa-circle-xmark"></i> IBAN yok</span>';

        const ilkKazanc = fmtDate(r.ilk_kazanc);
        const odenebilirlik = fmtDate(r.odenebilirlik_tarihi);
        const odenebilirAktif = r.odenebilirlik_tarihi && new Date(r.odenebilirlik_tarihi) <= new Date();
        const acilBadge = r.acil_mi
            ? '<span class="acil-badge"><i class="fas fa-fire"></i> Acil</span>'
            : '';

        const isSelectable = state.status === 'available' && ibanCheck.valid;
        const isChecked = state.selected.has(r.egitmen_id);

        // Aksiyon: status'a gore farkli buton:
        //   - available  -> "Odemeyi Onayla" (modal'a duser, iyzico approval ile odenir)
        //   - pending    -> "Simdi Onayla (Sure Beklemeden)" (T+14 beklemeden direkt iyzico approval)
        //   - paid/cancelled/processing -> aksiyon yok
        let aksiyon = '<span class="text-muted">—</span>';
        if (state.status === 'available') {
            aksiyon = `<button class="btn-primary btn-sm row-approve-btn" data-egitmen="${escapeHtml(r.egitmen_id)}" ${ibanCheck.valid ? '' : 'disabled title="IBAN gecersiz"'}>
                           <i class="fas fa-check"></i> Odemeyi Onayla
                       </button>`;
        } else if (state.status === 'pending') {
            aksiyon = `<button class="btn-warning btn-sm row-approve-now-btn" data-egitmen="${escapeHtml(r.egitmen_id)}" ${ibanCheck.valid ? '' : 'disabled title="IBAN gecersiz"'} title="T+14 iade penceresini bekleme, iyzico'da hemen onayla">
                           <i class="fas fa-bolt"></i> Simdi Onayla
                       </button>`;
        }

        return `
            <tr class="${r.acil_mi ? 'row-acil' : ''}" data-egitmen-id="${escapeHtml(r.egitmen_id)}">
                <td class="col-check">
                    <input type="checkbox"
                           class="row-checkbox"
                           data-egitmen="${escapeHtml(r.egitmen_id)}"
                           ${isChecked ? 'checked' : ''}
                           ${isSelectable ? '' : 'disabled'}
                           aria-label="Sec">
                </td>
                <td>
                    <div class="egitmen-cell">
                        <div class="egitmen-avatar">${escapeHtml(initials)}</div>
                        <div class="egitmen-meta">
                            <strong>${escapeHtml(adSoyad)} ${acilBadge}</strong>
                            <small>${escapeHtml(eposta)}</small>
                            <div class="egitmen-iban">${ibanText}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="kazanc-detayi">
                        <div><span class="label">Brut:</span> <strong>${escapeHtml(fmtTRY(r.toplam_brut))}</strong></div>
                        <div><span class="label">%${escapeHtml(r.komisyon_orani)} Kesinti:</span> <span class="kesinti-tutar">-${escapeHtml(fmtTRY(r.toplam_kesinti))}</span></div>
                        <div class="net-row"><span class="label">Net:</span> <strong class="net-tutar">${escapeHtml(fmtTRY(r.toplam_net))}</strong></div>
                        <small class="kalem-info"><i class="fas fa-receipt"></i> ${escapeHtml(r.kazanc_adet)} kazanc kalemi</small>
                    </div>
                </td>
                <td>
                    <div class="zaman-detayi">
                        <div><span class="label">Ilk kazanc:</span> ${escapeHtml(ilkKazanc)}</div>
                        <div>
                            <span class="label">Odenebilir:</span>
                            <span class="${odenebilirAktif ? 'odenebilir-dolu' : 'odenebilir-bekliyor'}">
                                ${escapeHtml(odenebilirlik)}
                            </span>
                        </div>
                    </div>
                </td>
                <td class="col-status">
                    <span class="durum-badge durum-${escapeHtml(state.status)}">
                        ${escapeHtml(durumLabel(state.status))}
                    </span>
                </td>
                <td class="col-action">${aksiyon}</td>
            </tr>`;
    }

    function durumLabel(d) {
        return ({
            pending: 'Iade Suresinde (Bekliyor)',
            available: 'Odenebilir',
            processing: 'Islemde',
            paid: 'Otomatik Odendi',
            cancelled: 'Iptal',
        })[d] || d;
    }

    function renderPagination() {
        const container = document.getElementById('payoutsPagination');
        if (!container) return;
        if (state.totalPages <= 1) { container.innerHTML = ''; return; }

        const { page, totalPages } = { page: state.page, totalPages: state.totalPages };
        let html = `<button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i>
                    </button>`;
        for (let i = 1; i <= totalPages; i++) {
            const isEdge = (i === 1 || i === totalPages);
            const isNear = Math.abs(i - page) <= 2;
            if (isEdge || isNear) {
                html += `<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
            } else if (Math.abs(i - page) === 3) {
                html += `<span class="page-dots">…</span>`;
            }
        }
        html += `<button class="page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                 </button>`;
        container.innerHTML = html;
    }

    // -------------------------------------------------------------------
    // BULK SELECTION
    // -------------------------------------------------------------------
    function refreshBulkBar() {
        const bar = document.getElementById('bulkActionsBar');
        const count = state.selected.size;
        if (count === 0) {
            bar.hidden = true;
            return;
        }
        // Sadece bu sayfada gorunenler arasinda secililerin toplami (UI'da gosterim)
        const selectedRows = state.rows.filter(r => state.selected.has(r.egitmen_id));
        const toplamNet = selectedRows.reduce((sum, r) => sum + Number(r.toplam_net || 0), 0);
        document.getElementById('bulkCount').textContent = count;
        document.getElementById('bulkTotal').textContent = fmtTRY(toplamNet);
        bar.hidden = false;

        // Tumunu sec checkbox state'i
        const allOnPage = state.rows.filter(r =>
            state.status === 'available' && validateTrIban(r.iban_no).valid
        );
        const allSel = document.getElementById('selectAllCheckbox');
        if (allOnPage.length > 0 && allOnPage.every(r => state.selected.has(r.egitmen_id))) {
            allSel.checked = true;
            allSel.indeterminate = false;
        } else if (count > 0) {
            allSel.checked = false;
            allSel.indeterminate = true;
        } else {
            allSel.checked = false;
            allSel.indeterminate = false;
        }
    }

    function toggleSelect(egitmenId, on) {
        if (on) state.selected.add(egitmenId);
        else    state.selected.delete(egitmenId);
        refreshBulkBar();
    }

    // -------------------------------------------------------------------
    // ONAY MODAL'I
    // -------------------------------------------------------------------
    function openApproveModal(targets) {
        if (!targets || targets.length === 0) return;
        state.approveTargets = targets;

        const toplamNet = targets.reduce((sum, t) => sum + Number(t.toplam_net || 0), 0);
        document.getElementById('approveModalCount').textContent = targets.length;
        document.getElementById('approveModalTotal').textContent = fmtTRY(toplamNet);

        // Liste
        const list = document.getElementById('approveIbanList');
        list.innerHTML = targets.map(t => {
            const adSoyad = `${t.egitmen?.ad || ''} ${t.egitmen?.soyad || ''}`.trim();
            const ibanV = validateTrIban(t.iban_no);
            return `
                <div class="approve-iban-row ${ibanV.valid ? '' : 'has-warning'}">
                    <div class="approve-iban-name">
                        <strong>${escapeHtml(adSoyad)}</strong>
                        <small>${escapeHtml(maskIban(t.iban_no))}</small>
                    </div>
                    <div class="approve-iban-amount">${escapeHtml(fmtTRY(t.toplam_net))}</div>
                </div>`;
        }).join('');

        document.getElementById('dekontInput').value = '';
        document.getElementById('approveModal').hidden = false;
        setTimeout(() => document.getElementById('dekontInput').focus(), 100);
    }

    function closeApproveModal() {
        document.getElementById('approveModal').hidden = true;
        state.approveTargets = [];
    }

    /**
     * "Simdi Onayla" akisi (status='pending' icin admin override).
     * Modal kullanmadan, direkt bulk-approve'u iyzico modunda cagirir.
     * Backend payoutApprovalService uzerinden iyzico'da approval atar.
     */
    async function approveNowForEgitmen(btn, target) {
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Onaylaniyor...';
        try {
            const body = await adminFetch('/api/admin/payouts/bulk-approve', {
                method: 'POST',
                body: JSON.stringify({
                    egitmen_id: target.egitmen_id,
                    // manual_transfer FALSE -> iyzico approval cagrilir, T+14 bekleme atlanir
                }),
            });
            const d = body.data || {};
            showToast(
                `Iyzico onayi: ${d.approved || 0} kalem onaylandi, ${d.failed || 0} hatali, ${d.skipped || 0} atlandi.`,
                d.failed > 0 ? 'warning' : 'success'
            );
            await Promise.all([loadSummary(), loadList()]);
        } catch (err) {
            console.error('[PAYOUTS] approve-now hata:', err.message);
            showToast(`Onaylanamadi: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
        }
    }

    async function confirmApprove() {
        // Modal davranisi:
        //   - dekont alani BOS -> IYZICO OTOMATIK mod (varsayilan, onerilen)
        //   - dekont alani DOLU -> MANUEL BANKA TRANSFER mod (legacy / iyzico yapilamayan kayitlar icin)
        const dekontNo = document.getElementById('dekontInput').value.trim();
        const manualMode = dekontNo.length > 0;
        if (manualMode && dekontNo.length > 100) {
            showToast('Dekont numarasi 100 karakteri asamaz.', 'error');
            return;
        }

        const btn = document.getElementById('confirmApproveBtn');
        btn.disabled = true;
        btn.innerHTML = manualMode
            ? '<i class="fas fa-spinner fa-spin"></i> Manuel transfer kaydediliyor...'
            : '<i class="fas fa-spinner fa-spin"></i> Iyzico\'da onaylaniyor...';

        try {
            // Egitmen bazli toplu: backend her egitmen icin ayri istek atilir.
            let toplamOnaylanan = 0;
            let toplamHatali = 0;
            for (const t of state.approveTargets) {
                const body = await adminFetch('/api/admin/payouts/bulk-approve', {
                    method: 'POST',
                    body: JSON.stringify({
                        egitmen_id: t.egitmen_id,
                        ...(manualMode
                            ? { manual_transfer: true, islem_dekont_no: dekontNo }
                            : {}),
                    }),
                });
                const d = body.data || {};
                toplamOnaylanan += Number(d.approved ?? d.affectedCount ?? 0);
                toplamHatali += Number(d.failed || 0);
            }
            showToast(
                manualMode
                    ? `Manuel transfer kaydedildi: ${toplamOnaylanan} kalem.`
                    : `Iyzico onayi: ${toplamOnaylanan} kalem onaylandi${toplamHatali > 0 ? `, ${toplamHatali} hatali` : ''}.`,
                toplamHatali > 0 ? 'warning' : 'success'
            );
            state.selected.clear();
            closeApproveModal();
            await Promise.all([loadSummary(), loadList()]);
        } catch (err) {
            showToast(`Onaylanamadi: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Onayla';
        }
    }

    // -------------------------------------------------------------------
    // EVENT BINDING
    // -------------------------------------------------------------------
    function bindEvents() {
        // Durum chip'leri
        document.querySelector('.payouts-status-filters').addEventListener('click', (e) => {
            const btn = e.target.closest('.rating-chip');
            if (!btn) return;
            document.querySelectorAll('.payouts-status-filters .rating-chip')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.status = btn.getAttribute('data-status') || 'available';
            state.page = 1;
            state.selected.clear();
            loadList();
        });

        // Arama (debounce)
        let timer = null;
        document.getElementById('payoutSearchInput').addEventListener('input', (e) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                state.search = (e.target.value || '').trim();
                state.page = 1;
                loadList();
            }, 280);
        });

        // Gelismis filtreler
        document.getElementById('applyFiltersBtn').addEventListener('click', () => {
            state.filters.minTutar  = document.getElementById('filterMinTutar').value;
            state.filters.from      = document.getElementById('filterFrom').value;
            state.filters.to        = document.getElementById('filterTo').value;
            state.filters.ibanVarMi = document.getElementById('filterIban').value;
            state.page = 1;
            loadList();
        });
        document.getElementById('resetFiltersBtn').addEventListener('click', () => {
            ['filterMinTutar', 'filterFrom', 'filterTo'].forEach(id => {
                document.getElementById(id).value = '';
            });
            document.getElementById('filterIban').value = '';
            state.filters = { minTutar: '', from: '', to: '', ibanVarMi: '' };
            state.page = 1;
            loadList();
        });

        // CSV Export - admin token'i URL'e koymak yerine fetch ile blob alip indirme
        document.getElementById('exportCsvBtn').addEventListener('click', async () => {
            const btn = document.getElementById('exportCsvBtn');
            const orig = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Hazirlaniyor...';
            try {
                const params = new URLSearchParams({ durum: state.status });
                if (state.search) params.set('q', state.search);
                if (state.filters.minTutar)  params.set('minTutar',  state.filters.minTutar);
                if (state.filters.from)      params.set('from',      state.filters.from);
                if (state.filters.to)        params.set('to',        state.filters.to);
                if (state.filters.ibanVarMi) params.set('ibanVarMi', state.filters.ibanVarMi);

                const token = getAdminToken();
                const res = await fetch(`/api/admin/payouts/export.csv?${params.toString()}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (!res.ok) throw new Error(`Sunucu hatasi (${res.status})`);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `edunex_odeme_listesi_${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                showToast('CSV indirildi.', 'success');
            } catch (err) {
                showToast(`CSV indirilemedi: ${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = orig;
            }
        });

        // Tablo body - delegated events
        document.getElementById('payoutsTableBody').addEventListener('click', (e) => {
            // IBAN kopyala
            const copyBtn = e.target.closest('.iban-copy-btn');
            if (copyBtn) {
                const iban = copyBtn.getAttribute('data-copy');
                copyToClipboard(iban).then(() => showToast('IBAN kopyalandi.', 'success'));
                return;
            }

            // Tek satir onay (status='available' - normal akis)
            const approveBtn = e.target.closest('.row-approve-btn');
            if (approveBtn) {
                const egitmenId = approveBtn.getAttribute('data-egitmen');
                const target = state.rows.find(r => r.egitmen_id === egitmenId);
                if (target) {
                    const ibanV = validateTrIban(target.iban_no);
                    if (!ibanV.valid) {
                        showToast(`IBAN gecersiz: ${ibanV.reason}`, 'error');
                        return;
                    }
                    openApproveModal([target]);
                }
                return;
            }

            // "Simdi Onayla (Sure Beklemeden)" - status='pending' icin admin override
            const approveNowBtn = e.target.closest('.row-approve-now-btn');
            if (approveNowBtn) {
                const egitmenId = approveNowBtn.getAttribute('data-egitmen');
                const target = state.rows.find(r => r.egitmen_id === egitmenId);
                if (target) {
                    const ibanV = validateTrIban(target.iban_no);
                    if (!ibanV.valid) {
                        showToast(`IBAN gecersiz: ${ibanV.reason}`, 'error');
                        return;
                    }
                    const tutar = fmtTRY(target.toplam_net);
                    const adSoyad = `${target.egitmen?.ad || ''} ${target.egitmen?.soyad || ''}`.trim();
                    if (!confirm(
                        `T+14 iade penceresini bekleme atlanacak.\n\n` +
                        `${adSoyad} icin ${tutar} hakedis, iyzico'da hemen onaylanacak.\n\n` +
                        `Bu islem geri alinamaz. Devam edilsin mi?`
                    )) return;
                    approveNowForEgitmen(approveNowBtn, target);
                }
                return;
            }
        });

        // Checkbox'lar (change event - delegated)
        document.getElementById('payoutsTableBody').addEventListener('change', (e) => {
            const cb = e.target.closest('.row-checkbox');
            if (cb) {
                toggleSelect(cb.getAttribute('data-egitmen'), cb.checked);
            }
        });

        // Tumunu sec
        document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
            const on = e.target.checked;
            state.rows.forEach(r => {
                if (state.status === 'available' && validateTrIban(r.iban_no).valid) {
                    if (on) state.selected.add(r.egitmen_id);
                    else    state.selected.delete(r.egitmen_id);
                }
            });
            // Sayfadaki checkbox'lari guncelle
            document.querySelectorAll('.row-checkbox:not(:disabled)').forEach(cb => { cb.checked = on; });
            refreshBulkBar();
        });

        // Bulk approve
        document.getElementById('bulkApproveBtn').addEventListener('click', () => {
            if (state.selected.size === 0) {
                showToast('Once en az bir egitmen secin.', 'warning');
                return;
            }
            // IBAN'i olmayanlari/ gecersizleri ayikla
            const all = state.rows.filter(r => state.selected.has(r.egitmen_id));
            const valid = all.filter(r => validateTrIban(r.iban_no).valid);
            const invalid = all.filter(r => !validateTrIban(r.iban_no).valid);

            if (invalid.length > 0) {
                const list = document.getElementById('ibanWarningList');
                list.innerHTML = invalid.map(r => `
                    <li>${escapeHtml(`${r.egitmen?.ad || ''} ${r.egitmen?.soyad || ''}`.trim())}
                        — ${escapeHtml(validateTrIban(r.iban_no).reason)}</li>
                `).join('');
                document.getElementById('ibanWarningModal').hidden = false;
                return;
            }
            openApproveModal(valid);
        });

        document.getElementById('bulkClearBtn').addEventListener('click', () => {
            state.selected.clear();
            document.querySelectorAll('.row-checkbox').forEach(cb => { cb.checked = false; });
            refreshBulkBar();
        });

        // Modal'lar
        document.getElementById('cancelApproveBtn').addEventListener('click', closeApproveModal);
        document.getElementById('confirmApproveBtn').addEventListener('click', confirmApprove);
        document.getElementById('approveModal').addEventListener('click', (e) => {
            if (e.target.id === 'approveModal') closeApproveModal();
        });

        document.getElementById('cancelIbanWarnBtn').addEventListener('click', () => {
            document.getElementById('ibanWarningModal').hidden = true;
        });
        document.getElementById('ibanWarningModal').addEventListener('click', (e) => {
            if (e.target.id === 'ibanWarningModal') {
                document.getElementById('ibanWarningModal').hidden = true;
            }
        });

        // ESC -> modal kapat
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (!document.getElementById('approveModal').hidden) closeApproveModal();
                if (!document.getElementById('ibanWarningModal').hidden) {
                    document.getElementById('ibanWarningModal').hidden = true;
                }
            }
        });

        // Pagination (delegation)
        document.getElementById('payoutsPagination').addEventListener('click', (e) => {
            const btn = e.target.closest('.page-btn:not([disabled])');
            if (!btn) return;
            const p = parseInt(btn.getAttribute('data-page'), 10);
            if (!isNaN(p) && p >= 1 && p <= state.totalPages) {
                state.page = p;
                loadList().then(() => window.scrollTo({ top: 200, behavior: 'smooth' }));
            }
        });
    }

    // -------------------------------------------------------------------
    // INIT
    // -------------------------------------------------------------------
    function init() {
        if (!getAdminToken()) {
            window.location.href = '/admin/login.html';
            return;
        }
        bindEvents();
        loadSummary();
        loadList();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
