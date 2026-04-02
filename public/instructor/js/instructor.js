/**
 * EduNex - Egitmen Panosu (Instructor Dashboard Logic)
 * Version: 3.0 (Backend Entegrasyonu Tamamlandı)
 * Eğitmenin kurslarını dinamik olarak yükler, durumlarına göre badge gösterir,
 * ve yeni kurs oluşturmayı backend'e bağlar.
 */

import { UIHelper } from './modules/ui-helper.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Oturum ve Rol Dogrulamasi
    if (!UIHelper.checkInstructorAccess()) return;
    
    // 2. Egitmene Ait Kurslari Yukle (Backend'den)
    await loadMyCourses();
    
    // 3. Yeni Kurs Olusturma Formunu Hazırla
    setupCreateCourseListener();
});

/**
 * API'den egitmenin tüm kurslarını çeker ve dinamik olarak arayüze basar
 * BACKEND: GET /api/courses/my-courses
 */
async function loadMyCourses() {
    const courseListDiv = document.getElementById('courseList');
    if (!courseListDiv) {
        console.warn('[INSTRUCTOR] courseList DOM element bulunamadi.');
        return;
    }

    try {
        // Yükleniyor durumunu göster
        courseListDiv.innerHTML = `
            <div class="loading-state" style="grid-column: 1/-1;">
                <div class="spinner" aria-hidden="true"></div>
                <p>Kurslarınız yükleniyor...</p>
            </div>
        `;

        // BACKEND API ÇAĞRISI
        const result = await ApiService.get('/courses/my-courses');
        const courses = result.data || [];

        // Eğer kurs yoksa empty state göster
        if (courses.length === 0) {
            renderEmptyState(courseListDiv);
            return;
        }

        // Kursları render et
        courseListDiv.innerHTML = '';
        courses.forEach(course => {
            const courseCard = createCourseCard(course);
            courseListDiv.insertAdjacentHTML('beforeend', courseCard);
        });

        // Event listener'ları ata
        attachCourseCardListeners();

    } catch (error) {
        console.error('[INSTRUCTOR DASHBOARD] Kurslar yüklenemedi:', error.message);
        courseListDiv.innerHTML = `
            <div class="error-state" style="grid-column: 1/-1; padding: 40px; text-align: center; border: 2px solid #fecaca; border-radius: 12px; background: #fef2f2;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2.5rem; color: #ef4444; margin-bottom: 15px;"></i>
                <p style="color: #991b1b; font-weight: 500; margin: 10px 0;">
                    Hata: ${error.message}
                </p>
                <button onclick="location.reload()" class="btn-primary-lg-alt" style="margin-top: 15px; padding: 10px 20px; font-size: 0.9rem;">
                    <i class="fas fa-redo"></i> Tekrar Dene
                </button>
            </div>
        `;
    }
}

/**
 * Boş durum (Empty State) HTML'ini render eder
 * @param {HTMLElement} container - İçerik yerleştirilecek konteyner
 */
function renderEmptyState(container) {
    container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 60px 40px; border: 2px dashed #cbd5e1; border-radius: 12px; background: #f8fafc;">
            <i class="fas fa-book-open" style="font-size: 3.5rem; color: #cbd5e1; margin-bottom: 20px;" aria-hidden="true"></i>
            <h3 style="color: #475569; font-size: 1.3rem; font-weight: 700; margin: 0 0 10px 0;">Henüz bir kurs oluşturmadınız</h3>
            <p style="color: #94a3b8; font-size: 1rem; margin: 0 0 25px 0; max-width: 400px; margin-left: auto; margin-right: auto;">
                Uzmanlığınızı paylaşmaya başlamak için ilk kursunuzu oluşturun ve öğrencilere kattığınız değeri gösterin.
            </p>
            <a href="/instructor/create-course.html" class="btn-primary-lg-alt" style="display: inline-flex; gap: 8px; align-items: center; padding: 14px 28px; font-size: 1rem;">
                <i class="fas fa-plus" aria-hidden="true"></i> Yeni Kurs Oluştur
            </a>
        </div>
    `;
}

/**
 * Tek bir kurs kartı için HTML oluşturur
 * Durum badge'leri (taslak, onay_bekliyor, yayinda vb.) render eder
 * @param {Object} course - Kurs verisi (backend'den dönen)
 * @returns {string} HTML string
 */
function createCourseCard(course) {
    // 1. Durum ve Renkler
    const statusConfig = getStatusConfig(course.durum);
    
    // 2. Fiyat Formatlanması
    const priceDisplay = course.fiyat > 0 
        ? `${parseFloat(course.fiyat).toFixed(2)} ₺` 
        : 'Ücretsiz';
    
    // 3. Kategori (eğer varsa)
    const categoryName = course.Category?.ad || 'Genel Kategori';
    
    // 4. Kurs Başlığı (iki satıra sınırlı)
    const courseTitle = course.baslik || 'Başlıksız Kurs';
    
    // 5. Bölüm Sayısı
    const sectionCount = course.Sections?.length || 0;

    return `
        <div class="course-card-alt" data-course-id="${course.id}">
            <div class="course-card-body">
                <!-- DURUM BADGE'İ -->
                <span class="course-badge" style="background-color: ${statusConfig.bgColor}; color: ${statusConfig.textColor}; border: 1px solid ${statusConfig.borderColor};">
                    <i class="${statusConfig.icon}" style="margin-right: 4px;"></i>
                    ${statusConfig.label}
                </span>
                
                <!-- Kurs Başlığı -->
                <h3 class="course-card-title">${escapeHtml(courseTitle)}</h3>
                
                <!-- Kurs Bilgileri -->
                <div class="course-card-info">
                    <span>
                        <i class="fas fa-folder-open" aria-hidden="true"></i> 
                        ${sectionCount} bölüm
                    </span>
                    <span>
                        <i class="fas fa-tag" aria-hidden="true"></i> 
                        ${escapeHtml(categoryName)}
                    </span>
                    <span>
                        <i class="fas fa-wallet" aria-hidden="true"></i> 
                        ${priceDisplay}
                    </span>
                </div>
            </div>
            
            <!-- Kart Alti Butonları -->
            <div class="course-card-actions">
                <a href="/instructor/edit-course.html?id=${course.id}" 
                   class="btn-edit-link" 
                   title="Kursu yönet ve müfredatı düzenle">
                    <i class="fas fa-cog" aria-hidden="true"></i> Yönet
                </a>
                <a href="/main/course-detail.html?id=${course.id}" 
                   class="btn-view-link" 
                   title="Kurs detayını görüntüle">
                    <i class="fas fa-eye" aria-hidden="true"></i> Önizle
                </a>
            </div>
        </div>
    `;
}

/**
 * Kurs durumuna göre badge yapılandırmasını döndürür
 * @param {string} durum - Kurs durumu (taslak, onay_bekliyor, onaylandi, yayinda, arsiv)
 * @returns {Object} Badge yapılandırması (label, bgColor, textColor, borderColor, icon)
 */
function getStatusConfig(durum) {
    const statusMap = {
        'taslak': {
            label: 'TASLAK',
            bgColor: '#fef3c7',
            textColor: '#92400e',
            borderColor: '#fde68a',
            icon: 'fas fa-file-alt'
        },
        'onay_bekliyor': {
            label: 'ONAY BEKLİYOR',
            bgColor: '#fed7aa',
            textColor: '#92400e',
            borderColor: '#fdba74',
            icon: 'fas fa-hourglass-half'
        },
        'onaylandi': {
            label: 'ONAYLANDI',
            bgColor: '#dbeafe',
            textColor: '#075985',
            borderColor: '#bae6fd',
            icon: 'fas fa-check-circle'
        },
        'yayinda': {
            label: 'YAYINDA',
            bgColor: '#dcfce7',
            textColor: '#15803d',
            borderColor: '#bbf7d0',
            icon: 'fas fa-rocket'
        },
        'arsiv': {
            label: 'ARŞİV',
            bgColor: '#e5e7eb',
            textColor: '#374151',
            borderColor: '#d1d5db',
            icon: 'fas fa-archive'
        },
        'default': {
            label: 'BİLİNMİYOR',
            bgColor: '#f3f4f6',
            textColor: '#6b7280',
            borderColor: '#d1d5db',
            icon: 'fas fa-question-circle'
        }
    };

    return statusMap[durum] || statusMap['default'];
}

/**
 * Kurs kartlarına event listener'lar ekler (silme, değiştirme vb.)
 */
function attachCourseCardListeners() {
    // Şimdilik basit, sonradan eklenebilir
    // Örn: Sağ tıkla menüsü, inline edit, vb.
}

/**
 * Yeni kurs oluşturma formunun submit eventini dinler
 * BACKEND: POST /api/courses
 */
function setupCreateCourseListener() {
    const createCourseForm = document.getElementById('createCourseForm');
    
    if (!createCourseForm) {
        console.warn('[CREATE COURSE] Form bulunamadı.');
        return;
    }

    createCourseForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = createCourseForm.querySelector('button[type="submit"]');
        const messageDiv = document.getElementById('courseMessage');
        
        if (!submitBtn) return;

        // UI Feedback: Işlem başladı
        const originalBtnText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Kaydediliyor...';

        try {
            // Form verilerini topla
            const payload = {
                baslik: (document.getElementById('baslik')?.value || '').trim(),
                alt_baslik: (document.getElementById('alt_baslik')?.value || '').trim(),
                kategori_id: document.getElementById('kategori_id')?.value || '',
                dil: document.getElementById('dil')?.value || 'Turkce',
                seviye: document.getElementById('seviye')?.value || 'Baslangic',
                fiyat: parseFloat(document.getElementById('fiyat')?.value) || 0,
                gereksinimler: (document.getElementById('gereksinimler')?.value || '').trim(),
                kazanimlar: (document.getElementById('kazanimlar')?.value || '').trim()
            };

            // Temel validasyon
            if (!payload.baslik || !payload.kategori_id) {
                throw new Error('Başlık ve kategori zorunlu alanlar.');
            }

            // BACKEND API ÇAĞRISI: Yeni kurs oluştur
            const result = await ApiService.post('/courses', payload);

            // Başarılı
            if (result.status === 'success') {
                // Mesaj göster
                if (messageDiv) {
                    messageDiv.textContent = '✓ ' + (result.message || 'Kurs başarıyla oluşturuldu!');
                    messageDiv.className = 'message-box success active';
                }

                // 1.5 saniye sonra panoya yönlendir
                setTimeout(() => {
                    window.location.href = '/instructor/dashboard.html';
                }, 1500);
            }

        } catch (error) {
            console.error('[CREATE COURSE] Hata:', error.message);
            
            // Hata mesajı göster
            if (messageDiv) {
                messageDiv.textContent = '✗ ' + error.message;
                messageDiv.className = 'message-box error active';
            }

            // Buton durumunu geri al
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
        }
    });
}

/**
 * XSS saldırılarını önlemek için HTML karakterlerini escape eder
 * @param {string} text - Escape edilecek metin
 * @returns {string} Escape edilmiş metin
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Global logout fonksiyonu
 */
window.logout = function() {
    if (typeof ApiService !== 'undefined' && typeof ApiService.logout === 'function') {
        ApiService.logout();
    } else {
        localStorage.removeItem('edunex_token');
        localStorage.removeItem('edunex_user');
        window.location.href = '/auth/index.html';
    }
};