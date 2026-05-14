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
let bunnyCdnHostname = 'vz-1e031aea-0f2.b-cdn.net';
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
 * Önceki bölümlerin tümü tamamlanmış mı? (frontend kilit hesabı)
 * sectionIndex 0-tabanlı; ilk bölüm her zaman açık.
 */
function isSectionLocked(sectionIndex) {
    if (sectionIndex === 0) return false;
    const curriculum = currentCourseData.curriculum;
    for (let i = 0; i < sectionIndex; i++) {
        const prev = curriculum[i];
        const hasLessons = prev.lessons && prev.lessons.length > 0;
        if (!hasLessons) continue; // boş bölüm kilit koymaz
        const allDone = prev.lessons.every(l => l.tamamlandi_mi);
        if (!allDone) return true;
    }
    return false;
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
        const locked = isSectionLocked(sectionIndex);
        const sectionHtml = `
            <div class="section-accordion">
                <div class="section-header${locked ? ' section-locked' : ''}"
                     data-section-id="${section.id}"
                     onclick="${locked ? 'showSectionLockedToast()' : 'toggleSection(this)'}">
                    <div class="section-title">
                        <i class="fas ${locked ? 'fa-lock' : 'fa-folder-open'}"
                           style="${locked ? 'color:#64748b;' : ''}"></i>
                        <span style="${locked ? 'color:#64748b;' : ''}">${escapeHtml(section.baslik)}</span>
                        <span style="color: #64748b; font-size: 0.8rem; margin-left: 5px;">
                            (${section.lessons.length})
                        </span>
                    </div>
                    <div class="section-toggle">
                        <i class="fas ${locked ? 'fa-lock' : 'fa-chevron-down'}"
                           style="${locked ? 'color:#64748b;font-size:0.85rem;' : ''}"></i>
                    </div>
                </div>
                ${!locked ? `<div class="lesson-list" data-section-id="${section.id}">
                    ${renderLessons(section.lessons)}
                </div>` : ''}
            </div>
        `;

        curriculumContent.insertAdjacentHTML('beforeend', sectionHtml);
    });

    // İlk bölümü aç
    const firstSectionHeader = document.querySelector('.section-header:not(.section-locked)');
    if (firstSectionHeader) {
        toggleSection(firstSectionHeader);
    }
}

function showSectionLockedToast() {
    let banner = document.getElementById('sectionLockedBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'sectionLockedBanner';
        banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fcd34d;border:1px solid #f59e0b;padding:10px 22px;border-radius:8px;font-size:0.9rem;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.4);pointer-events:none;';
        banner.innerHTML = '<i class="fas fa-lock" style="margin-right:8px;"></i>Önceki bölümü tamamlamadan bu bölüme geçemezsiniz.';
        document.body.appendChild(banner);
    }
    banner.style.display = 'block';
    clearTimeout(banner._hideTimer);
    banner._hideTimer = setTimeout(() => { banner.style.display = 'none'; }, 2500);
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
        const isQuiz = lesson.icerik_tipi === 'quiz';
        const durationText = lesson.sure_saniye
            ? `${Math.floor(lesson.sure_saniye / 60)}m`
            : (isQuiz ? 'Quiz' : 'N/A');

        let icon = 'fa-play-circle';
        if (isQuiz) icon = 'fa-clipboard-list';
        else if (lesson.icerik_tipi === 'metin') icon = 'fa-file-alt';

        return `
            <div class="lesson-item" data-lesson-id="${lesson.id}" onclick="selectLesson('${lesson.id}')">
                <div class="lesson-name">
                    <i class="fas ${icon}" style="${isQuiz ? 'color:#8b5cf6;' : ''}"></i>
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
            htmlContent += `
                <div style="position: relative; flex-grow: 1; min-height: 400px; background: #000; display: flex; align-items: center; justify-content: center;">
                    <video
                        id="bunnyNativePlayer"
                        controls
                        controlsList="nodownload"
                        style="width: 100%; height: 100%; object-fit: contain; display: block;">
                    </video>
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

    if (tip === 'quiz') {
        // Quiz dersi: video player alanı kaldırılır, yerini quiz widget alır
        htmlContent += `
            <div id="quizWidgetArea" style="flex:1; overflow-y:auto; padding:24px; background:#0f172a; color:#e2e8f0;">
                <div style="text-align:center; padding:40px 0;">
                    <i class="fas fa-spinner fa-spin fa-2x" style="color:#8b5cf6;"></i>
                    <p style="margin-top:12px; color:#94a3b8;">Quiz yükleniyor...</p>
                </div>
            </div>
        `;
    } else if (extraButtons || lesson.aciklama) {
        htmlContent += `
            <div style="padding: 20px; background: #1e293b; border-top: 1px solid #334155; flex-shrink: 0;">
                ${extraButtons ? `<div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 15px;">${extraButtons}</div>` : ''}
                ${lesson.aciklama ? `<div style="color: #cbd5e1; line-height: 1.6; font-size: 0.95rem; white-space: pre-wrap;">${escapeHtml(lesson.aciklama)}</div>` : ''}
            </div>
        `;
    }

    htmlContent += `</div>`;
    videoPlayer.innerHTML = htmlContent;

    if (tip === 'quiz') {
        // Quiz widget'ı async yükle (lesson.id = quiz dersi)
        loadQuizWidget(lesson.id);
        return; // tracking quiz derslerinde ayrıca yapılır (submit sonrası)
    }

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
            ${isCompleted
                ? `<span class="btn-mark-complete completed" style="cursor:default;"><i class="fas fa-check-circle"></i> Tamamlandı</span>`
                : `<button class="btn-mark-complete" onclick="markLessonComplete('${lesson.id}')">
                        <i class="fas fa-check"></i> Tamamlandı Olarak İşaretle
                   </button>`}
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

        // %100 tamamlandıysa kutlama göster
        const yuzde = response?.data?.ilerleme_yuzdesi;
        if (yuzde >= 100) {
            showCourseCompleteModal();
        } else if (!isSilent) {
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
// AKILLI DERS TAKİP SİSTEMİ — Olay Bazlı (window.message + player.js)
// setInterval tamamen kaldırıldı. Tüm takip Bunny iframe'inin
// window.postMessage olaylarına dinleyici eklenerek yapılır.
// Iframe değiştiğinde dinleyici temizlenir → null referans hatası olmaz.
// ==========================================

let _activeHls = null;        // HLS.js instance
let _activeVideoEl = null;    // Native <video> elementi
let maxWatchedSeconds = 0;
let videoCompleted = false;
let seekLock = false;
let _resolvedDuration = 0;

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
    if (_activeHls) {
        try { _activeHls.destroy(); } catch(e) {}
        _activeHls = null;
    }
    _activeVideoEl = null;
    _resolvedDuration = 0;
    maxWatchedSeconds = 0;
    videoCompleted = false;
    seekLock = false;
}

// ─── LocalStorage yardımcıları: nerede kaldığını hatırla ───────────────────
function _saveResumePos(lessonId, seconds) {
    try { localStorage.setItem('resume_' + lessonId, String(Math.floor(seconds))); } catch(e) {}
}
function _loadResumePos(lessonId) {
    try { return parseInt(localStorage.getItem('resume_' + lessonId) || '0', 10) || 0; } catch(e) { return 0; }
}
function _clearResumePos(lessonId) {
    try { localStorage.removeItem('resume_' + lessonId); } catch(e) {}
}

// ─── timeupdate işleyici: pozisyon kaydet + %95 tamamlama ─────────────────────
// Seek engeli ayrıca native 'seeked' event'inde yapılıyor (trackBunnyVideo).
function _handleTimeUpdate(seconds, duration) {
    if (seekLock) return;
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return;

    if (duration && duration > 0) _resolvedDuration = duration;

    // Pozisyonu her 5 saniyede bir kaydet
    if (Math.floor(seconds) % 5 === 0) {
        _saveResumePos(currentLessonId, seconds);
    }

    if (seconds > maxWatchedSeconds) maxWatchedSeconds = seconds;

    // %95 tamamlama kontrolü
    if (!videoCompleted && _resolvedDuration > 0 && maxWatchedSeconds >= _resolvedDuration * 0.95) {
        videoCompleted = true;
        _clearResumePos(currentLessonId);
        markLessonComplete(currentLessonId);
    }
}

function trackBunnyVideo(lesson) {
    const videoEl = document.getElementById('bunnyNativePlayer');
    if (!videoEl) { console.error('[TRACKING] Video elementi bulunamadı!'); return; }

    _activeVideoEl = videoEl;
    maxWatchedSeconds = 0;
    videoCompleted = false;
    seekLock = false;
    currentLessonId = lesson.id;
    _resolvedDuration = lesson.sure_saniye || 0;

    // HLS stream URL'i
    const hlsSrc = `https://${bunnyCdnHostname}/${lesson.video_saglayici_id}/playlist.m3u8`;

    if (window.Hls && Hls.isSupported()) {
        _activeHls = new Hls();
        _activeHls.loadSource(hlsSrc);
        _activeHls.attachMedia(videoEl);
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari: yerleşik HLS desteği
        videoEl.src = hlsSrc;
    } else {
        console.error('[TRACKING] Bu tarayıcı HLS oynatmayı desteklemiyor.');
        return;
    }

    // Metadata yüklenince: süreyi güncelle, kaldığı yerden devam et
    videoEl.addEventListener('loadedmetadata', function onMeta() {
        videoEl.removeEventListener('loadedmetadata', onMeta);
        if (videoEl.duration && isFinite(videoEl.duration)) {
            _resolvedDuration = videoEl.duration;
        }
        const resumePos = _loadResumePos(lesson.id);
        if (resumePos > 5 && !lesson.tamamlandi_mi) {
            console.log('[TRACKING] Kaldığı yerden devam: ' + resumePos + 's');
            videoEl.currentTime = resumePos;
            maxWatchedSeconds = resumePos;
        }
    });

    // Timeupdate: pozisyon kaydet + %95 tamamlama
    videoEl.addEventListener('timeupdate', function() {
        _handleTimeUpdate(videoEl.currentTime, videoEl.duration || _resolvedDuration);
    });

    // Seeked: ileri atlama engelle
    videoEl.addEventListener('seeked', function() {
        if (seekLock) return;
        if (videoEl.currentTime > maxWatchedSeconds + 2) {
            seekLock = true;
            videoEl.currentTime = maxWatchedSeconds;
            showNotification('Eğitim bütünlüğü için dersi ileri saramazsınız.', 'error');
            setTimeout(function() { seekLock = false; }, 1000);
        }
    });

    // Ended: tamamlandı
    videoEl.addEventListener('ended', function() {
        if (!videoCompleted) {
            videoCompleted = true;
            _clearResumePos(currentLessonId);
            markLessonComplete(currentLessonId);
        }
    });
}

// ═══════════════════════════════════════════════════
// QUİZ WIDGET — Öğrenci quiz çözme arayüzü
// ═══════════════════════════════════════════════════

let _activeQuizData = null;

async function loadQuizWidget(lessonId) {
    const area = document.getElementById('quizWidgetArea');
    if (!area) return;

    area.innerHTML = `<div style="padding:60px 0; text-align:center;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#8b5cf6;"></i></div>`;

    try {
        const res = await ApiService.get(`/quiz/by-lesson/${lessonId}`);
        const quizId = res?.data?.id;
        if (!quizId) { area.innerHTML = _quizNoQuizHtml(); return; }
        await _fetchAndRenderQuiz(area, quizId, lessonId);
    } catch (err) {
        if (err.statusCode === 403) {
            area.innerHTML = _quizLockedHtml();
        } else if (err.statusCode === 404) {
            area.innerHTML = _quizNoQuizHtml();
        } else {
            area.innerHTML = `<div style="padding:40px;text-align:center;color:#f87171;">Quiz yüklenemedi: ${escapeHtml(err.message)}</div>`;
        }
    }
}

async function _fetchAndRenderQuiz(area, quizId, lessonId) {
    const res = await ApiService.get(`/quiz/${quizId}/take`);
    _activeQuizData = res.data;
    const { quiz, questions, best_attempt } = _activeQuizData;

    const passedBanner = best_attempt?.gecti_mi
        ? `<div style="padding:10px 24px;background:#064e3b;color:#6ee7b7;font-size:0.88rem;border-bottom:1px solid #065f46;"><i class="fas fa-check-circle"></i> Bu quizi geçtiniz (${best_attempt.puan}%). Tekrar çözebilirsiniz.</div>`
        : '';

    const formHtml = questions.map((q, qi) => `
        <div style="background:#1e293b;border-radius:10px;padding:18px;margin-bottom:14px;">
            <p style="margin:0 0 12px;font-weight:600;color:#f1f5f9;">${qi + 1}. ${escapeHtml(q.soru_metni)}</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
                ${(q.Choices || []).map(c => `
                    <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0f172a;border:1px solid #334155;border-radius:8px;cursor:pointer;">
                        <input type="radio" name="q_${q.id}" value="${c.id}" style="accent-color:#8b5cf6;">
                        <span style="color:#e2e8f0;font-size:0.93rem;">${escapeHtml(c.secenek_metni)}</span>
                    </label>`).join('')}
            </div>
        </div>`).join('');

    area.innerHTML = `
        <div style="background:#1e293b;padding:16px 24px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;">
            <div>
                <h3 style="margin:0;font-size:1.05rem;color:#f1f5f9;"><i class="fas fa-clipboard-list" style="color:#8b5cf6;margin-right:8px;"></i>${escapeHtml(quiz.ders_baslik || 'Quiz')}</h3>
                <small style="color:#94a3b8;">Geçme puanı: <strong style="color:#a78bfa;">${quiz.gecme_puani}%</strong>${quiz.sure_dakika ? ' | Süre: ' + quiz.sure_dakika + ' dk' : ''}</small>
            </div>
            ${best_attempt ? `<div style="text-align:right;font-size:0.85rem;color:#94a3b8;">En iyi: <strong style="color:${best_attempt.gecti_mi ? '#34d399' : '#f87171'};">${best_attempt.puan}%</strong></div>` : ''}
        </div>
        ${passedBanner}
        <div style="padding:20px 24px;">
            <input type="hidden" id="activeQuizId" value="${quiz.id}">
            <input type="hidden" id="activeQuizLessonId" value="${lessonId}">
            ${formHtml}
            <button type="button" onclick="window.submitQuizWidget()" style="width:100%;padding:14px;background:#8b5cf6;color:white;border:none;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer;margin-top:8px;">
                <i class="fas fa-paper-plane"></i> Quizi Gönder
            </button>
        </div>`;
}

window.submitQuizWidget = async () => {
    const quizId = document.getElementById('activeQuizId')?.value;
    const lessonId = document.getElementById('activeQuizLessonId')?.value;
    if (!quizId || !_activeQuizData) return;

    const cevaplar = _activeQuizData.questions.map(q => {
        const sel = document.querySelector(`input[name="q_${q.id}"]:checked`);
        return { soru_id: q.id, secilen_secenek_id: sel ? sel.value : null };
    });

    const btn = document.querySelector('#quizWidgetArea button[type="button"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gönderiliyor...'; }

    try {
        const res = await ApiService.post(`/quiz/${quizId}/submit`, { cevaplar });
        const d = res.data;
        const gecti = d.gecti_mi;
        const area = document.getElementById('quizWidgetArea');
        area.innerHTML = `
            <div style="padding:50px 24px;text-align:center;color:#e2e8f0;">
                <div style="font-size:3rem;margin-bottom:14px;">${gecti ? '🎉' : '😕'}</div>
                <h2 style="font-size:1.7rem;margin:0 0 8px;color:${gecti ? '#34d399' : '#f87171'};">${gecti ? 'Geçtiniz!' : 'Kaldınız'}</h2>
                <p style="color:#94a3b8;margin-bottom:24px;">
                    ${d.dogru_sayisi} / ${d.toplam_soru} doğru — <strong style="color:${gecti ? '#34d399' : '#f87171'};">${d.puan}%</strong>
                    <br><small>Geçme puanı: ${d.gecme_puani}%</small>
                </p>
                ${gecti
                    ? `<p style="color:#6ee7b7;background:#064e3b;padding:10px 20px;border-radius:8px;display:inline-block;font-size:0.9rem;">✅ Bu bölüm tamamlandı!</p>`
                    : `<button onclick="loadQuizWidget('${lessonId}')" style="padding:12px 28px;background:#8b5cf6;color:white;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;"><i class="fas fa-redo"></i> Tekrar Dene</button>`}
                <br><br>
                <button onclick="loadQuizWidget('${lessonId}')" style="padding:7px 18px;background:#1e293b;color:#94a3b8;border:1px solid #334155;border-radius:8px;font-size:0.82rem;cursor:pointer;">
                    <i class="fas fa-redo"></i> ${gecti ? 'Tekrar Çöz' : 'Tekrar Dene'}
                </button>
            </div>`;
    } catch (err) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Quizi Gönder'; }
        alert('Hata: ' + err.message);
    }
};

function _quizLockedHtml() {
    return `<div style="padding:60px 24px;text-align:center;color:#94a3b8;">
        <i class="fas fa-lock" style="font-size:3rem;color:#475569;margin-bottom:16px;display:block;"></i>
        <h3 style="color:#e2e8f0;margin:0 0 10px;">Quiz Kilitli</h3>
        <p style="max-width:360px;margin:0 auto;line-height:1.6;">Bu bölümdeki diğer dersleri tamamladıktan sonra quiz açılır.</p>
    </div>`;
}

function _quizNoQuizHtml() {
    return `<div style="padding:60px 24px;text-align:center;color:#94a3b8;">
        <i class="fas fa-clipboard-list" style="font-size:3rem;color:#475569;margin-bottom:16px;display:block;"></i>
        <h3 style="color:#e2e8f0;margin:0 0 10px;">Quiz Henüz Eklenmedi</h3>
        <p>Eğitmen bu derse henüz soru eklememiş.</p>
    </div>`;
}

// ═══════════════════════════════════════════════════
// KURS TAMAMLAMA KUTLAMASI
// ═══════════════════════════════════════════════════

function showCourseCompleteModal() {
    // Konfeti (canvas-confetti CDN)
    if (!window._confettiLoaded) {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.2/dist/confetti.browser.min.js';
        s.onload = () => { window._confettiLoaded = true; _fireConfetti(); };
        document.head.appendChild(s);
    } else {
        _fireConfetti();
    }

    // Modalı oluştur (bir kez)
    if (document.getElementById('courseCompleteModal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'courseCompleteModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    overlay.innerHTML = `
        <div style="background:#fff;border-radius:20px;padding:48px 40px;max-width:460px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:popIn .4s cubic-bezier(.175,.885,.32,1.275);">
            <div style="font-size:4rem;margin-bottom:12px;">🎉</div>
            <h2 style="font-size:1.6rem;font-weight:800;color:#1e3a8a;margin:0 0 12px;">Tebrikler!</h2>
            <p style="color:#475569;line-height:1.6;margin-bottom:28px;">
                Kursu başarıyla tamamladınız ve sertifikanız oluşturuldu.
            </p>
            <a href="/student/certificates.html"
               style="display:inline-flex;align-items:center;gap:8px;padding:13px 28px;background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;border-radius:10px;font-weight:700;font-size:1rem;text-decoration:none;margin-bottom:12px;">
                <i class="fas fa-certificate"></i> Sertifikamı Gör
            </a>
            <br>
            <button onclick="document.getElementById('courseCompleteModal').remove()"
                    style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:0.88rem;margin-top:4px;">
                Kapat
            </button>
        </div>
    `;

    if (!document.querySelector('style[data-pop-anim]')) {
        const st = document.createElement('style');
        st.setAttribute('data-pop-anim', '');
        st.textContent = `@keyframes popIn{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}`;
        document.head.appendChild(st);
    }

    document.body.appendChild(overlay);
}

function _fireConfetti() {
    if (typeof confetti !== 'function') return;
    confetti({ particleCount: 160, spread: 90, origin: { y: 0.55 } });
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.6 } }), 400);
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.6 } }), 700);
}