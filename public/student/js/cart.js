/**
 * EduNex - Sepet (Cart) Mantığı
 */

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        alert('Sepeti görmek için lütfen giriş yapınız.');
        window.location.href = '/auth/index.html';
        return;
    }
    loadCart();
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
        const fiyat = Number(c?.fiyat || 0).toFixed(2);
        return `
            <div class="cart-item" data-kurs-id="${c.id}">
                <div class="thumb"><i class="fas fa-play-circle"></i></div>
                <div>
                    <h4 class="title">${escapeHtml(c.baslik)}</h4>
                    <div class="meta"><i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(egitmen)} · ${escapeHtml(c.seviye || '')} · ${escapeHtml(c.dil || '')}</div>
                    <button class="remove" onclick="removeItem('${c.id}')"><i class="fas fa-trash"></i> Kaldır</button>
                </div>
                <div class="price">${fiyat} ₺</div>
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
    if (!confirm('Sepetteki tüm kursları kaldırmak istediğinize emin misiniz?')) return;
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
    btn.textContent = 'Ödeme sayfasına yönlendiriliyor...';
    try {
        const result = await ApiService.post('/payments/checkout', {});
        if (result.data?.paymentPageUrl) {
            window.location.href = result.data.paymentPageUrl;
            return;
        }
        throw new Error('Ödeme sayfası adresi alınamadı.');
    } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Ödemeye Geç';
    }
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
