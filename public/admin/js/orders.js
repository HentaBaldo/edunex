/**
 * EduNex Admin - Siparişler / Ödemeler sayfası mantığı.
 * /api/admin/orders (liste), /api/admin/orders/:id (detay), /api/admin/orders/summary
 */

const state = {
    page: 1,
    limit: 20,
    pages: 1,
    total: 0,
    filters: { q: '', durum: '', from: '', to: '' },
};

document.addEventListener('DOMContentLoaded', () => {
    wireUi();
    loadSummary();
    loadOrders();
});

function wireUi() {
    document.getElementById('applyBtn').addEventListener('click', () => {
        state.filters = {
            q: document.getElementById('searchInput').value.trim(),
            durum: document.getElementById('statusFilter').value,
            from: document.getElementById('fromDate').value,
            to: document.getElementById('toDate').value,
        };
        state.page = 1;
        loadOrders();
    });

    document.getElementById('resetBtn').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        document.getElementById('statusFilter').value = '';
        document.getElementById('fromDate').value = '';
        document.getElementById('toDate').value = '';
        state.filters = { q: '', durum: '', from: '', to: '' };
        state.page = 1;
        loadOrders();
    });

    document.getElementById('prevBtn').addEventListener('click', () => {
        if (state.page > 1) { state.page--; loadOrders(); }
    });
    document.getElementById('nextBtn').addEventListener('click', () => {
        if (state.page < state.pages) { state.page++; loadOrders(); }
    });

    document.getElementById('searchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('applyBtn').click();
    });

    document.getElementById('detailOverlay').addEventListener('click', (e) => {
        if (e.target.id === 'detailOverlay') closeDetail();
    });
}

async function loadSummary() {
    try {
        const result = await ApiService.get('/admin/orders/summary');
        const d = result.data || {};
        const s = d.summary || {};
        document.getElementById('sumRevenue').textContent = fmtTry(d.toplamCiro || 0);
        document.getElementById('sumTotal').textContent = d.toplamSiparis ?? 0;
        document.getElementById('sumDone').textContent = s.tamamlandi?.adet ?? 0;
        document.getElementById('sumPending').textContent = s.beklemede?.adet ?? 0;
        document.getElementById('sumFailed').textContent = s.basarisiz?.adet ?? 0;
        document.getElementById('sumRefund').textContent = s.iade_edildi?.adet ?? 0;
    } catch (err) {
        console.warn('Özet yüklenemedi:', err.message);
    }
}

async function loadOrders() {
    const body = document.getElementById('ordersBody');
    body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#64748b;">Yükleniyor...</td></tr>';

    const qs = new URLSearchParams({ page: state.page, limit: state.limit });
    if (state.filters.q) qs.set('q', state.filters.q);
    if (state.filters.durum) qs.set('durum', state.filters.durum);
    if (state.filters.from) qs.set('from', state.filters.from);
    if (state.filters.to) qs.set('to', state.filters.to);

    try {
        const result = await ApiService.get(`/admin/orders?${qs.toString()}`);
        const items = result?.data?.items || [];
        const pag = result?.data?.pagination || { total: 0, page: 1, pages: 1 };

        state.page = pag.page;
        state.pages = pag.pages;
        state.total = pag.total;

        document.getElementById('pageInfo').textContent = `${pag.total} kayıt · Sayfa ${pag.page}/${Math.max(1, pag.pages)}`;
        document.getElementById('prevBtn').disabled = pag.page <= 1;
        document.getElementById('nextBtn').disabled = pag.page >= pag.pages;

        if (items.length === 0) {
            body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#64748b;">Eşleşen sipariş bulunamadı.</td></tr>';
            return;
        }

        body.innerHTML = items.map(renderRow).join('');
    } catch (err) {
        body.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;color:#ef4444;">${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderRow(o) {
    const ogrenci = o.Profile ? `${o.Profile.ad} ${o.Profile.soyad}<br><small style="color:#64748b;">${escapeHtml(o.Profile.eposta || '')}</small>` : '<span style="color:#94a3b8;">Silinmiş</span>';
    const kalem = Array.isArray(o.OrderItems) ? o.OrderItems.length : 0;
    return `
        <tr>
            <td><span class="ref">${escapeHtml(o.id)}</span></td>
            <td>${formatDate(o.olusturulma_tarihi)}</td>
            <td>${ogrenci}</td>
            <td>${kalem}</td>
            <td><b>${fmtTry(o.toplam_tutar)}</b></td>
            <td><span class="pill ${escapeHtml(o.durum || '')}">${statusLabel(o.durum)}</span></td>
            <td style="text-align:right;"><button class="btn-view" onclick="openDetail('${o.id}')"><i class="fas fa-eye"></i> İncele</button></td>
        </tr>`;
}

async function openDetail(id) {
    const overlay = document.getElementById('detailOverlay');
    const body = document.getElementById('detailBody');
    overlay.classList.add('open');
    body.innerHTML = 'Yükleniyor...';

    try {
        const result = await ApiService.get(`/admin/orders/${encodeURIComponent(id)}`);
        body.innerHTML = renderDetail(result.data);
    } catch (err) {
        body.innerHTML = `<p style="color:#ef4444;">${escapeHtml(err.message)}</p>`;
    }
}

function closeDetail() {
    document.getElementById('detailOverlay').classList.remove('open');
}
window.openDetail = openDetail;
window.closeDetail = closeDetail;

function renderDetail(o) {
    const p = o.Profile || {};
    const items = Array.isArray(o.OrderItems) ? o.OrderItems : [];
    const txs = Array.isArray(o.PaymentTransactions) ? o.PaymentTransactions : [];

    const metaHtml = `
        <div class="meta-grid">
            <div class="cell"><small>Sipariş No</small><b style="font-family:monospace;font-size:0.85rem;">${escapeHtml(o.id)}</b></div>
            <div class="cell"><small>Tarih</small><b>${formatDate(o.olusturulma_tarihi)}</b></div>
            <div class="cell"><small>Durum</small><b><span class="pill ${escapeHtml(o.durum || '')}">${statusLabel(o.durum)}</span></b></div>
            <div class="cell"><small>Tutar</small><b>${fmtTry(o.toplam_tutar)}</b></div>
            <div class="cell"><small>Öğrenci</small><b>${escapeHtml((p.ad || '') + ' ' + (p.soyad || ''))}</b><small>${escapeHtml(p.eposta || '')}</small></div>
            <div class="cell"><small>Sağlayıcı</small><b>${escapeHtml(o.saglayici || '-')}</b></div>
            <div class="cell"><small>İyzico Payment ID</small><b style="font-family:monospace;font-size:0.8rem;">${escapeHtml(o.islem_id || '-')}</b></div>
            <div class="cell"><small>Conversation ID</small><b style="font-family:monospace;font-size:0.8rem;">${escapeHtml(o.conversation_id || '-')}</b></div>
        </div>`;

    const itemsHtml = `
        <h3 style="margin:4px 0 10px;font-size:1rem;">Sipariş Kalemleri (${items.length})</h3>
        <div class="items-list">
            ${items.length === 0 ? '<div class="row"><span>Kalem yok</span><span></span></div>'
                : items.map(it => `
                    <div class="row">
                        <span>${escapeHtml(it.Course?.baslik || 'Silinmiş kurs')}</span>
                        <b>${fmtTry(it.odenen_fiyat)}</b>
                    </div>`).join('')}
        </div>`;

    const txHtml = `
        <h3 style="margin:4px 0 10px;font-size:1rem;">Ödeme İşlemleri (${txs.length})</h3>
        <div class="tx-list">
            ${txs.length === 0 ? '<div class="tx-row" style="color:#64748b;">Kayıt yok</div>'
                : txs.map(tx => `
                    <div class="tx-row">
                        <div class="tx-head">
                            <b>${escapeHtml(tx.islem_tipi || '-')} · ${escapeHtml(tx.saglayici || '')}</b>
                            <span style="color:${tx.durum === 'success' || tx.durum === 'SUCCESS' ? '#059669' : '#ef4444'};">${escapeHtml(tx.durum || '-')}</span>
                        </div>
                        <div>Tarih: ${formatDate(tx.olusturulma_tarihi)}</div>
                        ${tx.payment_id ? `<div>Payment ID: <code>${escapeHtml(tx.payment_id)}</code></div>` : ''}
                        ${tx.hata_mesaji ? `<div style="color:#b91c1c;">Hata: ${escapeHtml(tx.hata_mesaji)}</div>` : ''}
                    </div>`).join('')}
        </div>`;

    return metaHtml + itemsHtml + txHtml;
}

function statusLabel(durum) {
    switch ((durum || '').toLowerCase()) {
        case 'tamamlandi': return 'Tamamlandı';
        case 'beklemede': return 'Beklemede';
        case 'basarisiz': return 'Başarısız';
        case 'iade_edildi': return 'İade Edildi';
        default: return durum || '-';
    }
}

function fmtTry(v) {
    const n = Number(v || 0);
    return n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
}

function formatDate(iso) {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return String(iso); }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
