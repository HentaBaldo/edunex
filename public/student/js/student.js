/**
 * EduNex - Öğrenci Paneli (Student Dashboard Logic)
 * Version: 2.0 (Enrollment Sistemi Entegre)
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkStudentAccess()) return;
    await loadEnrolledCourses();
});

function checkStudentAccess() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');

    if (!token || !userJson) {
        window.location.href = '/auth/index.html';
        return false;
    }

    try {
        const user = JSON.parse(userJson);
        
        if (user.rol === 'egitmen') {
            window.location.href = '/instructor/dashboard.html';
            return false;
        }
        
        return true;

    } catch (error) {
        console.error('[AUTH ERROR] Geçersiz kullanıcı oturumu:', error);
        localStorage.removeItem('edunex_token');
        localStorage.removeItem('edunex_user');
        window.location.href = '/auth/index.html';
        return false;
    }
}

/**
 * Backend'den öğrencinin kayıtlı olduğu kursları çeker ve görüntüler
 * ✅ REAL DATA: /api/enrollments/my-courses endpoint'ine GET isteği
 */
async function loadEnrolledCourses() {
    const grid = document.getElementById('enrolledCourses');
    if (!grid) {
        console.error('[STUDENT] enrolledCourses DOM element bulunamadı.');
        return;
    }
    
    try {
        grid.innerHTML = `
            <div class="loading-state">
                <div class="spinner" aria-hidden="true"></div>
                <p>Kurslarınız yükleniyor...</p>
            </div>
        `;

        console.log('[STUDENT] Enrollment API çağrılıyor: /enrollments/my-courses');
        const result = await ApiService.get('/enrollments/my-courses');
        console.log('[STUDENT] Enrollment API yanıtı:', result);

        const courses = result.data || [];
        
        if (!Array.isArray(courses)) {
            console.error('[STUDENT] Courses data bir array değil:', typeof courses);
            grid.innerHTML = `
                <div class="error-message-container">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Veri formatı hatalı. Admin ile iletişime geçin.</p>
                </div>
            `;
            return;
        }

        if (courses.length === 0) {
            grid.innerHTML = `
                <div class="empty-message-container">
                    <p class="empty-message">Henüz hiçbir kursa kayıt olmadınız.</p>
                    <a href="/main/index.html#courses" class="btn-primary-lg-alt">
                        Kursları Keşfet
                    </a>
                </div>
            `;
            return;
        }

        grid.innerHTML = ''; 
        courses.forEach(enrollment => {
            if (!enrollment || !enrollment.Course) {
                console.warn('[STUDENT] Eksik enrollment verisi:', enrollment);
                return;
            }

            const course = enrollment.Course;
            const instructor = course.Egitmen || {};
            const progress = enrollment.ilerleme_yuzdesi || 0;

            const courseTitle = escapeHtml(course.baslik || 'Başlıksız Kurs');
            const instructorName = escapeHtml(`${instructor.ad || 'Bilinmeyen'} ${instructor.soyad || 'Eğitmen'}`);

            const card = `
                <div class="student-course-card">
                    <div class="course-img-placeholder">
                        <i class="fas fa-play-circle" style="font-size: 2rem; color: #3b82f6;"></i>
                    </div>
                    <div class="card-body">
                        <h3 class="course-title">${courseTitle}</h3>
                        <p class="instructor-name">
                            <i class="fas fa-chalkboard-teacher"></i>
                            ${instructorName}
                        </p>
                        <p class="course-level" style="font-size: 0.85rem; color: #64748b; margin: 5px 0;">
                            <i class="fas fa-signal"></i> ${course.seviye || 'Temel'}
                        </p>
                        
                        <div class="progress-wrapper">
                            <div class="progress-bar-bg">
                                <div class="progress-bar-fill" style="width: ${progress}%;"></div>
                            </div>
                            <span class="progress-text">%${Math.round(progress)} Tamamlandı</span>
                        </div>
                        
                        <div class="card-actions">
                            <!-- ✅ BURASI DÜZELTILDI: /student/learning-room.html -->
                            <a href="/student/learning-room.html?id=${course.id}" class="btn-continue">
                                <i class="fas fa-play"></i> Öğrenmeye Devam Et
                            </a>
                            <button onclick="unenrollCourse('${course.id}')" class="btn-unenroll" title="Kurstan Ayrıl">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', card);
        });

        console.log(`[STUDENT] ${courses.length} kurs başarıyla render edildi`);

    } catch (error) {
        console.error("[STUDENT] Kayıtlı kurslar yüklenemedi:", error);
        grid.innerHTML = `
            <div class="error-message-container">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ef4444;"></i>
                <p class="error-message">Hata: ${escapeHtml(error.message)}</p>
                <button onclick="loadEnrolledCourses()" class="btn-retry">Tekrar Dene</button>
            </div>
        `;
    }
}

/**
 * Öğrenciyi bir kurstan çıkarır (Kaydı iptal eder)
 * ✅ REAL DATA: /api/enrollments/:courseId endpoint'ine DELETE isteği
 * @param {string} courseId - Kurstan ayrılacak kursun ID'si
 */
async function unenrollCourse(courseId) {
    if (!confirm('Kurstan ayrılmak istediğinize emin misiniz? Bu işlem geri alınamaz.')) {
        return;
    }

    try {
        const result = await ApiService.delete(`/enrollments/${courseId}`);
        
        if (result.status === 'success') {
            alert('Kurs kaydı başarıyla iptal edildi.');
            // Sayfayı yenile
            await loadEnrolledCourses();
        }
    } catch (error) {
        console.error("[UNENROLL ERROR]", error.message);
        alert('Kurstan ayrılırken hata oluştu: ' + error.message);
    }
}

function logout() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) {
        ApiService.logout();
    } else {
        localStorage.removeItem('edunex_token');
        localStorage.removeItem('edunex_user');
        window.location.href = '/auth/index.html';
    }
}
// ==========================================
// STUDENT DASHBOARD - ÖNERİ SİSTEMİ
// ==========================================

/**
 * Öğrenci paneli için trend olan kursları yükle
 */
async function loadStudentTrendingCourses() {
    const trendingGrid = document.getElementById('studentTrendingGrid');
    if (!trendingGrid) return;

    try {
        console.log('[STUDENT RECOMMENDATIONS] Trend kurslar yükleniyor...');
        
        const result = await ApiService.get('/recommendations/trending');
        const courses = result.data || [];

        if (courses.length === 0) {
            trendingGrid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 20px; text-align: center; color: #64748b;">
                    <p>Şu anda trend olan kurs bulunmuyor.</p>
                </div>
            `;
            return;
        }

        trendingGrid.innerHTML = '';
        courses.forEach(course => {
            const cardHtml = renderStudentCourseCard(course);
            trendingGrid.insertAdjacentHTML('beforeend', cardHtml);
        });

        console.log(`[STUDENT RECOMMENDATIONS] ${courses.length} trend kurs render edildi`);

    } catch (error) {
        console.error('[STUDENT RECOMMENDATIONS] Trend yükleme hatası:', error);
        trendingGrid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 20px; text-align: center; color: #dc3545;">
                <p>Trend kurslar yüklenemedi.</p>
            </div>
        `;
    }
}

/**
 * Öğrenci paneli için en yüksek puanlı kursları yükle
 */
async function loadStudentTopRatedCourses() {
    const topRatedGrid = document.getElementById('studentTopRatedGrid');
    if (!topRatedGrid) return;

    try {
        console.log('[STUDENT RECOMMENDATIONS] Top-rated kurslar yükleniyor...');
        
        const result = await ApiService.get('/recommendations/top-rated');
        const courses = result.data || [];

        if (courses.length === 0) {
            topRatedGrid.innerHTML = `
                <div style="grid-column: 1/-1; padding: 20px; text-align: center; color: #64748b;">
                    <p>Henüz puanlanmış kurs bulunmuyor.</p>
                </div>
            `;
            return;
        }

        topRatedGrid.innerHTML = '';
        courses.forEach(course => {
            const cardHtml = renderStudentCourseCard(course);
            topRatedGrid.insertAdjacentHTML('beforeend', cardHtml);
        });

        console.log(`[STUDENT RECOMMENDATIONS] ${courses.length} top-rated kurs render edildi`);

    } catch (error) {
        console.error('[STUDENT RECOMMENDATIONS] Top-rated yükleme hatası:', error);
        topRatedGrid.innerHTML = `
            <div style="grid-column: 1/-1; padding: 20px; text-align: center; color: #dc3545;">
                <p>En yüksek puanlı kurslar yüklenemedi.</p>
            </div>
        `;
    }
}

/**
 * Öğrenci paneli için kurs kartı render eder
 * (Ana sayfadaki renderCourseCard'dan biraz daha kompakt)
 */
/**
 * Öğrenci paneli için kurs kartı render eder
 * (Ana sayfadaki renderCourseCard'dan biraz daha kompakt)
 */
function renderStudentCourseCard(course) {
    const courseId = course.id || '';
    const courseTitle = course.baslik || 'Başlıksız Kurs';
    const coursePrice = course.fiyat > 0 ? `${parseFloat(course.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
    const avgRating = course.istatistikler?.ortalama_puan || null;
    const totalStudents = course.istatistikler?.toplam_ogrenci || 0;
    const instructorName = course.egitmen 
        ? `${course.egitmen.ad || ''} ${course.egitmen.soyad || ''}`.trim()
        : 'Bilinmeyen Eğitmen';

    const safeTitle = escapeHtml(courseTitle);
    const safeInstructor = escapeHtml(instructorName);

    return `
        <a href="/student/learning-room.html?id=${courseId}" style="text-decoration: none; color: inherit;">
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.08); transition: all 0.2s; cursor: pointer;" 
                 onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'; this.style.transform='translateY(-2px)'"
                 onmouseout="this.style.boxShadow='0 1px 3px rgba(0,0,0,0.08)'; this.style.transform='translateY(0)'">
                
                <!-- Kapak -->
                <div style="height: 140px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-size: 2.5rem;">
                    <i class="fas fa-book"></i>
                </div>

                <!-- Bilgi -->
                <div style="padding: 12px;">
                    <h4 style="margin: 0 0 6px 0; font-size: 0.95rem; color: #1e293b; font-weight: 600; line-height: 1.3;">
                        ${safeTitle}
                    </h4>
                    
                    <p style="margin: 6px 0; font-size: 0.8rem; color: #64748b;">
                        <i class="fas fa-user-tie" style="margin-right: 4px;"></i>
                        ${safeInstructor}
                    </p>

                    ${avgRating ? `<p style="margin: 6px 0; font-size: 0.8rem; color: #fbbf24;"><i class="fas fa-star"></i> ${avgRating} (${totalStudents})</p>` : ''}

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9;">
                        <span style="font-weight: 700; font-size: 0.95rem; color: #0f172a;">${coursePrice}</span>
                        <span style="background: #2563eb; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Devam Et</span>
                    </div>
                </div>
            </div>
        </a>
    `;
}

/**
 * XSS Koruması
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Öğrenci paneli önerilerini yükle
 */
async function loadStudentRecommendations() {
    console.log('[STUDENT RECOMMENDATIONS] Öneriler başlatılıyor...');
    
    await Promise.all([
        loadStudentTrendingCourses(),
        loadStudentTopRatedCourses()
    ]);

    console.log('[STUDENT RECOMMENDATIONS] Tamamlandı.');
}

// ==========================================
// MEVCUT DOMContentLoaded'A EKLE
// ==========================================

// Mevcut kod: document.addEventListener('DOMContentLoaded', async () => {
//     if (!checkStudentAccess()) return;
//     await loadEnrolledCourses();
// });

// BUNU ŞUNA ÇEVIR:

// Eski kod (satır 5-8):
// document.addEventListener('DOMContentLoaded', async () => {
//     if (!checkStudentAccess()) return;
//     await loadEnrolledCourses();
// });

// YENİ KOD (satır 5-11):
document.addEventListener('DOMContentLoaded', async () => {
    if (!checkStudentAccess()) return;
    
    // Kayıtlı kursları yükle
    await loadEnrolledCourses();
    
    // ✅ Önerileri de yükle
    await loadStudentRecommendations();
});