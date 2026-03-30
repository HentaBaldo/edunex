/**
 * EduNex - Kurs Detay Mantığı (Course Detail Logic)
 * Oturum yönetimi ve Navbar senkronizasyonu eklenmiş versiyon.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Navbar'daki giriş durumunu kontrol et
    checkAuth();

    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');

    if (!courseId) {
        window.location.href = '/';
        return;
    }

    try {
        const result = await ApiService.get(`/courses/details/${courseId}`);
        const course = result.data;

        if (!course) throw new Error("Kurs verisi bulunamadı.");

        // Arayüz (UI) Güncellemeleri
        document.getElementById('courseTitle').innerText = course.baslik;
        document.getElementById('courseSubTitle').innerText = course.alt_baslik || '';
        document.getElementById('courseInstructor').innerHTML = `<i class="fas fa-chalkboard-teacher"></i> Eğitmen: ${course.Egitmen.ad} ${course.Egitmen.soyad}`;
        document.getElementById('coursePrice').innerText = course.fiyat > 0 ? `${course.fiyat} ₺` : 'Ücretsiz';

        const curriculumDiv = document.getElementById('curriculumList');
        curriculumDiv.innerHTML = ''; // Yükleniyor yazısını temizle

        if (course.Sections && course.Sections.length > 0) {
            course.Sections.forEach(section => {
                const sectionHtml = `
                    <div class="curriculum-section">
                        <header class="section-title-box">
                            <strong><i class="fas fa-folder-open"></i> ${section.baslik}</strong>
                        </header>
                        <div class="section-lessons">
                            ${section.Lessons.map(lesson => `
                                <div class="lesson-row">
                                    <div class="lesson-left">
                                        <i class="fas ${lesson.icerik_tipi === 'video' ? 'fa-play-circle' : 'fa-file-alt'} lesson-icon"></i>
                                        <span class="lesson-name">${lesson.baslik}</span>
                                    </div>
                                    <div class="lesson-right">
                                        <span class="lesson-time">${lesson.sure_saniye ? Math.floor(lesson.sure_saniye/60) + ' dk' : ''}</span>
                                        <span class="lesson-lock">${lesson.onizleme_mi ? '<i class="fas fa-eye" style="color:var(--primary-color);"></i>' : '<i class="fas fa-lock" style="color:#94a3b8;"></i>'}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                curriculumDiv.insertAdjacentHTML('beforeend', sectionHtml);
            });
        } else {
            curriculumDiv.innerHTML = '<p class="info-message">Bu kurs için henüz müfredat eklenmemiş.</p>';
        }

    } catch (error) {
        console.error("[HATA] Kurs detayları çekilemedi:", error.message);
        alert("Kurs detayları yüklenemedi. Ana sayfaya yönlendiriliyorsunuz.");
        window.location.href = '/';
    }
});

/**
 * Kullanıcı oturum durumunu kontrol eder ve Navbar'ı günceller
 * Bu mantık main.js'den referans alınmıştır
 */
function checkAuth() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');
    // course-detail.html'deki navigasyon konteynerini seçiyoruz
    const authContainer = document.querySelector('.nav-actions');
    
    if (token && userJson && authContainer) {
        try {
            const user = JSON.parse(userJson);
            
            // Kullanıcının rolüne göre doğru paneli belirle
            const dashboardLink = user.rol === 'egitmen' 
                ? '/instructor/dashboard.html' 
                : '/student/dashboard.html';

            // Navbar'ı giriş yapmış kullanıcıya göre düzenle
            authContainer.innerHTML = `
                <div class="user-dropdown">
                    <button class="dropdown-trigger">
                        <i class="fas fa-user-circle" style="font-size: 1.2rem;"></i> 
                        ${user.ad} 
                        <i class="fas fa-chevron-down" style="font-size: 0.8rem; margin-left: 5px;"></i>
                    </button>
                    
                    <div class="dropdown-content">
                        <a href="/profile/index.html"><i class="fas fa-id-badge" style="width:20px;"></i> Profil</a>
                        <a href="${dashboardLink}"><i class="fas fa-columns" style="width:20px;"></i> Panelim</a>
                        <hr>
                        <button onclick="logout()" class="text-danger">
                            <i class="fas fa-sign-out-alt" style="width:20px;"></i> Çıkış Yap
                        </button>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('[HATA] Kullanıcı verisi okunamadı.');
            logout(); 
        }
    }
}

/**
 * Oturumu kapatır ve sayfayı yeniler
 */
function logout() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) {
        ApiService.logout();
    } else {
        localStorage.clear();
        window.location.reload();
    }
}