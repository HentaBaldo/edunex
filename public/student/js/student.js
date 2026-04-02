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
    if (!grid) return;
    
    try {
        // Yükleniyor durumunu göster
        grid.innerHTML = `
            <div class="loading-state">
                <div class="spinner" aria-hidden="true"></div>
                <p>Kurslarınız yükleniyor...</p>
            </div>
        `;

        // ✅ BACKEND API ÇAĞRISI: Öğrencinin kayıtlı olduğu tüm kursları getir
        const result = await ApiService.get('/enrollments/my-courses');
        const courses = result.data || [];
        
        // Eğer kurs yoksa boş durum göster
        if (courses.length === 0) {
            grid.innerHTML = `
                <div class="empty-message-container">
                    <p class="empty-message">Henüz hiçbir kursa kayıt olmadınız.</p>
                    <a href="/main/index.html#courses" class="btn-outline">Kursları Keşfet</a>
                </div>
            `;
            return;
        }

        // ✅ RENDER: Kursları grid yapısında göster
        grid.innerHTML = ''; 

        courses.forEach(enrollment => {
            // Course bilgisini enrollment'tan çıkar
            const course = enrollment.Course;
            const instructor = course.Egitmen;
            const progress = enrollment.ilerleme_yuzdesi || 0;

            const card = `
                <div class="student-course-card">
                    <div class="course-img-placeholder">
                        <i class="fas fa-play-circle" style="font-size: 2rem; color: #3b82f6;"></i>
                    </div>
                    <div class="card-body">
                        <h3 class="course-title">${course.baslik || 'Başlıksız Kurs'}</h3>
                        <p class="instructor-name">
                            <i class="fas fa-chalkboard-teacher"></i>
                            ${instructor ? `${instructor.ad} ${instructor.soyad}` : 'Bilinmeyen Eğitmen'}
                        </p>
                        <p class="course-level" style="font-size: 0.85rem; color: #64748b; margin: 5px 0;">
                            <i class="fas fa-signal"></i> ${course.seviye || 'Temel'}
                        </p>
                        
                        <div class="progress-wrapper">
                            <div class="progress-bar-bg">
                                <div class="progress-bar-fill" style="width: ${progress}%;"></div>
                            </div>
                            <span class="progress-text">%${progress} Tamamlandı</span>
                        </div>
                        
                        <div class="card-actions">
                            <a href="/student/course-player.html?id=${course.id}" class="btn-continue">
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

    } catch (error) {
        console.error("[FETCH ERROR] Kayıtlı kurslar yüklenemedi:", error.message);
        grid.innerHTML = `
            <div class="error-message-container">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ef4444;"></i>
                <p class="error-message">Hata: ${error.message}</p>
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