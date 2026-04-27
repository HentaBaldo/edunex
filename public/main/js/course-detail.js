/**
 * EduNex - Kurs Detay Mantığı (Course Detail Logic)
 * Version: 2.0 (Enrollment Sistemi Entegre)
 * Oturum yönetimi, Navbar senkronizasyonu ve Kursa Kayıt özelliği eklenmiş versiyon.
 */

let currentCourseId = null;
let currentUserToken = null;
let isEnrolledStudent = false;
let currentUserId = null;

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

    const userJson = localStorage.getItem('edunex_user');
    if (userJson) {
        try {
            currentUserId = JSON.parse(userJson).id;
        } catch(e) {}
    }

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

        renderCurriculum(course.Sections || []);
        loadReviews();
    } catch (error) {
        console.error("[HATA] Kurs detayları çekilemedi:", error.message);
        alert("Kurs detayları yüklenemedi. Ana sayfaya yönlendiriliyorsunuz.");
        window.location.href = '/';
    }
});

/**
 * Kayıtlı öğrenci için enroll check + ilerleme/kilitsiz modu aç.
 */
async function checkEnrollmentStatus(courseId) {
    try {
        const result = await ApiService.get(`/enrollments/${courseId}`);

        if (result.status === 'success' && result.enrolled === true && result.data) {
            isEnrolledStudent = true;
            applyEnrolledMode(courseId, result.data);
        }
    } catch (error) {
        console.warn('[ENROLLMENT CHECK] Hata:', error.message);
    }
}

/**
 * Kayıtlı öğrenci modunu aktifleştir:
 *  - Sepete Ekle / Kaydol butonları gizle, "Öğrenim Ekranına Git" göster
 *  - İlerleme kartını göster (yüzde + bar)
 */
function applyEnrolledMode(courseId, enrollment) {
    const addToCartBtn = document.getElementById('addToCartBtn');
    const enrollBtn = document.getElementById('enrollBtn');
    const goToLearningBtn = document.getElementById('goToLearningBtn');
    

    if (addToCartBtn) addToCartBtn.style.display = 'none';
    if (enrollBtn) enrollBtn.style.display = 'none';
    if (goToLearningBtn) {
        goToLearningBtn.style.display = 'flex';
        goToLearningBtn.style.alignItems = 'center';
        goToLearningBtn.style.justifyContent = 'center';
        goToLearningBtn.style.gap = '8px';
        goToLearningBtn.addEventListener('click', () => {
            window.location.href = `/student/learning-room.html?id=${courseId}`;
        });
    }

    const progressCard = document.getElementById('progressCard');
    if (progressCard) {
        const yuzde = Math.max(0, Math.min(100, Number(enrollment.ilerleme_yuzdesi) || 0));
        progressCard.style.display = 'block';
        document.getElementById('progressPercent').textContent = `${yuzde}%`;
        document.getElementById('progressBar').style.width = `${yuzde}%`;
        const hint = document.getElementById('progressHint');
        if (hint) {
            hint.textContent = yuzde === 0
                ? 'Öğrenime henüz başlamadınız. İlk dersi seçerek başlayabilirsiniz.'
                : yuzde === 100
                    ? 'Tebrikler! Bu kursu tamamladınız.'
                    : 'Kaldığınız yerden devam edebilirsiniz.';
        }
    }

    // Müfredatı kilitsiz, tıklanabilir hale getir
    const curriculumDiv = document.getElementById('curriculumList');
    if (curriculumDiv && curriculumDiv.dataset.sections) {
        try {
            const sections = JSON.parse(curriculumDiv.dataset.sections);
            renderCurriculum(sections);
        } catch (_) {}
    }

    const reviewSection = document.getElementById('leaveReviewSection');
    if (reviewSection) reviewSection.style.display = 'block';
}

/**
 * Müfredatı render et — kayıtlı öğrenciler için tıklanabilir, değilse kilitli preview.
 */
function renderCurriculum(sections) {
    const curriculumDiv = document.getElementById('curriculumList');
    if (!curriculumDiv) return;

    curriculumDiv.dataset.sections = JSON.stringify(sections);

    if (!sections || sections.length === 0) {
        curriculumDiv.innerHTML = '<p class="info-message">Bu kurs için henüz müfredat eklenmemiş.</p>';
        return;
    }

    curriculumDiv.innerHTML = sections.map(section => {
        const lessons = (section.Lessons || []).map(lesson => {
            const icon = iconForLessonType(lesson.icerik_tipi);
            const duration = lesson.sure_saniye ? Math.floor(lesson.sure_saniye / 60) + ' dk' : '';
            const canOpen = isEnrolledStudent || lesson.onizleme_mi;

            const rightIcon = canOpen
                ? (isEnrolledStudent
                    ? '<i class="fas fa-play" style="color:#10b981;" title="Derse Git"></i>'
                    : '<i class="fas fa-eye" style="color:var(--primary-color);" title="Önizleme"></i>')
                : '<i class="fas fa-lock" style="color:#94a3b8;" title="Kilitli"></i>';

            const rowStyle = canOpen ? 'cursor:pointer;' : 'cursor:default; opacity:0.85;';
            const dataAttrs = canOpen
                ? `data-clickable="1" data-lesson-id="${escapeAttr(lesson.id)}"`
                : '';

            return `
                <div class="lesson-row" ${dataAttrs} style="${rowStyle}">
                    <div class="lesson-left">
                        <i class="fas ${icon} lesson-icon"></i>
                        <span class="lesson-name">${escapeHtml(lesson.baslik || '')}</span>
                    </div>
                    <div class="lesson-right">
                        <span class="lesson-time">${duration}</span>
                        <span class="lesson-lock">${rightIcon}</span>
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="curriculum-section">
                <header class="section-title-box">
                    <strong><i class="fas fa-folder-open"></i> ${escapeHtml(section.baslik || '')}</strong>
                </header>
                <div class="section-lessons">${lessons}</div>
            </div>`;
    }).join('');

    // Tıklanabilir satırlara listener ekle
    curriculumDiv.querySelectorAll('[data-clickable="1"]').forEach(row => {
        row.addEventListener('click', () => {
            const lessonId = row.dataset.lessonId;
            if (!lessonId) return;
            window.location.href = `/student/learning-room.html?id=${currentCourseId}&lesson_id=${lessonId}`;
        });
    });
}

function iconForLessonType(tip) {
    switch ((tip || 'video').toLowerCase()) {
        case 'video': return 'fa-play-circle';
        case 'quiz': return 'fa-clipboard-question';
        case 'metin': return 'fa-file-lines';
        default: return 'fa-file-alt';
    }
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function escapeAttr(text) {
    return String(text).replace(/"/g, '&quot;');
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

            const isStudent = user.rol === 'ogrenci';
            const cartIconHtml = isStudent ? `
                <a href="/student/cart.html" class="nav-cart-link" title="Sepetim" style="position:relative;display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;color:#0f172a;text-decoration:none;margin-right:8px;">
                    <i class="fas fa-shopping-cart" style="font-size:1.15rem;"></i>
                    <span id="cartCountBadge" style="display:none;position:absolute;top:2px;right:2px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;background:#ef4444;color:#fff;font-size:0.7rem;font-weight:700;line-height:18px;text-align:center;"></span>
                </a>
            ` : '';

            authContainer.innerHTML = `
                ${cartIconHtml}
                <div class="user-dropdown">
                    <button class="dropdown-trigger">
                        <i class="fas fa-user-circle" style="font-size: 1.2rem;"></i>
                        ${user.ad}
                        <i class="fas fa-chevron-down" style="font-size: 0.8rem; margin-left: 5px;"></i>
                    </button>

                    <div class="dropdown-content">
                        <a href="/profile/index.html"><i class="fas fa-id-badge" style="width:20px;"></i> Profil</a>
                        <a href="${dashboardLink}"><i class="fas fa-columns" style="width:20px;"></i> Panelim</a>
                        ${isStudent ? '<a href="/student/cart.html"><i class="fas fa-shopping-cart" style="width:20px;"></i> Sepetim</a><a href="/student/orders.html"><i class="fas fa-receipt" style="width:20px;"></i> Siparişlerim</a>' : ''}
                        <hr>
                        <button onclick="logout()" class="text-danger">
                            <i class="fas fa-sign-out-alt" style="width:20px;"></i> Çıkış Yap
                        </button>
                    </div>
                </div>
            `;

            if (isStudent) {
                (async () => {
                    try {
                        const r = await ApiService.get('/cart');
                        const c = r?.data?.kalem_sayisi || 0;
                        const b = document.getElementById('cartCountBadge');
                        if (b && c > 0) { b.textContent = c > 99 ? '99+' : c; b.style.display = 'inline-block'; }
                    } catch (_) {}
                })();
            }
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

let selectedRating = 0;
let reviewsCurrentPage = 1;

/**
 * Kurs yorumlarını backendden çeker ve listeler (sayfalama destekli)
 */
async function loadReviews(page = 1) {
    const reviewsList = document.getElementById('reviewsList');
    if (!reviewsList || !currentCourseId) return;

    reviewsCurrentPage = page;

    try {
        const result = await ApiService.get(`/reviews/course/${currentCourseId}?page=${page}&limit=10`);
        const { ortalama_puan, toplam_degerlendirme, pagination, data: reviews } = result;

        // Özet kutusu
        const avgText  = document.getElementById('avgRatingText');
        const totalText = document.getElementById('totalReviewsText');
        const starBox  = document.getElementById('avgRatingStars');
        if (avgText)   avgText.textContent  = ortalama_puan || '0.0';
        if (totalText) totalText.textContent = `${toplam_degerlendirme} değerlendirme`;
        if (starBox)   starBox.innerHTML    = renderStars(ortalama_puan || 0);

        // Kullanıcının kendi yorumunu bul (sadece ilk sayfada arama yapar —
        // kendi yorumunu formu doldurmak için tam liste gerekiyor değil,
        // backend DESC sıralar, en yeni ilk gelir, 10'da bulunamayabilir;
        // bu yüzden ayrı GET ile de alabiliriz, ama mevcut yapıda sayfa 1
        // yeterli çünkü ogrenci_id eşleşmesi bozulmaz)
        if (currentUserId && reviews && reviews.length > 0 && page === 1) {
            const myReview = reviews.find(r => r.ogrenci_id === currentUserId);
            if (myReview) {
                selectedRating = myReview.puan;
                updateStarUI(selectedRating);
                const textInput = document.getElementById('reviewText');
                if (textInput) textInput.value = myReview.yorum || '';
                const btn = document.getElementById('submitReviewBtn');
                if (btn) btn.textContent = 'Yorumu Güncelle';
                const sectionTitle = document.querySelector('#leaveReviewSection h4');
                if (sectionTitle) sectionTitle.innerHTML = '<i class="fas fa-edit" style="color:#2563eb;"></i> Mevcut Değerlendirmenizi Güncelleyin';
            }
        }

        if (!reviews || reviews.length === 0) {
            reviewsList.innerHTML = '<p style="color:#64748b;margin-top:10px;">Henüz yorum yapılmamış. İlk yorumu siz yapın!</p>';
            renderPagination(pagination);
            return;
        }

        reviewsList.innerHTML = reviews.map(r => {
            const isOwn = currentUserId && r.ogrenci_id === currentUserId;
            const deleteBtn = isOwn
                ? `<button onclick="deleteOwnReview()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:0.82rem;padding:0;"><i class="fas fa-trash-alt"></i> Yorumu Sil</button>`
                : '';
            return `
            <div class="review-item" style="border-bottom:1px solid #f1f5f9;padding:20px 0;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-user-circle" style="font-size:1.5rem;color:#cbd5e1;"></i>
                        <strong>${escapeHtml(r.StudentDetail?.Profile?.ad)} ${escapeHtml(r.StudentDetail?.Profile?.soyad)}</strong>
                    </div>
                    <div style="color:#fbbf24;">${renderStars(r.puan)}</div>
                </div>
                <p style="margin:10px 0 5px 0;color:#475569;line-height:1.5;">${escapeHtml(r.yorum || '')}</p>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <small style="color:#94a3b8;"><i class="far fa-calendar-alt"></i> ${new Date(r.olusturulma_tarihi).toLocaleDateString('tr-TR')}</small>
                    ${deleteBtn}
                </div>
            </div>`;
        }).join('');

        renderPagination(pagination);

    } catch (error) {
        console.error('Yorumlar yüklenemedi:', error);
    }
}

function renderPagination(pagination) {
    const container = document.getElementById('reviewsPagination');
    if (!container || !pagination) return;

    if (pagination.total_pages <= 1) {
        container.innerHTML = '';
        return;
    }

    const { page, total_pages } = pagination;
    container.innerHTML = `
        <div style="display:flex;justify-content:center;align-items:center;gap:12px;margin-top:20px;">
            <button onclick="loadReviews(${page - 1})"
                style="padding:6px 14px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;${page <= 1 ? 'opacity:0.4;pointer-events:none;' : ''}"
                ${page <= 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i> Önceki
            </button>
            <span style="color:#64748b;font-size:0.9rem;">${page} / ${total_pages}</span>
            <button onclick="loadReviews(${page + 1})"
                style="padding:6px 14px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;cursor:pointer;${page >= total_pages ? 'opacity:0.4;pointer-events:none;' : ''}"
                ${page >= total_pages ? 'disabled' : ''}>
                Sonraki <i class="fas fa-chevron-right"></i>
            </button>
        </div>`;
}

async function deleteOwnReview() {
    if (!confirm('Yorumunuzu silmek istediğinizden emin misiniz?')) return;
    try {
        await ApiService.delete(`/reviews/${currentCourseId}`);
        showSuccessToast('Yorumunuz silindi.');
        selectedRating = 0;
        updateStarUI(0);
        const textInput = document.getElementById('reviewText');
        if (textInput) textInput.value = '';
        const btn = document.getElementById('submitReviewBtn');
        if (btn) btn.textContent = 'Yorumu Gönder';
        const sectionTitle = document.querySelector('#leaveReviewSection h4');
        if (sectionTitle) sectionTitle.innerHTML = 'Kursu Değerlendirin';
        loadReviews(1);
    } catch (error) {
        showErrorToast('Yorum silinemedi: ' + error.message);
    }
}

// Yıldız seçimi ve yorum gönderme listener'ları
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.star-rating-input i').forEach(star => {
        star.addEventListener('click', (e) => {
            selectedRating = parseInt(e.target.dataset.value);
            updateStarUI(selectedRating);
        });
    });

    document.getElementById('submitReviewBtn')?.addEventListener('click', async () => {
        const yorum = document.getElementById('reviewText').value;
        if (selectedRating === 0) return alert('Lütfen bir puan seçin!');

        const btn = document.getElementById('submitReviewBtn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Gönderiliyor...';

        try {
            const res = await ApiService.post('/reviews', {
                kurs_id: currentCourseId,
                puan: selectedRating,
                yorum
            });
            if (res.success) {
                showSuccessToast(res.message || 'Yorumunuz iletildi!');
                loadReviews(1);
            }
        } catch (error) {
            showErrorToast('Hata: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
});
/**
 * Sayısal puanı (örn: 4.5) görsel yıldız ikonlarına çevirir
 */
function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(rating)) {
            stars += '<i class="fas fa-star"></i>'; // Tam yıldız
        } else if (i - 0.5 <= rating) {
            stars += '<i class="fas fa-star-half-alt"></i>'; // Yarım yıldız
        } else {
            stars += '<i class="far fa-star"></i>'; // Boş yıldız
        }
    }
    return stars;
}

/**
 * Puanlama formundaki yıldızların görsel durumunu günceller
 * @param {number} rating - Seçilen puan
 */
function updateStarUI(rating) {
    document.querySelectorAll('.star-rating-input i').forEach(s => {
        const val = parseInt(s.dataset.value);
        const isSelected = val <= rating;
        
        // Klasları değiştir (fas: dolu yıldız, far: boş yıldız)
        s.classList.toggle('fas', isSelected);
        s.classList.toggle('far', !isSelected);
        
        // Rengi ayarla
        s.style.color = isSelected ? '#fbbf24' : '#cbd5e1';
    });
}