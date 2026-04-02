/**
 * EduNex - Eğitmen Panosu (Dashboard)
 * Backend'den kursları çeken ve dinamik olarak render eden modül
 */

import { UIHelper } from './modules/ui-helper.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Oturum doğrula
    if (!UIHelper.checkInstructorAccess()) return;
    
    // Kursları yükle
    await loadMyCourses();
});

/**
 * Backend'den eğitmenin kurslarını çekip render eder
 */
async function loadMyCourses() {
    const courseListDiv = document.getElementById('courseList');
    if (!courseListDiv) {
        console.warn('[DASHBOARD] courseList DOM element bulunamadı.');
        return;
    }

    try {
        // API çağrısı
        const result = await ApiService.get('/courses/my-courses');
        const courses = result.data || [];

        if (courses.length === 0) {
            renderEmptyState(courseListDiv);
            return;
        }

        // Kursları render et
        courseListDiv.innerHTML = '';
        courses.forEach(course => {
            const card = createCourseCard(course);
            courseListDiv.insertAdjacentHTML('beforeend', card);
        });

    } catch (error) {
        console.error('[DASHBOARD] Kurslar yüklenemedi:', error.message);
        renderErrorState(courseListDiv, error.message);
    }
}

/**
 * Boş durum render eder
 */
function renderEmptyState(container) {
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-book-open"></i>
            <h3>Henüz bir kurs oluşturmadınız</h3>
            <p>Uzmanlığınızı paylaşmaya başlamak için ilk kursunuzu oluşturun.</p>
            <a href="/instructor/create-course.html" class="btn-primary-lg-alt">
                <i class="fas fa-plus"></i> Yeni Kurs Oluştur
            </a>
        </div>
    `;
}

/**
 * Hata durumu render eder
 */
function renderErrorState(container, message) {
    container.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Hata: ${message}</p>
            <button onclick="location.reload()" class="btn-primary-lg-alt" style="margin-top: 15px;">
                <i class="fas fa-redo"></i> Tekrar Dene
            </button>
        </div>
    `;
}

/**
 * Kurs kartı HTML'i oluşturur
 */
function createCourseCard(course) {
    const statusClass = `badge-${course.durum}`;
    const statusLabel = getStatusLabel(course.durum);
    const categoryName = course.Category?.ad || 'Genel';
    const sectionCount = course.Sections?.length || 0;
    const priceDisplay = course.fiyat > 0 
        ? `${parseFloat(course.fiyat).toFixed(2)} ₺` 
        : 'Ücretsiz';

    return `
        <div class="course-card-alt" data-course-id="${course.id}">
            <div class="course-card-body">
                <span class="course-badge ${statusClass}">
                    <i class="${getStatusIcon(course.durum)}"></i>
                    ${statusLabel}
                </span>
                <h3 class="course-card-title">${escapeHtml(course.baslik)}</h3>
                <div class="course-card-info">
                    <span>
                        <i class="fas fa-folder-open"></i> 
                        ${sectionCount} bölüm
                    </span>
                    <span>
                        <i class="fas fa-tag"></i> 
                        ${escapeHtml(categoryName)}
                    </span>
                    <span>
                        <i class="fas fa-wallet"></i> 
                        ${priceDisplay}
                    </span>
                </div>
            </div>
            <div class="course-card-actions">
                <a href="/instructor/edit-course.html?id=${course.id}" class="btn-edit-link" title="Kursu yönet">
                    <i class="fas fa-cog"></i> Yönet
                </a>
                <a href="/main/course-detail.html?id=${course.id}" class="btn-view-link" title="Kursu önizle">
                    <i class="fas fa-eye"></i> Önizle
                </a>
            </div>
        </div>
    `;
}

/**
 * Durum etiketi döndürür
 */
function getStatusLabel(durum) {
    const labels = {
        'taslak': 'TASLAK',
        'onay_bekliyor': 'ONAY BEKLİYOR',
        'onaylandi': 'ONAYLANDI',
        'yayinda': 'YAYINDA',
        'arsiv': 'ARŞİV'
    };
    return labels[durum] || 'BİLİNMİYOR';
}

/**
 * Durum ikonu döndürür
 */
function getStatusIcon(durum) {
    const icons = {
        'taslak': 'fas fa-file-alt',
        'onay_bekliyor': 'fas fa-hourglass-half',
        'onaylandi': 'fas fa-check-circle',
        'yayinda': 'fas fa-rocket',
        'arsiv': 'fas fa-archive'
    };
    return icons[durum] || 'fas fa-question-circle';
}

/**
 * HTML escape eder
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

// Global erişim
window.loadMyCourses = loadMyCourses;