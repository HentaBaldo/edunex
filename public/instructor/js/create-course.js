import { UIHelper } from './modules/ui-helper.js';
/**
 * EduNex Egitmen - Kurs Olusturma Isleyisi (Course Creation Logic)
 * API versiyon 1.0 standartlarina uygundur.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Oturum ve Rol Dogrulamasi
    if (!UIHelper.checkInstructorAccess()) return;

    // 2. Baslangic Verilerinin Yuklenmesi (Kategoriler)
    await loadCategories();
    
    // 3. Form Dinleyicisinin Baslatilmasi
    initCreateCourseForm();
});

/**
 * API'den kategorileri ceker ve secim (select) kutusunu dinamik olarak doldurur.
 */
async function loadCategories() {
    const categorySelect = document.getElementById('kategori_id');
    const messageDiv = document.getElementById('courseMessage');
    
    if (!categorySelect) return;

    try {
        const result = await ApiService.get('/categories');
        const categories = result.data || [];

        if (categories.length === 0) {
            console.warn('[CREATE COURSE] Sunucuda kayitli kategori bulunamadi.');
        }

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.ad;
            categorySelect.appendChild(option);
        });

    } catch (error) {
        console.error('[CREATE COURSE] Kategoriler yuklenemedi:', error.message);
        if (messageDiv) {
            messageDiv.textContent = "Uyari: Kategoriler sunucudan yuklenemedi.";
            messageDiv.className = "message-box error active";
        }
    }
}

/**
 * Kurs olusturma formunun gonderim (submit) islemini yonetir ve veriyi API'ye iletir.
 */
function initCreateCourseForm() {
    const form = document.getElementById('createCourseForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const messageDiv = document.getElementById('courseMessage');
        const submitBtn = e.target.querySelector('button[type="submit"]');

        // Kullanici Arayuzu Geri Bildirimi: Islemi baslat
        if (messageDiv) {
            messageDiv.textContent = "Kurs kaydediliyor, lutfen bekleyin...";
            messageDiv.className = "message-box active";
        }
        if (submitBtn) submitBtn.disabled = true;

        // Veri Hazirligi ve Temizligi (Trim)
        const payload = {
            baslik: document.getElementById('baslik')?.value.trim() || '',
            alt_baslik: document.getElementById('alt_baslik')?.value.trim() || '',
            aciklama: document.getElementById('aciklama')?.value.trim() || '',
            kategori_id: document.getElementById('kategori_id')?.value || '',
            dil: document.getElementById('dil')?.value || '',
            seviye: document.getElementById('seviye')?.value || '',
            fiyat: parseFloat(document.getElementById('fiyat')?.value) || 0,
            gereksinimler: document.getElementById('gereksinimler')?.value.trim() || '',
            kazanimlar: document.getElementById('kazanimlar')?.value.trim() || ''
        };

        try {
            // API Cagrisi
            const result = await ApiService.post('/courses', payload);
            
            // Basarili Islem Yonetimi
            if (messageDiv) {
                messageDiv.textContent = result.message || "Kurs basariyla olusturuldu! Yonlendiriliyorsunuz...";
                messageDiv.className = "message-box success active";
            }
            
            // Yonlendirme Bekleme Suresi
            setTimeout(() => {
                window.location.href = '/instructor/dashboard.html';
            }, 1500);

        } catch (error) {
            // Hata Yonetimi
            console.error("[CREATE COURSE] Kurs olusturma isleminde hata:", error.message);
            if (messageDiv) {
                messageDiv.textContent = `Hata: ${error.message}`;
                messageDiv.className = "message-box error active";
            }
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}