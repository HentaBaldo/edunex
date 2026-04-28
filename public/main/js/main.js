// public/main/js/main.js
// EduNex Ana Sayfa — Navigasyon, Kurslar ve 5 Modüllü Öneri Motoru

document.addEventListener('DOMContentLoaded', async () => {
    kimlikKontrol();
    menuIcinKategorileriYukle();
    yayindakiKurslariYukle();
    await tumOnerileriYukle();
});

// ============================================================
// KİMLİK DOĞRULAMA VE NAVBAR
// ============================================================

function kimlikKontrol() {
    const jeton         = localStorage.getItem('edunex_token');
    const kullanicJson  = localStorage.getItem('edunex_user');
    const authKonteynir = document.getElementById('authNavContainer');

    if (jeton && kullanicJson) {
        let kullanici;
        try {
            kullanici = JSON.parse(kullanicJson);
        } catch {
            cikisYap();
            return;
        }

        if (!authKonteynir) return;

        const panelLinki = kullanici.rol === 'egitmen'
            ? '/instructor/dashboard.html'
            : '/student/dashboard.html';

        const ogrenciMi = kullanici.rol === 'ogrenci';

        const sepetSimgesiHtml = ogrenciMi ? `
            <a href="/student/cart.html" class="nav-sepet-link" title="Sepetim">
                <i class="fas fa-shopping-cart"></i>
                <span id="cartCountBadge" class="sepet-rozet" style="display:none;"></span>
            </a>
        ` : '';

        const ogrenciMenusu = ogrenciMi ? `
            <a href="/student/cart.html"><i class="fas fa-shopping-cart" style="width:20px;"></i> Sepetim</a>
            <a href="/student/orders.html"><i class="fas fa-receipt" style="width:20px;"></i> Siparişlerim</a>
        ` : '';

        authKonteynir.innerHTML = `
            ${sepetSimgesiHtml}
            <div class="user-dropdown">
                <button class="dropdown-trigger">
                    <i class="fas fa-user-circle" style="font-size:1.2rem;"></i>
                    ${kullanici.ad}
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
            </div>
        `;

        if (ogrenciMi) sepetRozetiniGuncelle();
    } else {
        if (authKonteynir) {
            authKonteynir.innerHTML = `
                <a href="/auth/index.html" class="btn-auth-blue">Giriş Yap / Kayıt Ol</a>
            `;
        }
    }
}

function cikisYap() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) {
        ApiService.logout();
    } else {
        localStorage.clear();
        window.location.reload();
    }
}
window.cikisYap = cikisYap;

// Eski isimle de çalışsın (geriye dönük uyumluluk)
function logout() { cikisYap(); }
window.logout = logout;

async function sepetRozetiniGuncelle() {
    const rozet = document.getElementById('cartCountBadge');
    if (!rozet) return;
    try {
        const sonuc = await ApiService.get('/cart');
        const sayi  = sonuc?.data?.kalem_sayisi || 0;
        if (sayi > 0) {
            rozet.textContent    = sayi > 99 ? '99+' : String(sayi);
            rozet.style.display  = 'inline-block';
        } else {
            rozet.style.display  = 'none';
        }
    } catch { /* sessiz hata */ }
}
window.updateCartBadge = sepetRozetiniGuncelle;

// ============================================================
// KATEGORİ MEGA MENÜ
// ============================================================

window.tumKategoriler = [];

async function menuIcinKategorileriYukle() {
    const anaListe = document.getElementById('parentList');
    if (!anaListe) return;
    try {
        const sonuc      = await ApiService.get('/categories');
        const kategoriler = sonuc.data || [];
        window.tumKategoriler = kategoriler;

        const anaKategoriler = kategoriler.filter(k => {
            const ustId = k.ust_kategori_id || k.ustKategoriId || k.parent_id || null;
            return ustId === null || ustId === undefined || ustId === '';
        });

        anaListe.innerHTML = anaKategoriler.length
            ? anaKategoriler.map(p => `
                <div class="cat-item p-item" onmouseenter="altKategorileriGoster('${p.id}', this)">
                    ${p.ad} <i class="fas fa-chevron-right"></i>
                </div>
              `).join('')
            : '<p style="padding:10px 20px;color:#64748b;">Kategori bulunamadı.</p>';
    } catch (hata) {
        console.error('[MEGA_MENU] Kategoriler yüklenemedi:', hata);
    }
}

function altKategorileriGoster(anaId, element) {
    document.querySelectorAll('.p-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    document.getElementById('grandChildCol').style.display = 'none';

    const cocuklar = window.tumKategoriler.filter(k => {
        const ustId = k.ust_kategori_id || k.ustKategoriId || k.parent_id;
        return ustId == anaId;
    });

    const cocukKol   = document.getElementById('childCol');
    const cocukListe = document.getElementById('childList');

    if (cocuklar.length > 0) {
        cocukKol.style.display = 'block';
        cocukListe.innerHTML = cocuklar.map(c => `
            <div class="cat-item c-item" onmouseenter="torunKategorileriGoster('${c.id}', this)">
                ${c.ad} <i class="fas fa-chevron-right"></i>
            </div>
        `).join('');
    } else {
        cocukKol.style.display = 'none';
    }
}

function torunKategorileriGoster(cocukId, element) {
    document.querySelectorAll('.c-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');

    const torunlar = window.tumKategoriler.filter(k => {
        const ustId = k.ust_kategori_id || k.ustKategoriId || k.parent_id;
        return ustId == cocukId;
    });

    const torunKol   = document.getElementById('grandChildCol');
    const torunListe = document.getElementById('grandChildList');

    if (torunlar.length > 0) {
        torunKol.style.display = 'block';
        torunListe.innerHTML = torunlar.map(g => `
            <div class="cat-item">${g.ad}</div>
        `).join('');
    } else {
        torunKol.style.display = 'none';
    }
}

// Eski isimleri de dışa aç (mega menu HTML'de inline onmouseenter var)
window.showChildCategories     = altKategorileriGoster;
window.showGrandChildCategories = torunKategorileriGoster;

// ============================================================
// ÖNE ÇIKAN EĞİTİMLER
// ============================================================

async function yayindakiKurslariYukle() {
    const izgara = document.getElementById('courseGrid');
    if (!izgara) return;

    izgara.innerHTML = '<div class="loading-state"><p>Kurslar yükleniyor...</p></div>';
    try {
        const sonuc   = await ApiService.get('/courses/published');
        const kurslar = sonuc.data || [];

        if (kurslar.length === 0) {
            izgara.innerHTML = '<p class="info-message">Henüz yayınlanmış bir kurs bulunmuyor.</p>';
            return;
        }
        izgara.innerHTML = '';
        kurslar.forEach(kurs => izgara.insertAdjacentHTML('beforeend', kursKartiOlustur(kurs)));
    } catch (hata) {
        console.error('[KURSLAR] Yüklenemedi:', hata.message);
        izgara.innerHTML = `<div class="hata-mesaji"><p>Kurslar şu anda yüklenemiyor.</p></div>`;
    }
}

// ============================================================
// TÜM ÖNERİLERİ TEK API ÇAĞRISIYLA YÜKLEYİP RENDER ET
// ============================================================

async function tumOnerileriYukle() {
    // Oturum bellekten son görüntülenen kurs/kategori ID'sini al (varsa)
    const tohumKursId     = sessionStorage.getItem('son_goruntulenen_kurs_id') || '';
    const tohumKategoriId = sessionStorage.getItem('son_goruntulenen_kategori_id') || '';

    const parametreler = new URLSearchParams();
    if (tohumKursId)     parametreler.append('kurs_id',     tohumKursId);
    if (tohumKategoriId) parametreler.append('kategori_id', tohumKategoriId);
    const sorguStr = parametreler.toString() ? `?${parametreler.toString()}` : '';

    try {
        const sonuc = await ApiService.get(`/recommendations/anasayfa${sorguStr}`);
        const veri  = sonuc.veri || {};

        renderEnPopulerKurslar(veri.enPopulerKurslar        || []);
        renderPopulerKategoriler(veri.populerKategoriler    || []);
        renderBirlikteAlinan(veri.birlikteAlinanKurslar     || []);
        renderKategoriCarpraz(veri.kategoriBazliCarpraz     || []);
        renderEnCokBegenilen(veri.enCokBegenilen            || []);
    } catch (hata) {
        console.error('[ÖNERİLER] Ana sayfa yüklenemedi:', hata.message);
        ['enPopulerGrid','birlikteAlinanGrid','enCokBegenilenGrid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="hata-mesaji"><p>Öneriler yüklenemedi.</p></div>';
        });
    }

    // Kişiselleştirilmiş bölüm ayrı istekle çağrılır (auth gerektirir)
    await kisisellestirilmisOnerileriYukle();
}

// ── MODÜL 1 render ──────────────────────────────────────────
function renderEnPopulerKurslar(kurslar) {
    const izgara = document.getElementById('enPopulerGrid');
    if (!izgara) return;

    if (kurslar.length === 0) {
        izgara.innerHTML = '<div class="bos-durum"><p>Henüz popüler kurs verisi bulunmuyor.</p></div>';
        return;
    }
    izgara.innerHTML = '';
    kurslar.forEach(kurs => izgara.insertAdjacentHTML('beforeend', kursKartiOlustur(kurs)));
}

// ── MODÜL 2 render — Kategori kartları ──────────────────────
function renderPopulerKategoriler(kategoriler) {
    const izgara = document.getElementById('populerKategorilerGrid');
    if (!izgara) return;

    if (kategoriler.length === 0) {
        izgara.innerHTML = '<div class="bos-durum"><p>Kategori verisi bulunamadı.</p></div>';
        return;
    }
    izgara.innerHTML = '';
    kategoriler.forEach(kat => {
        const ornekKursHtml = (kat.ornek_kurslar || []).map(k => `
            <a href="/main/course-detail.html?id=${guvenliMetin(k.id)}" class="kategori-kurs-chip">
                <span class="chip-baslik">${guvenliMetin(k.baslik)}</span>
                <span class="chip-fiyat">${k.fiyat > 0 ? parseFloat(k.fiyat).toFixed(2) + ' ₺' : 'Ücretsiz'}</span>
            </a>
        `).join('');

        const kayitSayisi = kat.istatistikler?.toplam_kayit || 0;
        const kursSayisi  = kat.istatistikler?.kurs_sayisi  || 0;

        izgara.insertAdjacentHTML('beforeend', `
            <div class="kategori-karti">
                <div class="kategori-karti-ust">
                    <div class="kategori-ikon"><i class="fas fa-graduation-cap"></i></div>
                    <div>
                        <h3 class="kategori-adi">${guvenliMetin(kat.ad)}</h3>
                        <p class="kategori-meta">
                            <span>${kursSayisi} kurs</span>
                            <span class="meta-ayirici">·</span>
                            <span>${kayitSayisi.toLocaleString('tr-TR')} kayıt</span>
                        </p>
                    </div>
                </div>
                <div class="kategori-kurslar">${ornekKursHtml}</div>
                <a href="#courses" class="kategori-tum-link">
                    Tüm kursları gör <i class="fas fa-arrow-right"></i>
                </a>
            </div>
        `);
    });
}

// ── MODÜL 3 render — Collaborative filtering ────────────────
function renderBirlikteAlinan(kurslar) {
    const izgara = document.getElementById('birlikteAlinanGrid');
    if (!izgara) return;

    if (kurslar.length === 0) {
        izgara.innerHTML = `
            <div class="bos-durum bos-durum-acik">
                <i class="fas fa-users" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.5;"></i>
                <p>Henüz birlikte alınma verisi yeterli değil.</p>
            </div>`;
        return;
    }
    izgara.innerHTML = '';
    kurslar.forEach(kurs => izgara.insertAdjacentHTML('beforeend', kursKartiOlustur(kurs)));
}

// ── MODÜL 4 render — Kategori çapraz öneri ──────────────────
function renderKategoriCarpraz(kategoriler) {
    const bolum  = document.getElementById('kategoriCarprazSection');
    const izgara = document.getElementById('kategoriCarprazGrid');
    if (!bolum || !izgara) return;

    if (kategoriler.length === 0) {
        bolum.style.display = 'none';
        return;
    }

    bolum.style.display = 'block';
    izgara.innerHTML = '';

    kategoriler.forEach(kat => {
        const ornekKursHtml = (kat.ornek_kurslar || []).map(k => `
            <a href="/main/course-detail.html?id=${guvenliMetin(k.id)}" class="kategori-kurs-chip">
                <span class="chip-baslik">${guvenliMetin(k.baslik)}</span>
                <span class="chip-fiyat">${k.fiyat > 0 ? parseFloat(k.fiyat).toFixed(2) + ' ₺' : 'Ücretsiz'}</span>
            </a>
        `).join('');

        izgara.insertAdjacentHTML('beforeend', `
            <div class="kategori-karti kategori-karti-carpraz">
                <div class="kategori-karti-ust">
                    <div class="kategori-ikon kategori-ikon-mor"><i class="fas fa-random"></i></div>
                    <div>
                        <h3 class="kategori-adi">${guvenliMetin(kat.ad)}</h3>
                        <p class="kategori-meta">
                            <span>${kat.ortak_kullanici_sayisi?.toLocaleString('tr-TR') || 0} ortak öğrenci</span>
                        </p>
                    </div>
                </div>
                <div class="kategori-kurslar">${ornekKursHtml}</div>
            </div>
        `);
    });
}

// ── MODÜL 5 render ──────────────────────────────────────────
function renderEnCokBegenilen(kurslar) {
    const izgara = document.getElementById('enCokBegenilenGrid');
    if (!izgara) return;

    if (kurslar.length === 0) {
        izgara.innerHTML = '<div class="bos-durum"><p>Henüz yeterli değerlendirme bulunmuyor.</p></div>';
        return;
    }
    izgara.innerHTML = '';
    kurslar.forEach(kurs => izgara.insertAdjacentHTML('beforeend', kursKartiOlustur(kurs)));
}

// ── KİŞİSELLEŞTİRİLMİŞ (ayrı auth endpoint) ─────────────────
async function kisisellestirilmisOnerileriYukle() {
    const bolum    = document.getElementById('recommendedSection');
    const izgara   = document.getElementById('recommendedGrid');
    if (!izgara) return;

    const jeton = localStorage.getItem('edunex_token');
    if (!jeton) {
        if (bolum) bolum.style.display = 'none';
        return;
    }

    if (bolum) bolum.style.display = 'block';

    try {
        const sonuc   = await ApiService.get('/recommendations/personalized');
        const kurslar = sonuc.veri || sonuc.data || [];

        if (kurslar.length === 0) {
            izgara.innerHTML = `
                <div class="bos-durum bos-durum-acik" style="grid-column:1/-1;">
                    <i class="fas fa-info-circle" style="font-size:2rem;margin-bottom:8px;display:block;"></i>
                    <p>Henüz kişiselleştirilmiş öneri oluşturulamadı.</p>
                    <a href="/profile/index.html" style="color:white;text-decoration:underline;margin-top:10px;display:inline-block;">
                        Profil Ayarlarına Git →
                    </a>
                </div>`;
            return;
        }
        izgara.innerHTML = '';
        kurslar.forEach(kurs => izgara.insertAdjacentHTML('beforeend', kursKartiOlustur(kurs)));
    } catch {
        if (bolum) bolum.style.display = 'none';
    }
}

// Eski fonksiyon isimlerini geriye dönük olarak dışa aç
async function loadAllRecommendations()  { await tumOnerileriYukle(); }
async function loadTrendingCourses()     { /* anasayfa endpoint'i karşılar */ }
async function loadTopRatedCourses()     { /* anasayfa endpoint'i karşılar */ }
window.loadAllRecommendations  = loadAllRecommendations;
window.loadTrendingCourses     = loadTrendingCourses;
window.loadTopRatedCourses     = loadTopRatedCourses;

// ============================================================
// ORTAK KART VE YARDIMCI FONKSİYONLAR
// ============================================================

function guvenliMetin(metin) {
    if (metin === null || metin === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(metin);
    return div.innerHTML;
}

// Eski isimle de erişilebilsin
function escapeHtml(text) { return guvenliMetin(text); }
window.escapeHtml = escapeHtml;

/**
 * Puana göre yıldız HTML'i üretir
 */
function yildizHtmlOlustur(puan, yorumSayisi) {
    if (!puan || parseFloat(puan) === 0) {
        return `<div class="kurs-puan kurs-puan-bos">
                    <i class="far fa-star"></i> Henüz değerlendirilmedi
                </div>`;
    }

    const puanSayi    = parseFloat(puan);
    const tamYildiz   = Math.floor(puanSayi);
    const yarimYildiz = (puanSayi - tamYildiz) >= 0.5;
    const bosYildiz   = 5 - tamYildiz - (yarimYildiz ? 1 : 0);

    let yildizHtml = '';
    for (let i = 0; i < tamYildiz; i++)   yildizHtml += '<i class="fas fa-star"></i> ';
    if (yarimYildiz)                       yildizHtml += '<i class="fas fa-star-half-alt"></i> ';
    for (let i = 0; i < bosYildiz; i++)    yildizHtml += '<i class="far fa-star"></i> ';

    return `<div class="kurs-puan">
                <span class="puan-deger">${puanSayi.toFixed(1)}</span>
                <span class="yildizlar">${yildizHtml}</span>
                <span class="puan-yorum">(${yorumSayisi || 0})</span>
            </div>`;
}
// Eski isimle de erişilebilsin
function generateStarRatingHtml(rating, reviewCount) { return yildizHtmlOlustur(rating, reviewCount); }
window.generateStarRatingHtml = generateStarRatingHtml;

/**
 * Tek bir kurs kartı HTML'i oluşturur (tüm bölümler bu fonksiyonu kullanır)
 */
function kursKartiOlustur(kurs) {
    const kursId     = kurs.id || '';
    const baslik     = kurs.baslik || 'Başlıksız Kurs';
    const altBaslik  = kurs.alt_baslik || '';

    // Eğitmen adı — hem ORM hem ham SQL formatını destekler
    let egitmenAdi = 'Uzman Eğitmen';
    if (kurs.egitmen) {
        egitmenAdi = `${kurs.egitmen.ad || ''} ${kurs.egitmen.soyad || ''}`.trim();
    } else if (kurs.Egitmen) {
        egitmenAdi = `${kurs.Egitmen.ad || ''} ${kurs.Egitmen.soyad || ''}`.trim();
    }

    const fiyat      = kurs.fiyat > 0 ? `${parseFloat(kurs.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
    const kategoriAd = kurs.kategori?.ad || kurs.Kategori?.ad || kurs.Category?.ad || 'Genel';

    const ortalamaPuan = kurs.istatistikler?.ortalama_puan
                         || kurs.dataValues?.ortalama_puan
                         || 0;
    const yorumSayisi  = kurs.istatistikler?.toplam_yorum
                         || kurs.dataValues?.toplam_yorum
                         || 0;

    const yildizHtml = yildizHtmlOlustur(ortalamaPuan, yorumSayisi);

    return `
        <a href="/main/course-detail.html?id=${guvenliMetin(kursId)}" class="course-card">
            <div class="kurs-kart-ic">
                <div class="kurs-kart-kapak">
                    <i class="fas fa-laptop-code"></i>
                    <span class="kurs-kategori-rozet">${guvenliMetin(kategoriAd)}</span>
                </div>
                <div class="kurs-kart-govde">
                    <h3 class="kurs-kart-baslik">${guvenliMetin(baslik)}</h3>
                    ${altBaslik ? `<p class="kurs-kart-alt-baslik">${guvenliMetin(altBaslik)}</p>` : ''}
                    <p class="kurs-kart-egitmen">
                        <i class="fas fa-chalkboard-teacher"></i>
                        ${guvenliMetin(egitmenAdi)}
                    </p>
                    ${yildizHtml}
                    <div class="kurs-kart-alt">
                        <span class="kurs-fiyat">${fiyat}</span>
                        <span class="kurs-incele">İncele <i class="fas fa-arrow-right"></i></span>
                    </div>
                </div>
            </div>
        </a>
    `;
}
// Eski isimle de erişilebilsin
function renderCourseCard(course) { return kursKartiOlustur(course); }
window.renderCourseCard = renderCourseCard;
