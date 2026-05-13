/**
 * EduNex - Siparişlerim sayfası
 * /api/payments/orders/my endpoint'inden öğrencinin sipariş geçmişini çeker.
 * İade talebi: POST /api/payments/refund/:orderItemId
 *   — backend 14 gün + %20 ilerleme şartlarını uygular ve hata mesajını döner.
 */

const IADE_PENCERESI_GUN = 14;

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        window.location.href = '/auth/index.html';
        return;
    }
    loadOrders();

    // İade butonları event delegation ile yakalanır (dinamik HTML için güvenli)
    document.getElementById('ordersRoot').addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-refund');
        if (!btn || btn.disabled) return;
        const itemId = btn.dataset.itemId;
        if (itemId) requestRefund(itemId, btn);
    });
});

async function loadOrders() {
    const root = document.getElementById('ordersRoot');
    root.innerHTML = '<p>Siparişleriniz yükleniyor...</p>';

    try {
        const result = await ApiService.get('/payments/orders/my');
        const orders = Array.isArray(result.data) ? result.data : [];
        render(orders);
    } catch (err) {
        root.innerHTML = `<p style="color:#ef4444;">Siparişler yüklenemedi: ${escapeHtml(err.message)}</p>`;
    }
}

function render(orders) {
    const root = document.getElementById('ordersRoot');

    if (orders.length === 0) {
        root.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h2>Henüz sipariş yok</h2>
                <p>Kurs satın aldığınızda siparişleriniz burada listelenecek.</p>
                <a href="/main/index.html#courses" class="btn-auth-blue" style="display:inline-block;margin-top:10px;text-decoration:none;">Kursları Keşfet</a>
            </div>`;
        return;
    }

    root.innerHTML = orders.map(renderOrderCard).join('');
}

function renderOrderCard(order) {
    const tarih = formatDate(order.olusturulma_tarihi);
    const tutar = Number(order.toplam_tutar || 0).toFixed(2);
    const durum = (order.durum || 'beklemede').toLowerCase();
    const items = Array.isArray(order.OrderItems) ? order.OrderItems : [];
    const refId = order.islem_id || order.conversation_id || '';
    const isCompleted = durum === 'tamamlandi';

    // İade penceresi hesabı (client-side ipucu — backend yine de doğrular)
    const siparisTarihi = order.olusturulma_tarihi ? new Date(order.olusturulma_tarihi) : null;
    const gecenGun = siparisTarihi
        ? (Date.now() - siparisTarihi.getTime()) / (1000 * 60 * 60 * 24)
        : 999;
    const iadeWindowAcik = gecenGun <= IADE_PENCERESI_GUN;

    return `
        <article class="order-card">
            <header class="order-head">
                <div>
                    <div class="meta"><strong>Sipariş No:</strong> <span class="ref-id">${escapeHtml(order.id)}</span></div>
                    <div class="meta" style="margin-top:4px;"><strong>Tarih:</strong> ${tarih}</div>
                    ${refId ? `<div class="meta" style="margin-top:4px;"><strong>İşlem Ref:</strong> <span class="ref-id">${escapeHtml(refId)}</span></div>` : ''}
                </div>
                <div class="right">
                    <div class="amount">${tutar} ${escapeHtml(order.para_birimi || 'TRY')}</div>
                    <span class="status-pill status-${escapeHtml(durum)}">${statusLabel(durum)}</span>
                </div>
            </header>
            <div class="order-items">
                ${items.length === 0
                    ? '<p style="color:#64748b;padding:10px 0;">Bu siparişte kalem bulunamadı.</p>'
                    : items.map(it => renderItemRow(it, isCompleted, iadeWindowAcik)).join('')
                }
            </div>
        </article>`;
}

function renderItemRow(item, isCompleted, iadeWindowAcik) {
    const title = item.Course?.baslik || 'Silinmiş kurs';
    const fiyat = Number(item.odenen_fiyat || 0).toFixed(2);
    const hakedis = item.hakedis_durumu || 'beklemede';

    // İzle butonu — iade edilmiş kursa erişim yok
    const izleHtml = isCompleted && item.Course?.id && hakedis !== 'iade_edildi'
        ? `<a href="/student/learning-room.html?id=${encodeURIComponent(item.Course.id)}"
               style="color:#2563eb;text-decoration:none;font-weight:600;font-size:0.9rem;">
               <i class="fas fa-play-circle"></i> İzle
           </a>`
        : '';

    // İade durumu rozeti veya butonu
    let iadeHtml = '';
    if (hakedis === 'iade_edildi') {
        iadeHtml = '<span class="badge-iade"><i class="fas fa-undo"></i> İade Edildi</span>';
    } else if (hakedis === 'onaylandi') {
        iadeHtml = '<span class="badge-onaylandi"><i class="fas fa-check-circle"></i> Ödeme Onaylı</span>';
    } else if (isCompleted && hakedis === 'beklemede') {
        // Pencere kapalıysa pasif — backend yine de kesin kontrolü yapıyor
        const disabledAttr = iadeWindowAcik ? '' : 'disabled';
        const titleAttr = iadeWindowAcik
            ? 'title="14 gün ve %20 ilerleme sınırı uygulanır"'
            : 'title="İade süresi (14 gün) dolmuştur"';
        iadeHtml = `<button class="btn-refund" data-item-id="${escapeHtml(item.id)}" ${disabledAttr} ${titleAttr}>
            <i class="fas fa-undo-alt"></i> İade Talep Et
        </button>`;
    }

    return `
        <div class="order-item-row">
            <div class="title">${escapeHtml(title)}</div>
            <div class="price">${fiyat} ₺</div>
            <div class="action" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                ${izleHtml}
                ${iadeHtml}
            </div>
        </div>`;
}

/**
 * İade talebi gönderir.
 * @param {string} itemId   - OrderItem.id
 * @param {HTMLButtonElement} btn - Tıklanan buton (loading durumu için)
 */
async function requestRefund(itemId, btn) {
    const onay = window.confirm(
        'Bu kursu iade etmek istediğinizden emin misiniz?\n\n' +
        '• Satın alım tarihinden itibaren 14 gün geçmemiş olmalıdır.\n' +
        '• Kurs tamamlanma oranınız %20\'yi aşmamalıdır.\n\n' +
        'Şartlar uygunsa iade başlatılır; tutar 3-7 iş günü içinde kartınıza yansır.'
    );
    if (!onay) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> İşleniyor...';

    try {
        const result = await ApiService.post(`/payments/refund/${encodeURIComponent(itemId)}`, {});

        if (result?.success) {
            showOrdersToast(result.message || 'İade talebiniz alındı.', 'success');
            // Sayfayı yenile — iade_edildi badge'ini ve erişim kaldırmayı göster
            setTimeout(() => loadOrders(), 1800);
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;

        // Backend'den gelen açıklayıcı mesajı göster (14 gün, %20 vb.)
        const msg = err.message || 'İade işlemi gerçekleştirilemedi.';
        showOrdersToast(msg, 'error');
    }
}

// ─── Yardımcı fonksiyonlar ────────────────────────────────

function statusLabel(durum) {
    switch (durum) {
        case 'tamamlandi':  return 'Tamamlandı';
        case 'beklemede':   return 'Beklemede';
        case 'basarisiz':   return 'Başarısız';
        case 'iade_edildi': return 'İade Edildi';
        default:            return durum;
    }
}

function formatDate(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
        return String(iso);
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * Orders sayfasına özel hafif toast bildirimi.
 */
function showOrdersToast(message, type = 'info', durationMs = 5000) {
    const container = document.getElementById('ordersToastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `orders-toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.35s';
        setTimeout(() => el.remove(), 400);
    }, durationMs);
}
