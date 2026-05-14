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
        const placeholder = document.getElementById('navbar-placeholder') || document.getElementById('navbar-container');
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
        mobilHamburgerKur();
    });

    // ─── Mobil Hamburger ──────────────────────────────────────────────────
    function mobilHamburgerKur() {
        const buton    = document.getElementById('navHamburger');
        const drawer   = document.getElementById('mobileNavDrawer');
        const backdrop = document.getElementById('mobileNavBackdrop');
        const kapat    = document.getElementById('mobileNavClose');
        if (!buton || !drawer) return;

        const ac = () => {
            drawer.classList.add('open');
            drawer.setAttribute('aria-hidden', 'false');
            buton.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
        };
        const kapatFn = () => {
            drawer.classList.remove('open');
            drawer.setAttribute('aria-hidden', 'true');
            buton.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        };

        buton.addEventListener('click', ac);
        if (kapat)    kapat.addEventListener('click', kapatFn);
        if (backdrop) backdrop.addEventListener('click', kapatFn);
        // Drawer linkine tiklayinca otomatik kapansin
        drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', kapatFn));
        // Esc ile kapat
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && drawer.classList.contains('open')) kapatFn();
        });

        // Mobil arama: enter ile arama sayfasina yonlendir
        const mAra = document.getElementById('mobileGlobalSearchInput');
        if (mAra) {
            mAra.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && mAra.value.trim()) {
                    window.location.href = `/main/courses.html?q=${encodeURIComponent(mAra.value.trim())}`;
                }
            });
        }
    }

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
            const egitmenMi = kullanici.rol === 'egitmen';

            const sepetHtml = ogrenciMi ? `
                <a href="/student/cart.html" class="nav-sepet-link" title="Sepetim">
                    <i class="fas fa-shopping-cart"></i>
                    <span id="cartCountBadge" class="sepet-rozet" style="display:none;"></span>
                </a>` : '';

            // Bildirim cani: hem ogrenci hem egitmen icin acik (her ikisi de bildirim alabiliyor).
            const bildirimHtml = `
                <div class="nav-bildirim-wrap" style="position:relative;">
                    <button id="bildirimZilButton" class="nav-sepet-link" title="Bildirimler" type="button" aria-haspopup="true" aria-expanded="false" style="background:transparent;border:0;cursor:pointer;color:inherit;font:inherit;">
                        <i class="fas fa-bell"></i>
                        <span id="bildirimCountBadge" class="sepet-rozet" style="display:none;"></span>
                    </button>
                    <div id="bildirimDropdown" class="bildirim-dropdown" style="display:none;position:absolute;top:calc(100% + 8px);right:0;width:340px;max-height:420px;overflow-y:auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,0.18);z-index:1000;">
                        <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
                            <strong style="color:#0f172a;">Bildirimler</strong>
                            <span id="bildirimCountText" style="font-size:0.78rem;color:#64748b;"></span>
                        </div>
                        <div id="bildirimListe">
                            <p style="padding:18px;color:#64748b;text-align:center;font-size:0.9rem;">Yükleniyor...</p>
                        </div>
                    </div>
                </div>`;

            const ogrenciMenusu = ogrenciMi ? `
                <a href="/student/cart.html"><i class="fas fa-shopping-cart" style="width:20px;"></i> Sepetim</a>
                <a href="/student/orders.html"><i class="fas fa-receipt" style="width:20px;"></i> Siparişlerim</a>` : '';

            const egitmenMenusu = egitmenMi ? `
                <a href="/instructor/live-sessions.html"><i class="fas fa-video" style="width:20px;color:#ef4444;"></i> Canlı Derslerim</a>` : '';

            authEl.innerHTML = `
                ${sepetHtml}
                ${bildirimHtml}
                <div class="user-dropdown">
                    <button class="dropdown-trigger">
                        <i class="fas fa-user-circle" style="font-size:1.2rem;"></i>
                        ${_escHtml(kullanici.ad)}
                        <i class="fas fa-chevron-down" style="font-size:0.8rem;margin-left:5px;"></i>
                    </button>
                    <div class="dropdown-content">
                        <a href="/profile/index.html"><i class="fas fa-id-badge" style="width:20px;"></i> Profil</a>
                        <a href="${panelLinki}"><i class="fas fa-columns" style="width:20px;"></i> Panelim</a>
                        ${egitmenMenusu}
                        ${ogrenciMenusu}
                        <a href="/main/contact.html"><i class="fas fa-headset" style="width:20px;color:#0ea5e9;"></i> Destek Talepleri</a>
                        <hr>
                        <button onclick="cikisYap()" class="text-danger">
                            <i class="fas fa-sign-out-alt" style="width:20px;"></i> Çıkış Yap
                        </button>
                    </div>
                </div>`;

            if (ogrenciMi) _sepetRozetiniGuncelle();
            _bildirimleriBaslat();
        } else {
            authEl.innerHTML = `<a href="/auth/index.html" class="btn-auth-blue">Giriş Yap / Kayıt Ol</a>`;
        }
    }

    // ─── Bildirim Sistemi ─────────────────────────────────────────────────
    let _bildirimCache = [];

    async function _bildirimleriBaslat() {
        const buton    = document.getElementById('bildirimZilButton');
        const dropdown = document.getElementById('bildirimDropdown');
        if (!buton || !dropdown) return;

        // Acilis -> kapanis toggle
        buton.addEventListener('click', (e) => {
            e.stopPropagation();
            const acik = dropdown.style.display === 'block';
            dropdown.style.display = acik ? 'none' : 'block';
            buton.setAttribute('aria-expanded', String(!acik));
        });
        // Disari tikla -> kapat
        document.addEventListener('click', (e) => {
            if (!buton.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
                buton.setAttribute('aria-expanded', 'false');
            }
        });

        await _bildirimleriCek();
    }

    async function _bildirimleriCek() {
        const rozet      = document.getElementById('bildirimCountBadge');
        const sayiText   = document.getElementById('bildirimCountText');
        const listeEl    = document.getElementById('bildirimListe');
        if (!rozet || !listeEl) return;

        try {
            const sonuc = await ApiService.get('/notifications/unread');
            const liste = sonuc?.data?.bildirimler || [];
            const sayi  = sonuc?.data?.okunmamis_sayisi || 0;
            _bildirimCache = liste;

            rozet.textContent   = sayi > 99 ? '99+' : String(sayi);
            rozet.style.display = sayi > 0 ? 'inline-block' : 'none';
            if (sayiText) sayiText.textContent = sayi > 0 ? `${sayi} okunmamış` : 'Tümü okundu';

            if (liste.length === 0) {
                listeEl.innerHTML = `
                    <p style="padding:24px 18px;color:#94a3b8;text-align:center;font-size:0.9rem;">
                        <i class="fas fa-bell-slash" style="display:block;font-size:1.6rem;margin-bottom:8px;"></i>
                        Yeni bildirim yok.
                    </p>`;
                return;
            }

            listeEl.innerHTML = liste.map(b => {
                const ikon = b.tip === 'yeni_kurs'    ? 'fa-graduation-cap'
                           : b.tip === 'canli_yayin' ? 'fa-video'
                           : b.tip === 'satis'       ? 'fa-shopping-bag'
                           : b.tip === 'yorum'       ? 'fa-comment-dots'
                           : b.tip === 'takip'       ? 'fa-user-plus'
                           : b.tip === 'destek'      ? 'fa-headset'
                           : 'fa-info-circle';
                const renk = b.tip === 'canli_yayin' ? '#ef4444'
                           : b.tip === 'satis'       ? '#16a34a'
                           : b.tip === 'yorum'       ? '#f59e0b'
                           : b.tip === 'takip'       ? '#8b5cf6'
                           : b.tip === 'destek'      ? '#0ea5e9'
                           : '#2563eb';
                // Stateful: backend hedef_url'i 'canli_yayin' icin dinamik olarak null'a cekebilir
                // (ders bitince). null/empty ise tiklanamaz hale getiriyoruz.
                const url       = (b.hedef_url || '').trim();
                const okunmus   = !!b.okundu_mu;
                const linkVar   = !!url;
                const tag       = linkVar ? 'a' : 'div';
                const hrefAttr  = linkVar ? ` href="${_escAttr(url)}"` : '';
                const ariaAttr  = linkVar ? '' : ' aria-disabled="true"';
                const okuClass  = okunmus ? ' bildirim-okundu' : '';
                const disClass  = linkVar ? '' : ' bildirim-disabled';
                const opacity   = (okunmus || !linkVar) ? '0.65' : '1';
                const cursor    = linkVar ? 'pointer' : 'not-allowed';
                return `
                    <${tag}${hrefAttr}${ariaAttr} data-bid="${_escAttr(b.id)}" data-link="${linkVar ? '1' : '0'}" class="bildirim-item${okuClass}${disClass}"
                       style="display:flex;gap:10px;padding:12px 16px;border-bottom:1px solid #f1f5f9;text-decoration:none;color:#0f172a;opacity:${opacity};cursor:${cursor};pointer-events:${linkVar ? 'auto' : 'none'};">
                        <i class="fas ${ikon}" style="color:${renk};font-size:1.1rem;margin-top:3px;"></i>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;font-size:0.9rem;margin-bottom:2px;">${_escHtml(b.baslik)}</div>
                            <div style="font-size:0.82rem;color:#475569;line-height:1.35;">${_escHtml(b.icerik || '')}</div>
                        </div>
                    </${tag}>`;
            }).join('');

            // Bildirime tiklayinca: read isaretle + yonlendir.
            // pointer-events:none zaten engelliyor ama defansif olarak burada da kontrol var.
            listeEl.querySelectorAll('.bildirim-item').forEach(el => {
                el.addEventListener('click', async (e) => {
                    // Tiklanamaz bildirim: hicbir sey yapma.
                    if (el.dataset.link !== '1') {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    const bid = el.dataset.bid;
                    if (!bid) return;
                    try {
                        await fetch(`/api/notifications/${bid}/read`, {
                            method: 'PATCH',
                            headers: { 'Authorization': `Bearer ${localStorage.getItem('edunex_token') || localStorage.getItem('edunex_admin_token') || ''}` }
                        });
                    } catch {}
                    // Default link davranisi yonlendirmeyi yapar; rozet azalt.
                    const yeniSayi = Math.max(0, _bildirimCache.length - 1);
                    rozet.textContent   = String(yeniSayi);
                    rozet.style.display = yeniSayi > 0 ? 'inline-block' : 'none';
                });
            });
        } catch (err) {
            listeEl.innerHTML = `<p style="padding:18px;color:#ef4444;text-align:center;font-size:0.85rem;">Bildirimler yüklenemedi.</p>`;
        }
    }

    function _escAttr(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
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
