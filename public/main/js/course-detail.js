/**
 * EduNex - Kurs Detay Mantığı (Course Detail Logic)
 * Version: 2.0 (Enrollment Sistemi Entegre)
 * Oturum yönetimi, Navbar senkronizasyonu ve Kursa Kayıt özelliği eklenmiş versiyon.
 */

let currentCourseId = null;
let currentUserToken = null;
let isEnrolledStudent = false;
let currentUserId = null;
let bunnyLibraryId = null;
let previewLessonsMap = {};

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
        document.getElementById('courseInstructor').innerHTML = `<i class="fas fa-chalkboard-teacher"></i> Eğitmen: ${escapeHtml(course.Egitmen?.ad)} ${escapeHtml(course.Egitmen?.soyad)}`;
        document.getElementById('coursePrice').innerText = course.fiyat > 0 ? `${course.fiyat} ₺` : 'Ücretsiz';

        // Açıklama (HTML destekli — eğitmen kontrolündeki içerik)
        const descEl = document.getElementById('courseDescription');
        if (descEl && course.aciklama) descEl.innerHTML = course.aciklama;

        // Puan özeti (header — tek aggregate sorgudan geliyor)
        const headerRatingEl = document.getElementById('headerRating');
        if (headerRatingEl && course.istatistikler?.toplam_yorum > 0) {
            const { ortalama_puan, toplam_yorum } = course.istatistikler;
            headerRatingEl.innerHTML = `
                <span>${renderStars(ortalama_puan)}</span>
                <strong class="hr-score">${ortalama_puan}</strong>
                <span class="hr-count">(${toplam_yorum} değerlendirme)</span>`;
        }

        // BunnyCDN library ID
        bunnyLibraryId = course.bunny_library_id || null;

        // Eğitmen Kartı
        renderInstructorCard(course.Egitmen, course.InstructorDetail);

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
 * Müfredatı render et — kayıtlı öğrenciler için tıklanabilir, değilse önizleme/kilitli.
 */
function renderCurriculum(sections) {
    const curriculumDiv = document.getElementById('curriculumList');
    if (!curriculumDiv) return;

    curriculumDiv.dataset.sections = JSON.stringify(sections);
    previewLessonsMap = {};

    if (!sections || sections.length === 0) {
        curriculumDiv.innerHTML = '<p class="info-message">Bu kurs için henüz müfredat eklenmemiş.</p>';
        return;
    }

    curriculumDiv.innerHTML = sections.map(section => {
        const lessons = (section.Lessons || []).map(lesson => {
            const icon = iconForLessonType(lesson.icerik_tipi);
            const duration = lesson.sure_saniye ? formatDuration(lesson.sure_saniye) : '';
            const isPreviewOnly = !isEnrolledStudent && lesson.onizleme_mi;
            const canOpen = isEnrolledStudent || lesson.onizleme_mi;

            if (isPreviewOnly) previewLessonsMap[lesson.id] = lesson;

            const desc = lesson.aciklama
                ? `<span class="lesson-desc">${escapeHtml(lesson.aciklama.length > 80 ? lesson.aciklama.substring(0, 80) + '…' : lesson.aciklama)}</span>`
                : '';
            const badge = lesson.icerik_tipi
                ? `<span class="content-badge badge-${escapeAttr(lesson.icerik_tipi)}">${escapeHtml(contentTypeLabel(lesson.icerik_tipi))}</span>`
                : '';

            let rightAction;
            if (isEnrolledStudent && canOpen) {
                rightAction = '<i class="fas fa-play enrolled-icon" title="Derse Git"></i>';
            } else if (isPreviewOnly) {
                rightAction = '<button class="preview-btn" tabindex="-1"><i class="fas fa-eye"></i> Önizleme</button>';
            } else {
                rightAction = '<i class="fas fa-lock lock-icon" title="Kilitli"></i>';
            }

            const rowClass = `lesson-row${isEnrolledStudent && canOpen ? ' lesson-clickable' : isPreviewOnly ? ' lesson-preview-open' : ''}`;
            const dataAttrs = isEnrolledStudent && canOpen
                ? `data-clickable="1" data-lesson-id="${escapeAttr(lesson.id)}"`
                : isPreviewOnly
                    ? `data-preview="1" data-lesson-id="${escapeAttr(lesson.id)}"`
                    : '';

            return `
                <div class="${rowClass}" ${dataAttrs}>
                    <div class="lesson-left">
                        <i class="fas ${icon} lesson-icon"></i>
                        <div class="lesson-info">
                            <span class="lesson-name">${escapeHtml(lesson.baslik || '')}</span>
                            ${desc}
                        </div>
                    </div>
                    <div class="lesson-right">
                        ${badge}
                        <span class="lesson-time">${duration}</span>
                        ${rightAction}
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

    // Kayıtlı öğrenci: öğrenim ekranına git
    curriculumDiv.querySelectorAll('[data-clickable="1"]').forEach(row => {
        row.addEventListener('click', () => {
            window.location.href = `/student/learning-room.html?id=${currentCourseId}&lesson_id=${row.dataset.lessonId}`;
        });
    });

    // Önizleme: modal aç
    curriculumDiv.querySelectorAll('[data-preview="1"]').forEach(row => {
        row.addEventListener('click', () => openPreviewModal(row.dataset.lessonId));
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

function contentTypeLabel(tip) {
    const labels = { video: 'Video', metin: 'Metin', quiz: 'Quiz', belge: 'Belge' };
    return labels[(tip || '').toLowerCase()] || tip;
}

function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${m} dk`;
}

/**
 * Eğitmen kartını render edip instructor-section'ı görünür yapar.
 */
function renderInstructorCard(egitmen, detail) {
    if (!egitmen) return;
    const section = document.getElementById('instructorSection');
    const card = document.getElementById('instructorCard');
    if (!section || !card) return;

    const avatarInner = egitmen.profil_fotografi
        ? `<img src="${escapeAttr(egitmen.profil_fotografi)}" alt="${escapeAttr(egitmen.ad)}">`
        : '<i class="fas fa-user"></i>';

    const unvanHtml = detail?.unvan
        ? `<p class="instructor-title-text">${escapeHtml(detail.unvan)}</p>`
        : '';
    const bioRaw = detail?.biyografi || '';
    const bioHtml = bioRaw
        ? `<p class="instructor-bio">${escapeHtml(bioRaw.length > 220 ? bioRaw.substring(0, 220) + '…' : bioRaw)}</p>`
        : '';

    card.innerHTML = `
        <div class="instructor-card-inner" role="link" tabindex="0"
             onclick="window.location.href='/main/instructor/detail.html?id=${escapeAttr(egitmen.id)}'"
             onkeydown="if(event.key==='Enter') window.location.href='/main/instructor/detail.html?id=${escapeAttr(egitmen.id)}'">
            <div class="instructor-avatar">${avatarInner}</div>
            <div class="instructor-card-info">
                <h4 class="instructor-name">${escapeHtml(egitmen.ad)} ${escapeHtml(egitmen.soyad)}</h4>
                ${unvanHtml}
                ${bioHtml}
                <span class="instructor-link-hint"><i class="fas fa-external-link-alt"></i> Tüm kursları ve biyografiyi gör</span>
            </div>
        </div>`;

    section.style.display = 'block';
}

/**
 * Önizleme modalını açar.
 * learning.js ile aynı kaynak-tipi hiyerarşisi kullanılır:
 *   kaynak1 (video_saglayici_id) UUID ise → Bunny, değilse → document
 *   kaynak2 (kaynak_url)         YouTube/Vimeo URL ise → ilgili player
 * Bunny iframe'i yalnızca gerçek UUID için çağrılır; YouTube/document durumunda hiç çağrılmaz.
 */
function openPreviewModal(lessonId) {
    const lesson = previewLessonsMap[lessonId];
    if (!lesson) return;

    document.getElementById('previewModalTitle').textContent = lesson.baslik;
    const player = document.getElementById('previewPlayerContainer');

    const kaynak1 = lesson.video_saglayici_id || null;
    const kaynak2 = lesson.kaynak_url || null;

    let mainMedia = 'none';
    if (kaynak1 && isBunnyUUID(kaynak1)) {
        mainMedia = 'bunny';
    } else if (kaynak2 && isYoutubeUrl(kaynak2)) {
        mainMedia = 'youtube';
    } else if (kaynak2 && isVimeoUrl(kaynak2)) {
        mainMedia = 'vimeo';
    } else if (kaynak1 && !isBunnyUUID(kaynak1)) {
        mainMedia = 'document';
    }

    let html = `<div style="width:100%;display:flex;flex-direction:column;background:#000;overflow-y:auto;">`;

    if (mainMedia === 'bunny') {
        html += `
            <div style="position:relative;flex-grow:1;min-height:300px;display:flex;">
                <iframe
                    src="https://iframe.mediadelivery.net/embed/${escapeHtml(bunnyLibraryId)}/${escapeHtml(kaynak1)}?autoplay=true&responsive=true"
                    allowfullscreen
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                    style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;">
                </iframe>
            </div>`;

    } else if (mainMedia === 'youtube') {
        const ytId = extractYoutubeId(kaynak2);
        html += `
            <div style="padding:10px 15px;background:#0f172a;text-align:right;flex-shrink:0;border-bottom:1px solid #1e293b;">
                <a href="https://www.youtube.com/watch?v=${encodeURIComponent(ytId)}" target="_blank" rel="noopener noreferrer"
                   style="background:#ef4444;color:white;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:0.85rem;font-weight:600;display:inline-flex;align-items:center;gap:6px;">
                    <i class="fab fa-youtube"></i> Oynatıcı Hata Verirse Doğrudan Aç
                </a>
            </div>
            <div style="position:relative;flex-grow:1;min-height:300px;display:flex;">
                <iframe
                    src="https://www.youtube.com/embed/${escapeHtml(ytId)}"
                    title="YouTube video player"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerpolicy="strict-origin-when-cross-origin"
                    allowfullscreen
                    style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;">
                </iframe>
            </div>`;

    } else if (mainMedia === 'vimeo') {
        const vimeoId = extractVimeoId(kaynak2);
        html += `
            <div style="position:relative;flex-grow:1;min-height:300px;display:flex;">
                <iframe src="https://player.vimeo.com/video/${escapeHtml(vimeoId)}" allowfullscreen
                    style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;">
                </iframe>
            </div>`;

    } else if (mainMedia === 'document') {
        const ext = extractExtension(kaynak1);
        if (ext === 'pdf') {
            html += `<iframe src="${escapeHtml(kaynak1)}#toolbar=1"
                        style="width:100%;height:60vh;border:0;background:#fff;flex-shrink:0;"></iframe>`;
        } else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
            html += `
                <div style="display:flex;justify-content:center;align-items:center;min-height:300px;background:#000;padding:20px;">
                    <img src="${escapeHtml(kaynak1)}" style="max-width:100%;max-height:70vh;object-fit:contain;">
                </div>`;
        } else {
            const fileName = decodeURIComponent(kaynak1.split('/').pop().split('?')[0]) || 'belge';
            html += `
                <div style="display:flex;justify-content:center;align-items:center;min-height:300px;background:#1e293b;flex-direction:column;gap:16px;padding:40px;text-align:center;">
                    <i class="fas fa-file-alt" style="font-size:3.5rem;color:#3b82f6;"></i>
                    <p style="font-size:1rem;color:#cbd5e1;margin:0;">${escapeHtml(fileName)}</p>
                    <p style="font-size:0.85rem;color:#94a3b8;margin:0;">Bu belge türü tarayıcıda önizlenemiyor.</p>
                    <a href="${escapeHtml(kaynak1)}" target="_blank" rel="noopener noreferrer"
                       style="background:#3b82f6;padding:10px 24px;border-radius:6px;color:white;text-decoration:none;font-weight:600;">
                        <i class="fas fa-download"></i> Dosyayı İndir
                    </a>
                </div>`;
        }

    } else {
        html += `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:250px;gap:12px;color:#94a3b8;padding:40px;text-align:center;">
                <i class="fas fa-video-slash" style="font-size:2.8rem;"></i>
                <p style="margin:0;">Bu ders için önizleme içeriği mevcut değil.</p>
            </div>`;
    }

    html += `</div>`;
    player.innerHTML = html;

    const modal = document.getElementById('previewModal');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

/**
 * Önizleme modalını kapatır ve videoyu durdurur.
 */
function closePreviewModal() {
    const modal = document.getElementById('previewModal');
    modal.style.display = 'none';
    document.getElementById('previewPlayerContainer').innerHTML = '';
    document.body.style.overflow = '';
}

// ESC tuşuyla modal kapatma
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePreviewModal();
});

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function escapeAttr(text) {
    return String(text).replace(/"/g, '&quot;');
}

// --- Medya Tipi Yardımcıları (learning.js ile aynı mantık) ---
function isBunnyUUID(str) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
function isYoutubeUrl(url) {
    return url.includes('youtube.com') || url.includes('youtu.be');
}
function isVimeoUrl(url) {
    return url.includes('vimeo.com');
}
function extractYoutubeId(url) {
    if (url.includes('youtu.be/')) return url.split('youtu.be/')[1]?.split('?')[0] || '';
    return new URLSearchParams(url.split('?')[1]).get('v') || url.split('v=')[1]?.split('&')[0] || '';
}
function extractVimeoId(url) {
    return url.split('/').pop()?.split('?')[0] || '';
}
function extractExtension(url) {
    if (!url) return '';
    const clean = String(url).split('?')[0].split('#')[0];
    const idx = clean.lastIndexOf('.');
    if (idx === -1 || idx < clean.lastIndexOf('/')) return '';
    return clean.slice(idx + 1).toLowerCase();
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