/**
 * EduNex Profil Yönetimi Scripti
 * Rol bazlı dinamik içerik, 3 Sütunlu İlgi Alanı Gezgini ve hesap yönetimi.
 */

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
        document.getElementById('iban_no').value = detail?.iban_no || '';
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
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('edunex_token'); 
    
    const formData = {
        ad: document.getElementById('ad').value,
        soyad: document.getElementById('soyad').value,
        sehir: document.getElementById('sehir').value,
        website: document.getElementById('website').value,
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
        iban_no: document.getElementById('iban_no').value || null,
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
            alert('Profiliniz başarıyla güncellendi.');
            window.location.reload(); 
        } else {
            alert('Güncelleme hatası: ' + result.message);
        }
    } catch (error) {
        alert('Sunucu ile bağlantı kurulamadı.');
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
            alert('Fotoğraf güncellendi.');
        }
    } catch (error) {
        alert('Yükleme hatası.');
    } finally {
        imgElement.style.opacity = '1';
    }
});

// Hesap Silme İşlemi
async function deleteMyAccount() {
    if (!confirm('⚠️ DİKKAT: Hesabınızı kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz!')) return;

    const token = localStorage.getItem('edunex_token');
    try {
        const response = await fetch('/api/profile/delete', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();
        if (result.success) {
            alert('Hesabınız silindi. Elveda!');
            localStorage.clear();
            window.location.href = '/auth/index.html';
        }
    } catch (error) {
        alert('Hesap silinirken hata oluştu.');
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