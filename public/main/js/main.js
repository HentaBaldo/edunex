// public/main/js/main.js
// EduNex Ana Sayfa — Akıllı Hero + Öneri Modülleri
// Navbar, Auth ve Global Arama: /assets/js/loadNavbar.js tarafından yönetilir.

document.addEventListener('DOMContentLoaded', async () => {
    heroAyarla();
    await tumOnerileriYukle();
    await kisisellestirilmisOnerileriYukle();
});

// ============================================================
// AKILLI HERO — Auth durumuna göre banner seç
// ============================================================

function heroAyarla() {
    const heroOut = document.getElementById('heroLoggedOut');
    const heroIn  = document.getElementById('heroLoggedIn');
    if (!heroOut || !heroIn) return;

    const jeton        = localStorage.getItem('edunex_token');
    const kullanicJson = localStorage.getItem('edunex_user');

    if (!jeton || !kullanicJson) {
        heroOut.style.display = 'block';
        heroIn.style.display  = 'none';
        return;
    }

    let kullanici;
    try { kullanici = JSON.parse(kullanicJson); } catch { return; }

    heroOut.style.display = 'none';
    heroIn.style.display  = 'block';

    const adEl = document.getElementById('hosgeldinAd');
    if (adEl) adEl.textContent = kullanici.ad || 'Öğrenci';

    const panelLink = document.getElementById('hosgeldinPanelLink');
    if (panelLink) {
        panelLink.href = kullanici.rol === 'egitmen'
            ? '/instructor/dashboard.html'
            : '/student/dashboard.html';
    }
}

// ============================================================
// TÜM ÖNERİLERİ TEK API ÇAĞRISIYLA YÜKLEYİP RENDER ET
// ============================================================

async function tumOnerileriYukle() {
    const tohumKursId     = sessionStorage.getItem('son_goruntulenen_kurs_id')     || '';
    const tohumKategoriId = sessionStorage.getItem('son_goruntulenen_kategori_id') || '';

    const parametreler = new URLSearchParams();
    if (tohumKursId)     parametreler.append('kurs_id',     tohumKursId);
    if (tohumKategoriId) parametreler.append('kategori_id', tohumKategoriId);
    const sorguStr = parametreler.toString() ? `?${parametreler.toString()}` : '';

    try {
        const sonuc = await ApiService.get(`/recommendations/anasayfa${sorguStr}`);
        const veri  = sonuc.veri || {};

        renderEnPopulerKurslar(veri.enPopulerKurslar     || []);
        renderPopulerKategoriler(veri.populerKategoriler || []);
        renderBirlikteAlinan(veri.birlikteAlinanKurslar  || []);
        renderKategoriCarpraz(veri.kategoriBazliCarpraz  || []);
        renderEnCokBegenilen(veri.enCokBegenilen         || []);
        renderPopulerEgitmenler(veri.populerEgitmenler   || []);
    } catch (hata) {
        console.error('[ÖNERİLER] Ana sayfa yüklenemedi:', hata.message);
        ['enPopulerGrid', 'birlikteAlinanGrid', 'enCokBegenilenGrid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="hata-mesaji"><p>Öneriler yüklenemedi.</p></div>';
        });
    }
}

// ── MODÜL 1: En Popüler Kurslar ──────────────────────────────
function renderEnPopulerKurslar(kurslar) {
    const izgara = document.getElementById('enPopulerGrid');
    if (!izgara) return;
    izgara.innerHTML = kurslar.length
        ? kurslar.map(kursKartiOlustur).join('')
        : '<div class="bos-durum"><p>Henüz popüler kurs verisi bulunmuyor.</p></div>';
}

// ── MODÜL 2: Kategori kartları ───────────────────────────────
function renderPopulerKategoriler(kategoriler) {
    const izgara = document.getElementById('populerKategorilerGrid');
    if (!izgara) return;
    if (!kategoriler.length) {
        izgara.innerHTML = '<div class="bos-durum"><p>Kategori verisi bulunamadı.</p></div>';
        return;
    }
    izgara.innerHTML = '';
    kategoriler.forEach(kat => {
        const ornekKursHtml = (kat.ornek_kurslar || []).map(k => `
            <a href="/main/course-detail.html?id=${guvenliMetin(k.id)}" class="kategori-kurs-chip">
                <span class="chip-baslik">${guvenliMetin(k.baslik)}</span>
                <span class="chip-fiyat">${k.fiyat > 0 ? parseFloat(k.fiyat).toFixed(2) + ' ₺' : 'Ücretsiz'}</span>
            </a>`).join('');

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
                <a href="/main/category.html?id=${guvenliMetin(kat.id)}" class="kategori-tum-link">
                    Tüm kursları gör <i class="fas fa-arrow-right"></i>
                </a>
            </div>`);
    });
}

// ── MODÜL 3: Collaborative filtering ────────────────────────
function renderBirlikteAlinan(kurslar) {
    const izgara = document.getElementById('birlikteAlinanGrid');
    if (!izgara) return;
    izgara.innerHTML = kurslar.length
        ? kurslar.map(kursKartiOlustur).join('')
        : `<div class="bos-durum bos-durum-acik">
               <i class="fas fa-users" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.5;"></i>
               <p>Henüz birlikte alınma verisi yeterli değil.</p>
           </div>`;
}

// ── MODÜL 4: Kategori çapraz öneri ──────────────────────────
function renderKategoriCarpraz(kategoriler) {
    const bolum  = document.getElementById('kategoriCarprazSection');
    const izgara = document.getElementById('kategoriCarprazGrid');
    if (!bolum || !izgara) return;

    if (!kategoriler.length) { bolum.style.display = 'none'; return; }

    bolum.style.display = 'block';
    izgara.innerHTML    = '';
    kategoriler.forEach(kat => {
        const ornekKursHtml = (kat.ornek_kurslar || []).map(k => `
            <a href="/main/course-detail.html?id=${guvenliMetin(k.id)}" class="kategori-kurs-chip">
                <span class="chip-baslik">${guvenliMetin(k.baslik)}</span>
                <span class="chip-fiyat">${k.fiyat > 0 ? parseFloat(k.fiyat).toFixed(2) + ' ₺' : 'Ücretsiz'}</span>
            </a>`).join('');

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
            </div>`);
    });
}

// ── MODÜL 5: En Çok Beğenilenler ────────────────────────────
function renderEnCokBegenilen(kurslar) {
    const izgara = document.getElementById('enCokBegenilenGrid');
    if (!izgara) return;
    izgara.innerHTML = kurslar.length
        ? kurslar.map(kursKartiOlustur).join('')
        : '<div class="bos-durum"><p>Henüz yeterli değerlendirme bulunmuyor.</p></div>';
}

// ── MODÜL 6: En Popüler Eğitmenler ──────────────────────────
function renderPopulerEgitmenler(egitmenler) {
    const izgara = document.getElementById('egitmenlerGrid');
    const bolum  = document.getElementById('egitmenlerSection');
    if (!izgara) return;

    if (!egitmenler.length) {
        if (bolum) bolum.style.display = 'none';
        return;
    }

    izgara.innerHTML = egitmenler.map(egitmenKartiOlustur).join('');
}

// ── KİŞİSELLEŞTİRİLMİŞ (auth gerektirir) ─────────────────────
async function kisisellestirilmisOnerileriYukle() {
    const bolum  = document.getElementById('recommendedSection');
    const izgara = document.getElementById('recommendedGrid');
    if (!izgara) return;

    if (!localStorage.getItem('edunex_token')) {
        if (bolum) bolum.style.display = 'none';
        return;
    }

    if (bolum) bolum.style.display = 'block';

    try {
        const sonuc   = await ApiService.get('/recommendations/personalized');
        const kurslar = sonuc.veri || sonuc.data || [];

        if (!kurslar.length) {
            izgara.innerHTML = `
                <div class="bos-durum bos-durum-acik" style="grid-column:1/-1;">
                    <i class="fas fa-info-circle" style="font-size:2rem;margin-bottom:8px;display:block;"></i>
                    <p>Kişiselleştirilmiş öneri oluşturmak için birkaç kursa göz atın.</p>
                    <a href="/main/courses.html" style="color:white;text-decoration:underline;margin-top:10px;display:inline-block;">
                        Kurslara Git →
                    </a>
                </div>`;
            return;
        }
        izgara.innerHTML = kurslar.map(kursKartiOlustur).join('');
    } catch {
        if (bolum) bolum.style.display = 'none';
    }
}

// ============================================================
// KART FONKSİYONLARI
// ============================================================

function egitmenKartiOlustur(e) {
    const tam    = `${guvenliMetin(e.ad)} ${guvenliMetin(e.soyad)}`.trim();
    const unvan  = e.unvan ? guvenliMetin(e.unvan) : 'Eğitmen';
    const ist    = e.istatistikler || {};
    const ogrenci = parseInt(ist.toplam_ogrenci || 0).toLocaleString('tr-TR');
    const kurs    = parseInt(ist.toplam_kurs || 0);
    const puan    = ist.ortalama_puan ? parseFloat(ist.ortalama_puan).toFixed(1) : null;

    const baslarf = (e.ad || '?')[0].toUpperCase();
    const soylarf = (e.soyad || '?')[0].toUpperCase();
    const initials = baslarf + soylarf;

    const avatarIc = e.profil_fotografi
        ? `<img src="${guvenliMetin(e.profil_fotografi)}" alt="${tam}" class="egitmen-foto">`
        : `<span class="egitmen-initials">${initials}</span>`;

    const puanHtml = puan
        ? `<span class="egitmen-puan"><i class="fas fa-star"></i> ${puan}</span>`
        : '';

    return `
    <a href="/main/instructor-profile.html?id=${guvenliMetin(e.id)}" class="egitmen-karti">
        <div class="egitmen-kart-ic">
            <div class="egitmen-avatar">${avatarIc}</div>
            <div class="egitmen-bilgi">
                <h3 class="egitmen-adi">${tam}</h3>
                <p class="egitmen-unvan">${unvan}</p>
                <div class="egitmen-meta">
                    <span><i class="fas fa-users"></i> ${ogrenci} öğrenci</span>
                    <span><i class="fas fa-play-circle"></i> ${kurs} kurs</span>
                    ${puanHtml}
                </div>
            </div>
        </div>
    </a>`;
}

function kursKartiOlustur(kurs) {
    const kursId    = kurs.id || '';
    const baslik    = kurs.baslik || 'Başlıksız Kurs';
    const altBaslik = kurs.alt_baslik || '';

    let egitmenAdi = 'Uzman Eğitmen';
    if (kurs.egitmen)      egitmenAdi = `${kurs.egitmen.ad || ''} ${kurs.egitmen.soyad || ''}`.trim();
    else if (kurs.Egitmen) egitmenAdi = `${kurs.Egitmen.ad || ''} ${kurs.Egitmen.soyad || ''}`.trim();

    const fiyat      = kurs.fiyat > 0 ? `${parseFloat(kurs.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
    const kategoriAd = kurs.kategori?.ad || kurs.Kategori?.ad || kurs.Category?.ad || 'Genel';
    const puan       = kurs.istatistikler?.ortalama_puan || kurs.dataValues?.ortalama_puan || 0;
    const yorum      = kurs.istatistikler?.toplam_yorum  || kurs.dataValues?.toplam_yorum  || 0;

    const kapak = kurs.kapak_fotografi || null;

    return `
        <a href="/main/course-detail.html?id=${guvenliMetin(kursId)}" class="course-card">
            <div class="kurs-kart-ic">
                <div class="kurs-kart-kapak">
                    ${kapak ? `<img src="${guvenliMetin(kapak)}" alt="" class="kurs-kart-kapak-img">` : '<i class="fas fa-laptop-code"></i>'}
                    <span class="kurs-kategori-rozet">${guvenliMetin(kategoriAd)}</span>
                </div>
                <div class="kurs-kart-govde">
                    <h3 class="kurs-kart-baslik">${guvenliMetin(baslik)}</h3>
                    ${altBaslik ? `<p class="kurs-kart-alt-baslik">${guvenliMetin(altBaslik)}</p>` : ''}
                    <p class="kurs-kart-egitmen"><i class="fas fa-chalkboard-teacher"></i> ${guvenliMetin(egitmenAdi)}</p>
                    ${yildizHtmlOlustur(puan, yorum)}
                    <div class="kurs-kart-alt">
                        <span class="kurs-fiyat">${fiyat}</span>
                        <span class="kurs-incele">İncele <i class="fas fa-arrow-right"></i></span>
                    </div>
                </div>
            </div>
        </a>`;
}

// ============================================================
// YARDIMCI FONKSİYONLAR
// ============================================================

function guvenliMetin(metin) {
    if (metin == null) return '';
    const div = document.createElement('div');
    div.textContent = String(metin);
    return div.innerHTML;
}

function yildizHtmlOlustur(puan, yorumSayisi) {
    if (!puan || parseFloat(puan) === 0) {
        return `<div class="kurs-puan kurs-puan-bos"><i class="far fa-star"></i> Henüz değerlendirilmedi</div>`;
    }
    const p = parseFloat(puan);
    let yildiz = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(p))                       yildiz += '<i class="fas fa-star"></i> ';
        else if (i === Math.ceil(p) && p % 1 >= 0.5) yildiz += '<i class="fas fa-star-half-alt"></i> ';
        else                                          yildiz += '<i class="far fa-star"></i> ';
    }
    return `<div class="kurs-puan">
                <span class="puan-deger">${p.toFixed(1)}</span>
                <span class="yildizlar">${yildiz}</span>
                <span class="puan-yorum">(${yorumSayisi || 0})</span>
            </div>`;
}

// ============================================================
// CAROUSEL — Ok düğmesi kaydırma
// ============================================================

function carScroll(btn, dir) {
    const track = btn.closest('.car-wrap').querySelector('.car-track');
    const card  = track.querySelector('.course-card, .egitmen-karti, .kategori-karti');
    if (!card) return;
    const step = card.offsetWidth + 24; // 24 = gap
    track.scrollBy({ left: dir * step * 3, behavior: 'smooth' });
}
window.carScroll = carScroll;

// ─── Geriye dönük alias'lar ────────────────────────────────────
window.escapeHtml               = guvenliMetin;
window.renderCourseCard         = kursKartiOlustur;
window.generateStarRatingHtml   = yildizHtmlOlustur;
window.loadAllRecommendations   = async () => tumOnerileriYukle();
window.tumYayindakiKurslar      = [];
