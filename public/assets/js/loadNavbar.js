// public/assets/js/loadNavbar.js
// Merkezi navbar yükleyici + Mega Menü + Global Akıllı Arama + Auth

(function () {
    'use strict';

    // ─── Module-level cache ───────────────────────────────────────────────
    let tumKategoriler = [];
    let aramaKurslari  = [];
    let aramaTimer     = null;
    let aramaYuklendi  = false;

    // ─── Entry ───────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async function () {
        const placeholder = document.getElementById('navbar-placeholder');
        if (!placeholder) return;

        try {
            const res  = await fetch('/components/navbar.html');
            const html = await res.text();
            placeholder.innerHTML = html;
        } catch (e) {
            console.error('[NAVBAR] Yüklenemedi:', e);
            return;
        }

        kimlikKontrol();
        menuIcinKategorileriYukle();
        globalAramaMotorBaslat();
    });

    // ─── Auth ─────────────────────────────────────────────────────────────
    function kimlikKontrol() {
        const jeton        = localStorage.getItem('edunex_token');
        const kullanicJson = localStorage.getItem('edunex_user');
        const authEl       = document.getElementById('authNavContainer');
        if (!authEl) return;

        if (jeton && kullanicJson) {
            let kullanici;
            try { kullanici = JSON.parse(kullanicJson); } catch { _cikisYap(); return; }

            const panelLinki = kullanici.rol === 'egitmen'
                ? '/instructor/dashboard.html'
                : '/student/dashboard.html';

            const ogrenciMi = kullanici.rol === 'ogrenci';

            const sepetHtml = ogrenciMi ? `
                <a href="/student/cart.html" class="nav-sepet-link" title="Sepetim">
                    <i class="fas fa-shopping-cart"></i>
                    <span id="cartCountBadge" class="sepet-rozet" style="display:none;"></span>
                </a>` : '';

            const ogrenciMenusu = ogrenciMi ? `
                <a href="/student/cart.html"><i class="fas fa-shopping-cart" style="width:20px;"></i> Sepetim</a>
                <a href="/student/orders.html"><i class="fas fa-receipt" style="width:20px;"></i> Siparişlerim</a>` : '';

            authEl.innerHTML = `
                ${sepetHtml}
                <div class="user-dropdown">
                    <button class="dropdown-trigger">
                        <i class="fas fa-user-circle" style="font-size:1.2rem;"></i>
                        ${_escHtml(kullanici.ad)}
                        <i class="fas fa-chevron-down" style="font-size:0.8rem;margin-left:5px;"></i>
                    </button>
                    <div class="dropdown-content">
                        <a href="/profile/index.html"><i class="fas fa-id-badge" style="width:20px;"></i> Profil</a>
                        <a href="${panelLinki}"><i class="fas fa-columns" style="width:20px;"></i> Panelim</a>
                        ${ogrenciMenusu}
                        <hr>
                        <button onclick="cikisYap()" class="text-danger">
                            <i class="fas fa-sign-out-alt" style="width:20px;"></i> Çıkış Yap
                        </button>
                    </div>
                </div>`;

            if (ogrenciMi) _sepetRozetiniGuncelle();
        } else {
            authEl.innerHTML = `<a href="/auth/index.html" class="btn-auth-blue">Giriş Yap / Kayıt Ol</a>`;
        }
    }

    async function _sepetRozetiniGuncelle() {
        const rozet = document.getElementById('cartCountBadge');
        if (!rozet) return;
        try {
            const sonuc = await ApiService.get('/cart');
            const sayi  = sonuc?.data?.kalem_sayisi || 0;
            rozet.textContent   = sayi > 99 ? '99+' : String(sayi);
            rozet.style.display = sayi > 0 ? 'inline-block' : 'none';
        } catch {}
    }

    function _cikisYap() {
        if (typeof ApiService !== 'undefined' && ApiService.logout) {
            ApiService.logout();
        } else {
            localStorage.clear();
            window.location.reload();
        }
    }

    // ─── Mega Menu ────────────────────────────────────────────────────────
    async function menuIcinKategorileriYukle() {
        const anaListe = document.getElementById('parentList');
        if (!anaListe) return;
        try {
            const sonuc = await ApiService.get('/categories');
            tumKategoriler = sonuc.data || [];
            window.tumKategoriler = tumKategoriler;

            const anaKategoriler = tumKategoriler.filter(k =>
                !(k.ust_kategori_id || k.ustKategoriId || k.parent_id)
            );

            anaListe.innerHTML = anaKategoriler.length
                ? anaKategoriler.map(p => `
                    <div class="cat-item p-item"
                         onmouseenter="altKategorileriGoster('${p.id}', this)"
                         onclick="window.location.href='/main/category.html?id=${p.id}'"
                         style="cursor:pointer;">
                        ${_escHtml(p.ad)} <i class="fas fa-chevron-right"></i>
                    </div>`).join('')
                : '<p style="padding:10px 20px;color:#64748b;">Kategori bulunamadı.</p>';
        } catch (e) {
            console.error('[MEGA_MENU] Kategoriler yüklenemedi:', e);
        }
    }

    function altKategorileriGoster(anaId, el) {
        document.querySelectorAll('.p-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        document.getElementById('grandChildCol').style.display = 'none';

        const cocuklar = tumKategoriler.filter(k =>
            (k.ust_kategori_id || k.ustKategoriId || k.parent_id) == anaId
        );
        const cocukKol   = document.getElementById('childCol');
        const cocukListe = document.getElementById('childList');

        if (cocuklar.length) {
            cocukKol.style.display  = 'block';
            cocukListe.innerHTML    = cocuklar.map(c => `
                <div class="cat-item c-item"
                     onmouseenter="torunKategorileriGoster('${c.id}', this)"
                     onclick="window.location.href='/main/category.html?id=${c.id}'"
                     style="cursor:pointer;">
                    ${_escHtml(c.ad)} <i class="fas fa-chevron-right"></i>
                </div>`).join('');
        } else {
            cocukKol.style.display = 'none';
        }
    }

    function torunKategorileriGoster(cocukId, el) {
        document.querySelectorAll('.c-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');

        const torunlar   = tumKategoriler.filter(k =>
            (k.ust_kategori_id || k.ustKategoriId || k.parent_id) == cocukId
        );
        const torunKol   = document.getElementById('grandChildCol');
        const torunListe = document.getElementById('grandChildList');

        if (torunlar.length) {
            torunKol.style.display  = 'block';
            torunListe.innerHTML    = torunlar.map(g => `
                <div class="cat-item"
                     onclick="window.location.href='/main/category.html?id=${g.id}'"
                     style="cursor:pointer;">
                    ${_escHtml(g.ad)}
                </div>`).join('');
        } else {
            torunKol.style.display = 'none';
        }
    }

    // ─── Global Akıllı Arama ─────────────────────────────────────────────
    async function _aramaVerisiniYukle() {
        if (aramaYuklendi) return;
        aramaYuklendi = true;
        try {
            const res  = await ApiService.get('/courses/published?limit=500');
            aramaKurslari = res.data || [];
        } catch { aramaYuklendi = false; }
    }

    function globalAramaMotorBaslat() {
        const input    = document.getElementById('globalSearchInput');
        const dropdown = document.getElementById('globalSearchResults');
        if (!input || !dropdown) return;

        // Veriyi arka planda önceden çek
        _aramaVerisiniYukle();

        input.addEventListener('input', function (e) {
            clearTimeout(aramaTimer);
            const term = e.target.value.trim();
            if (!term) { _aramaKapat(dropdown); return; }
            aramaTimer = setTimeout(() => _aramaYap(term, dropdown), 300);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && input.value.trim()) {
                window.location.href = `/main/courses.html?q=${encodeURIComponent(input.value.trim())}`;
            }
            if (e.key === 'Escape') { _aramaKapat(dropdown); input.blur(); }
        });

        input.addEventListener('focus', function () {
            if (input.value.trim().length > 1) dropdown.style.display = 'block';
        });

        // Dışarı tıklanınca kapat
        document.addEventListener('click', function (e) {
            const wrapper = document.querySelector('.global-search-wrapper');
            if (wrapper && !wrapper.contains(e.target)) _aramaKapat(dropdown);
        });
    }

    function _aramaKapat(dropdown) {
        if (dropdown) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }
    }

    function _aramaYap(term, dropdown) {
        const lower = term.toLowerCase();

        // ── Kategoriler ──
        const katSonuc = tumKategoriler.filter(k =>
            k.ad && k.ad.toLowerCase().includes(lower)
        ).slice(0, 3);

        // ── Eğitmenler (kurs datasından deduplicate) ──
        const egitmenMap = new Map();
        aramaKurslari.forEach(k => {
            if (!k.Egitmen) return;
            const tam = `${k.Egitmen.ad || ''} ${k.Egitmen.soyad || ''}`.trim();
            if (tam.toLowerCase().includes(lower) && k.Egitmen.id && !egitmenMap.has(k.Egitmen.id)) {
                egitmenMap.set(k.Egitmen.id, { id: k.Egitmen.id, ad: tam });
            }
        });
        const egitmenSonuc = [...egitmenMap.values()].slice(0, 3);

        // ── Kurslar ──
        const kursSonuc = aramaKurslari.filter(k =>
            (k.baslik && k.baslik.toLowerCase().includes(lower)) ||
            (k.aciklama && k.aciklama.toLowerCase().includes(lower))
        ).slice(0, 5);

        const bosmu = !katSonuc.length && !egitmenSonuc.length && !kursSonuc.length;

        if (bosmu) {
            dropdown.innerHTML = `
                <div class="search-empty">
                    <i class="fas fa-search-minus"></i>
                    <span>"${_escHtml(term)}" için sonuç bulunamadı.</span>
                </div>`;
        } else {
            const katHtml = katSonuc.length ? `
                <div class="search-group">
                    <div class="search-group-title"><i class="fas fa-th-large"></i> Kategoriler</div>
                    ${katSonuc.map(k => `
                        <a href="/main/courses.html?category=${k.id}" class="search-item">
                            <i class="fas fa-folder"></i>
                            <span class="search-item-title">${_escHtml(k.ad)}</span>
                        </a>`).join('')}
                </div>` : '';

            const egHtml = egitmenSonuc.length ? `
                <div class="search-group">
                    <div class="search-group-title"><i class="fas fa-user"></i> Eğitmenler</div>
                    ${egitmenSonuc.map(e => `
                        <a href="/main/instructor-profile.html?id=${encodeURIComponent(e.id)}" class="search-item">
                            <i class="fas fa-chalkboard-teacher"></i>
                            <span class="search-item-title">${_escHtml(e.ad)}</span>
                        </a>`).join('')}
                </div>` : '';

            const kursHtml = kursSonuc.length ? `
                <div class="search-group">
                    <div class="search-group-title"><i class="fas fa-play-circle"></i> Eğitimler</div>
                    ${kursSonuc.map(k => {
                        const egitmen = k.Egitmen ? `${k.Egitmen.ad || ''} ${k.Egitmen.soyad || ''}`.trim() : '';
                        const fiyat   = k.fiyat > 0 ? `${parseFloat(k.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
                        return `
                        <a href="/main/course-detail.html?id=${k.id}" class="search-item search-item-course">
                            <i class="fas fa-play-circle"></i>
                            <div class="search-item-body">
                                <span class="search-item-title">${_escHtml(k.baslik)}</span>
                                ${egitmen ? `<span class="search-item-sub">${_escHtml(egitmen)}</span>` : ''}
                            </div>
                            <span class="search-item-price">${fiyat}</span>
                        </a>`;
                    }).join('')}
                </div>` : '';

            dropdown.innerHTML = `
                ${katHtml}${egHtml}${kursHtml}
                <a href="/main/courses.html?q=${encodeURIComponent(term)}" class="search-see-all">
                    Tüm "${_escHtml(term)}" sonuçlarını gör <i class="fas fa-arrow-right"></i>
                </a>`;
        }

        dropdown.style.display = 'block';
    }

    // ─── Yardımcı ────────────────────────────────────────────────────────
    function _escHtml(text) {
        if (text == null) return '';
        const d = document.createElement('div');
        d.textContent = String(text);
        return d.innerHTML;
    }

    // ─── Global window API (inline handlers + dış scriptler için) ────────
    window.altKategorileriGoster      = altKategorileriGoster;
    window.torunKategorileriGoster    = torunKategorileriGoster;
    window.showChildCategories        = altKategorileriGoster;
    window.showGrandChildCategories   = torunKategorileriGoster;
    window.cikisYap                   = _cikisYap;
    window.logout                     = _cikisYap;
    window.kimlikKontrol              = kimlikKontrol;
    window.updateCartBadge            = _sepetRozetiniGuncelle;

})();
