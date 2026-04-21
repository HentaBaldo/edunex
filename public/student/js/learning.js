/**
 * EduNex - Öğrenim Ekranı (Course Player)
 * Version: 1.0 (Production Ready)
 * 
 * Udemy tarzı video izleme, müfredat yönetimi ve ilerleme takibi
 */

// === GLOBAL VARIABLES ===
let currentCourseData = null;
let currentLessonId = null;
let currentSectionId = null;

/**
 * Sayfa yüklendiğinde çalışan başlangıç fonksiyonu
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[LEARNING] Öğrenim ekranı başlıyor...');

    // 1. Token kontrol et
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        alert('Oturum açmanız gerekiyor.');
        window.location.href = '/auth/index.html';
        return;
    }

    // 2. Kurs ID'sini URL'den al
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');

    if (!courseId) {
        console.error('[LEARNING] Kurs ID boş!');
        alert('Geçersiz kurs ID\'si.');
        window.location.href = '/student/dashboard.html';
        return;
    }

    console.log(`[LEARNING] Kurs ID: ${courseId}`);

    // 3. Kurs verilerini yükle
    await loadCourseData(courseId);

    // 4. İlk dersi yükle (varsa)
    const requestedLessonId = urlParams.get('lesson_id');
    if (requestedLessonId) {
        loadLesson(requestedLessonId);
    } else if (currentCourseData?.currentLesson) {
        loadLesson(currentCourseData.currentLesson.id);
    }
});

/**
 * Kurs verilerini backend'den çek
 * @param {string} courseId - Kurs UUID
 */
async function loadCourseData(courseId) {
    try {
        console.log(`[LEARNING] Kurs verisi çekiliyor: ${courseId}`);

        const response = await ApiService.get(`/courses/${courseId}/learning`);

        if (!response.data) {
            throw new Error('Kurs verisi eksik');
        }

        currentCourseData = response.data;

        console.log(`[LEARNING] Kurs verisi yüklendi:`, currentCourseData);

        // UI'yi güncelle
        updateHeader();
        renderCurriculum();

    } catch (error) {
        console.error('[LEARNING] Kurs verisi çekilemedi:', error.message);
        showError(
            'Kurs verisi yüklenemedi: ' + error.message,
            'lessonInfo'
        );
    }
}

/**
 * Header'ı güncelle
 */
function updateHeader() {
    const { course, enrollment } = currentCourseData;

    // Kurs başlığı
    const courseTitleElement = document.getElementById('courseTitle');
    if (courseTitleElement) {
        courseTitleElement.textContent = course.baslik;
    }

    // İlerleme yüzdesi
    const progressPercent = Math.round(enrollment.ilerleme_yuzdesi);
    const progressPercentElement = document.getElementById('progressPercent');
    if (progressPercentElement) {
        progressPercentElement.textContent = `${progressPercent}%`;
    }
}

/**
 * Müfredatı render et (Accordion)
 */
function renderCurriculum() {
    const curriculumContent = document.getElementById('curriculumContent');
    const { curriculum } = currentCourseData;

    if (!curriculumContent) {
        console.error('[LEARNING] curriculumContent DOM element bulunamadı');
        return;
    }

    if (!curriculum || curriculum.length === 0) {
        curriculumContent.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #94a3b8;">
                <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
                <p>Henüz müfredat eklenmemiş</p>
            </div>
        `;
        return;
    }

    curriculumContent.innerHTML = '';

    curriculum.forEach((section, sectionIndex) => {
        const sectionHtml = `
            <div class="section-accordion">
                <div class="section-header" data-section-id="${section.id}" onclick="toggleSection(this)">
                    <div class="section-title">
                        <i class="fas fa-folder-open"></i>
                        <span>${escapeHtml(section.baslik)}</span>
                        <span style="color: #64748b; font-size: 0.8rem; margin-left: 5px;">
                            (${section.lessons.length})
                        </span>
                    </div>
                    <div class="section-toggle">
                        <i class="fas fa-chevron-down"></i>
                    </div>
                </div>
                <div class="lesson-list" data-section-id="${section.id}">
                    ${renderLessons(section.lessons)}
                </div>
            </div>
        `;

        curriculumContent.insertAdjacentHTML('beforeend', sectionHtml);
    });

    // İlk bölümü aç
    const firstSectionHeader = document.querySelector('.section-header');
    if (firstSectionHeader) {
        toggleSection(firstSectionHeader);
    }
}

/**
 * Bölüm içindeki dersleri render et
 * @param {Array} lessons - Ders array'ı
 * @returns {string} HTML string
 */
function renderLessons(lessons) {
    if (!lessons || lessons.length === 0) {
        return `
            <div style="padding: 12px 15px; color: #64748b; font-size: 0.9rem;">
                <i class="fas fa-inbox" style="margin-right: 5px;"></i>
                Ders yok
            </div>
        `;
    }

    return lessons.map(lesson => {
        const isCompleted = lesson.tamamlandi_mi;
        const isPreview = lesson.onizleme_mi; // ✅ PREVIEW KONTROL
        const durationText = lesson.sure_saniye 
            ? `${Math.floor(lesson.sure_saniye / 60)}m`
            : 'N/A';

        return `
            <div class="lesson-item" data-lesson-id="${lesson.id}" onclick="selectLesson('${lesson.id}')">
                <div class="lesson-name">
                    <i class="fas ${lesson.icerik_tipi === 'video' ? 'fa-play-circle' : 'fa-file-alt'}"></i>
                    <span>${escapeHtml(lesson.baslik)}</span>
                    
                    <!-- ✅ PREVIEW BADGE -->
                    ${isPreview ? '<span style="background: #dbeafe; color: #075985; padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; margin-left: 5px; font-weight: 600;">ÖNİZLEME</span>' : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${isCompleted ? '<i class="fas fa-check-circle lesson-completed"></i>' : ''}
                    <span class="lesson-duration-small">${durationText}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Bölüm açılır/kapanır
 * @param {HTMLElement} headerElement - Tıklanan header
 */
function toggleSection(headerElement) {
    const sectionId = headerElement.getAttribute('data-section-id');
    const lessonList = document.querySelector(`.lesson-list[data-section-id="${sectionId}"]`);

    if (!lessonList) {
        console.error('[LEARNING] Lesson list bulunamadı:', sectionId);
        return;
    }

    // Açık/Kapalı durumu değiştir
    headerElement.classList.toggle('active');
    lessonList.classList.toggle('active');
}

/**
 * Derse tıklanıldığında yükle
 * @param {string} lessonId - Ders UUID
 */
function selectLesson(lessonId) {
    console.log(`[LEARNING] Ders seçildi: ${lessonId}`);

    // Önceki seçimi temizle
    document.querySelectorAll('.lesson-item.active').forEach(el => {
        el.classList.remove('active');
    });

    // Yeni dersi seç
    const selectedLessonElement = document.querySelector(`.lesson-item[data-lesson-id="${lessonId}"]`);
    if (selectedLessonElement) {
        selectedLessonElement.classList.add('active');
    }

    // Dersi yükle
    loadLesson(lessonId);
}

/**
 * Dersi yükle ve video'yu göster
 * @param {string} lessonId - Ders UUID
 */
function loadLesson(lessonId) {
    // Müfredattan dersi bul
    let selectedLesson = null;

    for (const section of currentCourseData.curriculum) {
        const found = section.lessons.find(l => l.id === lessonId);
        if (found) {
            selectedLesson = found;
            currentSectionId = section.id;
            break;
        }
    }

    if (!selectedLesson) {
        console.error(`[LEARNING] Ders bulunamadı: ${lessonId}`);
        return;
    }

    currentLessonId = lessonId;

    console.log(`[LEARNING] Ders yükleniyor: ${selectedLesson.baslik} (tip: ${selectedLesson.icerik_tipi || 'video'})`);

    // İçerik tipine göre uygun render fonksiyonunu çağır
    loadLessonContent(selectedLesson);

    // Ders bilgisini güncelle
    updateLessonInfo(selectedLesson);

    // URL'yi güncelle (back button için)
    const courseId = new URLSearchParams(window.location.search).get('id');
    window.history.replaceState(
        {},
        '',
        `/student/learning-room.html?id=${courseId}&lesson_id=${lessonId}`
    );
}

/**
 * İçerik tipine göre uygun render fonksiyonunu seç
 * @param {Object} lesson - Ders nesnesi
 */
function loadLessonContent(lesson) {
    const tip = (lesson.icerik_tipi || 'video').toLowerCase();

    if (tip === 'quiz') return renderQuizPlaceholder(lesson);
    if (tip === 'video') return loadVideo(lesson);
    // metin, belge, pdf vb. — döküman görüntüleyici
    return loadDocument(lesson);
}

/**
 * Quiz placeholder (quiz sistemi ileride geliştirilecek)
 */
function renderQuizPlaceholder(lesson) {
    const videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer) return;
    const wrapper = videoPlayer.parentElement;
    if (wrapper) wrapper.style.aspectRatio = '';
    videoPlayer.innerHTML = `
        <div class="video-placeholder" style="padding: 40px; text-align: center;">
            <i class="fas fa-clipboard-question" style="font-size: 3rem; color: #f59e0b; margin-bottom: 16px;"></i>
            <h3 style="color:#f1f5f9; margin-bottom: 8px;">${escapeHtml(lesson.baslik || 'Quiz')}</h3>
            <p style="color:#94a3b8;">Quiz/test sistemi yakında eklenecek.</p>
        </div>
    `;
}

/**
 * Döküman görüntüleyici (PDF / resim / indirilebilir dosya / metin)
 */
function loadDocument(lesson) {
    const videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer) return;
    const wrapper = videoPlayer.parentElement;

    const src = lesson.video_saglayici_id || lesson.kaynak_url || '';
    const ext = extractExtension(src);

    // Dosya yok — açıklama metnini göster
    if (!src) {
        if (wrapper) wrapper.style.aspectRatio = '';
        videoPlayer.innerHTML = `
            <div class="video-placeholder" style="padding: 40px; text-align: left; overflow-y: auto;">
                <h3 style="color:#f1f5f9; margin-bottom: 12px;">${escapeHtml(lesson.baslik || '')}</h3>
                ${lesson.aciklama
                    ? `<div style="color:#cbd5e1; line-height:1.6; white-space:pre-wrap;">${escapeHtml(lesson.aciklama)}</div>`
                    : `<p style="color:#94a3b8;"><i class="fas fa-info-circle"></i> Bu ders için içerik eklenmemiş.</p>`
                }
            </div>
        `;
        return;
    }

    // PDF — iframe ile göster
    if (ext === 'pdf') {
        if (wrapper) wrapper.style.aspectRatio = '';
        videoPlayer.innerHTML = `
            <iframe src="${escapeHtml(src)}#toolbar=1"
                style="width:100%; height:75vh; border:0; background:#fff;"
                title="PDF Görüntüleyici"></iframe>
        `;
        return;
    }

    // Resim dosyası
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
        if (wrapper) wrapper.style.aspectRatio = '';
        videoPlayer.innerHTML = `
            <div style="width:100%; min-height:60vh; display:flex; align-items:center; justify-content:center; background:#000; padding:20px;">
                <img src="${escapeHtml(src)}" alt="${escapeHtml(lesson.baslik || '')}"
                    style="max-width:100%; max-height:75vh; object-fit:contain;">
            </div>
        `;
        return;
    }

    // İndirilebilir belge (doc, docx, xlsx, ppt, txt, vb.)
    if (wrapper) wrapper.style.aspectRatio = '';
    videoPlayer.innerHTML = `
        <div class="video-placeholder" style="padding: 40px; text-align: center;">
            <i class="fas fa-file-alt" style="font-size: 3rem; color: #3b82f6; margin-bottom: 16px;"></i>
            <h3 style="color:#f1f5f9; margin-bottom: 8px;">${escapeHtml(lesson.baslik || 'Ders Dosyası')}</h3>
            <p style="color:#94a3b8; margin-bottom: 20px;">Bu içerik tarayıcıda görüntülenemiyor. İndirip açabilirsiniz.</p>
            <a href="${escapeHtml(src)}" target="_blank" download
                style="background:#3b82f6; color:#fff; padding:10px 24px; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:8px;">
                <i class="fas fa-download"></i> Dosyayı İndir
            </a>
        </div>
    `;
}

/**
 * URL/dosya yolundan uzantı çıkar (sorgu stringini atla)
 */
function extractExtension(url) {
    if (!url) return '';
    const clean = String(url).split('?')[0].split('#')[0];
    const idx = clean.lastIndexOf('.');
    if (idx === -1 || idx < clean.lastIndexOf('/')) return '';
    return clean.slice(idx + 1).toLowerCase();
}

/**
 * Video'yu yükle (Bunny.net Stream + HTML5 + YouTube + Vimeo)
 * @param {Object} lesson - Ders nesnesi
 */
function loadVideo(lesson) {
    const videoPlayer = document.getElementById('videoPlayer');

    if (!videoPlayer) {
        console.error('[LEARNING] videoPlayer DOM element bulunamadı');
        return;
    }

    // Video ise 16/9 oranını geri getir
    const wrapper = videoPlayer.parentElement;
    if (wrapper) wrapper.style.aspectRatio = '16 / 9';

    // Video kaynağı kontrol et (video_saglayici_id veya kaynak_url)
    const videoSource = lesson.video_saglayici_id || lesson.kaynak_url;

    if (!videoSource) {
        videoPlayer.innerHTML = `
            <div class="video-placeholder">
                <i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>
                <p>Video kaynağı bulunamadı</p>
            </div>
        `;
        return;
    }

    console.log(`[LEARNING] Video kaynağı: ${videoSource}`);

    // === BUNNY.NET STREAM (UUID) ===
    // Eğer video_saglayici_id UUID formatında ise (49887b68-c7c6-4f49-bd0c-5efcc70bbf30)
    if (isBunnyUUID(videoSource)) {
        const BUNNY_LIBRARY_ID = '640675'; // .env'den BUNNY_LIBRARY_ID
        const bunnyStreamUrl = `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${videoSource}?autoplay=false&loop=false&muted=false&preload=true&responsive=true`;
        
        console.log(`[LEARNING] Bunny.net video yükleniyor: ${bunnyStreamUrl}`);
        
        videoPlayer.innerHTML = `
            <iframe
                src="${bunnyStreamUrl}"
                loading="lazy"
                style="border:0;position:absolute;top:0;height:100%;width:100%;"
                allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
                allowfullscreen="true">
            </iframe>
        `;
        return;
    }

    // === YOUTUBE ===
    if (isYoutubeUrl(videoSource)) {
        const videoId = extractYoutubeId(videoSource);
        videoPlayer.innerHTML = `
            <iframe 
                src="https://www.youtube.com/embed/${videoId}" 
                allowfullscreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                style="width: 100%; height: 100%; border: none;"
            ></iframe>
        `;
        return;
    }

    // === VIMEO ===
    if (isVimeoUrl(videoSource)) {
        const videoId = extractVimeoId(videoSource);
        videoPlayer.innerHTML = `
            <iframe 
                src="https://player.vimeo.com/video/${videoId}" 
                allowfullscreen
                allow="autoplay; fullscreen; picture-in-picture"
                style="width: 100%; height: 100%; border: none;"
            ></iframe>
        `;
        return;
    }

    // === HTML5 VIDEO (MP4 / WebM) ===
    videoPlayer.innerHTML = `
        <video controls style="width: 100%; height: 100%; object-fit: contain;">
            <source src="${escapeHtml(videoSource)}" type="video/mp4">
            Tarayıcınız HTML5 video etiketini desteklemiyor.
        </video>
    `;
}

/**
 * UUID formatını kontrol et (Bunny.net video GUID)
 * Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * @param {string} str - Kontrol edilecek string
 * @returns {boolean}
 */
function isBunnyUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

/**
 * YouTube URL'si kontrol et
 * @param {string} url - URL
 * @returns {boolean}
 */
function isYoutubeUrl(url) {
    return url.includes('youtube.com') || url.includes('youtu.be');
}

/**
 * Vimeo URL'si kontrol et
 * @param {string} url - URL
 * @returns {boolean}
 */
function isVimeoUrl(url) {
    return url.includes('vimeo.com');
}

/**
 * Ders bilgisini güncelle
 * @param {Object} lesson - Ders nesnesi
 */
function updateLessonInfo(lesson) {
    const lessonInfo = document.getElementById('lessonInfo');

    if (!lessonInfo) {
        console.error('[LEARNING] lessonInfo DOM element bulunamadı');
        return;
    }

    const isCompleted = lesson.tamamlandi_mi;
    const durationText = lesson.sure_saniye
        ? `${Math.floor(lesson.sure_saniye / 60)} dakika`
        : 'Belirtilmemiş';

    lessonInfo.innerHTML = `
        <div class="lesson-header">
            <div class="lesson-title">${escapeHtml(lesson.baslik)}</div>
            <div class="lesson-duration">
                <i class="fas fa-clock"></i>
                ${durationText}
            </div>
        </div>
        <div class="lesson-description">
            ${escapeHtml(lesson.aciklama || 'Açıklama bulunmamaktadır.')}
        </div>
        <div class="lesson-actions">
            <button class="btn-mark-complete ${isCompleted ? 'completed' : ''}" onclick="markLessonComplete('${lesson.id}')">
                <i class="fas ${isCompleted ? 'fa-check-circle' : 'fa-play'}"></i>
                ${isCompleted ? 'Tamamlandı' : 'Tamamlandı Olarak İşaretle'}
            </button>
        </div>
    `;
}

/**
 * Dersi tamamlandı olarak işaretle
 * @param {string} lessonId - Ders UUID
 */
async function markLessonComplete(lessonId) {
    try {
        const courseId = new URLSearchParams(window.location.search).get('id');

        console.log(`[LEARNING] Ders tamamlanıyor: ${lessonId}`);

        const response = await ApiService.put(
            `/courses/${courseId}/lessons/${lessonId}/complete`,
            {}
        );

        console.log('[LEARNING] Ders tamamlandı:', response);

        // UI'yi güncelle
        const button = event.target.closest('.btn-mark-complete');
        if (button) {
            button.classList.add('completed');
            button.innerHTML = '<i class="fas fa-check-circle"></i> Tamamlandı';
        }

        // Müfredatta da işaretle
        const lessonItem = document.querySelector(`.lesson-item[data-lesson-id="${lessonId}"]`);
        if (lessonItem) {
            const lessonNameSpan = lessonItem.querySelector('.lesson-name span');
            const durationSpan = lessonItem.querySelector('.lesson-duration-small');
            const durationText = durationSpan ? durationSpan.textContent : '';
            
            lessonItem.innerHTML = `
                <div class="lesson-name">
                    <i class="fas fa-play-circle"></i>
                    <span>${lessonNameSpan ? lessonNameSpan.textContent : 'Ders'}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-check-circle lesson-completed"></i>
                    <span class="lesson-duration-small">${durationText}</span>
                </div>
            `;
        }

        // Başarı mesajı
        showNotification('Ders tamamlandı olarak işaretlendi!', 'success');

    } catch (error) {
        console.error('[LEARNING] Ders tamamlama hatası:', error);
        showNotification(`Hata: ${error.message}`, 'error');
    }
}

/**
 * Yardımcı Fonksiyonlar
 */

/**
 * YouTube URL'si kontrol et
 * @param {string} url - URL
 * @returns {boolean}
 */
function isYoutubeUrl(url) {
    return url.includes('youtube.com') || url.includes('youtu.be');
}

/**
 * Vimeo URL'si kontrol et
 * @param {string} url - URL
 * @returns {boolean}
 */
function isVimeoUrl(url) {
    return url.includes('vimeo.com');
}

/**
 * YouTube video ID'sini çıkar
 * @param {string} url - URL
 * @returns {string}
 */
function extractYoutubeId(url) {
    let videoId = '';
    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    } else {
        videoId = new URLSearchParams(url.split('?')[1]).get('v') || url.split('v=')[1]?.split('&')[0] || '';
    }
    return videoId;
}

/**
 * Vimeo video ID'sini çıkar
 * @param {string} url - URL
 * @returns {string}
 */
function extractVimeoId(url) {
    return url.split('/').pop()?.split('?')[0] || '';
}

/**
 * XSS Koruması - HTML escape
 * @param {string} text - Metin
 * @returns {string}
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Hata mesajı göster
 * @param {string} message - Mesaj
 * @param {string} containerId - Container ID
 */
function showError(message, containerId) {
    const container = document.getElementById(containerId);
    
    if (!container) {
        console.error('[LEARNING] Error container bulunamadı:', containerId);
        return;
    }

    container.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; margin-bottom: 10px;"></i>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

/**
 * Bildirim göster (Toast)
 * @param {string} message - Mesaj
 * @param {string} type - Tip ('success' veya 'error')
 */
function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
        font-weight: 500;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// CSS for toast animations (eğer daha önce eklenmemişse)
if (!document.querySelector('style[data-toast-animations]')) {
    const style = document.createElement('style');
    style.setAttribute('data-toast-animations', 'true');
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
}