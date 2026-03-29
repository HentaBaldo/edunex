document.addEventListener('DOMContentLoaded', async () => {
    if (!checkInstructorAccess()) return;
    await loadInstructorCourses();
});

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
        
        const userNameSpan = document.getElementById('userName');
        if (userNameSpan) {
            userNameSpan.innerText = `${user.ad} ${user.soyad}`;
        }
        
        return true;
    } catch (error) {
        localStorage.clear();
        window.location.href = '/auth/index.html';
        return false;
    }
}

async function loadInstructorCourses() {
    const courseListDiv = document.getElementById('courseList');
    courseListDiv.innerHTML = '<div class="loading-state"><p>Kurslarınız yükleniyor...</p></div>';
    
    try {
        const result = await ApiService.get('/courses/my-courses');
        const courses = result.data || [];
        
        if (courses.length > 0) {
            // Grid yapısını HTML içine basıyoruz
            courseListDiv.innerHTML = courses.map(course => {
                // Durum belirleme (Taslak veya Yayında)
                const isPublished = course.durum === 'yayinda' || course.yayinlandi === true;
                const statusText = isPublished ? 'YAYINDA' : 'TASLAK';
                const statusClass = isPublished ? 'badge-published' : 'badge-draft';
                const priceDisplay = course.fiyat > 0 ? `${course.fiyat} ₺` : 'Ücretsiz';

                // YENİ: instructor-dashboard.css ile %100 uyumlu HTML yapısı
                return `
                    <div class="course-card-alt">
                        <div class="course-card-body">
                            <span class="course-badge ${statusClass}">${statusText}</span>
                            <h3 class="course-card-title">${course.baslik}</h3>
                            <div class="course-card-info">
                                <span><i class="fas fa-tag"></i> ${course.Category ? course.Category.ad : 'Genel'}</span>
                                <span><i class="fas fa-wallet"></i> ${priceDisplay}</span>
                            </div>
                        </div>
                        <div class="course-card-actions">
                            <a href="/instructor/edit-course.html?id=${course.id}" class="btn-edit-link">
                                <i class="fas fa-cog"></i> Yönet
                            </a>
                            <a href="/main/course-detail.html?id=${course.id}" class="btn-view-link">
                                <i class="fas fa-eye"></i> Önizle
                            </a>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            courseListDiv.innerHTML = `
                <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 50px;">
                    <i class="fas fa-book-open" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 15px;"></i>
                    <p class="empty-message">Henüz bir kurs oluşturmadınız.</p>
                </div>`;
        }
    } catch (error) {
        console.error("Kurs yükleme hatası:", error);
        courseListDiv.innerHTML = `<p class="error-message">Hata: ${error.message}</p>`;
    }
}

function logout() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) {
        ApiService.logout();
    } else {
        localStorage.clear();
        window.location.href = '/auth/index.html';
    }
}