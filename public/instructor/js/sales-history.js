/**
 * EduNex Eğitmen - Satış Geçmişi & Hak Edişler
 *
 * /api/instructor/earnings/sales-history endpoint'inden yalnızca BU eğitmenin
 * kazanç satırlarını çeker. Her satır için ReceiptDownloader modülünü kullanan
 * "Hak Ediş Dekontu" indirme butonu sunar.
 *
 * Önemli: PDF endpoint'i (`/api/receipts/download/:orderId`) eğitmen rolüyle
 * çağrıldığında otomatik olarak pazaryeri hak ediş şablonunu üretir; veri
 * gizliliği (başka eğitmenin kalemlerinin gizlenmesi) sunucu tarafında garanti
 * altına alınmıştır.
 */

const state = {
    page: 1,
    limit: 20,
    pages: 1,
    total: 0,
    durum: '',
    rows: [],
};

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        window.location.href = '/auth/index.html';
        return;
    }

    wireUi();
    loadSalesHistory();
});

function wireUi() {
    document.getElementById('durumFilter').addEventListener('change', (e) => {
        state.durum = e.target.value;
        state.page = 1;
        loadSalesHistory();
    });
    document.getElementById('refreshBtn').addEventListener('click', () => loadSalesHistory());
    document.getElementById('prevBtn').addEventListener('click', () => {
        if (state.page > 1) { state.page--; loadSalesHistory(); }
    });
    document.getElementById('nextBtn').addEventListener('click', () => {
        if (state.page < state.pages) { state.page++; loadSalesHistory(); }
    });
}

async function loadSalesHistory() {
    const body = document.getElementById('salesBody');
    body.innerHTML = `
        <tr><td colspan="8" class="sh-empty">
            <i class="fas fa-spinner fa-spin" style="font-size:1.6rem;color:#94a3b8;display:block;margin-bottom:8px;"></i>
            Yükleniyor...
        </td></tr>`;
    _setSummaryLoading(true);

    const qs = new URLSearchParams({ page: state.page, limit: state.limit });
    if (state.durum) qs.set('durum', state.durum);

    try {
        const result = await ApiService.get(`/instructor/earnings/sales-history?${qs.toString()}`);
        const rows = Array.isArray(result.data) ? result.data : [];
        const pag = result.pagination || { total: 0, pages: 1 };

        state.rows = rows;
        state.pages = pag.pages || 1;
        state.total = pag.total || 0;

        renderSummary(rows);
        renderTable(rows);
        renderPagination(pag);
    } catch (err) {
        _setSummaryLoading(false);
        body.innerHTML = `<tr><td colspan="8" class="sh-empty" style="color:#ef4444;">
            <i class="fas fa-circle-exclamation" style="display:block;font-size:1.8rem;margin-bottom:8px;"></i>
            Kayıtlar yüklenemedi: ${escapeHtml(err.message)}
        </td></tr>`;
        showToast(err.message || 'Liste yüklenemedi.', 'error');
    }
}

/**
 * Mevcut sayfadaki satırların toplamı — backend ek bir özet endpoint'i istemeden
 * tablo başında hızlı bir görünüm verir.
 */
function renderSummary(rows) {
    const sumBrut    = rows.reduce((s, r) => s + (r.finans?.brut || 0), 0);
    const sumKesinti = rows.reduce((s, r) => s + (r.finans?.platform_kesintisi || 0), 0);
    const sumNet     = rows.reduce((s, r) => s + (r.finans?.net || 0), 0);

    document.getElementById('sumNet').textContent     = fmtTRY(sumNet);
    document.getElementById('sumBrut').textContent    = fmtTRY(sumBrut);
    document.getElementById('sumKesinti').textContent = fmtTRY(sumKesinti);
    document.getElementById('sumAdet').textContent    = String(state.total);
}

function renderTable(rows) {
    const body = document.getElementById('salesBody');
    if (rows.length === 0) {
        body.innerHTML = `
            <tr><td colspan="8" class="sh-empty">
                <i class="fas fa-store"></i>
                <strong>Henüz satış yok</strong>
                <p>Kursunuz satıldıkça satış geçmişiniz burada görünecek.</p>
            </td></tr>`;
        return;
    }
    body.innerHTML = rows.map(renderRow).join('');

    // ReceiptDownloader: tabloya yeni eklenen dekont butonlarını bağla.
    // Her butonun kendi spinner/disabled UX'i otomatik yönetilir.
    if (window.ReceiptDownloader) {
        ReceiptDownloader.bindButtons(body, {
            notify: (msg, type) => showToast(msg, type),
        });
    }
}

function renderRow(r) {
    const tarih = formatDate(r.tarih);
    const kursBaslik = escapeHtml(r.kurs?.baslik || 'Silinmiş kurs');
    const ogrenci = escapeHtml(r.ogrenci?.ad_soyad || '—');
    const brut = fmtTRY(r.finans?.brut);
    const kesinti = fmtTRY(r.finans?.platform_kesintisi);
    const net = fmtTRY(r.finans?.net);
    const oran = Number(r.finans?.komisyon_orani || 0).toFixed(0);
    const durum = String(r.durum || 'pending').toLowerCase();

    // PDF endpoint sipariş bazlıdır — siparis_id ile çağırırız.
    const orderId = r.siparis_id || '';

    const btnHtml = orderId
        ? `<button class="btn-receipt sm" data-order-id="${escapeHtml(orderId)}"
                   title="Hak Ediş Dekontu (PDF) indir">
              <i class="fas fa-file-invoice-dollar"></i>
              <span>Dekont</span>
           </button>`
        : `<span style="color:#94a3b8;font-size:0.8rem;">—</span>`;

    return `
        <tr>
            <td>${tarih}</td>
            <td>
                <div class="sh-course-title">${kursBaslik}</div>
                <div class="sh-ref">${escapeHtml(orderId)}</div>
            </td>
            <td class="col-student">${ogrenci}</td>
            <td>${brut}</td>
            <td title="Platform komisyonu (%${oran})">${kesinti}</td>
            <td class="sh-net">${net}</td>
            <td><span class="sh-pill ${escapeHtml(durum)}">${statusLabel(durum)}</span></td>
            <td style="text-align:right;">${btnHtml}</td>
        </tr>`;
}

function renderPagination(pag) {
    document.getElementById('pageInfo').textContent =
        `${pag.total ?? 0} kayıt · Sayfa ${pag.page ?? 1}/${pag.pages ?? 1}`;
    document.getElementById('prevBtn').disabled = (pag.page ?? 1) <= 1;
    document.getElementById('nextBtn').disabled = (pag.page ?? 1) >= (pag.pages ?? 1);
}

function _setSummaryLoading(on) {
    ['sumNet', 'sumBrut', 'sumKesinti', 'sumAdet'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (on) {
            el.dataset.prev = el.textContent;
            el.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:1rem;color:#94a3b8;"></i>';
        } else if (el.dataset.prev !== undefined) {
            delete el.dataset.prev;
        }
    });
}

// ─── Yardımcılar ─────────────────────────────────────────────

function statusLabel(d) {
    switch (d) {
        case 'pending':    return 'İade Penceresinde';
        case 'available':  return 'Ödeme Bekliyor';
        case 'processing': return 'İşlemde';
        case 'paid':       return 'Ödendi';
        case 'cancelled':  return 'İptal';
        default:           return d || '-';
    }
}

const _tryFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
function fmtTRY(v) {
    return _tryFmt.format(Number(v || 0));
}

function formatDate(iso) {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) { return String(iso); }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * Hafif toast (instructor pattern'i ile uyumlu).
 */
function showToast(message, type = 'info', durationMs = 4500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.35s';
        setTimeout(() => el.remove(), 400);
    }, durationMs);
}
