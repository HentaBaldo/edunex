/**
 * EduNex - Sepet (Cart) Mantığı
 */

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        await notify.alert({
            title: 'Giriş gerekli',
            text: 'Sepeti görmek için lütfen giriş yapınız.',
            type: 'info'
        });
        window.location.href = '/auth/index.html';
        return;
    }
    loadCart();

    // iyzico inline overlay kapatma
    const closeBtn = document.getElementById('iyzicoCloseBtn');
    const overlay = document.getElementById('iyzicoOverlay');
    if (closeBtn) closeBtn.addEventListener('click', closeIyzicoOverlay);
    if (overlay) overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeIyzicoOverlay();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.style.display === 'block') {
            closeIyzicoOverlay();
        }
    });
});

async function loadCart() {
    const root = document.getElementById('cartRoot');
    root.innerHTML = '<p>Sepet yükleniyor...</p>';

    try {
        const result = await ApiService.get('/cart');
        render(result.data);
    } catch (err) {
        root.innerHTML = `<p style="color:#ef4444;">Sepet yüklenemedi: ${err.message}</p>`;
    }
}

function render(data) {
    const root = document.getElementById('cartRoot');

    if (!data || data.kalem_sayisi === 0) {
        root.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cart-shopping"></i>
                <h2>Sepetiniz boş</h2>
                <p>Keşfedebileceğiniz harika kurslar var.</p>
                <a href="/main/index.html#courses" class="btn-auth-blue" style="display:inline-block;margin-top:10px;">Kursları Keşfet</a>
            </div>`;
        return;
    }

    const itemsHtml = data.items.map(item => {
        const c = item.Course;
        const egitmen = c?.Egitmen ? `${c.Egitmen.ad} ${c.Egitmen.soyad}` : 'Eğitmen';
        const original = Number(c?.original_fiyat ?? c?.fiyat ?? 0);
        const net = Number(c?.net_fiyat ?? c?.fiyat ?? 0);
        const indirimVar = c?.indirim_var && net < original;
        const fiyatHtml = indirimVar
            ? `<div style="text-align:right;">
                <div style="text-decoration:line-through; color:#94a3b8; font-size:0.85rem;">${original.toFixed(2)} ₺</div>
                <div style="color:#10b981; font-weight:800;">${net.toFixed(2)} ₺</div>
                ${c.indirim_yuzde ? `<div style="font-size:0.7rem; color:#ef4444; font-weight:700;">-%${c.indirim_yuzde}</div>` : ''}
              </div>`
            : `${original.toFixed(2)} ₺`;
        return `
            <div class="cart-item" data-kurs-id="${c.id}">
                <div class="thumb"><i class="fas fa-play-circle"></i></div>
                <div>
                    <h4 class="title">${escapeHtml(c.baslik)}</h4>
                    <div class="meta"><i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(egitmen)} · ${escapeHtml(c.seviye || '')} · ${escapeHtml(c.dil || '')}</div>
                    <button class="remove" onclick="removeItem('${c.id}')"><i class="fas fa-trash"></i> Kaldır</button>
                </div>
                <div class="price">${fiyatHtml}</div>
            </div>`;
    }).join('');

    root.innerHTML = `
        <div class="cart-grid">
            <div class="cart-items">${itemsHtml}</div>
            <aside class="cart-summary">
                <h3>Özet</h3>
                <div class="row"><span>Kalem Sayısı</span><span>${data.kalem_sayisi}</span></div>
                <div class="row total"><span>Toplam</span><span>${Number(data.toplam_tutar).toFixed(2)} ₺</span></div>
                <button id="checkoutBtn" class="btn-checkout">Ödemeye Geç</button>
                <button id="clearBtn" class="btn-checkout" style="background:#e2e8f0;color:#0f172a;margin-top:8px;">Sepeti Boşalt</button>
            </aside>
        </div>`;

    document.getElementById('checkoutBtn').addEventListener('click', handleCheckout);
    document.getElementById('clearBtn').addEventListener('click', handleClear);
}

async function removeItem(kursId) {
    try {
        await ApiService.delete(`/cart/items/${kursId}`);
        toast('Kurs sepetten kaldırıldı.', 'success');
        loadCart();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleClear() {
    const onaylandi = await notify.confirm({
        title: 'Sepeti boşalt',
        text: 'Sepetteki tüm kursları kaldırmak istediğinize emin misiniz?',
        confirmText: 'Evet, boşalt',
        cancelText: 'Vazgeç',
        type: 'warning'
    });
    if (!onaylandi) return;
    try {
        await ApiService.delete('/cart');
        toast('Sepet boşaltıldı.', 'success');
        loadCart();
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function handleCheckout() {
    const btn = document.getElementById('checkoutBtn');
    btn.disabled = true;
    btn.textContent = 'Ödeme formu hazırlanıyor...';
    try {
        const result = await ApiService.post('/payments/checkout', {});
        console.log('[CHECKOUT] Backend response keys:', Object.keys(result?.data || {}));

        const content = result?.data?.checkoutFormContent;
        const paymentPageUrl = result?.data?.paymentPageUrl;

        if (!content) {
            // Inline content yoksa redirect mode'a dus (eski davranis korunur).
            if (paymentPageUrl) {
                console.warn('[CHECKOUT] checkoutFormContent yok, redirect fallback:', paymentPageUrl);
                window.location.assign(paymentPageUrl);
                return;
            }
            throw new Error('iyzico ödeme formu içeriği alınamadı. Sunucu loglarını kontrol edin.');
        }

        const container = document.getElementById('iyzipay-checkout-form');
        const overlay = document.getElementById('iyzicoOverlay');
        if (!container || !overlay) {
            throw new Error('Sayfada ödeme alanı (iyzipay-checkout-form) bulunamadı.');
        }

        // Onceki form kalintisini temizle (cift checkout durumu)
        container.innerHTML = '';

        // checkoutFormContent <script> tagi iceriyor; innerHTML script'leri calistirmaz.
        // createContextualFragment, parse edilen script tag'lerini DOM'a baglarken executable yapar.
        const fragment = document.createRange().createContextualFragment(content);
        container.appendChild(fragment);

        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';

        btn.disabled = false;
        btn.textContent = 'Ödemeye Geç';
        console.log('[CHECKOUT] Inline iyzico formu enjekte edildi.');
    } catch (err) {
        console.error('[CHECKOUT] Hata:', err);
        btn.disabled = false;
        btn.textContent = 'Ödemeye Geç';
        await showPaymentError(err.message);
    }
}

function closeIyzicoOverlay() {
    const overlay = document.getElementById('iyzicoOverlay');
    const container = document.getElementById('iyzipay-checkout-form');
    if (overlay) {
        overlay.style.display = 'none';
        document.body.style.overflow = '';
    }
    if (container) {
        container.innerHTML = '';
    }
}

async function showPaymentError(message) {
    if (!window.Swal) {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }
    Swal.fire({
        icon: 'error',
        title: 'Ödeme Başlatılamadı',
        text: message || 'Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.',
        confirmButtonText: 'Tamam',
        confirmButtonColor: '#2563eb',
    });
}

function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = (type === 'success' ? '✓ ' : '✗ ') + msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

window.removeItem = removeItem;
