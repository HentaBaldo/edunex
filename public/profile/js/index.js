/**
 * EduNex Profil Yönetimi Scripti
 * Kullanıcı verilerini dinamik olarak çeker ve role göre arayüzü şekillendirir.
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[SYSTEM] Profil sayfasi yuklendi.');
    
    // Doğru token ismini çağırıyoruz
    const token = localStorage.getItem('edunex_token'); 

    if (!token) {
        console.error('[AUTH ERROR] Token bulunamadi, giris sayfasina yonlendiriliyor.');
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

        if (response.status === 401) {
            console.warn('[AUTH] Oturum gecersiz, temizleniyor...');
            localStorage.removeItem('edunex_token'); // Temizlerken de doğru ismi kullanıyoruz
            window.location.href = '/auth/index.html';
            return;
        }

        const result = await response.json();

        if (result.success) {
            console.log('[API SUCCESS] Profil verileri basariyla alindi.');
            populateProfileForm(result.data);
            
            // Veriler yüklendikten sonra eğer URL'de bir #hash varsa o sekmeyi aç
            activateTabFromHash(); 
        } else {
            console.error('[API ERROR] Veri alinirken hata:', result.message);
        }
    } catch (error) {
        console.error('[NETWORK ERROR] Sunucu baglantisi sirasinda hata olustu:', error);
    }
});

/**
 * Gelen verileri HTML formundaki ilgili alanlara dagitir.
 */
function populateProfileForm(user) {
    document.getElementById('display_tam_ad').textContent = `${user.ad} ${user.soyad}`;
    document.getElementById('display_rol').textContent = user.rol.toUpperCase();
    
    document.getElementById('display_profil_fotografi').src = user.profil_fotografi || '/assets/images/default-avatar.png';

    document.getElementById('ad').value = user.ad || '';
    document.getElementById('soyad').value = user.soyad || '';
    document.getElementById('eposta').value = user.eposta || '';
    document.getElementById('sehir').value = user.sehir || '';
    document.getElementById('website').value = user.website || '';

    document.getElementById('linkedin').value = user.linkedin || '';
    document.getElementById('instagram').value = user.instagram || '';
    document.getElementById('x_twitter').value = user.x_twitter || '';
    document.getElementById('youtube').value = user.youtube || '';
    document.getElementById('facebook').value = user.facebook || '';
    document.getElementById('tiktok').value = user.tiktok || '';

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
    }
}

/**
 * Form Guncelleme Islemi
 */
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log('[SYSTEM] Guncelleme islemi baslatildi.');
    
    // DÜZELTME: Güncelleme yaparken de doğru token ismini çekmeliyiz
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
        unvan: document.getElementById('unvan').value,
        deneyim_yili: parseInt(document.getElementById('deneyim_yili').value) || 0,
        iban_no: document.getElementById('iban_no').value,
        egitim_seviyesi: document.getElementById('egitim_seviyesi').value,
        profil_herkese_acik_mi: document.getElementById('profil_herkese_acik_mi').checked,
        alinan_kurslari_goster: document.getElementById('alinan_kurslari_goster').checked
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

        if (response.status === 401) {
            alert('Oturumunuz dolmus, lutfen tekrar giris yapin.');
            window.location.href = '/auth/index.html';
            return;
        }

        const result = await response.json();

        if (result.success) {
            console.log('[API SUCCESS] Profil guncellendi.');
            alert('Profiliniz basariyla guncellendi.');
            window.location.reload(); 
        } else {
            console.error('[API ERROR] Guncelleme hatasi:', result.message);
            alert('Hata: ' + result.message);
        }
    } catch (error) {
        console.error('[NETWORK ERROR] Guncelleme sirasinda baglanti hatasi:', error);
    }
});

/**
 * Profil Fotoğrafı Yükleme İşlemi
 */
document.getElementById('file_input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Dosyayı sunucuya göndermek için FormData oluşturuyoruz
    const formData = new FormData();
    formData.append('avatar', file); // 'avatar' ismini backend'deki multer ayarına göre değiştirebilirsin

    const token = localStorage.getItem('edunex_token');

    try {
        // Kullanıcıya yüklendiğini belli etmek için resmi hafif saydam yapıyoruz
        const imgElement = document.getElementById('display_profil_fotografi');
        imgElement.style.opacity = '0.5';

        const response = await fetch('/api/profile/upload-avatar', { 
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
                // ÖNEMLİ: FormData gönderirken 'Content-Type' YAZILMAZ! 
                // Tarayıcı onu 'multipart/form-data' olarak kendi ayarlar.
            },
            body: formData
        });

        if (response.status === 401) {
            alert('Oturum süreniz dolmuş.');
            window.location.href = '/auth/index.html';
            return;
        }

        const result = await response.json();

        if (result.success) {
            // Başarılı olursa ekrandaki fotoğrafı hemen yenisiyle değiştir
            imgElement.src = result.imageUrl || URL.createObjectURL(file);
            alert('Profil fotoğrafınız başarıyla güncellendi.');
        } else {
            alert('Hata: ' + result.message);
        }
    } catch (error) {
        console.error('[UPLOAD ERROR] Fotoğraf yüklenemedi:', error);
        alert('Sunucuya bağlanırken bir hata oluştu.');
    } finally {
        document.getElementById('display_profil_fotografi').style.opacity = '1';
        e.target.value = ''; // Aynı dosyayı tekrar seçebilmek için input'u temizle
    }
});

/**
 * URL'deki #hash değerine göre ilgili sekmenin açılmasını sağlar
 */
function activateTabFromHash() {
    const hash = window.location.hash;
    if (hash) {
        // Hedef linki bul (örn: href="#ayarlar")
        const tabTriggerEl = document.querySelector(`.list-group-item[href="${hash}"]`);
        
        if (tabTriggerEl) {
            // Bootstrap Tab objesini oluştur ve göster
            const tab = new bootstrap.Tab(tabTriggerEl);
            tab.show();
            
            // Sayfa açıldığında sekmeye doğru hafifçe kaydır (kullanıcı deneyimi için)
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
}


// URL sonradan değişirse (örn: kullanıcı manuel olarak #sosyal yazarsa) yine yakala
window.addEventListener('hashchange', activateTabFromHash);