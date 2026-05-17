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
            webinarlarDoldur(data.webinarlar || []);
            istatistiklerDoldur(data.istatistikler || {});
            takipButonunuKur();
        } catch (err) {
            console.error('[EGITMEN_PROFIL]', err);
            // 403 PROFILE_PRIVATE: kullanici profilini gizlemis — nazik mesaj goster.
            if (err.statusCode === 403) {
                hataMesaji('Bu eğitmen profilini gizli tutmayı tercih etmiştir.');
                return;
            }
            hataMesaji('Eğitmen profili yüklenirken bir hata oluştu.');
        }
    }

    // ─── Takip Et / Takipten Cik ──────────────────────────────
    async function takipButonunuKur() {
        const buton = document.getElementById('followBtn');
        if (!buton) return;

        const token = localStorage.getItem('edunex_token');
        const userJson = localStorage.getItem('edunex_user');
        if (!token || !userJson) return; // anonim kullanici -> buton gizli kalir

        let kullanici;
        try { kullanici = JSON.parse(userJson); } catch { return; }
        if (kullanici.rol !== 'ogrenci') return; // sadece ogrenci takip edebilir
        if (kullanici.id === egitmenId) return;  // kendini takip edemez

        // Mevcut durumu cek: takip edilenler listesinde mi?
        let takipEdiyor = false;
        try {
            const sonuc = await ApiService.get('/follows/my-instructors');
            const liste = sonuc?.data?.egitmenler || [];
            takipEdiyor = liste.some(e => e.egitmen?.kullanici_id === egitmenId);
        } catch (err) {
            console.warn('[TAKIP] Mevcut durum okunamadi:', err.message);
        }

        buton.style.display = 'inline-flex';
        butonGorunumunuAyarla(buton, takipEdiyor);

        buton.addEventListener('click', async () => {
            buton.disabled = true;
            try {
                const sonuc = await ApiService.post(`/follows/${egitmenId}`, {});
                const yeniDurum = !!sonuc?.data?.takip_ediyor;
                butonGorunumunuAyarla(buton, yeniDurum);
            } catch (err) {
                console.error('[TAKIP] Toggle hatasi:', err);
                notify.error('İşlem başarısız: ' + (err.message || 'Bilinmeyen hata'));
            } finally {
                buton.disabled = false;
            }
        });
    }

    function butonGorunumunuAyarla(buton, takipEdiyor) {
        const text = document.getElementById('followBtnText');
        const ikon = buton.querySelector('i');
        if (takipEdiyor) {
            if (text) text.textContent = 'Takip Ediliyor';
            if (ikon) ikon.className = 'fas fa-user-check';
            buton.style.background = '#fff';
            buton.style.color = '#0f172a';
        } else {
            if (text) text.textContent = 'Takip Et';
            if (ikon) ikon.className = 'fas fa-user-plus';
            buton.style.background = 'transparent';
            buton.style.color = '#fff';
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
            avatarEl.innerHTML = `<img src="${_escAttr(profil.profil_fotografi)}" alt="${_escAttr(adSoyad)}">`;
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
                sosyal.innerHTML += `<a href="${_escAttr(href)}" target="_blank" rel="noopener noreferrer" title="${_escAttr(alan)}"><i class="${ikon}"></i></a>`;
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
                    <p>Bu eğitmenin henüz yayında olan bir kursu bulunmuyor.</p>
                </div>`;
            return;
        }

        grid.innerHTML = kurslar.map(k => {
            const kategori = k.Category ? _esc(k.Category.ad) : 'Genel';
            const puan     = k.istatistikler?.ortalama_puan || 0;
            const yorum    = k.istatistikler?.toplam_yorum  || 0;
            const kapak    = k.kapak_fotografi || null;
            const fiyatHtml = _renderPriceTag(k);

            return `
            <a href="/main/course-detail.html?id=${_escAttr(k.id)}" class="course-card">
                <div class="kurs-kart-kapak">
                    ${kapak ? `<img src="${_escAttr(kapak)}" alt="" class="kurs-kart-kapak-img">` : '<i class="fas fa-laptop-code"></i>'}
                    <span class="kurs-kategori-rozet">${kategori}</span>
                    ${k.indirim_var && k.indirim_yuzde ? `<span class="kurs-indirim-rozet">-%${k.indirim_yuzde}</span>` : ''}
                </div>
                <div class="kurs-kart-govde">
                    <h3 class="kurs-kart-baslik">${_esc(k.baslik)}</h3>
                    <p class="kurs-kart-alt-baslik">${_plainText(k.aciklama, 120)}</p>
                    ${yildizHtml(puan, yorum)}
                    <div class="kurs-kart-alt">
                        ${fiyatHtml}
                        <span class="kurs-incele">İncele <i class="fas fa-arrow-right"></i></span>
                    </div>
                </div>
            </a>`;
        }).join('');
    }

    function _renderPriceTag(k) {
        const original = parseFloat(k.original_fiyat ?? k.fiyat) || 0;
        if (original <= 0) return '<span class="kurs-fiyat">Ücretsiz</span>';
        if (k.indirim_var && k.net_fiyat != null && parseFloat(k.net_fiyat) < original) {
            return `<span class="kurs-fiyat-wrap">
                <span class="kurs-fiyat-eski">${original.toFixed(2)} ₺</span>
                <span class="kurs-fiyat kurs-fiyat-indirimli">${parseFloat(k.net_fiyat).toFixed(2)} ₺</span>
            </span>`;
        }
        return `<span class="kurs-fiyat">${original.toFixed(2)} ₺</span>`;
    }

    function istatistiklerDoldur(ist) {
        _setText('statStudents', ist.toplam_ogrenci != null ? ist.toplam_ogrenci.toLocaleString('tr-TR') : '0');
        _setText('statCourses',  ist.toplam_kurs    != null ? ist.toplam_kurs    : '0');
        _setText('statRating',   ist.ortalama_puan  > 0    ? ist.ortalama_puan.toFixed(1) : '—');
        _setText('statReviews',  ist.toplam_yorum   != null ? ist.toplam_yorum.toLocaleString('tr-TR') : '0');
        const takipci = ist.followerCount ?? ist.toplam_takipci ?? 0;
        _setText('statFollowers', Number(takipci).toLocaleString('tr-TR'));

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

    function webinarlarDoldur(webinarlar) {
        const section = document.getElementById('webinarsSection');
        const grid = document.getElementById('webinarsGrid');

        if (!webinarlar.length) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        grid.innerHTML = webinarlar.map(w => {
            const date = new Date(w.baslangic_tarihi);
            const dateStr = date.toLocaleString('tr-TR', { dateStyle: 'medium' });
            return `
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; transition:transform 0.2s, box-shadow 0.2s; cursor:pointer;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 10px 20px rgba(0,0,0,0.1)';" onmouseout="this.style.transform=''; this.style.boxShadow='';">
                <div style="position:relative; background:#0f172a; height:140px; display:flex; align-items:center; justify-content:center;">
                    <i class="fas fa-play-circle" style="font-size:2.5rem; color:#fff; opacity:0.8;"></i>
                </div>
                <div style="padding:14px;">
                    <h4 style="margin:0 0 6px 0; color:#1e293b; font-weight:600; font-size:0.95rem;">${_esc(w.baslik)}</h4>
                    <p style="margin:0 0 10px 0; color:#64748b; font-size:0.8rem; line-height:1.3;">${w.aciklama ? _plainText(w.aciklama, 60) : 'Açıklama yok'}</p>
                    <p style="margin:0 0 10px 0; color:#94a3b8; font-size:0.75rem;"><i class="fas fa-calendar"></i> ${dateStr}</p>
                    <a href="${_escAttr(w.kayit_video_url)}" target="_blank" class="btn-primary-lg-alt" style="display:inline-block; padding:7px 12px; font-size:0.8rem; text-decoration:none; border-radius:6px; color:#fff; background:var(--primary-color); text-align:center;"><i class="fas fa-play"></i> İzle</a>
                </div>
            </div>`;
        }).join('');
    }

    function _esc(text) {
        if (text == null) return '';
        const d = document.createElement('div');
        d.textContent = String(text);
        return d.innerHTML;
    }

    // Attribute degerlerine basilirken tirnak/satir basi karakterleri
    // (\n, ", ') HTML/inline-handler context'ini bozabilir. Bu nedenle
    // attribute icine yazilan tum dinamik veriler bu fonksiyondan gecer.
    function _escAttr(text) {
        return String(text ?? '').replace(/[&<>"'\r\n]/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;',
            '"': '&quot;', "'": '&#39;', '\r': '&#13;', '\n': '&#10;'
        }[c]));
    }

    // Zengin metni (HTML içerebilir) düz, kısaltılmış, güvenli metne çevir
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
