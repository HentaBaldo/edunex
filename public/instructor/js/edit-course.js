/**
 * EduNex - Kurs Düzenleme & Müfredat Yönetimi
 * Backend ile tam entegre, CRUD işlemleri yapan modül
 * ✅ VIDEO UPLOAD (Bunny.net) - PRODUCTION READY
 */

const UIHelper = {
    checkInstructorAccess: () => {
        const token = localStorage.getItem('edunex_token');
        if (!token) {
            alert('Lütfen giriş yapınız.');
            window.location.href = '/auth/index.html';
            return false;
        }
        return true;
    }
};

let courseId = new URLSearchParams(window.location.search).get('id');

document.addEventListener('DOMContentLoaded', async () => {
    if (!UIHelper.checkInstructorAccess()) return;

    if (!courseId) {
        showToast('Geçersiz Kurs ID\'si.', 'error');
        setTimeout(() => window.location.href = '/instructor/dashboard.html', 2000);
        return;
    }

    await loadCurriculum();
    setupEventListeners();
    await loadCourseForEdit();
    await loadCategoriesForEdit();
    initQuillEditor();
    setupSettingsListeners();
});

/**
 * Müfredatı backend'den çekip render eder
 */
async function loadCurriculum() {
    const listDiv = document.getElementById('mufredatListesi');
    if (!listDiv) return;

    try {
        listDiv.innerHTML = '<p class="loading-text"><i class="fas fa-spinner fa-spin"></i> Müfredat yükleniyor...</p>';

        const result = await ApiService.get(`/curriculum/${courseId}`);
        const sections = result.data || [];

        // Kursun mevcut durumunu cache'le (silme onay metinleri vs. icin)
        if (result.course) {
            window.__courseDurum = result.course.durum;
            window.__courseEditedAfterApproval = !!result.course.onaydan_sonra_duzenlendi_mi;
            window.__courseIadeEdildi = !!result.course.admin_tarafindan_iade_edildi;
            window.__courseIadeSebebi = result.course.iade_sebebi || '';
            window.__courseIadeTarihi = result.course.iade_tarihi || '';
        }

        listDiv.innerHTML = '';

        // Admin tarafindan iade edildiyse en ustte kirmizi banner goster
        // (bolum sayisindan bagimsiz olarak; ogretmen bos kursta da uyariyi gormeli)
        if (window.__courseIadeEdildi) {
            const iadeAt = window.__courseIadeTarihi
                ? new Date(window.__courseIadeTarihi).toLocaleString('tr-TR')
                : '';
            const sebepHtml = window.__courseIadeSebebi
                ? `<div style="margin-top:8px; padding:10px; background:#fff; border-left:3px solid #dc2626; border-radius:4px; color:#7f1d1d; font-size:0.88rem; font-style:italic;">"${escapeHtml(window.__courseIadeSebebi)}"</div>`
                : '';
            const iadeBanner = `
                <div style="background:#fef2f2; border:1px solid #fca5a5; color:#991b1b; padding:14px 18px; border-radius:10px; margin-bottom:14px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-exclamation-triangle" style="font-size:1.3rem; color:#dc2626;"></i>
                        <div style="flex:1;">
                            <div style="font-weight:700; font-size:0.95rem;">Bu kurs admin tarafından yayından kaldırılıp size iade edildi.</div>
                            ${iadeAt ? `<div style="font-size:0.78rem; margin-top:2px; color:#7f1d1d;">İade tarihi: <strong>${iadeAt}</strong></div>` : ''}
                            <div style="font-size:0.85rem; margin-top:6px;">Düzeltmeleri yapıp sayfanın üstündeki <strong>"Onaya Gönder"</strong> butonuyla yeniden onaya gönderebilirsiniz.</div>
                        </div>
                    </div>
                    ${sebepHtml}
                </div>
            `;
            listDiv.insertAdjacentHTML('beforeend', iadeBanner);
        }

        // Onaylı/yayında kursta düzenleme bayrağı varsa eğitmene de hatırlat
        if (window.__courseDurum && window.__courseDurum !== 'taslak' && window.__courseDurum !== 'arsiv') {
            const banner = `
                <div style="background:#fef3c7; color:#78350f; padding:10px 14px; border-radius:8px; margin-bottom:12px; font-size:0.88rem;">
                    <i class="fas fa-info-circle"></i>
                    Bu kurs <strong>${escapeHtml(window.__courseDurum)}</strong> durumunda. Yapacağınız değişiklikler izli düzenleme olarak kaydedilir; ders silindiğinde fiziksel olarak silinmek yerine öğrencilerden gizlenir.
                </div>
            `;
            listDiv.insertAdjacentHTML('beforeend', banner);
        }

        if (sections.length === 0) {
            listDiv.insertAdjacentHTML('beforeend', `
                <div class="empty-section">
                    <i class="fas fa-inbox" style="font-size: 2rem; display: block; margin-bottom: 10px;"></i>
                    <p>Henüz bölüm eklemediniz.</p>
                </div>
            `);
            return;
        }

        sections.forEach(section => {
            const sectionHtml = renderSection(section);
            listDiv.insertAdjacentHTML('beforeend', sectionHtml);
        });

    } catch (error) {
        console.error('[CURRICULUM LOAD] Hata:', error.message);
        listDiv.innerHTML = `
            <div class="empty-section">
                <i class="fas fa-exclamation-circle" style="color: #ef4444; font-size: 2rem; display: block; margin-bottom: 10px;"></i>
                <p>Müfredat yüklenemedi: ${error.message}</p>
            </div>
        `;
    }
}

/**
 * Bölüm HTML'i render eder
 */
function renderSection(section) {
    const lessons = section.Lessons || [];
    const isHidden = !!section.gizli_mi;

    // Gizli bolumler icin gri arkaplan + rozet + restore butonu
    const hiddenStyle = isHidden ? 'opacity: 0.6; background-color: #f3f4f6;' : '';
    const hiddenBadge = isHidden
        ? `<span style="background:#fee2e2; color:#991b1b; font-size:0.72rem; padding:3px 10px; border-radius:12px; margin-left:10px;">
             <i class="fas fa-eye-slash"></i> Gizli (öğrenciler göremez)
           </span>`
        : '';

    const actionButtons = isHidden
        ? `<button type="button" class="btn-primary-sm btn-restore-section" data-section-id="${section.id}" style="background:#10b981;" title="Bölümü geri yükle">
              <i class="fas fa-undo"></i> Geri Yükle
           </button>`
        : `<button type="button" class="btn-primary-sm btn-add-lesson" data-section-id="${section.id}">
              <i class="fas fa-plus"></i> Ders Ekle
           </button>
           <button type="button" class="btn-delete-icon btn-delete-section" data-section-id="${section.id}" title="Bölümü sil/gizle">
              <i class="fas fa-trash-alt"></i>
           </button>`;

    return `
        <div class="section-item" id="section-${section.id}" style="${hiddenStyle}">
            <div class="section-header">
                <div class="section-title-group">
                    <h4>
                        <i class="fas fa-folder" style="color: #2563eb;"></i>
                        ${escapeHtml(section.baslik)}
                        ${hiddenBadge}
                    </h4>
                </div>
                <div class="action-buttons">
                    ${actionButtons}
                </div>
            </div>
            <div class="lessons-list" id="lessons-${section.id}">
                ${renderLessons(lessons)}
            </div>
        </div>
    `;
}

/**
 * Dersleri render eder
 */
function renderLessons(lessons) {
    if (!lessons || lessons.length === 0) {
        return `<p class="empty-section">Bu bölümde henüz ders yok.</p>`;
    }

    return lessons.map(lesson => {
        const durationText = lesson.sure_saniye
            ? `${Math.floor(lesson.sure_saniye / 60)}m`
            : '';
        const sourceInfo = renderLessonSourceBadge(lesson);
        const isHidden = !!lesson.gizli_mi;

        const hiddenStyle = isHidden ? 'opacity: 0.55; background-color: #f9fafb; text-decoration: line-through;' : '';
        const hiddenBadge = isHidden
            ? `<span style="background:#fee2e2; color:#991b1b; font-size:0.7rem; padding:2px 8px; border-radius:10px; margin-left:6px; text-decoration:none;">
                 <i class="fas fa-eye-slash"></i> Gizli
               </span>`
            : '';

        const isQuiz = lesson.icerik_tipi === 'quiz';

        let actionBtn;
        if (isHidden) {
            actionBtn = `<button type="button" class="btn-primary-sm btn-restore-lesson" data-lesson-id="${lesson.id}" style="background:#10b981; padding:4px 10px;" title="Dersi geri yükle">
                  <i class="fas fa-undo"></i>
               </button>`;
        } else if (isQuiz) {
            actionBtn = `
               <button type="button" class="btn-primary-sm" style="background:#8b5cf6; padding:4px 10px; font-size:0.78rem;" onclick="window.openQuizModal('${lesson.id}')" title="Quiz sorularını düzenle">
                  <i class="fas fa-edit"></i> Quiz Düzenle
               </button>
               <button type="button" class="btn-delete-sm btn-delete-lesson" data-lesson-id="${lesson.id}" title="Dersi sil/gizle">
                  <i class="fas fa-times"></i>
               </button>`;
        } else {
            actionBtn = `<button type="button" class="btn-delete-sm btn-delete-lesson" data-lesson-id="${lesson.id}" title="Dersi sil/gizle">
                  <i class="fas fa-times"></i>
               </button>`;
        }

        const iconClass = isQuiz ? 'fa-clipboard-list' : lesson.icerik_tipi === 'video' ? 'fa-play-circle' : 'fa-file-alt';
        const iconColor = isQuiz ? 'color:#8b5cf6;' : '';

        return `
            <div class="lesson-item" id="lesson-${lesson.id}" style="${hiddenStyle}">
                <div class="lesson-info">
                    <i class="fas ${iconClass}" style="${iconColor}"></i>
                    <span>${escapeHtml(lesson.baslik)}</span>
                    ${hiddenBadge}
                    ${sourceInfo}
                    ${lesson.onizleme_mi ? '<i class="fas fa-eye" style="color: #2563eb; margin-left: 8px;" title="Ücretsiz önizleme"></i>' : ''}
                    ${durationText ? `<span style="color: #64748b; font-size: 0.8rem; margin-left: 8px;">${durationText}</span>` : ''}
                </div>
                ${actionBtn}
            </div>
        `;
    }).join('');
}

/**
 * Derse bağlı kaynak/dosya göstergesi:
 *  - Bunny video GUID varsa "Video yüklendi" rozeti
 *  - /uploads/... dosyası ise "Dosyayı Aç" linki
 *  - Harici URL ise link rozeti
 *  - Hiçbir kaynak yoksa "Kaynak yok" uyarısı
 */
function renderLessonSourceBadge(lesson) {
    const src = lesson.video_saglayici_id || lesson.kaynak_url || '';
    const tip = (lesson.icerik_tipi || 'video').toLowerCase();

    const baseStyle = 'margin-left:auto; font-size:0.78rem; padding:3px 10px; border-radius:12px; display:inline-flex; align-items:center; gap:6px; text-decoration:none;';

    if (!src) {
        return `<span style="${baseStyle} background:#fef3c7; color:#92400e;"><i class="fas fa-exclamation-triangle"></i> Kaynak yok</span>`;
    }

    // Tam URL (http/https)
    if (/^https?:\/\//i.test(src)) {
        return `<a href="${escapeHtml(src)}" target="_blank" rel="noopener" style="${baseStyle} background:#dbeafe; color:#1e40af;" title="${escapeHtml(src)}">
            <i class="fas fa-link"></i> Link
        </a>`;
    }

    // Local uploads yolu
    if (src.startsWith('/uploads/')) {
        return `<a href="${escapeHtml(src)}" target="_blank" rel="noopener" style="${baseStyle} background:#dcfce7; color:#166534;" title="${escapeHtml(src)}">
            <i class="fas fa-paperclip"></i> Dosyayı Aç
        </a>`;
    }

    // Bunny video GUID (UUID formatında)
    if (tip === 'video' && /^[a-f0-9-]{36}$/i.test(src)) {
        return `<span style="${baseStyle} background:#ede9fe; color:#6d28d9;"><i class="fas fa-circle-check"></i> Video yüklendi</span>`;
    }

    return `<span style="${baseStyle} background:#e2e8f0; color:#475569;"><i class="fas fa-file"></i> Kaynak eklendi</span>`;
}

/**
 * Event listener'ları kur
 */
function setupEventListeners() {
    // Bölüm Ekleme Formu
    const bolumForm = document.getElementById('bolumEkleForm');
    if (bolumForm) {
        bolumForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleAddSection();
        });
    }

    // İçerik tipine göre dosya yükleme alanını göster/gizle
        // --- DİNAMİK DERS EKLEME FORMU KONTROLÜ ---
        const icerikTipiSelect = document.getElementById('icerik_tipi');
        const tahminiSureContainer = document.getElementById('tahminiSureContainer');
        const dersDosyasiInput = document.getElementById('ders_dosyasi');
        const dersDosyasiLabel = document.getElementById('ders_dosyasi_label');
    
        if (icerikTipiSelect) {
            icerikTipiSelect.addEventListener('change', (e) => {
                const secilenTip = e.target.value;
    
                if (secilenTip === 'video') {
                    // Video seçildi: Süre sorulmaz, dosya inputu video ile kısıtlanır
                    if (tahminiSureContainer) tahminiSureContainer.style.display = 'none';
                    if (dersDosyasiInput) dersDosyasiInput.accept = 'video/mp4,video/webm';
                    if (dersDosyasiLabel) dersDosyasiLabel.textContent = 'Ders Dosyası (Video MP4/WEBM)';
                } 
                else if (secilenTip === 'metin') {
                    // Belge seçildi: Süre sorulur, dosya inputu belge ile kısıtlanır
                    if (tahminiSureContainer) tahminiSureContainer.style.display = 'block';
                    if (dersDosyasiInput) dersDosyasiInput.accept = '.pdf,.doc,.docx,.ppt,.pptx';
                    if (dersDosyasiLabel) dersDosyasiLabel.textContent = 'Ders Dosyası (PDF, Word, PPT)';
                } 
                else if (secilenTip === 'quiz') {
                    // Quiz seçildi: Süre sorulur, dosya inputu PDF veya resim ile kısıtlanır
                    if (tahminiSureContainer) tahminiSureContainer.style.display = 'block';
                    if (dersDosyasiInput) dersDosyasiInput.accept = '.pdf,.jpg,.png';
                    if (dersDosyasiLabel) dersDosyasiLabel.textContent = 'Test Dosyası (PDF veya Resim)';
                }
            });
    
            // Sayfa açıldığında varsayılan seçime göre form arayüzünü ayarla
            icerikTipiSelect.dispatchEvent(new Event('change'));// --- VİDEO SÜRESİNİ OTOMATİK HESAPLAMA ---
            window.calculatedVideoDuration = 0; // Backend'e yollamak için süreyi burada tutacağız
        
            if (dersDosyasiInput) {
                dersDosyasiInput.addEventListener('change', function(e) {
                    const file = e.target.files[0];
                    window.calculatedVideoDuration = 0; // Dosya değişirse süreyi sıfırla
        
                    if (file && file.type.startsWith('video/')) {
                        const videoElement = document.createElement('video');
                        videoElement.preload = 'metadata';
        
                        videoElement.onloadedmetadata = function() {
                            window.URL.revokeObjectURL(videoElement.src); // Hafızayı temizle
                            window.calculatedVideoDuration = Math.floor(videoElement.duration); // Saniye cinsinden kaydet
                            
                            // Eğitmene sağ altta şık bir bildirim çıkar
                            let sureDk = Math.floor(window.calculatedVideoDuration / 60);
                            let sureSn = window.calculatedVideoDuration % 60;
                            showToast(`Video algılandı! Süre: ${sureDk} dk ${sureSn} sn`, 'info');
                        }
                        videoElement.src = URL.createObjectURL(file);
                    }
                });
            }
        }

    // Ders Ekleme Formu
    const dersForm = document.getElementById('dersEkleForm');
    if (dersForm) {
        dersForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleAddLesson();
        });
    }

    // Müfredat Konteynerine Event Delegation
    const mufredatDiv = document.getElementById('mufredatListesi');
    if (mufredatDiv) {
        mufredatDiv.addEventListener('click', async (e) => {
            const addLessonBtn = e.target.closest('.btn-add-lesson');
            const deleteSecBtn = e.target.closest('.btn-delete-section');
            const deleteLesBtn = e.target.closest('.btn-delete-lesson');
            const restoreSecBtn = e.target.closest('.btn-restore-section');
            const restoreLesBtn = e.target.closest('.btn-restore-lesson');

            if (addLessonBtn) {
                const sectionId = addLessonBtn.dataset.sectionId;
                openLessonModal(sectionId);
            }

            if (deleteSecBtn) {
                const sectionId = deleteSecBtn.dataset.sectionId;
                await handleDeleteSection(sectionId);
            }

            if (deleteLesBtn) {
                const lessonId = deleteLesBtn.dataset.lessonId;
                await handleDeleteLesson(lessonId);
            }

            if (restoreSecBtn) {
                const sectionId = restoreSecBtn.dataset.sectionId;
                await handleRestoreSection(sectionId);
            }

            if (restoreLesBtn) {
                const lessonId = restoreLesBtn.dataset.lessonId;
                await handleRestoreLesson(lessonId);
            }
        });
    }
}

/**
 * Bölüm ekleme işlemi
 */
async function handleAddSection() {
    const baslik = document.getElementById('bolum_baslik')?.value.trim();
    const aciklama = document.getElementById('bolum_aciklama')?.value.trim();

    if (!baslik) {
        showToast('Bölüm başlığı gereklidir.', 'error');
        return;
    }

    try {
        const result = await ApiService.post('/curriculum/sections', {
            kurs_id: courseId,
            baslik,
            aciklama
        });

        showToast('Bölüm başarıyla eklendi.', 'success');
        window.closeSectionModal();
        document.getElementById('bolumEkleForm').reset();
        await loadCurriculum();

    } catch (error) {
        console.error('[SECTION ADD] Hata:', error.message);
        showToast(`Hata: ${error.message}`, 'error');
    }
}

/**
 * Ders ekleme işlemi - UPLOAD SPAM ENGELLEME VE DİNAMİK VERİ (GÖREV 3)
 */
/**
 * Ders ekleme işlemi - YENİ ASENKRON (BEKLETMEYEN) YAPI
 */
async function handleAddLesson() {
    const bolumId = document.getElementById('secili_bolum_id')?.value;
    const baslik = document.getElementById('ders_baslik')?.value.trim();
    const icerikTipi = document.getElementById('icerik_tipi')?.value;
    const tahminiSureDk = document.getElementById('tahmini_sure')?.value;
    const dosyaInput = document.getElementById('ders_dosyasi');
    const aciklama = document.getElementById('ders_aciklama')?.value.trim();
    const kaynakUrl = document.getElementById('kaynak_url')?.value.trim();
    const onizlemeMi = document.getElementById('onizleme_mi')?.checked;

    const file = dosyaInput?.files[0];

    if (!baslik) {
        showToast('Ders başlığı gereklidir.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('bolum_id', bolumId);
    formData.append('baslik', baslik);
    formData.append('icerik_tipi', icerikTipi);
    formData.append('onizleme_mi', onizlemeMi);
    
    if (aciklama) formData.append('aciklama', aciklama);
    if (kaynakUrl) formData.append('kaynak_url', kaynakUrl);

    if (icerikTipi === 'video' && window.calculatedVideoDuration > 0) {
        formData.append('sure_saniye', window.calculatedVideoDuration);
    } else if (tahminiSureDk) {
        formData.append('sure_saniye', parseInt(tahminiSureDk) * 60);
    }

    if (file) {
        formData.append('video', file);
    }

    // ==========================================
    // ATEŞLE VE UNUT (FIRE & FORGET) MANTIĞI
    // ==========================================
    
    // 1. Modalı hemen kapat ve formu temizle (Eğitmen kesinlikle beklemesin)
    window.closeLessonModal();
    document.getElementById('dersEkleForm').reset();
    window.calculatedVideoDuration = 0; // Süreyi sıfırla

    // 2. Sağ üstte yükleme barını oluştur ve arka planda API'ye gönder!
    createUploadProgressBox(baslik, formData);
}

/**
 * Sağ Üstte Çıkan Dinamik Yükleme Kutucukları (Progress Bar)
 */
function createUploadProgressBox(baslik, formData) {
    // Container yoksa sayfanın sağ üstüne oluştur
    let container = document.getElementById('uploadProgressContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'uploadProgressContainer';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 12px; pointer-events: none;';
        document.body.appendChild(container);
    }

    // Her video yüklemesi için benzersiz bir kutu oluştur
    const uploadId = 'upload-' + Date.now();
    const box = document.createElement('div');
    box.id = uploadId;
    box.style.cssText = 'background: white; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); padding: 16px; width: 320px; border-left: 5px solid #3b82f6; pointer-events: auto; transform: translateX(120%); animation: slideIn 0.3s forwards;';
    
    box.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px; align-items: center;">
            <strong style="font-size: 0.95rem; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;"><i class="fas fa-cloud-upload-alt" style="color: #3b82f6; margin-right: 5px;"></i> ${escapeHtml(baslik)}</strong>
            <span id="pct-${uploadId}" style="font-size: 0.85rem; font-weight: 600; color: #3b82f6;">0%</span>
        </div>
        <div style="background: #e2e8f0; height: 8px; border-radius: 4px; overflow: hidden;">
            <div id="bar-${uploadId}" style="background: #3b82f6; width: 0%; height: 100%; transition: width 0.1s linear;"></div>
        </div>
        <div id="status-${uploadId}" style="font-size: 0.8rem; color: #64748b; margin-top: 10px; font-weight: 500;">Sisteme iletiliyor...</div>
    `;
    
    container.appendChild(box);

    // Animasyon CSS'i sayfada yoksa ekle
    if (!document.getElementById('uploadAnimStyles')) {
        const style = document.createElement('style');
        style.id = 'uploadAnimStyles';
        style.innerHTML = `
            @keyframes slideIn { to { transform: translateX(0); } }
            @keyframes fadeOut { to { opacity: 0; transform: translateX(100%); } }
        `;
        document.head.appendChild(style);
    }

    // Dosyayı sunucuya gönderme işlemi (İlerleme çubuğunu doldurur)
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/curriculum/lessons', true);
    xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('edunex_token')}`);
    
    // Yükleme sırasında yüzdelik dilimi güncelle
    xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
            const percentComplete = Math.floor((e.loaded / e.total) * 100);
            document.getElementById(`bar-${uploadId}`).style.width = percentComplete + '%';
            document.getElementById(`pct-${uploadId}`).innerText = percentComplete + '%';
            
            if (percentComplete === 100) {
                document.getElementById(`status-${uploadId}`).innerText = 'Arka planda işleniyor...';
            }
        }
    };

    // Yükleme başarıyla bittiğinde
    xhr.onload = async () => {
        const response = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) {
            document.getElementById(`bar-${uploadId}`).style.background = '#10b981'; // Yeşil bar
            document.getElementById(`pct-${uploadId}`).style.color = '#10b981';
            document.getElementById(`status-${uploadId}`).innerText = '✓ Ders eklendi (İşleniyor)';
            
            // Arka planda müfredat listesini sessizce yenile
            await loadCurriculum();
            
            // 5 saniye sonra kutucuğu kaydırarak yok et
            setTimeout(() => {
                box.style.animation = 'fadeOut 0.4s forwards';
                setTimeout(() => box.remove(), 400);
            }, 5000);
        } else {
            // Hata Durumu
            document.getElementById(`bar-${uploadId}`).style.background = '#ef4444';
            document.getElementById(`pct-${uploadId}`).style.color = '#ef4444';
            document.getElementById(`status-${uploadId}`).innerText = '❌ Hata: ' + (response.message || 'Yüklenemedi');
            setTimeout(() => box.remove(), 8000);
        }
    };

    // İnternet koptuğunda
    xhr.onerror = () => {
        document.getElementById(`bar-${uploadId}`).style.background = '#ef4444';
        document.getElementById(`status-${uploadId}`).innerText = '❌ Sunucu bağlantısı koptu!';
        setTimeout(() => box.remove(), 8000);
    };

    // Formu gönder
    xhr.send(formData);
}

/**
 * Mevcut kursun durumunu DOM'dan veya cache'den oku.
 * window.__courseDurum loadCourse() tarafindan set ediliyor.
 */
function getCourseDurum() {
    return window.__courseDurum || 'taslak';
}

/**
 * Bölüm silme/gizleme işlemi.
 * Taslakta hard-delete, diger durumlarda soft-delete (gizleme) yapilir.
 */
async function handleDeleteSection(sectionId) {
    const durum = getCourseDurum();
    const isDraft = durum === 'taslak';
    const message = isDraft
        ? 'Bu bölümü ve tüm derslerini KALICI olarak silmek istediğinize emin misiniz?'
        : 'Bu kurs onaylı/yayında olduğu için bölüm KALICI silinmeyecek; öğrencilerden GİZLENECEK ve ilerleme hesabından çıkarılacak. Devam edilsin mi?';
    if (!confirm(message)) return;

    try {
        await ApiService.delete(`/curriculum/sections/${sectionId}`);
        showToast(isDraft ? 'Bölüm silindi.' : 'Bölüm gizlendi.', 'success');
        await loadCurriculum();
    } catch (error) {
        console.error('[SECTION DELETE] Hata:', error.message);
        showToast(`Hata: ${error.message}`, 'error');
    }
}

/**
 * Ders silme/gizleme işlemi.
 */
async function handleDeleteLesson(lessonId) {
    const durum = getCourseDurum();
    const isDraft = durum === 'taslak';
    const message = isDraft
        ? 'Bu dersi KALICI olarak silmek istediğinize emin misiniz?'
        : 'Bu kurs onaylı/yayında olduğu için ders KALICI silinmeyecek; öğrencilerden GİZLENECEK ve ilerleme hesabından çıkarılacak. Devam edilsin mi?';
    if (!confirm(message)) return;

    try {
        await ApiService.delete(`/curriculum/lessons/${lessonId}`);
        showToast(isDraft ? 'Ders silindi.' : 'Ders gizlendi.', 'success');
        await loadCurriculum();
    } catch (error) {
        console.error('[LESSON DELETE] Hata:', error.message);
        showToast(`Hata: ${error.message}`, 'error');
    }
}

/**
 * Soft-delete edilmis bolumu geri yukle.
 */
async function handleRestoreSection(sectionId) {
    if (!confirm('Bu bölümü geri yüklemek istiyor musunuz? İçindeki dersleri ayrıca geri yüklemeniz gerekebilir.')) return;
    try {
        await ApiService.post(`/curriculum/sections/${sectionId}/restore`, {});
        showToast('Bölüm geri yüklendi.', 'success');
        await loadCurriculum();
    } catch (error) {
        console.error('[SECTION RESTORE] Hata:', error.message);
        showToast(`Hata: ${error.message}`, 'error');
    }
}

/**
 * Soft-delete edilmis dersi geri yukle.
 */
async function handleRestoreLesson(lessonId) {
    if (!confirm('Bu dersi geri yüklemek istiyor musunuz?')) return;
    try {
        await ApiService.post(`/curriculum/lessons/${lessonId}/restore`, {});
        showToast('Ders geri yüklendi.', 'success');
        await loadCurriculum();
    } catch (error) {
        console.error('[LESSON RESTORE] Hata:', error.message);
        showToast(`Hata: ${error.message}`, 'error');
    }
}

/**
 * Toast mesajı göster
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * HTML escape eder
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Global fonksiyonlar
 */
window.switchTab = (tabId) => {
    document.querySelectorAll('.sidebar-menu button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[onclick="window.switchTab('${tabId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const tab = document.getElementById(tabId);
    if (tab) tab.classList.add('active');

    if (tabId === 'yorumlar' && !window._reviewsLoaded) {
        window._reviewsLoaded = true;
        loadReviews();
    }
};

window.showSectionModal = () => {
    document.getElementById('bolumEkleModal').style.display = 'flex';
};

window.closeSectionModal = () => {
    document.getElementById('bolumEkleModal').style.display = 'none';
};

window.showLessonModal = (sectionId) => {
    // Tıklanan bölümün ID'sini gizli inputa yaz
    const bolumInput = document.getElementById('secili_bolum_id');
    if (bolumInput) {
        bolumInput.value = sectionId;
    }
    
    const modal = document.getElementById('dersEkleModal');
    if (modal) modal.style.display = 'flex';
};

window.closeLessonModal = () => {
    const modal = document.getElementById('dersEkleModal');
    if (modal) modal.style.display = 'none';
};

window.closeLessonModal = () => {
    document.getElementById('dersEkleModal').style.display = 'none';
};

window.openLessonModal = (sectionId) => window.showLessonModal(sectionId);

window.sendCourseForApproval = async () => {
    try {
        const result = await ApiService.put(`/courses/${courseId}/status`, {
            durum: 'onay_bekliyor'
        });
        showToast('Kurs onaya gönderildi.', 'success');
        setTimeout(() => window.location.href = '/instructor/dashboard.html', 2000);
    } catch (error) {
        console.error('[APPROVAL] Hata:', error.message);
        showToast(`Hata: ${error.message}`, 'error');
    }
};

window.handleLogout = () => {
    if (typeof ApiService !== 'undefined' && typeof ApiService.logout === 'function') {
        ApiService.logout();
    } else {
        localStorage.clear();
        window.location.href = '/auth/index.html';
    }
};

// ═══════════════════════════════════════════════════
// QUİZ MODAL — Eğitmen quiz soru/cevap düzenleme
// ═══════════════════════════════════════════════════

let _quizLessonId = null; // Modal açıkken hangi dersin quiz'i

window.openQuizModal = async (lessonId) => {
    _quizLessonId = lessonId;
    const modal = document.getElementById('quizModal');
    if (!modal) return;

    // Formu sıfırla
    document.getElementById('quiz_gecme_puani').value = 70;
    document.getElementById('quiz_sure_dakika').value = '';
    document.getElementById('quizSorularContainer').innerHTML = '<p style="color:#64748b; font-size:0.9rem;">Yükleniyor...</p>';
    modal.style.display = 'flex';

    try {
        const res = await ApiService.get(`/quiz/lesson/${lessonId}`);
        const quiz = res.data;

        if (quiz) {
            document.getElementById('quiz_gecme_puani').value = quiz.gecme_puani ?? 70;
            document.getElementById('quiz_sure_dakika').value = quiz.sure_dakika ?? '';
            // Soruları doldur
            document.getElementById('quizSorularContainer').innerHTML = '';
            (quiz.Questions || []).forEach(q => _appendQuestion(q));
        } else {
            document.getElementById('quizSorularContainer').innerHTML = '';
        }
    } catch (err) {
        document.getElementById('quizSorularContainer').innerHTML = '';
        showToast('Quiz yüklenemedi: ' + err.message, 'error');
    }
};

window.closeQuizModal = () => {
    const modal = document.getElementById('quizModal');
    if (modal) modal.style.display = 'none';
    _quizLessonId = null;
};

// Yeni boş soru ekle
window.addQuizQuestion = () => _appendQuestion(null);

function _appendQuestion(existingQ) {
    const container = document.getElementById('quizSorularContainer');
    const idx = container.children.length;
    const div = document.createElement('div');
    div.className = 'quiz-soru-item';
    div.dataset.idx = idx;
    div.style.cssText = 'background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin-bottom:14px;';

    const seceneklerHtml = (existingQ?.Choices || [{ secenek_metni: '', dogru_mu: false }, { secenek_metni: '', dogru_mu: false }])
        .map((c, ci) => _choiceHtml(idx, ci, c))
        .join('');

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <strong style="font-size:0.9rem; color:#1e293b;">Soru ${idx + 1}</strong>
            <button type="button" onclick="window.removeQuizQuestion(this)" style="background:#fee2e2; border:none; color:#991b1b; padding:4px 10px; border-radius:6px; cursor:pointer; font-size:0.8rem;"><i class="fas fa-trash"></i> Kaldır</button>
        </div>
        <textarea class="form-control quiz-soru-metni" rows="2" placeholder="Soru metnini yazın..." style="margin-bottom:10px; resize:vertical;">${escapeHtml(existingQ?.soru_metni || '')}</textarea>
        <div class="quiz-secenekler-list" style="display:flex; flex-direction:column; gap:8px;">
            ${seceneklerHtml}
        </div>
        <button type="button" onclick="window.addQuizChoice(this)" style="margin-top:10px; background:#ede9fe; border:1px dashed #8b5cf6; color:#6d28d9; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:0.82rem; width:100%;"><i class="fas fa-plus"></i> Seçenek Ekle</button>
    `;
    container.appendChild(div);
}

function _choiceHtml(qIdx, cIdx, choice) {
    const checked = choice.dogru_mu ? 'checked' : '';
    return `
        <div class="quiz-secenek-item" style="display:flex; align-items:center; gap:8px;">
            <input type="radio" name="dogru_cevap_${qIdx}" value="${cIdx}" ${checked} style="accent-color:#8b5cf6;" title="Doğru cevap">
            <input type="text" class="form-control quiz-secenek-metni" placeholder="Seçenek metni..." value="${escapeHtml(choice.secenek_metni || '')}" style="flex:1;">
            <button type="button" onclick="window.removeQuizChoice(this)" style="background:#fee2e2; border:none; color:#991b1b; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:0.75rem;" title="Bu seçeneği kaldır"><i class="fas fa-times"></i></button>
        </div>
    `;
}

window.removeQuizQuestion = (btn) => {
    btn.closest('.quiz-soru-item').remove();
    // Soru başlıklarını güncelle
    document.querySelectorAll('#quizSorularContainer .quiz-soru-item').forEach((el, i) => {
        el.querySelector('strong').textContent = `Soru ${i + 1}`;
    });
};

window.addQuizChoice = (btn) => {
    const soruItem = btn.closest('.quiz-soru-item');
    const qIdx = parseInt(soruItem.dataset.idx);
    const list = soruItem.querySelector('.quiz-secenekler-list');
    const cIdx = list.children.length;
    list.insertAdjacentHTML('beforeend', _choiceHtml(qIdx, cIdx, { secenek_metni: '', dogru_mu: false }));
};

window.removeQuizChoice = (btn) => {
    const list = btn.closest('.quiz-secenekler-list');
    if (list.children.length <= 2) {
        showToast('En az 2 seçenek olmalı.', 'error');
        return;
    }
    btn.closest('.quiz-secenek-item').remove();
};

// ═══════════════════════════════════════════════════
// BÖLÜM 2 — KURS STÜDYOSU (Temel Bilgiler, Medya, Yorumlar)
// ═══════════════════════════════════════════════════

let _dirtyTab = null;

async function loadCourseForEdit() {
    try {
        const res = await ApiService.get(`/courses/${courseId}/for-edit`);
        const course = res.data;
        window.__courseData = course;
        window.__courseDurum = course.durum;

        const nameEl = document.getElementById('studioCourseName');
        if (nameEl) nameEl.textContent = course.baslik || 'Kurs';

        updateStatusUI(course.durum, course.kayitli_ogrenci_sayisi);

        _setVal('tb_baslik', course.baslik);
        _setVal('tb_alt_baslik', course.alt_baslik);
        _setVal('tb_seviye', course.seviye);
        _setVal('tb_dil', course.dil);
        _setVal('tb_gereksinimler', course.gereksinimler);
        _setVal('tb_kazanimlar', course.kazanimlar);
        _setVal('mp_fiyat', course.fiyat);

        if (window._quillEditor) {
            window._quillEditor.clipboard.dangerouslyPasteHTML(course.aciklama || '');
        }

        if (course.kapak_fotografi) {
            const previewEl = document.getElementById('thumbnailPreview');
            const placeholder = document.getElementById('thumbnailPlaceholder');
            if (previewEl) { previewEl.src = course.kapak_fotografi; previewEl.style.display = 'block'; }
            if (placeholder) placeholder.style.display = 'none';
        }

        const priceWarn = document.getElementById('priceWarning');
        if (priceWarn && course.durum === 'yayinda') {
            ApiService.count ? null : null; // no-op
            priceWarn.style.display = course.kayitli_ogrenci_sayisi > 0 ? 'block' : 'none';
        }
    } catch (err) {
        showToast('Kurs bilgileri yüklenemedi: ' + err.message, 'error');
    }
}

function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
}

function updateStatusUI(durum, ogrenciSayisi) {
    const badge = document.getElementById('studioStatusBadge');
    const toggleBtn = document.getElementById('btnToggleStatus');
    const deleteBtn = document.getElementById('btnDeleteCourse');
    const ogrenciBadge = document.getElementById('ogrenciSayisiBadge');

    const labelMap = { taslak: 'Taslak', onay_bekliyor: 'Onay Bekliyor', onaylandi: 'Onaylandı', yayinda: 'Yayında', arsiv: 'Arşiv' };

    if (badge) {
        badge.className = `status-badge status-${durum}`;
        badge.textContent = labelMap[durum] || durum;
    }

    if (toggleBtn) {
        if (durum === 'yayinda') {
            toggleBtn.innerHTML = '<i class="fas fa-pause-circle"></i> Yayından Kaldır';
            toggleBtn.classList.add('unpublish');
            toggleBtn.disabled = false;
        } else if (durum === 'onay_bekliyor') {
            toggleBtn.innerHTML = '<i class="fas fa-clock"></i> Onay Bekliyor';
            toggleBtn.disabled = true;
            toggleBtn.classList.remove('unpublish');
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-rocket"></i> Onaya Gönder';
            toggleBtn.classList.remove('unpublish');
            toggleBtn.disabled = false;
        }
    }

    if (ogrenciBadge) {
        if (ogrenciSayisi > 0) {
            ogrenciBadge.textContent = `${ogrenciSayisi} öğrenci`;
            ogrenciBadge.style.display = 'inline-block';
        } else {
            ogrenciBadge.style.display = 'none';
        }
    }

    if (deleteBtn) {
        deleteBtn.disabled = ogrenciSayisi > 0;
        deleteBtn.title = ogrenciSayisi > 0 ? `${ogrenciSayisi} kayıtlı öğrenci olduğu için silinemez` : 'Kursu sil';
    }
}

async function loadCategoriesForEdit() {
    const select = document.getElementById('tb_kategori_id');
    if (!select) return;
    try {
        const res = await ApiService.get('/categories');
        (res.data || []).forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.ad;
            select.appendChild(opt);
        });
        if (window.__courseData?.kategori_id) {
            select.value = window.__courseData.kategori_id;
        }
    } catch (err) {
        console.error('[EDIT] Kategoriler yüklenemedi:', err.message);
    }
}

function initQuillEditor() {
    const container = document.getElementById('quillEditorContainer');
    if (!container || !window.Quill) return;

    window._quillEditor = new Quill('#quillEditorContainer', {
        theme: 'snow',
        placeholder: 'Kursunuz hakkında detaylı bilgi verin...',
        modules: {
            toolbar: [
                ['bold', 'italic', 'underline'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link'],
                ['clean']
            ]
        }
    });

    window._quillEditor.on('text-change', () => _markDirty('temel_bilgiler'));

    if (window.__courseData?.aciklama) {
        window._quillEditor.clipboard.dangerouslyPasteHTML(window.__courseData.aciklama);
    }
}

function setupSettingsListeners() {
    const dirtyFields = ['tb_baslik', 'tb_alt_baslik', 'tb_kategori_id', 'tb_seviye', 'tb_dil', 'tb_gereksinimler', 'tb_kazanimlar'];
    dirtyFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => _markDirty('temel_bilgiler'));
    });

    const fiyatEl = document.getElementById('mp_fiyat');
    if (fiyatEl) fiyatEl.addEventListener('input', () => _markDirty('medya_fiyat'));

    const thumbInput = document.getElementById('thumbnailInput');
    if (thumbInput) {
        thumbInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const previewEl = document.getElementById('thumbnailPreview');
                const placeholder = document.getElementById('thumbnailPlaceholder');
                if (previewEl) { previewEl.src = ev.target.result; previewEl.style.display = 'block'; }
                if (placeholder) placeholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
            _markDirty('medya_fiyat');
        });
    }
}

function _markDirty(tab) {
    _dirtyTab = tab;
    const bar = document.getElementById('saveBar');
    if (bar) bar.classList.add('visible');
}

function _clearDirty() {
    _dirtyTab = null;
    const bar = document.getElementById('saveBar');
    if (bar) bar.classList.remove('visible');
}

window.saveCurrentTabChanges = async () => {
    if (_dirtyTab === 'temel_bilgiler') await window.handleSaveBasicInfo();
    else if (_dirtyTab === 'medya_fiyat') await window.handleSaveMediaPricing();
};

window.discardCurrentTabChanges = () => {
    _clearDirty();
    if (!window.__courseData) return;
    _setVal('tb_baslik', window.__courseData.baslik);
    _setVal('tb_alt_baslik', window.__courseData.alt_baslik);
    _setVal('tb_gereksinimler', window.__courseData.gereksinimler);
    _setVal('tb_kazanimlar', window.__courseData.kazanimlar);
    _setVal('mp_fiyat', window.__courseData.fiyat);
    if (window._quillEditor) {
        window._quillEditor.clipboard.dangerouslyPasteHTML(window.__courseData.aciklama || '');
    }
};

window.handleSaveBasicInfo = async () => {
    const baslik = document.getElementById('tb_baslik')?.value.trim();
    if (!baslik) { showToast('Kurs başlığı zorunludur.', 'error'); return; }

    const aciklama = window._quillEditor
        ? window._quillEditor.root.innerHTML
        : (document.getElementById('tb_aciklama')?.value || '');

    const payload = {
        baslik,
        alt_baslik: document.getElementById('tb_alt_baslik')?.value.trim() || '',
        aciklama,
        kategori_id: document.getElementById('tb_kategori_id')?.value,
        seviye: document.getElementById('tb_seviye')?.value,
        dil: document.getElementById('tb_dil')?.value,
        gereksinimler: document.getElementById('tb_gereksinimler')?.value.trim() || '',
        kazanimlar: document.getElementById('tb_kazanimlar')?.value.trim() || ''
    };

    try {
        const res = await ApiService.put(`/courses/${courseId}/settings`, payload);
        if (res.criticalFieldWarning) {
            showToast('Kaydedildi. Yayındaki kursun kategori/fiyatı değiştirilemedi.', 'warning');
        } else {
            showToast('Temel bilgiler kaydedildi.', 'success');
        }
        Object.assign(window.__courseData, payload);
        document.getElementById('studioCourseName').textContent = baslik;
        _clearDirty();
    } catch (err) {
        showToast('Kaydetme hatası: ' + err.message, 'error');
    }
};

window.handleSaveMediaPricing = async () => {
    const fileInput = document.getElementById('thumbnailInput');
    const fiyat = document.getElementById('mp_fiyat')?.value;
    const token = localStorage.getItem('edunex_token');

    let saved = false;

    // Thumbnail yükleme
    if (fileInput?.files[0]) {
        const formData = new FormData();
        formData.append('thumbnail', fileInput.files[0]);
        try {
            const response = await fetch(`/api/courses/${courseId}/thumbnail`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Thumbnail yüklenemedi');
            if (data.data?.kapak_fotografi && window.__courseData) {
                window.__courseData.kapak_fotografi = data.data.kapak_fotografi;
            }
            saved = true;
        } catch (err) {
            showToast('Kapak fotoğrafı hatası: ' + err.message, 'error');
            return;
        }
    }

    // Fiyat güncelleme
    if (fiyat !== undefined && fiyat !== '') {
        try {
            const res = await ApiService.put(`/courses/${courseId}/settings`, { fiyat: parseFloat(fiyat) });
            if (res.criticalFieldWarning) {
                showToast('Kapak kaydedildi. Yayındaki kursun fiyatı değiştirilemedi.', 'warning');
            } else {
                saved = true;
            }
            if (window.__courseData) window.__courseData.fiyat = fiyat;
        } catch (err) {
            showToast('Fiyat kaydetme hatası: ' + err.message, 'error');
            return;
        }
    }

    if (saved) showToast('Medya ve fiyat kaydedildi.', 'success');
    _clearDirty();
};

window.handleToggleStatus = async () => {
    const durum = window.__courseDurum;
    const msg = durum === 'yayinda'
        ? 'Kursu yayından kaldırmak istediğinize emin misiniz?'
        : 'Kursu onaya göndermek istediğinize emin misiniz? (En az 1 bölüm + 1 ders gerekli)';
    if (!confirm(msg)) return;

    try {
        const res = await ApiService.post(`/courses/${courseId}/toggle-status`, {});
        showToast(res.message, 'success');
        window.__courseDurum = res.data.durum;
        updateStatusUI(res.data.durum, window.__courseData?.kayitli_ogrenci_sayisi || 0);
    } catch (err) {
        showToast('Hata: ' + err.message, 'error');
    }
};

window.handleDeleteCourse = async () => {
    if (!confirm('Bu kursu KALICI olarak silmek istediğinize emin misiniz?')) return;
    if (!confirm('Son onay: Tüm bölümler, dersler ve veriler silinecektir. Geri alınamaz!')) return;

    try {
        await ApiService.delete(`/courses/${courseId}`);
        showToast('Kurs silindi. Yönlendiriliyor...', 'success');
        setTimeout(() => { window.location.href = '/instructor/dashboard.html'; }, 1500);
    } catch (err) {
        showToast('Silme hatası: ' + err.message, 'error');
    }
};

async function loadReviews() {
    const container = document.getElementById('yorumlarListesi');
    if (!container) return;
    container.innerHTML = '<p class="loading-text"><i class="fas fa-spinner fa-spin"></i> Yorumlar yükleniyor...</p>';

    try {
        const res = await ApiService.get(`/courses/${courseId}/instructor-reviews`);
        const reviews = res.data || [];

        if (reviews.length === 0) {
            container.innerHTML = '<div class="empty-section"><i class="fas fa-comments" style="font-size:2rem; display:block; margin-bottom:8px;"></i><p>Henüz yorum yapılmamış.</p></div>';
            return;
        }

        const avgPuan = reviews.reduce((s, r) => s + r.puan, 0) / reviews.length;
        const statsHtml = `<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin-bottom:20px; display:flex; gap:24px; align-items:center;">
            <div style="text-align:center;">
                <div style="font-size:2.5rem; font-weight:800; color:#f59e0b;">${avgPuan.toFixed(1)}</div>
                <div style="color:#94a3b8; font-size:0.8rem;">Ortalama Puan</div>
            </div>
            <div>
                <div style="font-size:1rem; font-weight:600; color:#1e293b;">${reviews.length} yorum</div>
                <div style="color:#64748b; font-size:0.85rem; margin-top:2px;">${'★'.repeat(Math.round(avgPuan))}${'☆'.repeat(5 - Math.round(avgPuan))}</div>
            </div>
        </div>`;

        const cardsHtml = reviews.map(r => `
            <div class="review-card">
                <div class="review-card-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-weight:700; color:#475569; font-size:0.95rem; flex-shrink:0;">
                            ${escapeHtml((r.Yazar?.ad || 'Ö').charAt(0).toUpperCase())}
                        </div>
                        <div>
                            <div style="font-weight:600; font-size:0.9rem; color:#1e293b;">${escapeHtml(r.Yazar ? `${r.Yazar.ad} ${r.Yazar.soyad}` : 'Öğrenci')}</div>
                            <div style="font-size:0.75rem; color:#94a3b8;">${new Date(r.olusturulma_tarihi).toLocaleDateString('tr-TR')}</div>
                        </div>
                    </div>
                    <div class="review-stars">${'★'.repeat(r.puan)}${'☆'.repeat(5 - r.puan)} <span style="color:#94a3b8; font-size:0.82rem;">(${r.puan}/5)</span></div>
                </div>
                ${r.yorum ? `<p style="margin:0; font-size:0.88rem; color:#475569; line-height:1.6;">${escapeHtml(r.yorum)}</p>` : '<p style="margin:0; font-size:0.82rem; color:#94a3b8; font-style:italic;">Yorum yazılmamış.</p>'}
            </div>
        `).join('');

        container.innerHTML = statsHtml + cardsHtml;
    } catch (err) {
        container.innerHTML = `<div class="empty-section"><p>Yorumlar yüklenemedi: ${err.message}</p></div>`;
    }
}

window.saveQuiz = async () => {
    if (!_quizLessonId) return;

    const gecme_puani = parseInt(document.getElementById('quiz_gecme_puani').value) || 70;
    const sure_dakika = parseInt(document.getElementById('quiz_sure_dakika').value) || null;

    const soruItems = document.querySelectorAll('#quizSorularContainer .quiz-soru-item');
    if (soruItems.length === 0) {
        showToast('En az 1 soru eklemelisiniz.', 'error');
        return;
    }

    const sorular = [];
    let hata = null;

    soruItems.forEach((soruEl, si) => {
        if (hata) return;
        const soru_metni = soruEl.querySelector('.quiz-soru-metni').value.trim();
        if (!soru_metni) { hata = `Soru ${si + 1}: soru metni boş olamaz.`; return; }

        const secenekEls = soruEl.querySelectorAll('.quiz-secenek-item');
        if (secenekEls.length < 2) { hata = `Soru ${si + 1}: en az 2 seçenek gerekli.`; return; }

        const secenekler = [];
        let dogru_sayisi = 0;
        const dogru_radio = soruEl.querySelector(`input[type="radio"][name^="dogru_cevap_"]:checked`);

        secenekEls.forEach((cEl, ci) => {
            const secenek_metni = cEl.querySelector('.quiz-secenek-metni').value.trim();
            if (!secenek_metni) { hata = `Soru ${si + 1}, Seçenek ${ci + 1}: boş olamaz.`; return; }
            const dogru_mu = dogru_radio ? parseInt(dogru_radio.value) === ci : false;
            if (dogru_mu) dogru_sayisi++;
            secenekler.push({ secenek_metni, dogru_mu });
        });

        if (dogru_sayisi !== 1) { hata = `Soru ${si + 1}: tam olarak 1 doğru cevap işaretlenmeli.`; return; }
        sorular.push({ soru_metni, soru_tipi: 'coktan_secmeli', secenekler });
    });

    if (hata) { showToast(hata, 'error'); return; }

    const saveBtn = document.getElementById('quizSaveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kaydediliyor...';

    try {
        await ApiService.post(`/quiz/lesson/${_quizLessonId}`, { gecme_puani, sure_dakika, sorular });
        showToast('Quiz başarıyla kaydedildi.', 'success');
        window.closeQuizModal();
    } catch (err) {
        showToast('Kayıt hatası: ' + err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Kaydet';
    }
};