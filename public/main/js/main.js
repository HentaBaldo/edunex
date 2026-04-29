// public/main/js/main.js
// EduNex Ana Sayfa — Kurs Listesi ve Öneri Modülleri
// Navbar, Auth ve Global Arama: /assets/js/loadNavbar.js tarafından yönetilir.

window.tumYayindakiKurslar = [];

document.addEventListener('DOMContentLoaded', async () => {
    await yayindakiKurslariYukle();
    await tumOnerileriYukle();
});

// ============================================================
// ÖNE ÇIKAN KURSLAR
// ============================================================

async function yayindakiKurslariYukle() {
    const izgara = document.getElementById('courseGrid');
    if (!izgara) return;

    izgara.innerHTML = '<div class="loading-state"><p>Kurslar yükleniyor...</p></div>';
    try {
        const sonuc = await ApiService.get('/courses/published');
        window.tumYayindakiKurslar = sonuc.data || [];

        if (!window.tumYayindakiKurslar.length) {
            izgara.innerHTML = '<p class="info-message">Henüz yayınlanmış bir kurs bulunmuyor.</p>';
            return;
        }
        izgara.innerHTML = '';
        window.tumYayindakiKurslar.forEach(kurs => {
            izgara.insertAdjacentHTML('beforeend', kursKartiOlustur(kurs));
        });
    } catch (hata) {
        console.error('[KURSLAR] Yüklenemedi:', hata.message);
        izgara.innerHTML = '<div class="hata-mesaji"><p>Kurslar şu anda yüklenemiyor.</p></div>';
    }
}

// ============================================================
// TÜM ÖNERİLERİ TEK API ÇAĞRISIYLA YÜKLEYİP RENDER ET
// ============================================================

async function tumOnerileriYukle() {
    const tohumKursId     = sessionStorage.getItem('son_goruntulenen_kurs_id') || '';
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
    } catch (hata) {
        console.error('[ÖNERİLER] Ana sayfa yüklenemedi:', hata.message);
        ['enPopulerGrid', 'birlikteAlinanGrid', 'enCokBegenilenGrid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="hata-mesaji"><p>Öneriler yüklenemedi.</p></div>';
        });
    }

    await kisisellestirilmisOnerileriYukle();
}

// ── MODÜL 1 ──────────────────────────────────────────────────
function renderEnPopulerKurslar(kurslar) {
    const izgara = document.getElementById('enPopulerGrid');
    if (!izgara) return;
    izgara.innerHTML = kurslar.length
        ? kurslar.map(kursKartiOlustur).join('')
        : '<div class="bos-durum"><p>Henüz popüler kurs verisi bulunmuyor.</p></div>';
}

// ── MODÜL 2 — Kategori kartları ──────────────────────────────
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
                <a href="#courses" class="kategori-tum-link">Tüm kursları gör <i class="fas fa-arrow-right"></i></a>
            </div>`);
    });
}

// ── MODÜL 3 — Collaborative filtering ───────────────────────
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

// ── MODÜL 4 — Kategori çapraz öneri ─────────────────────────
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

// ── MODÜL 5 ──────────────────────────────────────────────────
function renderEnCokBegenilen(kurslar) {
    const izgara = document.getElementById('enCokBegenilenGrid');
    if (!izgara) return;
    izgara.innerHTML = kurslar.length
        ? kurslar.map(kursKartiOlustur).join('')
        : '<div class="bos-durum"><p>Henüz yeterli değerlendirme bulunmuyor.</p></div>';
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
                    <p>Henüz kişiselleştirilmiş öneri oluşturulamadı.</p>
                    <a href="/profile/index.html" style="color:white;text-decoration:underline;margin-top:10px;display:inline-block;">
                        Profil Ayarlarına Git →
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
// ORTAK KART VE YARDIMCI FONKSİYONLAR
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

function kursKartiOlustur(kurs) {
    const kursId    = kurs.id || '';
    const baslik    = kurs.baslik || 'Başlıksız Kurs';
    const altBaslik = kurs.alt_baslik || '';

    let egitmenAdi = 'Uzman Eğitmen';
    if (kurs.egitmen)       egitmenAdi = `${kurs.egitmen.ad || ''} ${kurs.egitmen.soyad || ''}`.trim();
    else if (kurs.Egitmen)  egitmenAdi = `${kurs.Egitmen.ad || ''} ${kurs.Egitmen.soyad || ''}`.trim();

    const fiyat      = kurs.fiyat > 0 ? `${parseFloat(kurs.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
    const kategoriAd = kurs.kategori?.ad || kurs.Kategori?.ad || kurs.Category?.ad || 'Genel';
    const puan       = kurs.istatistikler?.ortalama_puan || kurs.dataValues?.ortalama_puan || 0;
    const yorum      = kurs.istatistikler?.toplam_yorum  || kurs.dataValues?.toplam_yorum  || 0;

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

// ─── Geriye dönük alias'lar ────────────────────────────────────
window.escapeHtml           = guvenliMetin;
window.renderCourseCard     = kursKartiOlustur;
window.generateStarRatingHtml = yildizHtmlOlustur;
window.loadAllRecommendations = async () => tumOnerileriYukle();
