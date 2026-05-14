// public/main/js/main.js
// EduNex Ana Sayfa — Akıllı Hero + Öneri Modülleri
// Navbar, Auth ve Global Arama: /assets/js/loadNavbar.js tarafından yönetilir.

document.addEventListener('DOMContentLoaded', async () => {
    heroAyarla();
    await canliDerslerYukle();
    await tumOnerileriYukle();
    await kisisellestirilmisOnerileriYukle();
    await sonYorumlariYukle();
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
        renderTakipEdilen(veri.followedInstructorsCourses || []);
    } catch (hata) {
        console.error('[ÖNERİLER] Ana sayfa yüklenemedi:', hata.message);
        ['enPopulerGrid', 'birlikteAlinanGrid', 'enCokBegenilenGrid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="hata-mesaji"><p>Öneriler yüklenemedi.</p></div>';
        });
    }
}

// ── MODÜL: Takip Edilen Egitmenlerden Kurslar ─────────────────
// Backend yalnizca giris yapmis ogrenci icin bu listeyi doldurur;
// dizi bos gelirse sekmeyi sessizce gizleriz (gereksiz cikis tab degmesin).
function renderTakipEdilen(kurslar) {
    const buton = document.getElementById('tab-btn-takip');
    const grid  = document.getElementById('takipEdilenGrid');
    if (!buton || !grid) return;

    if (!kurslar.length) {
        buton.style.display = 'none';
        return;
    }
    buton.style.display = 'inline-block';
    grid.innerHTML = kurslar.map(kursKartiOlustur).join('');
}

// ── MODÜL 1: En Popüler Kurslar ──────────────────────────────
function renderEnPopulerKurslar(kurslar) {
    const izgara = document.getElementById('enPopulerGrid');
    if (!izgara) return;
    izgara.innerHTML = kurslar.length
        ? kurslar.map(kursKartiOlustur).join('')
        : '<div class="bos-durum"><p>Henüz popüler kurs verisi bulunmuyor.</p></div>';
}

// ── MODÜL 2: Kategori kartları (Udemy tarzı, kapaklı + yıldızlı) ──
const _KAT_IKONLAR = [
    'fa-laptop-code','fa-palette','fa-chart-bar','fa-camera',
    'fa-music','fa-flask','fa-language','fa-dumbbell',
    'fa-brain','fa-database','fa-mobile-alt','fa-pencil-alt'
];
const _KAT_GRADIENTS = [
    'linear-gradient(135deg,#4338ca 0%,#7c3aed 100%)',
    'linear-gradient(135deg,#0ea5e9 0%,#1d4ed8 100%)',
    'linear-gradient(135deg,#10b981 0%,#0d9488 100%)',
    'linear-gradient(135deg,#f97316 0%,#dc2626 100%)',
    'linear-gradient(135deg,#ec4899 0%,#8b5cf6 100%)',
    'linear-gradient(135deg,#f59e0b 0%,#b91c1c 100%)'
];

function _buildKatYildizlar(puan) {
    const r = parseFloat(puan) || 0;
    const tam   = Math.floor(r);
    const yarim = (r - tam) >= 0.5 ? 1 : 0;
    const bos   = 5 - tam - yarim;
    let html = '';
    for (let i = 0; i < tam;   i++) html += '<i class="fas fa-star"></i>';
    if (yarim) html += '<i class="fas fa-star-half-alt"></i>';
    for (let i = 0; i < bos;   i++) html += '<i class="far fa-star"></i>';
    return html;
}

function renderPopulerKategoriler(kategoriler) {
    const izgara = document.getElementById('populerKategorilerGrid');
    if (!izgara) return;
    if (!kategoriler.length) {
        izgara.innerHTML = '<div class="bos-durum"><p>Kategori verisi bulunamadı.</p></div>';
        return;
    }
    izgara.innerHTML = kategoriler.map((kat, i) => {
        const ikon       = _KAT_IKONLAR[i % _KAT_IKONLAR.length];
        const grad       = _KAT_GRADIENTS[i % _KAT_GRADIENTS.length];
        const kursSayisi = kat.istatistikler?.kurs_sayisi || 0;
        const puan       = parseFloat(kat.yildiz_ortalamasi || 0);
        const aciklama   = kat.aciklama
            ? duzMetin(kat.aciklama, 90)
            : `${kursSayisi} kurs ile yeteneklerinizi geliştirin.`;

        const arkaplan = kat.kapak_fotografi
            ? `style="background-image:url('${guvenliMetin(kat.kapak_fotografi)}');"`
            : `style="background:${grad};"`;

        const yildizBlok = puan > 0
            ? `<span class="kat-stars">${_buildKatYildizlar(puan)}</span>
               <span class="kat-stars-num">${puan.toFixed(1)}</span>`
            : '<span class="kat-stars-num kat-stars-empty">Yeni</span>';

        const fallbackIkon = kat.kapak_fotografi
            ? ''
            : `<div class="kat-fallback-ikon"><i class="fas ${ikon}"></i></div>`;

        return `
        <a href="/main/category.html?id=${guvenliMetin(kat.id)}" class="kategori-karti-v2 kategori-karti-cover" ${arkaplan}>
            <div class="kat-overlay"></div>
            ${fallbackIkon}
            <div class="kat-icerik">
                <div class="kat-meta">
                    <i class="fas fa-graduation-cap"></i> ${kursSayisi} kurs
                </div>
                <h3 class="kat-ad">${guvenliMetin(kat.ad)}</h3>
                <p class="kat-aciklama">${aciklama}</p>
                <div class="kat-rating">${yildizBlok}</div>
            </div>
        </a>`;
    }).join('');
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
    const pane   = document.getElementById('kategoriCarprazPane');
    const izgara = document.getElementById('kategoriCarprazGrid');
    if (!izgara) return;

    if (!kategoriler.length) { if (pane) pane.style.display = 'none'; return; }

    if (pane) pane.style.display = 'block';
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
    if (!izgara) return;

    if (!egitmenler.length) {
        izgara.innerHTML = '<div class="bos-durum"><i class="fas fa-user-slash" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.4;"></i><p>Henüz eğitmen verisi bulunamadı.</p></div>';
        return;
    }

    izgara.innerHTML = egitmenler.map(egitmenKartiOlustur).join('');
    if (egitmenler.length <= 3) {
        izgara.classList.add('car-track-centered');
    } else {
        izgara.classList.remove('car-track-centered');
    }
}

// ── KİŞİSELLEŞTİRİLMİŞ (auth gerektirir) ─────────────────────
async function kisisellestirilmisOnerileriYukle() {
    const tabBtn = document.getElementById('tab-btn-sizin-icin');
    const izgara = document.getElementById('recommendedGrid');
    if (!izgara) return;

    if (!localStorage.getItem('edunex_token')) {
        if (tabBtn) tabBtn.style.display = 'none';
        return;
    }

    if (tabBtn) {
        tabBtn.style.display = '';
        switchTab('tab-sizin-icin', tabBtn);
    }

    try {
        const sonuc   = await ApiService.get('/recommendations/personalized');
        const kurslar = sonuc.veri || sonuc.data || [];

        if (!kurslar.length) {
            izgara.innerHTML = `
                <div class="bos-durum" style="grid-column:1/-1;">
                    <i class="fas fa-info-circle" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.5;"></i>
                    <p>Kişiselleştirilmiş öneri oluşturmak için birkaç kursa göz atın.</p>
                    <a href="/main/courses.html" style="color:#2563eb;font-weight:700;margin-top:10px;display:inline-block;">
                        Kurslara Git →
                    </a>
                </div>`;
            return;
        }
        izgara.innerHTML = kurslar.map(kursKartiOlustur).join('');
    } catch {
        if (tabBtn) {
            tabBtn.style.display = 'none';
            switchTab('tab-populer', document.getElementById('tab-btn-populer'));
        }
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

    const kategoriAd = kurs.kategori?.ad || kurs.Kategori?.ad || kurs.Category?.ad || 'Genel';
    const puan       = kurs.istatistikler?.ortalama_puan || kurs.dataValues?.ortalama_puan || kurs.ortalamaPuan || 0;
    const yorum      = kurs.istatistikler?.toplam_yorum  || kurs.dataValues?.toplam_yorum  || 0;
    const kapak      = kurs.kapak_fotografi || null;
    const fiyatHtml  = _renderPriceTag(kurs);

    return `
        <a href="/main/course-detail.html?id=${guvenliMetin(kursId)}" class="course-card">
            <div class="kurs-kart-ic">
                <div class="kurs-kart-kapak">
                    ${kapak ? `<img src="${guvenliMetin(kapak)}" alt="" class="kurs-kart-kapak-img">` : '<i class="fas fa-laptop-code"></i>'}
                    <span class="kurs-kategori-rozet">${guvenliMetin(kategoriAd)}</span>
                    ${kurs.indirim_var && kurs.indirim_yuzde ? `<span class="kurs-indirim-rozet">-%${kurs.indirim_yuzde}</span>` : ''}
                </div>
                <div class="kurs-kart-govde">
                    <h3 class="kurs-kart-baslik">${guvenliMetin(baslik)}</h3>
                    ${altBaslik ? `<p class="kurs-kart-alt-baslik">${guvenliMetin(altBaslik)}</p>` : ''}
                    <p class="kurs-kart-egitmen"><i class="fas fa-chalkboard-teacher"></i> ${guvenliMetin(egitmenAdi)}</p>
                    ${yildizHtmlOlustur(puan, yorum)}
                    <div class="kurs-kart-alt">
                        ${fiyatHtml}
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

// İndirim durumuna göre fiyat etiketi (kart önizleme)
function _renderPriceTag(kurs) {
    const original = parseFloat(kurs.original_fiyat ?? kurs.fiyat) || 0;
    if (original <= 0) return '<span class="kurs-fiyat">Ücretsiz</span>';
    if (kurs.indirim_var && kurs.net_fiyat != null && parseFloat(kurs.net_fiyat) < original) {
        const net = parseFloat(kurs.net_fiyat).toFixed(2);
        return `<span class="kurs-fiyat-wrap">
            <span class="kurs-fiyat-eski">${original.toFixed(2)} ₺</span>
            <span class="kurs-fiyat kurs-fiyat-indirimli">${net} ₺</span>
        </span>`;
    }
    return `<span class="kurs-fiyat">${original.toFixed(2)} ₺</span>`;
}

// Zengin metni (HTML içerebilir) düz, kısaltılmış, güvenli metne çevir
function duzMetin(html, maxUzunluk) {
    if (html == null) return '';
    const d = document.createElement('div');
    d.innerHTML = String(html);
    let text = (d.textContent || '').replace(/\s+/g, ' ').trim();
    if (maxUzunluk && text.length > maxUzunluk) {
        text = text.slice(0, maxUzunluk).trim() + '…';
    }
    return guvenliMetin(text);
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
    const card  = track.querySelector('.course-card, .egitmen-karti, .kategori-karti, .kategori-karti-v2');
    if (!card) return;
    const isKat = track.classList.contains('kat-car-track');
    const step  = card.offsetWidth + (isKat ? 20 : 24);
    track.scrollBy({ left: dir * (isKat ? step * 5 : step * 3), behavior: 'smooth' });
}
window.carScroll = carScroll;

// ============================================================
// SEKME SİSTEMİ
// ============================================================

function switchTab(tabId, btnEl) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const hedef = document.getElementById(tabId);
    if (hedef) hedef.classList.add('active');
    if (btnEl) btnEl.classList.add('active');
}
window.switchTab = switchTab;

// ============================================================
// ÖĞRENCİ YORUMLARI
// ============================================================

async function sonYorumlariYukle() {
    const izgara = document.getElementById('recentReviewsGrid');
    if (!izgara) return;

    let yorumlar = [];
    try {
        const sonuc = await ApiService.get('/reviews/recent?limit=6');
        yorumlar = sonuc.veri || sonuc.data || [];
    } catch {}

    if (!yorumlar.length) {
        // Hiç yorum yoksa demo verilerle doldur
        yorumlar = [
            { ad: 'Ahmet Y.', kurs: 'Web Geliştirme Bootcamp', yorum: 'EduNex ile yazılım dünyasına adım attım. Eğitmenler son derece bilgili ve ilgili, içerikler her zaman güncel.', puan: 5 },
            { ad: 'Selin K.', kurs: 'Python ile Veri Bilimi', yorum: 'Sertifikam işe alım sürecimde gerçekten fark yarattı. Uygulamalı projelerle öğrenme deneyimi olağanüstüydü.', puan: 5 },
            { ad: 'Murat D.', kurs: 'UI/UX Tasarım Temelleri', yorum: 'Kısa sürede çok şey öğrendim. Modüler yapısı sayesinde kendi hızımda ilerleyebildim.', puan: 5 },
            { ad: 'Zeynep A.', kurs: 'Dijital Pazarlama', yorum: 'Canlı dersler sayesinde eğitmenle doğrudan iletişim kurabilmek paha biçilemez bir deneyim.', puan: 5 },
            { ad: 'Emre S.', kurs: 'React ile Modern Web', yorum: 'Projeye dayalı öğrenme yöntemi harika. İlk haftada gerçek bir uygulama yazdım.', puan: 5 },
            { ad: 'Büşra T.', kurs: 'İngilizce İletişim', yorum: 'Eğitmenin dönütleri ve pratik alıştırmalar sayesinde çok kısa sürede özgüven kazandım.', puan: 5 },
        ];
    }

    izgara.innerHTML = yorumlar.map(yorumKartiOlustur).join('');

    // Yorum sayısına göre layout class'ı (1 veya 2 yorum varsa kartlar genişler)
    izgara.classList.remove('review-count-1', 'review-count-2');
    if (yorumlar.length === 1) izgara.classList.add('review-count-1');
    else if (yorumlar.length === 2) izgara.classList.add('review-count-2');
}

function yorumKartiOlustur(y) {
    const puan      = y.puan || y.puan_degeri || 5;
    const ad        = guvenliMetin(y.ad || y.kullanici_adi || 'Öğrenci');
    const kurs      = guvenliMetin(y.kurs || y.kurs_baslik || '');
    // Yorum metni HTML içerebilir → düz metne çevir + boşsa fallback
    const yorumHam  = y.yorum || y.icerik || y.yorum_metni || '';
    const yorumDuz  = duzMetin(yorumHam, 280);
    const yorumBos  = !yorumDuz || yorumDuz.trim().length === 0;
    const yorumHtml = yorumBos
        ? '<span class="empty">Bu öğrenci henüz yazılı yorum bırakmadı.</span>'
        : yorumDuz;
    const inisyal   = ad.charAt(0).toUpperCase() || '?';
    const yildiz    = '★'.repeat(Math.min(5, Math.max(1, parseInt(puan))));

    return `
    <div class="review-card-home">
        <div class="review-quote-icon"><i class="fas fa-quote-left"></i></div>
        <p class="review-text ${yorumBos ? 'empty' : ''}">${yorumHtml}</p>
        <div class="review-stars">${yildiz}</div>
        <div class="review-author">
            <div class="review-avatar">${inisyal}</div>
            <div class="review-author-info">
                <div class="review-author-name">${ad}</div>
                ${kurs ? `<div class="review-author-kurs">${kurs}</div>` : ''}
            </div>
        </div>
    </div>`;
}

function reviewCarScroll(btn, dir) {
    const track = btn.closest('.review-car-wrap').querySelector('.review-car-track');
    const card  = track.querySelector('.review-card-home');
    if (!card) return;
    const step = card.offsetWidth + 24;
    track.scrollBy({ left: dir * step * 3, behavior: 'smooth' });
}
window.reviewCarScroll = reviewCarScroll;
window.sonYorumlariYukle = sonYorumlariYukle;

// ─── Geriye dönük alias'lar ────────────────────────────────────
window.escapeHtml               = guvenliMetin;
window.renderCourseCard         = kursKartiOlustur;
window.generateStarRatingHtml   = yildizHtmlOlustur;
window.loadAllRecommendations   = async () => tumOnerileriYukle();
window.tumYayindakiKurslar      = [];

// "Derse Katıl" butonuna tıklandığında:
function derseKatil(sessionId, odaAdi) {
    // 1. Session ID'yi kaydet
    localStorage.setItem('current_live_session_id', sessionId);
    // 2. Odaya yönlendir
    window.location.href = `/canli-ders/${odaAdi}`;
}
// ============================================================
// CANLI DERSLER — API'den veri çekme ve render etme
// ============================================================

async function canliDerslerYukle() {
    const bolum = document.getElementById('canliDerslerSection');
    const jeton = localStorage.getItem('edunex_token');

    if (!bolum) return;
    if (!jeton) {
        bolum.style.display = 'none';
        return;
    }

    const devamGrid = document.getElementById('devamEdenlerGrid');
    const planGrid  = document.getElementById('planlananlarGrid');

    try {
        const yanit = await fetch('/api/live-sessions/active', {
            headers: { 'Authorization': `Bearer ${jeton}` }
        });

        if (yanit.status === 401 || yanit.status === 403) {
            bolum.style.display = 'none';
            return;
        }

        const sonuc = await yanit.json();

        if (!sonuc.success || !sonuc.data) {
            bolum.style.display = 'none';
            return;
        }

        const { devam_edenler = [], planlananlar = [] } = sonuc.data;

        if (!devam_edenler.length && !planlananlar.length) {
            bolum.style.display = 'none';
            return;
        }

        bolum.style.display = 'block';

        const devamBolum = devamGrid?.closest('.canli-alt-bolum');
        const planBolum  = planGrid?.closest('.canli-alt-bolum');

        if (devamGrid) {
            if (devam_edenler.length) {
                devamGrid.innerHTML = devam_edenler.map(canliKartiOlustur).join('');
                if (devamBolum) devamBolum.style.display = '';
            } else {
                if (devamBolum) devamBolum.style.display = 'none';
            }
        }

        if (planGrid) {
            if (planlananlar.length) {
                planGrid.innerHTML = planlananlar.map(planliKartiOlustur).join('');
                if (planBolum) planBolum.style.display = '';
            } else {
                if (planBolum) planBolum.style.display = 'none';
            }
        }
    } catch (hata) {
        console.error('[CANLI DERSLER]', hata);
        bolum.style.display = 'none';
    }
}
function canliKartiOlustur(ders) {
    const dersId = ders.id || '';
    const baslik = ders.baslik || 'Başlıksız Ders';
    const odaAdi = ders.jitsi_oda_adi || '';
    const baslangicTarih = new Date(ders.baslangic_tarihi);
    const saatStr = baslangicTarih.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const tarihStr = baslangicTarih.toLocaleDateString('tr-TR');

    const egitmen = ders.Egitmen || {};
    const egitmenAdi = `${egitmen.ad || ''} ${egitmen.soyad || ''}`.trim() || 'Eğitmen';

    // BURADA <a href> YERİNE <button onclick> KULLANIYORUZ
    return `
        <div class="canli-kart">
            <div class="canli-kart-ust">
                <span class="canli-badge canli-badge-live"><i class="fas fa-circle"></i> CANLI</span>
                <h3 class="canli-kart-baslik">${guvenliMetin(baslik)}</h3>
                <div class="canli-kart-meta">
                    <div class="canli-meta-item">
                        <i class="fas fa-chalkboard-teacher"></i>
                        <span class="canli-egitmen">${guvenliMetin(egitmenAdi)}</span>
                    </div>
                    <div class="canli-meta-item">
                        <i class="fas fa-clock"></i>
                        <span>${saatStr}</span>
                    </div>
                </div>
            </div>
            <div class="canli-kart-icerik">
                <div class="canli-kart-buttons">
                    <button class="canli-btn canli-btn-katil" onclick="derseKatil('${guvenliMetin(dersId)}', '${guvenliMetin(odaAdi)}')">
                        <i class="fas fa-play"></i> Hemen Katıl
                    </button>
                </div>
            </div>
        </div>
    `;
}
function planliKartiOlustur(ders) {
    const baslik = ders.baslik || 'Başlıksız Ders';
    const baslangicTarih = new Date(ders.baslangic_tarihi);
    const saatStr = baslangicTarih.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const tarihStr = baslangicTarih.toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });

    const egitmen = ders.Egitmen || {};
    const egitmenAdi = `${egitmen.ad || ''} ${egitmen.soyad || ''}`.trim() || 'Eğitmen';

    return `
        <div class="canli-kart">
            <div class="canli-kart-ust">
                <span class="canli-badge canli-badge-soon"><i class="fas fa-calendar"></i> YAKINDA</span>
                <h3 class="canli-kart-baslik">${guvenliMetin(baslik)}</h3>
                <div class="canli-kart-meta">
                    <div class="canli-meta-item">
                        <i class="fas fa-chalkboard-teacher"></i>
                        <span class="canli-egitmen">${guvenliMetin(egitmenAdi)}</span>
                    </div>
                    <div class="canli-meta-item">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${tarihStr} ${saatStr}</span>
                    </div>
                </div>
            </div>
            <div class="canli-kart-icerik">
                <div class="canli-kart-buttons">
                    <button class="canli-btn canli-btn-reminder" onclick="alert('Hatırlatıcı kur (Çok Yakında)')">
                        <i class="fas fa-bell"></i> Hatırlatıcı Kur
                    </button>
                </div>
            </div>
        </div>
    `;
}

