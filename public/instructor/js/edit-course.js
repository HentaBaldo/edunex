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

        if (sections.length === 0) {
            listDiv.innerHTML = `
                <div class="empty-section">
                    <i class="fas fa-inbox" style="font-size: 2rem; display: block; margin-bottom: 10px;"></i>
                    <p>Henüz bölüm eklemediniz.</p>
                </div>
            `;
            return;
        }

        listDiv.innerHTML = '';
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

    return `
        <div class="section-item" id="section-${section.id}">
            <div class="section-header">
                <div class="section-title-group">
                    <h4>
                        <i class="fas fa-folder" style="color: #2563eb;"></i>
                        ${escapeHtml(section.baslik)}
                    </h4>
                </div>
                <div class="action-buttons">
                    <button type="button" class="btn-primary-sm btn-add-lesson" data-section-id="${section.id}">
                        <i class="fas fa-plus"></i> Ders Ekle
                    </button>
                    <button type="button" class="btn-delete-icon btn-delete-section" data-section-id="${section.id}" title="Bölümü sil">
                        <i class="fas fa-trash-alt"></i>
                    </button>
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
        
        return `
            <div class="lesson-item" id="lesson-${lesson.id}">
                <div class="lesson-info">
                    <i class="fas ${lesson.icerik_tipi === 'video' ? 'fa-play-circle' : 'fa-file-alt'}"></i>
                    <span>${escapeHtml(lesson.baslik)}</span>
                    ${lesson.onizleme_mi ? '<i class="fas fa-eye" style="color: #2563eb; margin-left: auto; margin-right: 10px;"></i>' : ''}
                    ${durationText ? `<span style="color: #64748b; font-size: 0.8rem; margin-left: 8px;">${durationText}</span>` : ''}
                </div>
                <button type="button" class="btn-delete-sm btn-delete-lesson" data-lesson-id="${lesson.id}" title="Dersi sil">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    }).join('');
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
    const icerikTipiSelect = document.getElementById('icerik_tipi');
    const dosyaYuklemeGrubu = document.getElementById('dosya_yukleme_grubu');

    if (icerikTipiSelect && dosyaYuklemeGrubu) {
        icerikTipiSelect.addEventListener('change', (e) => {
            if (e.target.value === 'quiz') {
                dosyaYuklemeGrubu.style.display = 'none';
            } else {
                dosyaYuklemeGrubu.style.display = 'block';
            }
        });
        
        icerikTipiSelect.dispatchEvent(new Event('change'));
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
 * Ders ekleme işlemi - VIDEO UPLOAD
 */
async function handleAddLesson() {
    const bolumId = document.getElementById('secili_bolum_id')?.value;
    const baslik = document.getElementById('ders_baslik')?.value.trim();
    const icerikTipi = document.getElementById('icerik_tipi')?.value;
    const sureSaniye = parseInt(document.getElementById('sure_saniye')?.value) || 0;
    const kaynakUrl = document.getElementById('kaynak_url')?.value.trim();
    const onizlemeMi = document.getElementById('onizleme_mi')?.checked || false;
    const aciklama = document.getElementById('ders_aciklama')?.value.trim();
    const dosyaInput = document.getElementById('ders_dosyasi');

    if (!baslik) {
        showToast('Ders başlığı gereklidir.', 'error');
        return;
    }

    try {
        // ✅ LOADING GÖSTER
        showToast('Video yükleniyor, lütfen bekleyin...', 'info');
        
        const formData = new FormData();
        
        formData.append('bolum_id', bolumId);
        formData.append('baslik', baslik);
        formData.append('icerik_tipi', icerikTipi || 'video');
        formData.append('sure_saniye', sureSaniye);
        formData.append('kaynak_url', kaynakUrl || '');
        formData.append('onizleme_mi', onizlemeMi);
        formData.append('aciklama', aciklama || '');
        
        // Video dosyası
        if (dosyaInput && dosyaInput.files.length > 0) {
            const videoFile = dosyaInput.files[0];
            
            const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
            if (!validTypes.includes(videoFile.type)) {
                showToast(`Geçersiz dosya tipi: ${videoFile.type}`, 'error');
                return;
            }
            
            const maxSize = 4 * 1024 * 1024 * 1024;
            if (videoFile.size > maxSize) {
                showToast(`Dosya çok büyük: ${(videoFile.size / 1024 / 1024 / 1024).toFixed(2)}GB`, 'error');
                return;
            }
            
            formData.append('video', videoFile);
            console.log(`[LESSON ADD] Video: ${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(2)}MB)`);
        }

        console.log('[LESSON ADD] FormData gönderiliyor');

        const token = localStorage.getItem('edunex_token');
        const response = await fetch('/api/curriculum/lessons', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        // ✅ Response kontrolü
        let result;
        try {
            result = await response.json();
        } catch (e) {
            throw new Error(`Sunucudan yanıt alınamadı: ${response.status}`);
        }

        if (!response.ok) {
            throw new Error(result.message || `HTTP Error: ${response.status}`);
        }

        console.log('[LESSON ADD] Başarı:', result);

        if (result.status === 'success') {
            // ✅ BAŞARILI BİLDİRİM
            showToast('✅ Ders başarıyla eklendi!', 'success');
            
            if (result.data.processingNote) {
                showToast(`ℹ️ ${result.data.processingNote}`, 'info');
            }
            
            // Modal kapat
            window.closeLessonModal();
            
            // Form temizle
            document.getElementById('dersEkleForm').reset();
            document.getElementById('ders_dosyasi').value = '';
            
            // Listeyi yenile
            await loadCurriculum();
        }

    } catch (error) {
        console.error('[LESSON ADD] HATA:', error.message);
        showToast(`❌ Hata: ${error.message}`, 'error');
    }
}

/**
 * Bölüm silme işlemi
 */
async function handleDeleteSection(sectionId) {
    if (!confirm('Bu bölümü ve tüm derslerini silmek istediğinize emin misiniz?')) return;

    try {
        await ApiService.delete(`/curriculum/sections/${sectionId}`);
        showToast('Bölüm başarıyla silindi.', 'success');
        await loadCurriculum();
    } catch (error) {
        console.error('[SECTION DELETE] Hata:', error.message);
        showToast(`Hata: ${error.message}`, 'error');
    }
}

/**
 * Ders silme işlemi
 */
async function handleDeleteLesson(lessonId) {
    if (!confirm('Bu dersi silmek istediğinize emin misiniz?')) return;

    try {
        await ApiService.delete(`/curriculum/lessons/${lessonId}`);
        showToast('Ders başarıyla silindi.', 'success');
        await loadCurriculum();
    } catch (error) {
        console.error('[LESSON DELETE] Hata:', error.message);
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
};

window.showSectionModal = () => {
    document.getElementById('bolumEkleModal').style.display = 'flex';
};

window.closeSectionModal = () => {
    document.getElementById('bolumEkleModal').style.display = 'none';
};

window.showLessonModal = (sectionId) => {
    document.getElementById('secili_bolum_id').value = sectionId;
    document.getElementById('dersEkleModal').style.display = 'flex';
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