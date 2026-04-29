// public/main/js/instructor-profile.js
(function () {
    'use strict';

    const params       = new URLSearchParams(window.location.search);
    const egitmenId    = params.get('id');

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        if (!egitmenId) { hataMesaji('Eğitmen ID bulunamadı.'); return; }
        try {
            const res  = await ApiService.get(`/instructor/${egitmenId}/profile`);
            const data = res.data;
            profilDoldur(data);
            kurslarDoldur(data.kurslar || []);
            istatistiklerDoldur(data.istatistikler || {});
        } catch (err) {
            console.error('[EGITMEN_PROFIL]', err);
            hataMesaji('Eğitmen profili yüklenirken bir hata oluştu.');
        }
    }

    function profilDoldur(d) {
        const profil  = d.profil    || {};
        const detay   = d.detay     || {};
        const adSoyad = `${profil.ad || ''} ${profil.soyad || ''}`.trim();

        document.title = `${adSoyad} — EduNex`;

        // Avatar
        const avatarEl = document.getElementById('heroAvatar');
        if (profil.profil_fotografi) {
            avatarEl.innerHTML = `<img src="${_esc(profil.profil_fotografi)}" alt="${_esc(adSoyad)}">`;
        }

        document.getElementById('heroName').textContent  = adSoyad;
        document.getElementById('heroTitle').textContent = detay.baslik || detay.unvan || '';

        // Hero İstatistikler
        const ist = d.istatistikler || {};
        const heroStats = document.getElementById('heroStats');
        heroStats.innerHTML = '';

        if (detay.deneyim_yili) {
            heroStats.innerHTML += _statHtml('fas fa-briefcase', `${detay.deneyim_yili} Yıl Deneyim`);
        }
        if (profil.sehir) {
            heroStats.innerHTML += _statHtml('fas fa-map-marker-alt', _esc(profil.sehir));
        }
        if (ist.toplam_ogrenci > 0) {
            heroStats.innerHTML += _statHtml('fas fa-users', `${ist.toplam_ogrenci.toLocaleString('tr-TR')} Öğrenci`);
        }
        if (ist.ortalama_puan > 0) {
            heroStats.innerHTML += _statHtml('fas fa-star', `${ist.ortalama_puan.toFixed(1)} Ortalama Puan`);
        }

        // Sosyal Medya
        const sosyal = document.getElementById('heroSocial');
        const sosyalBaglantilar = [
            { alan: profil.website,   ikon: 'fas fa-globe',         prefix: '' },
            { alan: profil.linkedin,  ikon: 'fab fa-linkedin-in',   prefix: '' },
            { alan: profil.youtube,   ikon: 'fab fa-youtube',       prefix: '' },
            { alan: profil.instagram, ikon: 'fab fa-instagram',     prefix: '' },
            { alan: profil.x_twitter, ikon: 'fab fa-x-twitter',     prefix: '' },
            { alan: profil.facebook,  ikon: 'fab fa-facebook-f',    prefix: '' },
            { alan: profil.tiktok,    ikon: 'fab fa-tiktok',        prefix: '' },
        ];
        sosyalBaglantilar.forEach(({ alan, ikon }) => {
            if (alan) {
                const href = alan.startsWith('http') ? alan : `https://${alan}`;
                sosyal.innerHTML += `<a href="${_esc(href)}" target="_blank" rel="noopener noreferrer" title="${_esc(alan)}"><i class="${ikon}"></i></a>`;
            }
        });

        // Biyografi
        const bio = detay.biyografi;
        if (bio && bio.trim()) {
            const bioCard   = document.getElementById('bioCard');
            const bioText   = document.getElementById('bioText');
            const bioToggle = document.getElementById('bioToggle');
            bioCard.style.display = 'block';
            bioText.textContent   = bio;

            if (bio.length > 300) {
                bioToggle.style.display = 'block';
            } else {
                bioText.classList.remove('bio-collapsed');
            }
        }
    }

    function kurslarDoldur(kurslar) {
        const grid = document.getElementById('coursesGrid');

        if (!kurslar.length) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column:1/-1;">
                    <i class="fas fa-box-open"></i>
                    <p>Bu eğitmene ait yayında kurs bulunmuyor.</p>
                </div>`;
            return;
        }

        grid.innerHTML = kurslar.map(k => {
            const kategori = k.Category ? _esc(k.Category.ad) : 'Genel';
            const fiyat    = k.fiyat > 0 ? `${parseFloat(k.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
            const puan     = k.istatistikler?.ortalama_puan || 0;
            const yorum    = k.istatistikler?.toplam_yorum  || 0;

            return `
            <a href="/main/course-detail.html?id=${_esc(k.id)}" class="course-card">
                <div class="kurs-kart-kapak">
                    <i class="fas fa-laptop-code"></i>
                    <span class="kurs-kategori-rozet">${kategori}</span>
                </div>
                <div class="kurs-kart-govde">
                    <h3 class="kurs-kart-baslik">${_esc(k.baslik)}</h3>
                    <p class="kurs-kart-alt-baslik">${_esc(k.aciklama || '')}</p>
                    ${yildizHtml(puan, yorum)}
                    <div class="kurs-kart-alt">
                        <span class="kurs-fiyat">${fiyat}</span>
                        <span class="kurs-incele">İncele <i class="fas fa-arrow-right"></i></span>
                    </div>
                </div>
            </a>`;
        }).join('');
    }

    function istatistiklerDoldur(ist) {
        _setText('statStudents', ist.toplam_ogrenci != null ? ist.toplam_ogrenci.toLocaleString('tr-TR') : '0');
        _setText('statCourses',  ist.toplam_kurs    != null ? ist.toplam_kurs    : '0');
        _setText('statRating',   ist.ortalama_puan  > 0    ? ist.ortalama_puan.toFixed(1) : '—');
        _setText('statReviews',  ist.toplam_yorum   != null ? ist.toplam_yorum.toLocaleString('tr-TR') : '0');

        if (ist.toplam_yorum > 0) {
            const ratingCard = document.getElementById('ratingCard');
            ratingCard.style.display = 'block';
            document.getElementById('ratingBigNum').textContent   = ist.ortalama_puan.toFixed(1);
            document.getElementById('ratingBigStars').innerHTML   = yildizSvg(ist.ortalama_puan);
            document.getElementById('ratingBigCount').textContent = `${ist.toplam_yorum.toLocaleString('tr-TR')} değerlendirme`;

            const dagılım = ist.puan_dagilimi || {};
            const bars    = document.getElementById('ratingBars');
            bars.innerHTML = [5,4,3,2,1].map(n => {
                const sayi = dagılım[n] || 0;
                const pct  = ist.toplam_yorum > 0 ? Math.round((sayi / ist.toplam_yorum) * 100) : 0;
                return `
                <div class="rating-bar-row">
                    <div class="rating-bar-label">${n} <i class="fas fa-star" style="color:#fbbf24;font-size:0.7rem;"></i></div>
                    <div class="rating-bar-track"><div class="rating-bar-fill" style="width:${pct}%"></div></div>
                    <div class="rating-bar-pct">${pct}%</div>
                </div>`;
            }).join('');
        }
    }

    // ─── Biyografi toggle ─────────────────────────────────────
    window.biyografiyiToggle = function () {
        const bioText   = document.getElementById('bioText');
        const bioToggle = document.getElementById('bioToggle');
        const acik      = !bioText.classList.contains('bio-collapsed');
        if (acik) {
            bioText.classList.add('bio-collapsed');
            bioToggle.innerHTML = 'Devamını Gör <i class="fas fa-chevron-down"></i>';
        } else {
            bioText.classList.remove('bio-collapsed');
            bioToggle.innerHTML = 'Daha Az Göster <i class="fas fa-chevron-up"></i>';
        }
    };

    // ─── Yardımcılar ──────────────────────────────────────────
    function yildizHtml(puan, yorum) {
        if (!yorum) return '';
        return `
        <div class="kurs-yildiz-satiri">
            <span class="yildiz-puan">${puan.toFixed(1)}</span>
            <span class="yildizlar">${yildizSvg(puan)}</span>
            <span class="yorum-sayisi">(${yorum})</span>
        </div>`;
    }

    function yildizSvg(puan) {
        return [1,2,3,4,5].map(n => {
            if (puan >= n)      return '<i class="fas fa-star"></i>';
            if (puan >= n - 0.5) return '<i class="fas fa-star-half-alt"></i>';
            return '<i class="far fa-star"></i>';
        }).join('');
    }

    function _statHtml(ikon, metin) {
        return `<div class="hero-stat"><i class="${ikon}"></i> ${metin}</div>`;
    }

    function _setText(id, val) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }

    function _esc(text) {
        if (text == null) return '';
        const d = document.createElement('div');
        d.textContent = String(text);
        return d.innerHTML;
    }

    function hataMesaji(msg) {
        document.getElementById('heroName').textContent = 'Hata';
        document.getElementById('heroTitle').textContent = msg;
        document.getElementById('coursesGrid').innerHTML = `
            <div class="empty-state" style="grid-column:1/-1;">
                <i class="fas fa-exclamation-circle"></i>
                <p>${_esc(msg)}</p>
            </div>`;
    }
})();
