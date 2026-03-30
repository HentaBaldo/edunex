// public/instructor/js/edit-course.js
import { UIHelper } from './modules/ui-helper.js';
import { CurriculumView } from './modules/curriculum-view.js';
import { CurriculumActions } from './modules/curriculum-actions.js';

let courseId = new URLSearchParams(window.location.search).get('id');

document.addEventListener('DOMContentLoaded', async () => {
    if (!UIHelper.checkInstructorAccess()) return;
    if (!courseId) {
        alert("Geçersiz Kurs ID'si.");
        window.location.href = '/instructor/dashboard.html';
        return;
    }
    await loadCurriculum();
    setupEventListeners();
});

async function loadCurriculum() {
    const listDiv = document.getElementById('mufredatListesi');
    if (listDiv) listDiv.innerHTML = '<div style="text-align:center; padding:30px;"><i class="fas fa-spinner fa-spin"></i> Güncelleniyor...</div>';
    
    try {
        const result = await ApiService.get(`/curriculum/${courseId}`);
        CurriculumView.renderCurriculum(result.data || [], 'mufredatListesi');
    } catch (error) {
        console.error('Yükleme Hatası:', error);
    }
}

function setupEventListeners() {
    // Bölüm Ekleme Formu
    document.getElementById('bolumEkleForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = { 
            kurs_id: courseId, 
            baslik: document.getElementById('bolum_baslik').value.trim(), 
            aciklama: document.getElementById('bolum_aciklama').value.trim() 
        };
        try {
            await CurriculumActions.addSection(payload);
            UIHelper.toggleModal('bolumEkleModal', 'none');
            UIHelper.resetForm('bolumEkleForm');
            await loadCurriculum();
        } catch (error) { alert(error.message); }
    });

    // Video/Ders Yükleme Formu
    document.getElementById('dersEkleForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('bolum_id', document.getElementById('secili_bolum_id').value);
        formData.append('baslik', document.getElementById('ders_baslik').value.trim());
        formData.append('video', document.getElementById('video_dosyasi').files[0]);

        try {
            const result = await CurriculumActions.uploadVideo(formData);
            if (result.success) {
                UIHelper.toggleModal('dersEkleModal', 'none');
                UIHelper.resetForm('dersEkleForm');
                await loadCurriculum();
            }
        } catch (error) { alert(error.message); }
        finally { submitBtn.disabled = false; }
    });

    // Dinamik Butonlar (Silme ve Modal Açma) için Event Delegation
    document.getElementById('mufredatListesi').addEventListener('click', async (e) => {
        const target = e.target;
        const sectionDelBtn = target.closest('.btn-delete-section');
        const lessonDelBtn = target.closest('.btn-delete-lesson');
        const addLessonBtn = target.closest('.btn-add-lesson-trigger');

        if (sectionDelBtn) {
            if (await CurriculumActions.deleteSection(sectionDelBtn.dataset.id)) await loadCurriculum();
        }
        if (lessonDelBtn) {
            if (await CurriculumActions.deleteLesson(lessonDelBtn.dataset.id)) await loadCurriculum();
        }
        if (addLessonBtn) {
            document.getElementById('secili_bolum_id').value = addLessonBtn.dataset.id;
            UIHelper.toggleModal('dersEkleModal', 'flex');
        }
    });
}

// Global fonksiyonları window objesine bağlıyoruz (HTML'den çağrılanlar için)
window.showSectionModal = () => UIHelper.toggleModal('bolumEkleModal', 'flex');
window.closeSectionModal = () => UIHelper.toggleModal('bolumEkleModal', 'none');
window.closeLessonModal = () => UIHelper.toggleModal('dersEkleModal', 'none');
window.switchTab = (id) => UIHelper.switchTab(id);
window.sendCourseForApproval = async () => {
    if (await CurriculumActions.sendForApproval(courseId)) window.location.href = '/instructor/dashboard.html';
};