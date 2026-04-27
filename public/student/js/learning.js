/**
 * EduNex - Öğrenim Ekranı (Course Player)
 * Version: 2.1 (Full Uncut Version + Tam Hibrit Destek)
 * * Udemy tarzı video izleme, müfredat yönetimi ve ilerleme takibi
 */

// === GLOBAL VARIABLES ===
let currentCourseData = null;
let currentLessonId = null;
let currentSectionId = null;
let bunnyLibraryId = '640675';
let playerInitTimeout = null;

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
        if (response.data.bunny_library_id) {
            bunnyLibraryId = response.data.bunny_library_id;
        }

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
        const isPreview = lesson.onizleme_mi;
        const durationText = lesson.sure_saniye 
            ? `${Math.floor(lesson.sure_saniye / 60)}m`
            : 'N/A';

        return `
            <div class="lesson-item" data-lesson-id="${lesson.id}" onclick="selectLesson('${lesson.id}')">
                <div class="lesson-name">
                    <i class="fas ${lesson.icerik_tipi === 'video' ? 'fa-play-circle' : 'fa-file-alt'}"></i>
                    <span>${escapeHtml(lesson.baslik)}</span>
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
 */
function toggleSection(headerElement) {
    const sectionId = headerElement.getAttribute('data-section-id');
    const lessonList = document.querySelector(`.lesson-list[data-section-id="${sectionId}"]`);

    if (!lessonList) {
        console.error('[LEARNING] Lesson list bulunamadı:', sectionId);
        return;
    }

    headerElement.classList.toggle('active');
    lessonList.classList.toggle('active');
}

/**
 * Derse tıklanıldığında yükle
 */
function selectLesson(lessonId) {
    console.log(`[LEARNING] Ders seçildi: ${lessonId}`);

    document.querySelectorAll('.lesson-item.active').forEach(el => {
        el.classList.remove('active');
    });

    const selectedLessonElement = document.querySelector(`.lesson-item[data-lesson-id="${lessonId}"]`);
    if (selectedLessonElement) {
        selectedLessonElement.classList.add('active');
    }

    loadLesson(lessonId);
}

/**
 * Dersi yükle ve video'yu göster
 */
function loadLesson(lessonId) {
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

    loadLessonContent(selectedLesson);
    updateLessonInfo(selectedLesson);

    const courseId = new URLSearchParams(window.location.search).get('id');
    window.history.replaceState(
        {},
        '',
        `/student/learning-room.html?id=${courseId}&lesson_id=${lessonId}`
    );
}

/**
 * URL/dosya yolundan uzantı çıkar
 */
function extractExtension(url) {
    if (!url) return '';
    const clean = String(url).split('?')[0].split('#')[0];
    const idx = clean.lastIndexOf('.');
    if (idx === -1 || idx < clean.lastIndexOf('/')) return '';
    return clean.slice(idx + 1).toLowerCase();
}

/**
 * İçerik tipine göre uygun render fonksiyonunu seç (Akıllı Hibrit Yapı)
 */
function loadLessonContent(lesson) {
    const videoPlayer = document.getElementById('videoPlayer');
    if (!videoPlayer) return;

    // CSS oranlarını iptal ediyoruz ki belge veya butonlar rahat sığsın
    videoPlayer.style.aspectRatio = 'auto'; 
    
    const kaynak1 = lesson.video_saglayici_id; // Uploaded Bunny Video or Document Path
    const kaynak2 = lesson.kaynak_url;         // External YouTube/Vimeo Link
    const tip = (lesson.icerik_tipi || 'video').toLowerCase();

    let htmlContent = `<div style="width: 100%; height: 100%; display: flex; flex-direction: column; background: #000; overflow-y: auto;">`;
    
    let mainMedia = 'none';

    // 1. Ana Sahnede Ne Oynayacağını Belirle (Hiyerarşi)
    if (kaynak1 && isBunnyUUID(kaynak1)) {
        mainMedia = 'bunny';
    } else if (kaynak2 && isYoutubeUrl(kaynak2)) {
        mainMedia = 'youtube';
    } else if (kaynak2 && isVimeoUrl(kaynak2)) {
        mainMedia = 'vimeo';
    } else if (kaynak1 && !isBunnyUUID(kaynak1)) {
        mainMedia = 'document';
    }

    // 2. Ana Sahneyi Çiz
    // learning.js içindeki loadLessonContent fonksiyonunun ilgili kısmı
        if (mainMedia === 'bunny') {
            const videoId = kaynak1;
            // controls=false → Bunny kendi seek bar ve butonlarını gizler
            // Kullanıcı yalnızca bizim custom player UI ile etkileşime girer
            htmlContent += `
                <div style="position: relative; flex-grow: 1; min-height: 400px; display: flex;">
                    <iframe 
                        id="bunnyIframe" 
                        src="https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${videoId}?autoplay=false&api=true" 
                        allowfullscreen 
                        allow="autoplay; fullscreen"
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;">
                    </iframe>
                </div>`;
        } else if (mainMedia === 'youtube') {
        const ytId = extractYoutubeId(kaynak2);
        const directLink = `https://www.youtube.com/watch?v=${ytId}`;
        htmlContent += `
            <div style="padding: 10px 15px; background: #0f172a; text-align: right; flex-shrink: 0; border-bottom: 1px solid #1e293b;">
                <a href="${directLink}" target="_blank" style="background: #ef4444; color: white; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s;">
                    <i class="fab fa-youtube"></i> Oynatıcı Hata Verirse Doğrudan Aç
                </a>
            </div>
            <div style="position: relative; flex-grow: 1; min-height: 400px; display: flex;">
                <iframe 
                    src="https://www.youtube.com/embed/${ytId}" 
                    title="YouTube video player" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                    referrerpolicy="strict-origin-when-cross-origin" 
                    allowfullscreen 
                    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;">
                </iframe>
            </div>`;
    } else if (mainMedia === 'vimeo') {
        const vimeoId = extractVimeoId(kaynak2);
        htmlContent += `
            <div style="position: relative; flex-grow: 1; min-height: 400px; display: flex;">
                <iframe src="https://player.vimeo.com/video/${vimeoId}" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"></iframe>
            </div>`;
    } else if (mainMedia === 'document') {
        const ext = extractExtension(kaynak1);
        if (ext === 'pdf') {
            htmlContent += `<iframe src="${escapeHtml(kaynak1)}#toolbar=1" style="width:100%; height:75vh; border:0; background:#fff; flex-shrink: 0;"></iframe>`;
        } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
            htmlContent += `<div style="display:flex; justify-content:center; align-items:center; min-height:60vh; background:#000; padding:20px;"><img src="${escapeHtml(kaynak1)}" style="max-width:100%; max-height:75vh; object-fit:contain;"></div>`;
        } else {
            // İndirilebilir belge formatları (docx, pptx, rar)
            htmlContent += `
                <div style="display:flex; justify-content:center; align-items:center; min-height:400px; background:#000; color:white; flex-direction:column; gap:15px;">
                    <i class="fas fa-file-alt" style="font-size:3.5rem; color:#3b82f6;"></i>
                    <p style="font-size:1.1rem; color:#cbd5e1;">Bu belge türü tarayıcıda önizlenemiyor.</p>
                    <a href="${escapeHtml(kaynak1)}" target="_blank" style="background:#3b82f6; padding:10px 24px; border-radius:6px; color:white; text-decoration:none; font-weight:600;"><i class="fas fa-download"></i> Dosyayı İndir</a>
                </div>`;
        }
    } else {
        htmlContent += `
            <div style="padding: 40px; text-align: center; margin: auto;">
                <i class="fas fa-inbox" style="font-size: 3rem; color: #64748b; margin-bottom: 16px;"></i>
                <h3 style="color:#f1f5f9;">İçerik Bulunamadı</h3>
                <p style="color:#94a3b8;">Bu ders için medya veya belge eklenmemiş.</p>
            </div>
        `;
    }

    // 3. Alt Eylem Barı (Ana ekrana çıkamayan veya ek olan tüm veriler buraya dizilecek)
    let extraButtons = '';
    
    // Eğer ana sahnede Bunny Video varsa ve YT linki de varsa:
    if (mainMedia === 'bunny' && kaynak2 && (isYoutubeUrl(kaynak2) || isVimeoUrl(kaynak2))) {
        extraButtons += `<button onclick="window.open('${escapeHtml(kaynak2)}', '_blank')" style="background: #ef4444; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;"><i class="fab fa-youtube"></i> Harici Videoyu İzle</button>`;
    }
    
    // Eğer ana sahnede YouTube varsa ve sistemde yüklü bir Bunny videosu da varsa:
    if ((mainMedia === 'youtube' || mainMedia === 'vimeo') && kaynak1 && isBunnyUUID(kaynak1)) {
        const BUNNY_LIBRARY_ID = '640675';
        const bunnyUrl = `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${kaynak1}`;
        extraButtons += `<button onclick="window.open('${bunnyUrl}', '_blank')" style="background: #3b82f6; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;"><i class="fas fa-play"></i> Yüklü Videoyu İzle</button>`;
    }

    // Eğer ana sahnede Herhangi bir Video varsa ve sisteme bir belge yüklendiyse (PDF vb.)
    if (mainMedia !== 'document' && kaynak1 && !isBunnyUUID(kaynak1)) {
        extraButtons += `<button onclick="window.open('${escapeHtml(kaynak1)}', '_blank')" style="background: #10b981; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;"><i class="fas fa-file-download"></i> Ders Belgesini Aç/İndir</button>`;
    }

    // Normal düz bir web sitesi linkiyse
    if (kaynak2 && !isYoutubeUrl(kaynak2) && !isVimeoUrl(kaynak2)) {
         extraButtons += `<button onclick="window.open('${escapeHtml(kaynak2)}', '_blank')" style="background: #8b5cf6; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;"><i class="fas fa-external-link-alt"></i> Ek Kaynağa Git</button>`;
    }

    if (extraButtons || lesson.aciklama || tip === 'quiz') {
        htmlContent += `
            <div style="padding: 20px; background: #1e293b; border-top: 1px solid #334155; flex-shrink: 0;">
                ${tip === 'quiz' ? `<div style="color: #f59e0b; margin-bottom: 15px; font-weight: bold;"><i class="fas fa-clipboard-list"></i> Bu bir Quiz bölümüdür.</div>` : ''}
                ${extraButtons ? `<div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">${extraButtons}</div>` : ''}
                ${lesson.aciklama ? `<div style="color: #cbd5e1; line-height: 1.6; font-size: 0.95rem; white-space: pre-wrap;">${escapeHtml(lesson.aciklama)}</div>` : ''}
            </div>
        `;
    }

    htmlContent += `</div>`;
    videoPlayer.innerHTML = htmlContent;

    // iframe DOM'a eklendi ama Bunny'nin iç player'ı henüz hazır değil.
    // 300ms bekleyerek player.js'in iframe ile握手yapmasına izin veriyoruz.
    setTimeout(() => initLessonTracking(lesson, mainMedia), 300);
}

/**
 * UUID formatını kontrol et (Bunny.net video GUID)
 */
function isBunnyUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

function isYoutubeUrl(url) {
    return url.includes('youtube.com') || url.includes('youtu.be');
}

function isVimeoUrl(url) {
    return url.includes('vimeo.com');
}

function extractYoutubeId(url) {
    let videoId = '';
    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    } else {
        videoId = new URLSearchParams(url.split('?')[1]).get('v') || url.split('v=')[1]?.split('&')[0] || '';
    }
    return videoId;
}

function extractVimeoId(url) {
    return url.split('/').pop()?.split('?')[0] || '';
}

/**
 * Ders bilgisini güncelle
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
 * Dersi tamamlandı olarak işaretle (Otomatik ve Manuel kullanıma uygun)
 */
async function markLessonComplete(lessonId, isSilent = false) {
    try {
        const courseId = new URLSearchParams(window.location.search).get('id');

        console.log(`[LEARNING] Ders tamamlanıyor: ${lessonId}`);

        // Zaten yeşil tik aldıysa sistemi yormamak için işlemi durdur (Performans)
        const lessonItem = document.querySelector(`.lesson-item[data-lesson-id="${lessonId}"]`);
        if (lessonItem && lessonItem.querySelector('.lesson-completed')) {
            return; 
        }

        const response = await ApiService.put(
            `/courses/${courseId}/lessons/${lessonId}/complete`,
            {}
        );

        console.log('[LEARNING] Ders tamamlandı:', response);

        // HATA BURADAYDI: event.target yerine doğrudan butonu DOM'dan buluyoruz
        const button = document.querySelector('.btn-mark-complete');
        if (button) {
            button.classList.add('completed');
            button.innerHTML = '<i class="fas fa-check-circle"></i> Tamamlandı';
        }

        // Sol menüdeki ders listesini güncelle (Yeşil tik at)
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

        // Eğer manuel olarak butona tıklandıysa (isSilent = false) sağ üstte bildirim göster
        if (!isSilent) {
            showNotification('Ders tamamlandı olarak işaretlendi!', 'success');
        }

    } catch (error) {
        console.error('[LEARNING] Ders tamamlama hatası:', error);
        if (!isSilent) {
            showNotification(`Hata: ${error.message}`, 'error');
        }
    }
}

/**
 * XSS Koruması - HTML escape
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Hata mesajı göster
 */
function showError(message, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem; margin-bottom: 10px;"></i>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

/**
 * Bildirim göster (Toast)
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

// Toast Animasyonları
if (!document.querySelector('style[data-toast-animations]')) {
    const style = document.createElement('style');
    style.setAttribute('data-toast-animations', 'true');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
}

// ==========================================
// AKILLI DERS TAKİP SİSTEMİ (player.js tabanlı - gerçek Bunny API)
// Bunny'nin resmi player.js kütüphanesi kullanılır.
// timeupdate ile gerçek video pozisyonunu okur,
// seeked eventi ile ileri atlama tespit edilip geri sarılır.
// ==========================================

let bunnyPlayer = null;
let maxWatchedSeconds = 0;
let videoCompleted = false;
let trackingInterval = null;
let lastTimeUpdatePos = -1;
let seekLock = false;

function initLessonTracking(lesson, mainMedia) {
    _stopTracking();
    if (lesson.tamamlandi_mi) return;

    if (mainMedia === 'document' || mainMedia === 'youtube' || mainMedia === 'vimeo') {
        console.log('[TRACKING] Belge/Harici Kaynak: 5 saniye sonra tamamlandı sayılacak.');
        setTimeout(() => { markLessonComplete(lesson.id, true); }, 5000);
    } else if (mainMedia === 'bunny') {
        trackBunnyVideo(lesson);
    }
}

function _stopTracking() {
    if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }
    if (bunnyPlayer) {
        try { bunnyPlayer.off('ended'); } catch(e) {}
        bunnyPlayer = null;
    }
    maxWatchedSeconds = 0;
    videoCompleted = false;
    lastTimeUpdatePos = -1;
    seekLock = false;
}

function trackBunnyVideo(lesson) {
    const iframe = document.getElementById('bunnyIframe');
    if (!iframe) { console.error('[TRACKING] Iframe bulunamadi!'); return; }

    maxWatchedSeconds = 0;
    videoCompleted = false;
    lastTimeUpdatePos = -1;
    seekLock = false;
    currentLessonId = lesson.id;
    const totalDuration = lesson.sure_saniye || 0;

    if (typeof playerjs === 'undefined') {
        console.error('[TRACKING] player.js yuklu degil!');
        return;
    }

    console.log('[TRACKING] player.js ile Bunny baglantisi kuruluyor...');

    // player.js Player nesnesi yarat — iframe yüklendikten sonra çağrılmalı
    bunnyPlayer = new playerjs.Player(iframe);

    bunnyPlayer.on('ready', () => {
        console.log('[TRACKING] Bunny player hazir! Polling baslatiliyor...');

        // Bunny'nin player.js (0.1.0) wrapper'ında 'timeupdate'/'play' eventleri
        // güvenilir tetiklenmiyor. Bu yüzden getCurrentTime() ile her 500ms
        // polling yapıyoruz — request/response postMessage ile çalışır.

        let resolvedDuration = totalDuration;
        try {
            bunnyPlayer.getDuration((d) => {
                if (typeof d === 'number' && d > 0) resolvedDuration = d;
            });
        } catch (e) {}

        let pollLogCounter = 0;
        trackingInterval = setInterval(() => {
            if (!bunnyPlayer) return;
            if (seekLock) return;

            try {
                bunnyPlayer.getCurrentTime((current) => {
                    if (typeof current !== 'number' || isNaN(current) || current < 0) return;

                    // Her 10 polling'de (~5s) bir log
                    if (++pollLogCounter % 10 === 0) {
                        console.log('[POLL] ' + current.toFixed(1) + 's | maks: ' + maxWatchedSeconds.toFixed(1) + 's | toplam: ' + resolvedDuration);
                    }

                    // Seek tespiti: önceki pozisyona göre 2s'den fazla ileri sıçrama,
                    // izlenmemiş bölgeye → geri sar
                    if (lastTimeUpdatePos >= 0) {
                        const jump = current - lastTimeUpdatePos;
                        if (jump > 2 && current > maxWatchedSeconds + 2) {
                            seekLock = true;
                            console.warn('[TRACKING] Ileri atlama ENGELLENDI! ' + lastTimeUpdatePos.toFixed(1) + 's -> ' + current.toFixed(1) + 's | izlenen maks: ' + maxWatchedSeconds.toFixed(1) + 's');
                            bunnyPlayer.setCurrentTime(maxWatchedSeconds);
                            showNotification('Videoyu atlayamazsiniz! Sirali izleyin.', 'error');
                            setTimeout(() => {
                                seekLock = false;
                                lastTimeUpdatePos = maxWatchedSeconds;
                            }, 1500);
                            return;
                        }
                    }

                    lastTimeUpdatePos = current;
                    if (current > maxWatchedSeconds) maxWatchedSeconds = current;

                    // %90 tamamlama kontrolü
                    if (!videoCompleted && resolvedDuration > 0 && maxWatchedSeconds >= resolvedDuration * 0.90) {
                        videoCompleted = true;
                        console.log('[TRACKING] DERS TAMAMLANDI (%90)!');
                        markLessonComplete(currentLessonId);
                    }
                });
            } catch (e) {
                console.warn('[TRACKING] getCurrentTime hata:', e);
            }
        }, 500);

        bunnyPlayer.on('ended', () => {
            if (!videoCompleted) {
                videoCompleted = true;
                console.log('[TRACKING] Video bitti, ders tamamlandi!');
                markLessonComplete(currentLessonId);
            }
        });
    });
}