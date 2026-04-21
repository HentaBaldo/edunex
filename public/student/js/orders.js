/**
 * EduNex - Siparişlerim sayfası
 * /api/payments/orders/my endpoint'inden öğrencinin sipariş geçmişini çeker.
 */

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        window.location.href = '/auth/index.html';
        return;
    }
    loadOrders();
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
                    : items.map(it => renderItemRow(it, isCompleted)).join('')}
            </div>
        </article>`;
}

function renderItemRow(item, isCompleted) {
    const title = item.Course?.baslik || 'Silinmiş kurs';
    const fiyat = Number(item.odenen_fiyat || 0).toFixed(2);
    const actionHtml = isCompleted && item.Course?.id
        ? `<a href="/student/learning-room.html?id=${encodeURIComponent(item.Course.id)}"><i class="fas fa-play-circle"></i> İzle</a>`
        : '';
    return `
        <div class="order-item-row">
            <div class="title">${escapeHtml(title)}</div>
            <div class="price">${fiyat} ₺</div>
            <div class="action">${actionHtml}</div>
        </div>`;
}

function statusLabel(durum) {
    switch (durum) {
        case 'tamamlandi': return 'Tamamlandı';
        case 'beklemede': return 'Beklemede';
        case 'basarisiz': return 'Başarısız';
        case 'iade_edildi': return 'İade Edildi';
        default: return durum;
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
