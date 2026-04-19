/**
 * EduNex - Kurs Detay Mantığı (Course Detail Logic)
 * Version: 2.0 (Enrollment Sistemi Entegre)
 * Oturum yönetimi, Navbar senkronizasyonu ve Kursa Kayıt özelliği eklenmiş versiyon.
 */

let currentCourseId = null;
let currentUserToken = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Navbar'daki giriş durumunu kontrol et
    checkAuth();

    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');

    if (!courseId) {
        window.location.href = '/';
        return;
    }

    currentCourseId = courseId;
    currentUserToken = localStorage.getItem('edunex_token');

    try {
        const result = await ApiService.get(`/courses/${courseId}`);
        const course = result.data;

        if (!course) throw new Error("Kurs verisi bulunamadı.");

        // Arayüz (UI) Güncellemeleri
        document.getElementById('courseTitle').innerText = course.baslik;
        document.getElementById('courseSubTitle').innerText = course.alt_baslik || '';
        document.getElementById('courseInstructor').innerHTML = `<i class="fas fa-chalkboard-teacher"></i> Eğitmen: ${course.Egitmen.ad} ${course.Egitmen.soyad}`;
        document.getElementById('coursePrice').innerText = course.fiyat > 0 ? `${course.fiyat} ₺` : 'Ücretsiz';

        // Fiyata göre buton gösterimi: ücretli -> Sepete Ekle, ücretsiz -> Direkt Kayıt
        const isPaid = Number(course.fiyat) > 0;
        const enrollBtn = document.getElementById('enrollBtn');
        const addToCartBtn = document.getElementById('addToCartBtn');
        if (isPaid) {
            if (enrollBtn) enrollBtn.style.display = 'none';
            if (addToCartBtn) addToCartBtn.addEventListener('click', handleAddToCart);
        } else {
            if (addToCartBtn) addToCartBtn.style.display = 'none';
            if (enrollBtn) {
                enrollBtn.style.background = '';
                enrollBtn.style.color = '';
                enrollBtn.textContent = 'Kursa Kaydol';
                enrollBtn.addEventListener('click', handleEnrollClick);
            }
        }

        // Öğrenci zaten kayıtlı mı kontrol et
        if (currentUserToken) {
            await checkEnrollmentStatus(courseId);
        }

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
 * Öğrencinin bu kursa zaten kayıtlı olup olmadığını kontrol et
 * ✅ REAL DATA: /api/enrollments/:courseId endpoint'ine GET isteği
 * @param {string} courseId - Kontrol edilecek kurs ID'si
 */
// ❌ YANLIŞ (SAT. 84-104):
async function checkEnrollmentStatus(courseId) {
    try {
        const result = await ApiService.get(`/enrollments/${courseId}`);
        
        if (result.status === 'success' && result.data) {
            // Öğrenci zaten kayıtlı
            const enrollBtn = document.getElementById('enrollBtn');
            if (enrollBtn) {
                enrollBtn.textContent = '✓ Kayıtlısınız';
                enrollBtn.disabled = true;
                enrollBtn.style.backgroundColor = '#10b981';
                enrollBtn.style.cursor = 'default';
            }
        }
    } catch (error) {
        // 404 gelecek (kayıtlı değil), bu normal
        if (error.message.includes('404')) {
            console.log('Öğrenci bu kursa kayıtlı değil');
        } else {
            console.warn('Enrollment status kontrol hatası:', error.message);
        }
    }
}

// ✅ DOĞRU (SAT. 84-110):
async function checkEnrollmentStatus(courseId) {
    try {
        const result = await ApiService.get(`/enrollments/${courseId}`);
        
        // ✅ DÜZELTME: enrolled flag'ine bak
        if (result.status === 'success') {
            if (result.enrolled === true && result.data) {
                // Öğrenci zaten kayıtlı - tüm butonları "Kayıtlısınız" olarak güncelle
                const enrollBtn = document.getElementById('enrollBtn');
                const addToCartBtn = document.getElementById('addToCartBtn');
                if (addToCartBtn) addToCartBtn.style.display = 'none';
                if (enrollBtn) {
                    enrollBtn.style.display = 'block';
                    enrollBtn.textContent = '✓ Kayıtlısınız';
                    enrollBtn.disabled = true;
                    enrollBtn.style.backgroundColor = '#10b981';
                    enrollBtn.style.color = '#fff';
                    enrollBtn.style.cursor = 'default';
                }
            } else if (result.enrolled === false) {
                // Öğrenci kayıtlı değil - düğme normal durumda kalsın
                console.log('[ENROLLMENT] Öğrenci bu kursa kayıtlı değildir.');
            }
        }
    } catch (error) {
        // Sadece gerçek hatalar için uyar
        console.warn('[ENROLLMENT CHECK] Hata:', error.message);
    }
}

/**
 * Sepete Ekle butonuna tıklandığında çalışır.
 * Ücretli kurslar için iyzico akışının başlangıcı.
 */
async function handleAddToCart() {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        alert('Sepete eklemek için lütfen giriş yapınız.');
        window.location.href = '/auth/index.html';
        return;
    }

    const btn = document.getElementById('addToCartBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ekleniyor...';

    try {
        const result = await ApiService.post('/cart/items', { kurs_id: currentCourseId });
        if (result.status === 'success') {
            showSuccessToast(result.message || 'Sepete eklendi.');
            btn.innerHTML = '<i class="fas fa-check"></i> Sepete Gitmek İçin Tıklayın';
            btn.onclick = () => { window.location.href = '/student/cart.html'; };
            btn.disabled = false;
        }
    } catch (error) {
        console.error('[CART ADD ERROR]', error.message);
        if (error.message.includes('zaten sepetinizde')) {
            btn.innerHTML = '<i class="fas fa-check"></i> Sepete Gitmek İçin Tıklayın';
            btn.onclick = () => { window.location.href = '/student/cart.html'; };
            btn.disabled = false;
            showErrorToast('Bu kurs zaten sepetinizde.');
        } else if (error.message.includes('zaten kayitli') || error.message.includes('zaten kayıtlı')) {
            btn.style.display = 'none';
            showErrorToast('Bu kursa zaten kayıtlısınız.');
        } else {
            showErrorToast(`Sepete eklenemedi: ${error.message}`);
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

/**
 * Enroll butonuna tıklandığında çalışan ana fonksiyon
 * ✅ REAL DATA: /api/enrollments endpoint'ine POST isteği
 */
async function handleEnrollClick() {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        alert('Kursa kaydolmak için lütfen giriş yapınız.');
        window.location.href = '/auth/index.html';
        return;
    }

    const enrollBtn = document.getElementById('enrollBtn');
    
    if (enrollBtn.disabled) {
        return;
    }

    const originalText = enrollBtn.textContent;
    enrollBtn.disabled = true;
    enrollBtn.textContent = '⏳ Kaydediliyor...';

    try {
        const result = await ApiService.post('/enrollments', {
            kurs_id: currentCourseId
        });

        if (result.status === 'success') {
            enrollBtn.textContent = '✓ Kayıtlısınız';
            enrollBtn.style.backgroundColor = '#10b981';
            enrollBtn.disabled = true;
            showSuccessToast(result.message || 'Kursa başarıyla kaydoldunuz!');
            
            // ✅ BURASI DÜZELTILDI: 2 saniye sonra Learning Room'a git
            setTimeout(() => {
                window.location.href = `/student/learning-room.html?id=${currentCourseId}`;
            }, 2000);
        }
    } catch (error) {
        console.error('[ENROLL ERROR]', error.message);

        if (error.message.includes('Zaten bu kursa kayıtlısınız')) {
            enrollBtn.textContent = '✓ Kayıtlısınız';
            enrollBtn.style.backgroundColor = '#10b981';
            enrollBtn.disabled = true;
            showErrorToast('Zaten bu kursa kayıtlısınız.');
            
            // ✅ BURAYA EKLE: Zaten kayıtlı ise de Learning Room'a git
            setTimeout(() => {
                window.location.href = `/student/learning-room.html?id=${currentCourseId}`;
            }, 1500);
        } else if (error.message.includes('Kurs bulunamadı')) {
            showErrorToast('Kurs bulunamadı veya yayında değildir.');
        } else {
            showErrorToast(`Kayıt işlemi başarısız: ${error.message}`);
            enrollBtn.textContent = originalText;
            enrollBtn.disabled = false;
        }
    }
}

/**
 * Başarı toast mesajı göster
 * @param {string} message - Gösterilecek mesaj
 */
function showSuccessToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = '✓ ' + message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Hata toast mesajı göster
 * @param {string} message - Gösterilecek hata mesajı
 */
function showErrorToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    toast.textContent = '✗ ' + message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Kullanıcı oturum durumunu kontrol eder ve Navbar'ı günceller
 * Bu mantık main.js'den referans alınmıştır
 */
function checkAuth() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');
    const authContainer = document.querySelector('.nav-actions');
    
    if (token && userJson && authContainer) {
        try {
            const user = JSON.parse(userJson);
            
            const dashboardLink = user.rol === 'egitmen' 
                ? '/instructor/dashboard.html' 
                : '/student/dashboard.html';

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
                        ${user.rol === 'ogrenci' ? '<a href="/student/cart.html"><i class="fas fa-shopping-cart" style="width:20px;"></i> Sepetim</a>' : ''}
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
 * Oturumu kapatır
 */
function logout() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) {
        ApiService.logout();
    } else {
        localStorage.clear();
        window.location.reload();
    }
}

// Toast animasyonları için CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);