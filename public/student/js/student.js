/**
 * EduNex - Öğrenci Paneli (Student Dashboard Logic)
 * Version: 1.3 (Universal Navbar Uyumlu)
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
        
        // HATA VEREN SATIR SİLİNDİ. 
        // Kullanıcı adını sağ üste yazdırma işini artık main.js ortak navbar üzerinden yapıyor.
        
        return true;

    } catch (error) {
        console.error('[AUTH ERROR] Geçersiz kullanıcı oturumu:', error);
        localStorage.removeItem('edunex_token');
        localStorage.removeItem('edunex_user');
        window.location.href = '/auth/index.html';
        return false;
    }
}

async function loadEnrolledCourses() {
    const grid = document.getElementById('enrolledCourses');
    if (!grid) return;
    
    try {
        // GELECEK PLAN: Backend hazır olduğunda bu satırı açacağız
        // const result = await ApiService.get('/enrollments/my-courses');
        // const courses = result.data || [];
        
        // Şimdilik Backend enrollment sistemi olmadığı için boş bir dizi simüle ediyoruz
        const courses = []; 

        if (courses.length === 0) {
            grid.innerHTML = `
                <div class="empty-message-container">
                    <p class="empty-message">Henüz hiçbir kursa kayıt olmadınız.</p>
                    <a href="/main/index.html#courses" class="btn-outline">Kursları Keşfet</a>
                </div>
            `;
            return;
        }

        grid.innerHTML = ''; 

        // İleride kurslar geldiğinde bu şablon kullanılacak
        courses.forEach(course => {
            const card = `
                <div class="student-course-card">
                    <div class="course-img-placeholder">🎓</div>
                    <div class="card-body">
                        <h3 class="course-title">${course.baslik}</h3>
                        <p class="instructor-name">Eğitmen: ${course.Egitmen.ad}</p>
                        
                        <div class="progress-wrapper">
                            <div class="progress-bar-bg">
                                <div class="progress-bar-fill" style="width: 0%;"></div>
                            </div>
                            <span class="progress-text">%0 Tamamlandı</span>
                        </div>
                        
                        <a href="/student/course-player.html?id=${course.id}" class="btn-continue">Öğrenmeye Devam Et</a>
                    </div>
                </div>
            `;
            grid.insertAdjacentHTML('beforeend', card);
        });

    } catch (error) {
        console.error("[FETCH ERROR] Kayıtlı kurslar yüklenemedi:", error.message);
        grid.innerHTML = `<p class="error-message">Hata: ${error.message}</p>`;
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