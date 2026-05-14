// public/main/js/category.js
(function () {
    'use strict';

    const params     = new URLSearchParams(window.location.search);
    const kategoriId = params.get('id');

    let tumKurslar = [];

    const skeletonGrid  = document.getElementById('skeletonGrid');
    const courseGrid    = document.getElementById('courseGrid');
    const errorState    = document.getElementById('errorState');
    const emptyState    = document.getElementById('emptyState');
    const resultsCount  = document.getElementById('resultsCount');
    const sortSelect    = document.getElementById('sortSelect');

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        if (!kategoriId) { hataGoster('Kategori ID bulunamadı.'); return; }
        skeletonOlustur();
        try {
            const res  = await ApiService.get(`/categories/${kategoriId}/details`);
            const data = res.data;
            heroDoldur(data.kategori);
            altKategorileriDoldur(data.altKategoriler || []);
            tumKurslar = data.kurslar || [];
            kurslarRender(sirala(tumKurslar));
        } catch (err) {
            console.error('[KATEGORI]', err);
            hataGoster('Kategori yüklenirken bir hata oluştu.');
        }
        sortSelect.addEventListener('change', () => kurslarRender(sirala(tumKurslar)));
    }

    function heroDoldur(kat) {
        if (!kat) return;
        document.title = `${kat.ad} — EduNex`;

        document.getElementById('heroCategoryName').textContent = kat.ad;
        document.getElementById('heroTitle').textContent        = kat.ad;

        // Kapak Fotoğrafı (CDN) → hero arka planı
        const heroEl = document.getElementById('categoryHero');
        if (kat.kapak_fotografi) {
            heroEl.classList.add('has-cover');
            heroEl.style.backgroundImage = `url('${kat.kapak_fotografi}')`;
        } else {
            heroEl.classList.remove('has-cover');
            heroEl.style.backgroundImage = '';
        }

        // Açıklama
        const descEl = document.getElementById('heroDescription');
        if (kat.aciklama && kat.aciklama.trim()) {
            descEl.textContent = kat.aciklama;
            descEl.style.display = 'block';
        } else {
            descEl.style.display = 'none';
        }

        // Yıldız ortalaması
        const puan = parseFloat(kat.yildiz_ortalamasi || kat.yildiz || 0);
        const ratingWrap = document.getElementById('heroRating');
        if (puan > 0) {
            document.getElementById('heroRatingStars').innerHTML = _heroYildizlar(puan);
            document.getElementById('heroRatingNum').textContent = puan.toFixed(1);
            document.getElementById('heroRatingLabel').textContent = 'kategori ortalama puanı';
            ratingWrap.style.display = 'inline-flex';
        } else {
            ratingWrap.style.display = 'none';
        }

        // Meta (kurs sayısı / öğrenci sayısı)
        const metaEl = document.getElementById('heroMeta');
        const kursSayisi = parseInt(kat.kurs_sayisi || 0, 10);
        const ogrSayisi  = parseInt(kat.toplam_ogrenci || 0, 10);
        const parcalar = [];
        if (kursSayisi > 0) parcalar.push(`<span class="hero-meta-item"><i class="fas fa-play-circle"></i> ${kursSayisi} kurs</span>`);
        if (ogrSayisi  > 0) parcalar.push(`<span class="hero-meta-item"><i class="fas fa-user-graduate"></i> ${ogrSayisi.toLocaleString('tr-TR')} öğrenci</span>`);
        metaEl.innerHTML = parcalar.join('');
    }

    function _heroYildizlar(puan) {
        const r = parseFloat(puan) || 0;
        const tam = Math.floor(r);
        const yarim = (r - tam) >= 0.5 ? 1 : 0;
        const bos = 5 - tam - yarim;
        let html = '';
        for (let i = 0; i < tam;   i++) html += '<i class="fas fa-star"></i>';
        if (yarim) html += '<i class="fas fa-star-half-alt"></i>';
        for (let i = 0; i < bos;   i++) html += '<i class="far fa-star"></i>';
        return html;
    }

    function altKategorileriDoldur(altKategoriler) {
        const section = document.getElementById('subcategorySection');
        const pills   = document.getElementById('subcategoryPills');
        if (!altKategoriler.length) return;

        section.style.display = 'block';
        pills.innerHTML = altKategoriler.map(k => `
            <a href="/main/category.html?id=${_esc(k.id)}" class="subcategory-pill">
                <i class="fas fa-folder"></i>
                ${_esc(k.ad)}
            </a>`).join('');
    }

    function kurslarRender(kurslar) {
        skeletonGrid.classList.add('hidden');
        errorState.classList.add('hidden');

        resultsCount.textContent = `${kurslar.length} kurs bulundu`;

        if (!kurslar.length) {
            courseGrid.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        courseGrid.classList.remove('hidden');
        courseGrid.innerHTML = kurslar.map(kursKartiOlustur).join('');
    }

    function sirala(kurslar) {
        const siralama = sortSelect.value;
        const kopya    = [...kurslar];
        switch (siralama) {
            case 'price_asc':
                kopya.sort((a, b) => parseFloat(a.fiyat || 0) - parseFloat(b.fiyat || 0));
                break;
            case 'price_desc':
                kopya.sort((a, b) => parseFloat(b.fiyat || 0) - parseFloat(a.fiyat || 0));
                break;
            case 'rating':
                kopya.sort((a, b) => (b.istatistikler?.ortalama_puan || 0) - (a.istatistikler?.ortalama_puan || 0));
                break;
            default:
                kopya.sort((a, b) => new Date(b.olusturulma_tarihi) - new Date(a.olusturulma_tarihi));
        }
        return kopya;
    }

    function skeletonOlustur() {
        skeletonGrid.innerHTML = Array.from({ length: 8 }, () => `
            <div class="skeleton-card">
                <div class="skeleton-cover"></div>
                <div class="skeleton-body">
                    <div class="skeleton-line wide"></div>
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line narrow"></div>
                    <div class="skeleton-line narrow"></div>
                </div>
            </div>`).join('');
    }

    function hataGoster(msg) {
        skeletonGrid.classList.add('hidden');
        errorState.classList.remove('hidden');
        document.getElementById('errorMessage').textContent = msg;
    }

    // ─── Card ─────────────────────────────────────────────────
    function kursKartiOlustur(kurs) {
        const egitmen  = kurs.Egitmen ? `${kurs.Egitmen.ad} ${kurs.Egitmen.soyad}` : 'Eğitmen';
        const kategori = kurs.Category ? _esc(kurs.Category.ad) : 'Genel';
        const puan     = kurs.istatistikler?.ortalama_puan || 0;
        const yorum    = kurs.istatistikler?.toplam_yorum  || 0;
        const kapak    = kurs.kapak_fotografi || null;
        const fiyatHtml = _renderPriceTag(kurs);

        return `
        <a href="/main/course-detail.html?id=${_esc(kurs.id)}" class="course-card">
            <div class="kurs-kart-ic">
                <div class="kurs-kart-kapak">
                    ${kapak ? `<img src="${_esc(kapak)}" alt="" class="kurs-kart-kapak-img">` : '<i class="fas fa-laptop-code"></i>'}
                    <span class="kurs-kategori-rozet">${kategori}</span>
                    ${kurs.indirim_var && kurs.indirim_yuzde ? `<span class="kurs-indirim-rozet">-%${kurs.indirim_yuzde}</span>` : ''}
                </div>
                <div class="kurs-kart-govde">
                    <h3 class="kurs-kart-baslik">${_esc(kurs.baslik)}</h3>
                    <p class="kurs-kart-alt-baslik">${_plainText(kurs.aciklama, 120)}</p>
                    <p class="kurs-kart-egitmen"><i class="fas fa-chalkboard-teacher"></i> ${_esc(egitmen)}</p>
                    ${yildizHtml(puan, yorum)}
                    <div class="kurs-kart-alt">
                        ${fiyatHtml}
                        <span class="kurs-incele">İncele <i class="fas fa-arrow-right"></i></span>
                    </div>
                </div>
            </div>
        </a>`;
    }

    // İndirim durumuna göre fiyat etiketi
    function _renderPriceTag(kurs) {
        const original = parseFloat(kurs.original_fiyat ?? kurs.fiyat) || 0;
        if (original <= 0) return '<span class="kurs-fiyat">Ücretsiz</span>';
        if (kurs.indirim_var && kurs.net_fiyat != null && kurs.net_fiyat < original) {
            return `<span class="kurs-fiyat-wrap">
                <span class="kurs-fiyat-eski">${original.toFixed(2)} ₺</span>
                <span class="kurs-fiyat kurs-fiyat-indirimli">${parseFloat(kurs.net_fiyat).toFixed(2)} ₺</span>
            </span>`;
        }
        return `<span class="kurs-fiyat">${original.toFixed(2)} ₺</span>`;
    }

    function yildizHtml(puan, yorumSayisi) {
        if (!puan || parseFloat(puan) === 0) {
            return `<div class="kurs-puan kurs-puan-bos"><i class="far fa-star"></i> Yeni</div>`;
        }
        const p = parseFloat(puan);
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.floor(p))                      stars += '<i class="fas fa-star"></i>';
            else if (i === Math.ceil(p) && p % 1 !== 0) stars += '<i class="fas fa-star-half-alt"></i>';
            else                                         stars += '<i class="far fa-star"></i>';
        }
        return `<div class="kurs-puan">
            <span class="puan-deger">${p.toFixed(1)}</span>
            <span class="yildizlar">${stars}</span>
            <span class="puan-yorum">(${yorumSayisi})</span>
        </div>`;
    }

    function _esc(text) {
        if (text == null) return '';
        const d = document.createElement('div');
        d.textContent = String(text);
        return d.innerHTML;
    }

    // Zengin metni (HTML içerebilir) düz, kısaltılmış ve güvenli metne çevir
    function _plainText(html, maxLen) {
        if (html == null) return '';
        const d = document.createElement('div');
        d.innerHTML = String(html);
        let text = (d.textContent || '').replace(/\s+/g, ' ').trim();
        if (maxLen && text.length > maxLen) {
            text = text.slice(0, maxLen).trim() + '…';
        }
        return _esc(text);
    }
})();
