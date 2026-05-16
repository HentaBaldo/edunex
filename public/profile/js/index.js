/**
 * EduNex Profil Yönetimi Scripti
 * Rol bazlı dinamik içerik, 3 Sütunlu İlgi Alanı Gezgini ve hesap yönetimi.
 */

function profilToast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = (type === 'success' ? '✓ ' : '✗ ') + msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ==========================================
// KURUMSAL VALIDATION ALGORITMALARI
// ==========================================

/**
 * Resmi T.C. Kimlik Numarasi dogrulamasi.
 *
 * Kurallar:
 *   1) Sadece rakamlardan olusur, uzunluk 11.
 *   2) Ilk hane 0 olamaz (TCKN'ler 1 ile baslar).
 *   3) 10. hane:  ((d1+d3+d5+d7+d9) * 7 - (d2+d4+d6+d8)) mod 10
 *   4) 11. hane:  (d1+d2+...+d10) mod 10
 *
 * @param {string} tc - Ham deger (string'e zorlanir, bosluklar temizlenir)
 * @returns {boolean}
 */
function validateTCKN(tc) {
    const v = String(tc || '').replace(/\D/g, '');
    if (v.length !== 11) return false;
    if (v[0] === '0') return false;

    const d = v.split('').map(Number);
    // 10. hane kontrolu: tek-indeksli hanelerin 7 kati ile cift-indekslilerin farki mod 10
    const tekToplam = d[0] + d[2] + d[4] + d[6] + d[8];
    const ciftToplam = d[1] + d[3] + d[5] + d[7];
    const onuncu = ((tekToplam * 7) - ciftToplam) % 10;
    if (onuncu < 0 || onuncu !== d[9]) return false;

    // 11. hane kontrolu: ilk 10 hanenin toplami mod 10
    const ilkOnToplam = d.slice(0, 10).reduce((s, x) => s + x, 0);
    if (ilkOnToplam % 10 !== d[10]) return false;

    return true;
}

/**
 * Turkiye IBAN'i icin temel format dogrulamasi.
 * Tam mod-97 checksum'a girmiyoruz (kullanici tarafinda overkill); ancak
 *   - Tum bosluk/tire kaldirilir, BUYUK harfe cevrilir.
 *   - 'TR' on eki + 24 hane = toplam 26 karakter olmali.
 *   - 3-26 arasi sadece rakam.
 *
 * @param {string} iban
 * @returns {boolean}
 */
function validateIBAN(iban) {
    const v = String(iban || '').replace(/[\s-]/g, '').toUpperCase();
    if (v.length !== 26) return false;
    if (!v.startsWith('TR')) return false;
    if (!/^TR\d{24}$/.test(v)) return false;
    return true;
}

/**
 * IBAN'i girdiginde 4'erli grupla okunabilir hale getirir (sadece UI).
 * Backend'e gonderirken bosluksuz/buyuk harfli halini kullaniyoruz.
 */
function formatIBANForDisplay(iban) {
    const v = String(iban || '').replace(/\s/g, '').toUpperCase();
    return v.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Onboarding modalini rol-bazli icerikle goster.
 * @param {object} cfg
 * @param {string} cfg.title
 * @param {string} cfg.message
 * @param {string} cfg.ctaText
 * @param {string} [cfg.icon]      - FontAwesome class (orn: 'fas fa-id-card')
 * @param {string} [cfg.tone]      - 'primary'|'warning'|'danger' (icon arkaplani)
 * @param {Function} cfg.onCta     - butona basinca tetiklenecek aksiyon
 */
function showOnboardingModal({ title, message, ctaText, icon, tone, onCta }) {
    const modalEl = document.getElementById('onboardingModal');
    if (!modalEl || typeof bootstrap === 'undefined') {
        // Bootstrap yoksa son care: ortak notify modal'i ile dusur.
        window.notify?.confirm({ title, text: message, confirmText: 'Devam', cancelText: 'Vazgeç', type: 'info' })
            .then((ok) => { if (ok) onCta?.(); });
        return;
    }
    document.getElementById('onboardingTitle').textContent = title;
    document.getElementById('onboardingMessage').textContent = message;

    const iconEl = document.getElementById('onboardingIcon');
    iconEl.className = `d-inline-flex align-items-center justify-content-center rounded-circle mb-2 bg-${tone || 'primary'} bg-opacity-10 text-${tone || 'primary'}`;
    iconEl.style.width = '64px'; iconEl.style.height = '64px'; iconEl.style.fontSize = '1.6rem';
    iconEl.innerHTML = `<i class="${icon || 'fas fa-hand-sparkles'}"></i>`;

    const cta = document.getElementById('onboardingCta');
    cta.innerHTML = `${ctaText} <i class="fas fa-arrow-right ms-1"></i>`;
    cta.className = `btn btn-${tone === 'warning' || tone === 'danger' ? tone : 'primary'} px-4 fw-bold rounded-pill shadow-sm`;

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    // Eski listener'lari dusurmek icin butonu clone'la.
    const freshCta = cta.cloneNode(true);
    cta.parentNode.replaceChild(freshCta, cta);
    freshCta.addEventListener('click', () => {
        modal.hide();
        try { onCta?.(); } catch (e) { console.error('[ONBOARDING] CTA hata:', e); }
    });

    modal.show();
}

/**
 * Belirli bir sekmeyi acar (id 'genel' | 'profesyonel' | 'sosyal' | 'ayarlar').
 * Modal kapaninca odaklama icin kullanilir.
 */
function activateProfileTab(tabId) {
    const trigger = document.querySelector(`.list-group-item[href="#${tabId}"]`);
    if (trigger && typeof bootstrap !== 'undefined') {
        new bootstrap.Tab(trigger).show();
    }
}

/**
 * Eksik veya default TCKN: bos string ya da '11111111111' (Profile.js default'u).
 */
function isPlaceholderTCKN(v) {
    return !v || String(v).trim() === '' || String(v).replace(/\D/g, '') === '11111111111';
}

// ==========================================
// 1. BAŞLANGIÇ VE PROFİL YÜKLEME
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[SYSTEM] Profil sayfası yüklendi.');
    const token = localStorage.getItem('edunex_token'); 

    if (!token) {
        window.location.href = '/auth/index.html'; 
        return;
    }

    try {
        const response = await fetch('/api/profile/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`, 
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        if (result.success) {
            populateProfileForm(result.data);
            activateTabFromHash(); 
        }
    } catch (error) {
        console.error('[SYSTEM ERROR] Veriler yüklenemedi:', error);
    }
});

function populateProfileForm(user) {
    document.getElementById('display_tam_ad').textContent = `${user.ad} ${user.soyad}`;
    document.getElementById('display_rol').textContent = user.rol.toUpperCase();

    // PP Yolu Çözümü
    const ppElement = document.getElementById('display_profil_fotografi');
    ppElement.src = user.profil_fotografi ? user.profil_fotografi : '/assets/images/default-avatar.png';

    // Genel Bilgiler
    document.getElementById('ad').value = user.ad || '';
    document.getElementById('soyad').value = user.soyad || '';
    document.getElementById('eposta').value = user.eposta || '';
    document.getElementById('sehir').value = user.sehir || '';
    document.getElementById('website').value = user.website || '';

    // Telefon: placeholder/default ('+905000000000') gosterme; bos birak.
    const phoneEl = document.getElementById('phone');
    if (phoneEl) phoneEl.value = (user.phone && user.phone !== '+905000000000') ? user.phone : '';

    // TCKN: default '11111111111' kullaniciya GERCEK degermis gibi gosterilmemeli.
    const tcknEl = document.getElementById('identity_number');
    if (tcknEl) tcknEl.value = isPlaceholderTCKN(user.identity_number) ? '' : user.identity_number;

    // Sosyal Medya
    document.getElementById('linkedin').value = user.linkedin || '';
    document.getElementById('instagram').value = user.instagram || '';
    document.getElementById('x_twitter').value = user.x_twitter || '';
    document.getElementById('youtube').value = user.youtube || '';
    document.getElementById('facebook').value = user.facebook || '';
    document.getElementById('tiktok').value = user.tiktok || '';

    // Gizlilik Ayarları
    document.getElementById('profil_herkese_acik_mi').checked = user.profil_herkese_acik_mi;
    document.getElementById('alinan_kurslari_goster').checked = user.alinan_kurslari_goster;

    if (user.rol === 'egitmen') {
        document.getElementById('egitmen_ozel').style.display = 'block';
        document.getElementById('ogrenci_ozel').style.display = 'none';

        const detail = user.InstructorDetail;
        document.getElementById('unvan').value = detail?.unvan || '';
        document.getElementById('deneyim_yili').value = detail?.deneyim_yili || 0;
        document.getElementById('iban_no').value = detail?.iban_no ? formatIBANForDisplay(detail.iban_no) : '';
        document.getElementById('baslik').value = detail?.baslik || '';
        document.getElementById('biyografi').value = detail?.biyografi || '';
    } else {
        document.getElementById('egitmen_ozel').style.display = 'none';
        document.getElementById('ogrenci_ozel').style.display = 'block';

        const detail = user.StudentDetail;
        document.getElementById('egitim_seviyesi').value = detail?.egitim_seviyesi || 'Lisans';
        document.getElementById('baslik').value = detail?.baslik || '';
        document.getElementById('biyografi').value = detail?.biyografi || '';

        // Öğrenci ise ilgi alanlarını (kategorileri) gezgine yükle
        loadCategoriesAndCheckInterests(user.Interests || []);
    }

    // --- AKILLI ONBOARDING AKISI ---
    // Hash ile spesifik bir sekmeye yonlendirme yapilmissa (#ayarlar gibi) modali atla.
    // Boylece kullanici bir yere yonlendigi her seferinde tekrar uyari almaz.
    if (!window.location.hash) {
        triggerOnboardingIfNeeded(user);
    }
}

/**
 * Rol-bazli onboarding tetikleyici.
 * - Ogrenci + Interests bos -> "Ilgi alanlarini sec" modali, CTA: Profesyonel sekmesi.
 * - Egitmen + (TCKN default veya IBAN bos) -> Hukuki zorunluluk uyarisi,
 *   eksik alana gore sekme odaklamasi (TCKN -> Genel, IBAN -> Profesyonel).
 */
function triggerOnboardingIfNeeded(user) {
    if (user.rol === 'ogrenci') {
        const interests = Array.isArray(user.Interests) ? user.Interests : [];
        if (interests.length === 0) {
            showOnboardingModal({
                title: `Hoş Geldin, ${user.ad || 'Öğrenci'}!`,
                message: 'Sana en uygun kursları önerebilmemiz için lütfen ilgi alanlarını seçerek profilini tamamla.',
                ctaText: 'İlgi Alanlarımı Seç',
                icon: 'fas fa-compass',
                tone: 'primary',
                onCta: () => {
                    activateProfileTab('profesyonel');
                    const target = document.getElementById('profileParentList');
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                },
            });
        }
        return;
    }

    if (user.rol === 'egitmen') {
        const tcknEksik = isPlaceholderTCKN(user.identity_number);
        const ibanEksik = !user.InstructorDetail?.iban_no;
        if (tcknEksik || ibanEksik) {
            const eksikler = [];
            if (tcknEksik) eksikler.push('T.C. Kimlik Numarası');
            if (ibanEksik) eksikler.push('IBAN');
            showOnboardingModal({
                title: 'Profil Bilgilerinizi Tamamlayın',
                message: `Eğitmen hesabınızın onaylanması ve ödeme alabilmeniz için ${eksikler.join(' ve ')} bilgilerinizi doldurmanız yasal bir zorunluluktur.`,
                ctaText: 'Şimdi Tamamla',
                icon: 'fas fa-id-card',
                tone: 'warning',
                onCta: () => {
                    // TCKN -> Genel Bilgiler, IBAN -> Profesyonel Detaylar.
                    // Iki eksik de varsa once TCKN'ye odaklan; iban kaydederken zaten sekme degisecek.
                    if (tcknEksik) {
                        activateProfileTab('genel');
                        document.getElementById('identity_number')?.focus();
                    } else if (ibanEksik) {
                        activateProfileTab('profesyonel');
                        document.getElementById('iban_no')?.focus();
                    }
                },
            });
        }
    }
}


// ==========================================
// 2. MEGA MENÜ (3 SÜTUNLU GEZGİN) SİSTEMİ
// ==========================================
window.allCategories = [];
window.selectedInterestIds = []; // Seçilen kutucukları sekme değişse de hafızada tutar

function getParentId(cat) {
    return cat.ust_kategori_id || cat.ustKategoriId || cat.KategoriId || cat.parentId || cat.parent_id || cat.ust_id || null;
}

/**
 * Seçilen İlgi Alanlarını Metne Dönüştüren Yardımcı Fonksiyon
 */
function refreshSelectedInterestsText() {
    const textArea = document.getElementById('selected_interests_text');
    const container = document.getElementById('selected_interests_display_area');

    if (window.selectedInterestIds.length > 0) {
        // ID'leri isimlere çevir
        const selectedNames = window.selectedInterestIds.map(id => {
            const cat = window.allCategories.find(c => String(c.id) === String(id));
            return cat ? cat.ad : null;
        }).filter(name => name !== null);

        textArea.innerText = selectedNames.join(', ');
        container.style.display = 'block';
    } else {
        textArea.innerText = '-';
        container.style.display = 'none';
    }
}

/**
 * Seçim Durumunu Güncelle (Override: Metin listesini tetikler)
 */
window.updateSelectedState = (id, isChecked) => {
    id = String(id);
    if (isChecked) {
        if (!window.selectedInterestIds.includes(id)) {
            window.selectedInterestIds.push(id);
        }
    } else {
        window.selectedInterestIds = window.selectedInterestIds.filter(sid => sid !== id);
    }
    
    // Her seçim değişiminde metni yenile
    refreshSelectedInterestsText();
};

/**
 * Veriyi Çek ve Gezgini Başlat (Override: Başlangıçta metni yazdırır)
 */
async function loadCategoriesAndCheckInterests(userInterests) {
    window.selectedInterestIds = userInterests.map(i => String(i.id));
    const token = localStorage.getItem('edunex_token');
    
    try {
        const response = await fetch('/api/categories', { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        
        if (result.success) {
            window.allCategories = result.data;
            renderProfileParentCategories();
            // Sayfa yüklendiğinde mevcut seçimleri yazdır
            refreshSelectedInterestsText();
        }
    } catch (e) { 
        console.error('Kategori hatası:', e); 
        document.getElementById('profileParentList').innerHTML = '<p class="text-danger p-3 small">Yüklenemedi</p>';
    }
}

// 1. Sütun: Ana Kategoriler
function renderProfileParentCategories() {
    const list = document.getElementById('profileParentList');
    const mainCategories = window.allCategories.filter(c => {
        const pid = getParentId(c);
        return pid === null || pid === "" || pid === 0;
    });

    list.innerHTML = mainCategories.map(p => {
        const isChecked = window.selectedInterestIds.includes(String(p.id)) ? 'checked' : '';
        const hasChildren = window.allCategories.some(c => String(getParentId(c)) === String(p.id));
        
        return `
            <div class="explorer-item p-item" onmouseenter="showProfileChildCategories('${p.id}', this)">
                <div class="form-check m-0">
                    <input class="form-check-input" type="checkbox" value="${p.id}" id="cat_${p.id}" ${isChecked} onchange="updateSelectedState('${p.id}', this.checked)">
                    <label class="form-check-label small" for="cat_${p.id}">${p.ad}</label>
                </div>
                ${hasChildren ? '<i class="fas fa-chevron-right"></i>' : ''}
            </div>
        `;
    }).join('');
}

// 2. Sütun: Alt Kategoriler
window.showProfileChildCategories = (parentId, element) => {
    document.querySelectorAll('.p-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    document.getElementById('profileGrandChildList').innerHTML = '<p class="p-3 small text-muted">Önce soldan üzerine gelin</p>';

    const children = window.allCategories.filter(c => String(getParentId(c)) === String(parentId));
    const list = document.getElementById('profileChildList');

    if (children.length > 0) {
        list.innerHTML = children.map(c => {
            const isChecked = window.selectedInterestIds.includes(String(c.id)) ? 'checked' : '';
            const hasChildren = window.allCategories.some(g => String(getParentId(g)) === String(c.id));
            
            return `
                <div class="explorer-item c-item" onmouseenter="showProfileGrandChildCategories('${c.id}', this)">
                    <div class="form-check m-0">
                        <input class="form-check-input" type="checkbox" value="${c.id}" id="cat_${c.id}" ${isChecked} onchange="updateSelectedState('${c.id}', this.checked)">
                        <label class="form-check-label small" for="cat_${c.id}">${c.ad}</label>
                    </div>
                    ${hasChildren ? '<i class="fas fa-chevron-right"></i>' : ''}
                </div>
            `;
        }).join('');
    } else {
        list.innerHTML = '<p class="p-3 small text-muted">Alt kategori yok</p>';
    }
};

// 3. Sütun: Konular
window.showProfileGrandChildCategories = (childId, element) => {
    document.querySelectorAll('.c-item').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    const grandChildren = window.allCategories.filter(c => String(getParentId(c)) === String(childId));
    const list = document.getElementById('profileGrandChildList');

    if (grandChildren.length > 0) {
        list.innerHTML = grandChildren.map(c => {
            const isChecked = window.selectedInterestIds.includes(String(c.id)) ? 'checked' : '';
            return `
                <div class="explorer-item">
                    <div class="form-check m-0">
                        <input class="form-check-input" type="checkbox" value="${c.id}" id="cat_${c.id}" ${isChecked} onchange="updateSelectedState('${c.id}', this.checked)">
                        <label class="form-check-label small" for="cat_${c.id}">${c.ad}</label>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        list.innerHTML = '<p class="p-3 small text-muted">Bu kategorinin konusu yok</p>';
    }
};

// İşaretleme Hafızası
window.updateSelectedState = (id, isChecked) => {
    id = String(id);
    if (isChecked && !window.selectedInterestIds.includes(id)) {
        window.selectedInterestIds.push(id);
    } else if (!isChecked) {
        window.selectedInterestIds = window.selectedInterestIds.filter(sid => sid !== id);
    }
};


// ==========================================
// 3. FORM GÜNCELLEME VE KAYIT İŞLEMLERİ
// ==========================================

/**
 * Backend'den dönen (veya localStorage'dan okunan) ayar objesini DOM'a uygular.
 * Sayfa yenilemeden anlık yansıma sağlar.
 * @param {object} settings
 */
function applyUserSettings(settings) {
    if (!settings) return;

    // Ad/Soyad güncelle
    if (settings.ad || settings.soyad) {
        const tamAdEl = document.getElementById('display_tam_ad');
        if (tamAdEl) {
            tamAdEl.textContent = `${settings.ad || ''} ${settings.soyad || ''}`.trim();
        }
    }

    // Gizlilik switch'leri — DB'deki boolean değerleri checkboxlara yansıt
    const profilAcikEl = document.getElementById('profil_herkese_acik_mi');
    if (profilAcikEl && settings.profil_herkese_acik_mi !== undefined) {
        profilAcikEl.checked = Boolean(settings.profil_herkese_acik_mi);
    }

    const kurslariGosterEl = document.getElementById('alinan_kurslari_goster');
    if (kurslariGosterEl && settings.alinan_kurslari_goster !== undefined) {
        kurslariGosterEl.checked = Boolean(settings.alinan_kurslari_goster);
    }

    // localStorage cache'ini güncelle
    try {
        const mevcutKullanici = JSON.parse(localStorage.getItem('edunex_user') || '{}');
        if (settings.ad !== undefined) mevcutKullanici.ad = settings.ad;
        if (settings.soyad !== undefined) mevcutKullanici.soyad = settings.soyad;
        if (settings.profil_herkese_acik_mi !== undefined) mevcutKullanici.profil_herkese_acik_mi = settings.profil_herkese_acik_mi;
        if (settings.alinan_kurslari_goster !== undefined) mevcutKullanici.alinan_kurslari_goster = settings.alinan_kurslari_goster;
        localStorage.setItem('edunex_user', JSON.stringify(mevcutKullanici));
    } catch (_) {}
}

// DOMContentLoaded'da localStorage'dan mevcut ayarları uygula (diğer sayfalarda da kullanılabilir)
document.addEventListener('DOMContentLoaded', () => {
    try {
        const cachedUser = JSON.parse(localStorage.getItem('edunex_user') || '{}');
        if (cachedUser && Object.keys(cachedUser).length > 0) {
            applyUserSettings(cachedUser);
        }
    } catch (_) {}
});

document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('edunex_token');

    // Kullanicinin rolu (localStorage cache - sunucu yine ID'den dogrulayacak).
    const currentUser = (() => { try { return JSON.parse(localStorage.getItem('edunex_user') || '{}'); } catch { return {}; } })();
    const rol = currentUser.rol;
    const isEgitmen = rol === 'egitmen';

    // Genel alanlardan ham deger al + normalize et.
    const rawIban = document.getElementById('iban_no')?.value || '';
    const rawTckn = document.getElementById('identity_number')?.value || '';
    const rawPhone = document.getElementById('phone')?.value || '';

    const normalizedIban = rawIban.replace(/[\s-]/g, '').toUpperCase();
    const normalizedTckn = rawTckn.replace(/\D/g, '');
    const normalizedPhone = rawPhone.trim();

    // --- VALIDASYON ---
    // TCKN: doluysa formati zorla; bosa izin verilir (henuz doldurmamis kullanici icin).
    if (normalizedTckn && !validateTCKN(normalizedTckn)) {
        profilToast('Geçersiz T.C. Kimlik Numarası. 11 haneli, ilk hanesi 0 olmayan ve resmi TCKN algoritmasına uygun bir numara giriniz.', 'error');
        document.getElementById('identity_number')?.focus();
        return;
    }
    // Egitmen icin TCKN ve IBAN zorunlu (odeme altyapisi). Ogrencide bos kalabilir.
    if (isEgitmen) {
        if (!normalizedTckn) {
            profilToast('Eğitmen hesapları için T.C. Kimlik Numarası zorunludur.', 'error');
            activateProfileTab('genel');
            document.getElementById('identity_number')?.focus();
            return;
        }
        if (!normalizedIban) {
            profilToast('Eğitmen hesapları için IBAN zorunludur.', 'error');
            activateProfileTab('profesyonel');
            document.getElementById('iban_no')?.focus();
            return;
        }
        if (!validateIBAN(normalizedIban)) {
            profilToast('IBAN "TR" ile başlamalı ve toplam 26 karakter olmalıdır (boşluksuz). Lütfen kontrol edip tekrar girin.', 'error');
            activateProfileTab('profesyonel');
            document.getElementById('iban_no')?.focus();
            return;
        }
    } else {
        // Ogrenci de IBAN girmis (gereksiz ama girdiyse) -> format mecburi.
        if (normalizedIban && !validateIBAN(normalizedIban)) {
            profilToast('IBAN "TR" ile başlamalı ve 26 karakter olmalıdır.', 'error');
            return;
        }
    }

    const formData = {
        ad: document.getElementById('ad').value,
        soyad: document.getElementById('soyad').value,
        sehir: document.getElementById('sehir').value,
        website: document.getElementById('website').value,
        // Yeni: telefon ve TCKN backend'e gonderiliyor (defansif olarak normalize edilmis halleriyle).
        phone: normalizedPhone || null,
        identity_number: normalizedTckn || null,
        linkedin: document.getElementById('linkedin').value,
        instagram: document.getElementById('instagram').value,
        x_twitter: document.getElementById('x_twitter').value,
        youtube: document.getElementById('youtube').value,
        facebook: document.getElementById('facebook').value,
        tiktok: document.getElementById('tiktok').value,
        baslik: document.getElementById('baslik').value,
        biyografi: document.getElementById('biyografi').value,
        unvan: document.getElementById('unvan').value || null,
        deneyim_yili: parseInt(document.getElementById('deneyim_yili').value) || 0,
        // IBAN her zaman bosluksuz, BUYUK harf gonderilir (iyzicoService de boyle bekliyor).
        iban_no: normalizedIban || null,
        egitim_seviyesi: document.getElementById('egitim_seviyesi').value || null,
        profil_herkese_acik_mi: document.getElementById('profil_herkese_acik_mi').checked,
        alinan_kurslari_goster: document.getElementById('alinan_kurslari_goster').checked,

        // Seçilen ilgi alanları küresel hafızadan alınıyor (DOM'dan değil)
        interests: window.selectedInterestIds
    };

    try {
        const response = await fetch('/api/profile/update', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        if (result.success) {
            // Backend'den dönen güncel veriyi anında DOM'a yansıt (reload yok)
            applyUserSettings(result.data || formData);
            profilToast('Ayarlarınız başarıyla kaydedildi.');
        } else {
            profilToast('Güncelleme hatası: ' + result.message, 'error');
        }
    } catch (error) {
        profilToast('Sunucu ile bağlantı kurulamadı.', 'error');
    }
});


// ==========================================
// 4. EKSTRA ARAÇLAR (PP Yükleme, Hesap Silme)
// ==========================================

// Profil Fotoğrafı Yükleme
document.getElementById('file_input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file); 

    const token = localStorage.getItem('edunex_token');
    const imgElement = document.getElementById('display_profil_fotografi');

    try {
        imgElement.style.opacity = '0.5';
        const response = await fetch('/api/profile/upload-avatar', { 
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const result = await response.json();
        if (result.success) {
            imgElement.src = result.imageUrl;
            const mevcutKullanici = JSON.parse(localStorage.getItem('edunex_user') || '{}');
            mevcutKullanici.profil_fotografi = result.imageUrl;
            localStorage.setItem('edunex_user', JSON.stringify(mevcutKullanici));
            profilToast('Fotoğraf güncellendi.');
        }
    } catch (error) {
        profilToast('Yükleme hatası.', 'error');
    } finally {
        imgElement.style.opacity = '1';
    }
});

// Hesap Silme İşlemi
async function deleteMyAccount() {
    const ok = await notify.confirm({
        title: 'Hesabı kalıcı olarak sil',
        text: 'Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!',
        confirmText: 'Evet, sil',
        cancelText: 'Vazgeç',
        type: 'error'
    });
    if (!ok) return;

    const token = localStorage.getItem('edunex_token');
    try {
        const response = await fetch('/api/profile/delete', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();
        if (result.success) {
            localStorage.clear();
            window.location.href = '/auth/index.html';
        }
    } catch (error) {
        profilToast('Hesap silinirken hata oluştu.', 'error');
    }
}

window.deleteMyAccount = deleteMyAccount;

// Hash Navigasyonu (Sayfa açıldığında URL sonundaki #ayarlar vs. kısmına gider)
function activateTabFromHash() {
    const hash = window.location.hash;
    if (hash) {
        const tabTriggerEl = document.querySelector(`.list-group-item[href="${hash}"]`);
        if (tabTriggerEl) {
            const tab = new bootstrap.Tab(tabTriggerEl);
            tab.show();
        }
    }
}
window.addEventListener('hashchange', activateTabFromHash);


// ==========================================
// 5. SIFRE DEGISTIRME MODAL'I (Bootstrap)
// ==========================================
//
// Mimari Notu (cok onemli):
//   passwordChangeForm, profileForm'un DISINDA. Bootstrap modal'lari Bootstrap
//   tarafindan body'ye tasinsa da, kaynak HTML'de ic ice koymadik — boylece
//   profileForm submit listener'i password modal submit'iyle CAKISMAZ.
//
// Akis:
//   1) "Sifremi Degistir" butonuna basilir -> modal acilir.
//   2) Kullanici uc alani doldurur (mevcut, yeni, yeni-tekrar).
//   3) Frontend savunma katmani: bos kontrol, esitlik, min 8 karakter, eski==yeni kontrol.
//   4) PUT /api/profile/change-password -> backend bcrypt.compare ile dogrular.
//   5) Basarili olunca toast goster + 1.6 sn sonra auth sayfasina yonlendir (token temizlenir).
//
// Defansif kabuller:
//   - Bootstrap yuklenmemis ise (CDN cokmesi vs.) alert ile fallback.
//   - Token yoksa (oturum suresi dolmus) /auth'a yonlendir.
//   - 429 (rate-limit) ve 401 (token gecersiz) hatalari NET mesajla gosterilir.

document.addEventListener('DOMContentLoaded', () => {
    initPasswordChangeModal();
    initProfileForgotPasswordLink();
});

// ==========================================
// 5b. PROFILDEN SIFRE SIFIRLAMA MAILI TETIKLEME
// ==========================================
//
// Kullanici mevcut sifresini hatirlamiyorsa modal icindeki "Sifremi unuttum"
// linkine tiklayarak login sayfasindaki ayni reset akisini tetikler.
//
// Akis:
//   1) Link click -> localStorage'dan oturum kullanicisinin epostasini al.
//   2) POST /api/auth/forgot-password { eposta }.
//   3) Backend zaten e-posta enumeration korumali ve fire-and-forget — her
//      durumda generic 200 doner. Bu yuzden response.ok kontrolu yeterli.
//   4) Toast goster (sag ust); modal kapatilmaz (kullanici belki yine de
//      mevcut sifreyle deneyebilir, ya da modal'i kendi kapatir).
//
// Defansif kabuller:
//   - localStorage bos / parse hatasi: kullaniciya logout uyarisi.
//   - Network/5xx: toast ile hata bildirimi.
function initProfileForgotPasswordLink() {
    const link = document.getElementById('profileForgotPasswordLink');
    if (!link) return;

    link.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleProfileForgotPasswordClick(link);
    });
}

async function handleProfileForgotPasswordClick(link) {
    let eposta = '';
    try {
        const cached = JSON.parse(localStorage.getItem('edunex_user') || '{}');
        eposta = (cached && typeof cached.eposta === 'string') ? cached.eposta.trim() : '';
    } catch (_e) {
        eposta = '';
    }

    if (!eposta) {
        profilToast('Oturum bilginiz okunamadi. Lutfen tekrar giris yapin.', 'error');
        return;
    }

    // Cift tiklamayi engelle (rate-limiter gereksiz tetiklenmesin).
    const originalHtml = link.innerHTML;
    link.classList.add('disabled');
    link.style.pointerEvents = 'none';
    link.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Gönderiliyor...';

    try {
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eposta })
        });

        // Backend enumeration korumasi nedeniyle her zaman generic 200 doner;
        // sadece 5xx/429 durumlarinda hata gosteririz. Mesaj icinde kullanici
        // epostasini gostermiyoruz (omuz-uzeri okuma + gizlilik); generic ve
        // yonlendirici bir bilgilendirme metni kullaniyoruz.
        let result = null;
        try { result = await response.json(); } catch (_e) { result = null; }

        if (response.ok && (result?.success !== false)) {
            profilToast('Şifre sıfırlama bağlantısı kayıtlı e-posta adresinize başarıyla gönderildi. Lütfen gelen kutunuzu kontrol edin.');
        } else if (response.status === 429) {
            profilToast('Çok sık deneme yaptınız. Birkaç dakika sonra tekrar deneyin.', 'error');
        } else {
            profilToast('Sıfırlama maili gönderilemedi. Lütfen tekrar deneyin.', 'error');
        }
    } catch (error) {
        console.error('[PROFILE FORGOT PW] Hata:', error);
        profilToast('Sunucu ile bağlantı kurulamadı.', 'error');
    } finally {
        link.classList.remove('disabled');
        link.style.pointerEvents = '';
        link.innerHTML = originalHtml;
    }
}

function initPasswordChangeModal() {
    const openBtn = document.getElementById('openPasswordChangeBtn');
    const modalEl = document.getElementById('passwordChangeModal');
    const form = document.getElementById('passwordChangeForm');

    // Sayfa baska bir context'te de yuklenebilir (profil yerine baska bir sayfaya
    // dahil edilirse vb.) — element yoksa sessizce cik.
    if (!openBtn || !modalEl || !form) return;

    // === MODAL ACMA ===
    openBtn.addEventListener('click', () => {
        if (typeof bootstrap === 'undefined') {
            profilToast('Bootstrap yuklenemedi, sayfayi yenileyin.', 'error');
            return;
        }
        // Form'u her acilista temizle — eski input'lar sessizce kaymasin.
        resetPasswordChangeForm();
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        // Modal acildiktan sonra ilk input'a odaklan (UX)
        setTimeout(() => document.getElementById('currentPassword')?.focus(), 250);
    });

    // === SIFRE GOSTER/GIZLE (eye icon toggle) ===
    // Tum input-group icindeki .toggle-password-btn butonlari icin event delegation:
    form.querySelectorAll('.toggle-password-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;
            const willShow = input.type === 'password';
            input.type = willShow ? 'text' : 'password';
            // Icon swap (FontAwesome)
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye', !willShow);
                icon.classList.toggle('fa-eye-slash', willShow);
            }
        });
    });

    // === SIFRE GUCU CANLI GOSTERGE ===
    const newPwInput = document.getElementById('newPassword');
    const confirmInput = document.getElementById('newPasswordConfirm');

    if (newPwInput) {
        newPwInput.addEventListener('input', () => {
            updatePasswordStrengthIndicator(newPwInput.value);
            updatePasswordMatchFeedback();
        });
    }
    if (confirmInput) {
        confirmInput.addEventListener('input', updatePasswordMatchFeedback);
    }

    // === FORM SUBMIT ===
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handlePasswordChangeSubmit();
    });
}

/**
 * Sifre gucu skoru (basit ama yararli heuristic):
 *   - >= 8 karakter: +1
 *   - kucuk + buyuk harf: +1
 *   - rakam icerir: +1
 *   - sembol icerir: +1
 *   - uzunluk >= 12: +1
 * Skor 0-2 = weak, 3 = medium, 4-5 = strong.
 */
function updatePasswordStrengthIndicator(password) {
    const wrap = document.getElementById('passwordStrengthWrap');
    const text = document.getElementById('passwordStrengthText');
    if (!wrap || !text) return;

    if (!password) {
        wrap.style.display = 'none';
        return;
    }
    wrap.style.display = 'block';

    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (password.length >= 12) score++;

    wrap.classList.remove('weak', 'medium', 'strong');
    if (score <= 2) {
        wrap.classList.add('weak');
        text.textContent = 'Zayıf şifre';
    } else if (score === 3) {
        wrap.classList.add('medium');
        text.textContent = 'Orta seviye şifre';
    } else {
        wrap.classList.add('strong');
        text.textContent = 'Güçlü şifre';
    }
}

/**
 * Yeni sifre + tekrar alani esit mi? Eslesince yesil, eslesmezken kirmizi feedback.
 */
function updatePasswordMatchFeedback() {
    const newPw = document.getElementById('newPassword')?.value || '';
    const confirm = document.getElementById('newPasswordConfirm')?.value || '';
    const feedback = document.getElementById('passwordMatchFeedback');
    if (!feedback) return;

    // Tekrar alani henuz bos -> feedback gosterme (gurultu yapma).
    if (!confirm) {
        feedback.style.display = 'none';
        feedback.textContent = '';
        return;
    }

    feedback.style.display = 'block';
    if (newPw === confirm) {
        feedback.textContent = '✓ Şifreler eşleşiyor';
        feedback.className = 'd-block mt-1 password-match-ok';
    } else {
        feedback.textContent = '✗ Şifreler eşleşmiyor';
        feedback.className = 'd-block mt-1 password-match-bad';
    }
}

/**
 * Form alanlarini sifirlar — modal her acildiginda temiz baslar.
 */
function resetPasswordChangeForm() {
    const form = document.getElementById('passwordChangeForm');
    if (form) form.reset();

    // Input type'larini password'e dondur (kullanici gosterip kapatmadan modal'i kapatmis olabilir)
    ['currentPassword', 'newPassword', 'newPasswordConfirm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.type = 'password';
    });
    document.querySelectorAll('#passwordChangeForm .toggle-password-btn i').forEach(icon => {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    });

    const msg = document.getElementById('passwordChangeMessage');
    if (msg) {
        msg.style.display = 'none';
        msg.textContent = '';
        msg.className = 'alert';
    }

    const strengthWrap = document.getElementById('passwordStrengthWrap');
    if (strengthWrap) {
        strengthWrap.style.display = 'none';
        strengthWrap.classList.remove('weak', 'medium', 'strong');
    }

    const matchFb = document.getElementById('passwordMatchFeedback');
    if (matchFb) {
        matchFb.style.display = 'none';
        matchFb.textContent = '';
    }

    togglePasswordSubmitButton(false);
}

/**
 * Modal icindeki mesaj alanini gosterir (alert-success / alert-danger / alert-info).
 */
function setPasswordModalMessage(text, type = 'danger') {
    const msg = document.getElementById('passwordChangeMessage');
    if (!msg) return;
    msg.textContent = text;
    msg.className = `alert alert-${type}`;
    msg.style.display = 'block';
}

/**
 * Submit butonunu disabled + loading metni durumuna alir.
 */
function togglePasswordSubmitButton(isLoading) {
    const btn = document.getElementById('passwordChangeSubmitBtn');
    if (!btn) return;
    btn.disabled = isLoading;
    btn.innerHTML = isLoading
        ? '<span class="spinner-border spinner-border-sm me-2"></span>Guncelleniyor...'
        : '<i class="fas fa-check me-2"></i>Şifremi Güncelle';
}

/**
 * Submit ana akisi — validation, API cagrisi, basari/hata handler.
 */
async function handlePasswordChangeSubmit() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const newPasswordConfirm = document.getElementById('newPasswordConfirm').value;

    // === FRONTEND SAVUNMA KATMANI ===
    // Backend her kosulda ayni kontrolleri tekrar yapar; bu sadece UX hizlandirma.
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
        setPasswordModalMessage('Tüm alanları doldurun.', 'danger');
        return;
    }
    if (newPassword.length < 8) {
        setPasswordModalMessage('Yeni şifre en az 8 karakter olmalıdır.', 'danger');
        document.getElementById('newPassword')?.focus();
        return;
    }
    if (newPassword !== newPasswordConfirm) {
        setPasswordModalMessage('Yeni şifre ile şifre tekrarı eşleşmiyor.', 'danger');
        document.getElementById('newPasswordConfirm')?.focus();
        return;
    }
    if (newPassword === currentPassword) {
        setPasswordModalMessage('Yeni şifre mevcut şifreyle aynı olamaz.', 'danger');
        document.getElementById('newPassword')?.focus();
        return;
    }

    // === TOKEN KONTROLU ===
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        // Oturum dusmus — direkt auth sayfasina at.
        window.location.href = '/auth/index.html';
        return;
    }

    togglePasswordSubmitButton(true);
    setPasswordModalMessage('Şifre güncelleniyor, lütfen bekleyin...', 'info');

    try {
        const response = await fetch('/api/profile/change-password', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentPassword,
                newPassword,
                newPasswordConfirm
            })
        });

        // 5xx'te response.json() patlayabilir (HTML error page); fallback ekliyoruz.
        let result;
        try {
            result = await response.json();
        } catch (_) {
            result = { success: false, message: `Sunucu hatasi: ${response.status}` };
        }

        if (response.ok && result.success) {
            // BASARILI — toast goster + 1.6 sn sonra auth'a at (oturum yenileme).
            setPasswordModalMessage(
                result.message || 'Şifreniz başarıyla güncellendi. Tekrar giriş yapın.',
                'success'
            );
            profilToast('Şifreniz güncellendi. Tekrar giriş yapın.');

            // Token'i hemen temizle (modal acikken bile baska bir API cagrisi yapilirsa cope atilsin).
            localStorage.removeItem('edunex_token');

            setTimeout(() => {
                if (typeof ApiService !== 'undefined' && ApiService.logoutUser) {
                    ApiService.logoutUser();
                } else {
                    // ApiService yoksa minimal logout: localStorage temizle ve auth'a git.
                    localStorage.clear();
                    window.location.href = '/auth/index.html';
                }
            }, 1600);
            return;
        }

        // BASARISIZ — backend mesajini birebir goster (frontend yakalayabilsin).
        // 401 'Mevcut sifre hatali', 400 'Yeni sifre en az 8...', 429 'Cok fazla istek', vs.
        setPasswordModalMessage(result.message || 'Şifre güncellenemedi.', 'danger');

        // 401 mevcut sifre hatali ise current input'a odaklan
        if (response.status === 401) {
            document.getElementById('currentPassword')?.focus();
            document.getElementById('currentPassword')?.select();
        }

    } catch (error) {
        console.error('[PASSWORD CHANGE] Hata:', error);
        setPasswordModalMessage('Sunucu ile baglantı kurulamadı. Lütfen tekrar deneyin.', 'danger');
    } finally {
        togglePasswordSubmitButton(false);
    }
}