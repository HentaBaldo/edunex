/**
 * EduNex Egitmen - Dashboard Isleyisi (Instructor Dashboard Logic)
 * Egitmenin oturum kontrolunu yapar ve kurslarini listeler.
 */

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Oturum ve Rol Dogrulamasi
    if (!checkInstructorAccess()) return;
    
    // 2. Egitmene Ait Kurslari Yukle
    await loadInstructorCourses();
});

/**
 * Kullanicinin giris yapip yapmadigini ve 'egitmen' rolune sahip olup olmadigini dogrular.
 * @returns {boolean} Erisim izni varsa true, yoksa false doner.
 */
function checkInstructorAccess() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');

    if (!token || !userJson) {
        window.location.href = '/auth/index.html';
        return false;
    }

    try {
        const user = JSON.parse(userJson);
        if (user.rol !== 'egitmen') {
            window.location.href = '/main/index.html';
            return false;
        }
        return true;
    } catch (error) {
        console.error('[AUTH ERROR] Gecersiz kullanici verisi:', error.message);
        localStorage.clear();
        window.location.href = '/auth/index.html';
        return false;
    }
}

/**
 * API'den egitmenin kurslarini ceker ve grid (izgara) yapisinda arayuze basar.
 */
async function loadInstructorCourses() {
    const courseListDiv = document.getElementById('courseList');
    if (!courseListDiv) return;

    courseListDiv.innerHTML = '<div class="loading-state"><p>Kurslariniz yukleniyor...</p></div>';
    
    try {
        const result = await ApiService.get('/courses/my-courses');
        const courses = result.data || [];
        
        if (courses.length > 0) {
            courseListDiv.innerHTML = courses.map(course => {
                // Durum ve Fiyatlandirma Kontrolleri
                const isPublished = course.durum === 'yayinda' || course.yayinlandi === true;
                const statusText = isPublished ? 'YAYINDA' : 'TASLAK';
                const statusClass = isPublished ? 'badge-published' : 'badge-draft';
                const priceDisplay = course.fiyat > 0 ? `${parseFloat(course.fiyat).toFixed(2)} TL` : 'Ucretsiz';
                const categoryName = (course.Category && course.Category.ad) ? course.Category.ad : 'Genel';
                const courseTitle = course.baslik || 'Isimsiz Kurs';

                return `
                    <div class="course-card-alt">
                        <div class="course-card-body">
                            <span class="course-badge ${statusClass}">${statusText}</span>
                            <h3 class="course-card-title">${courseTitle}</h3>
                            <div class="course-card-info" style="display:flex; justify-content:space-between; margin-top:10px; color:#64748b; font-size:0.9rem;">
                                <span><i class="fas fa-tag" aria-hidden="true"></i> ${categoryName}</span>
                                <span><i class="fas fa-wallet" aria-hidden="true"></i> ${priceDisplay}</span>
                            </div>
                        </div>
                        <div class="course-card-actions">
                            <a href="/instructor/edit-course.html?id=${course.id}" class="btn-edit-link" aria-label="${courseTitle} kursunu yonet">
                                <i class="fas fa-cog" aria-hidden="true"></i> Yonet
                            </a>
                            <a href="/main/course-detail.html?id=${course.id}" class="btn-view-link" aria-label="${courseTitle} kursunu onizle">
                                <i class="fas fa-eye" aria-hidden="true"></i> Onizle
                            </a>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            // Empty State (Bos Durum) Tasarimi
            courseListDiv.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 50px; border: 2px dashed #cbd5e1; border-radius: 12px;">
                    <i class="fas fa-book-open" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 15px;" aria-hidden="true"></i>
                    <p class="empty-message" style="color: #475569; font-weight: 500;">Henuz bir kurs olusturmadiniz.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("[INSTRUCTOR DASHBOARD] Kurslar yuklenirken hata olustu:", error.message);
        courseListDiv.innerHTML = `
            <div class="message-box error active" style="grid-column: 1/-1;">
                Hata: ${error.message}
            </div>
        `;
    }
}

/**
 * Egitmen oturumunu kapatir ve giris sayfasina yonlendirir.
 */
function logout() {
    if (typeof ApiService !== 'undefined' && typeof ApiService.logout === 'function') {
        ApiService.logout();
    } else {
        localStorage.clear();
        window.location.href = '/auth/index.html';
    }
}