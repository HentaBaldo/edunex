/**
 * EduNex Instructor - Müfredat Yönetimi (Edit Course)
 */

let courseId = null;
let deleteAction = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkInstructorAccess()) return;

    const urlParams = new URLSearchParams(window.location.search);
    courseId = urlParams.get('id');

    if (!courseId) {
        alert("Geçersiz Kurs ID'si.");
        window.location.href = '/instructor/dashboard.html';
        return;
    }

    await loadCurriculum();
});

function checkInstructorAccess() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');
    if (!token || !userJson) {
        window.location.href = '/auth/index.html'; return false;
    }
    try {
        const user = JSON.parse(userJson);
        if (user.rol !== 'egitmen') {
            window.location.href = '/main/index.html'; return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

function logout() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) ApiService.logout();
    else { localStorage.clear(); window.location.href = '/auth/index.html'; }
}

async function loadCurriculum() {
    const listDiv = document.getElementById('mufredatListesi');
    listDiv.innerHTML = '<p style="text-align:center; padding: 30px; color:#64748b;">Müfredat yükleniyor...</p>';
    
    try {
        const result = await ApiService.get(`/curriculum/${courseId}`);
        const sections = result.data || [];
        
        if (sections.length === 0) {
            listDiv.innerHTML = `
                <div style="text-align:center; padding: 40px; border: 2px dashed #cbd5e1; border-radius: 12px; margin-top:20px;">
                    <i class="fas fa-folder-open" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 15px;"></i>
                    <p style="color:#475569;">Henüz bir bölüm eklemediniz. İlk bölümünüzü oluşturarak başlayın!</p>
                </div>`;
            return;
        }

        listDiv.innerHTML = ''; 

        sections.forEach((bolum) => {
            const sectionHtml = `
                <div class="section-item" id="section-${bolum.id}">
                    <div class="section-header">
                        <div class="section-title-group">
                            <h4><i class="fas fa-folder" style="color:var(--primary-color); margin-right:8px;"></i> ${bolum.baslik}</h4>
                            ${bolum.aciklama ? `<small style="display:block; color:#64748b; margin-top:4px;">${bolum.aciklama}</small>` : ''}
                        </div>
                        <div class="action-buttons">
                            <button onclick="showLessonModal('${bolum.id}')" class="btn-primary-sm"><i class="fas fa-plus"></i> Ders Ekle</button>
                            <button onclick="initDeleteSection('${bolum.id}')" class="btn-delete-icon" title="Bölümü Sil"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                    <div class="lessons-list" id="lessons-${bolum.id}" style="padding-bottom: 10px;">
                        ${renderLessons(bolum.Lessons)}
                    </div>
                </div>
            `;
            listDiv.insertAdjacentHTML('beforeend', sectionHtml);
        });

    } catch (error) {
        listDiv.innerHTML = `<div class="message-box error active">Hata: ${error.message}</div>`;
    }
}

function renderLessons(lessons) {
    if (!lessons || lessons.length === 0) {
        return '<p style="text-align:center; color:#94a3b8; font-size:0.9rem; margin-top:15px;">Bu bölümde henüz ders yok.</p>';
    }
    return lessons.map(ders => {
        let icon = "fa-file-alt";
        if(ders.icerik_tipi === 'video') icon = "fa-play-circle";
        
        return `
        <div class="lesson-item">
            <div class="lesson-info">
                <i class="fas ${icon}"></i>
                <span>${ders.baslik}</span>
            </div>
            <button onclick="initDeleteLesson('${ders.id}')" class="btn-delete-sm" title="Dersi Sil">
                <i class="fas fa-times" style="color:#dc3545;"></i>
            </button>
        </div>
    `}).join('');
}

// --- MODAL İŞLEMLERİ ---
function showSectionModal() { document.getElementById('bolumEkleModal').style.display = 'flex'; }
function closeSectionModal() { document.getElementById('bolumEkleModal').style.display = 'none'; document.getElementById('bolumEkleForm').reset(); }

function showLessonModal(bolumId) {
    document.getElementById('secili_bolum_id').value = bolumId;
    document.getElementById('dersEkleModal').style.display = 'flex';
}
function closeLessonModal() { document.getElementById('dersEkleModal').style.display = 'none'; document.getElementById('dersEkleForm').reset(); }

// --- API İŞLEMLERİ (EKLEME) ---
document.getElementById('bolumEkleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = { kurs_id: courseId, baslik: document.getElementById('bolum_baslik').value, aciklama: document.getElementById('bolum_aciklama').value };
    try {
        await ApiService.post('/curriculum/sections', payload);
        closeSectionModal();
        await loadCurriculum();
    } catch (error) { alert(error.message); }
});

document.getElementById('dersEkleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        bolum_id: document.getElementById('secili_bolum_id').value,
        baslik: document.getElementById('ders_baslik').value,
        icerik_tipi: document.getElementById('icerik_tipi').value,
        kaynak_url: document.getElementById('kaynak_url').value,
        sure_saniye: parseInt(document.getElementById('sure_saniye').value) || 0,
        onizleme_mi: document.getElementById('onizleme_mi').checked,
        aciklama: ''
    };
    try {
        await ApiService.post('/curriculum/lessons', payload);
        closeLessonModal();
        await loadCurriculum();
    } catch (error) { alert(error.message); }
});

// --- SİLME İŞLEMLERİ ---
function initDeleteSection(id) {
    document.getElementById('confirmTitle').innerText = "Bölümü Sil?";
    document.getElementById('confirmMessage').innerText = "Bu bölümü ve içindeki tüm dersleri kalıcı olarak sileceksiniz.";
    document.getElementById('confirmModal').style.display = 'flex';
    deleteAction = async () => {
        try { await ApiService.delete(`/curriculum/sections/${id}`); closeConfirmModal(); await loadCurriculum(); } 
        catch (error) { alert(error.message); }
    };
}

function initDeleteLesson(id) {
    document.getElementById('confirmTitle').innerText = "Dersi Sil?";
    document.getElementById('confirmMessage').innerText = "Bu dersi silmek istediğinize emin misiniz?";
    document.getElementById('confirmModal').style.display = 'flex';
    deleteAction = async () => {
        try { await ApiService.delete(`/curriculum/lessons/${id}`); closeConfirmModal(); await loadCurriculum(); } 
        catch (error) { alert(error.message); }
    };
}

document.getElementById('confirmBtn').addEventListener('click', () => { if (deleteAction) deleteAction(); });
function closeConfirmModal() { document.getElementById('confirmModal').style.display = 'none'; deleteAction = null; }

// --- ONAYA GÖNDERME ---
async function sendCourseForApproval() {
    if (!confirm("Kursu yönetici onayına göndermek istediğinize emin misiniz?")) return;
    try {
        await ApiService.put(`/courses/${courseId}/status`, { durum: 'onay_bekliyor' });
        alert("Kurs başarıyla onaya gönderildi.");
        window.location.href = '/instructor/dashboard.html';
    } catch (error) { alert(error.message); }
}

// --- SEKME (TAB) DEĞİŞTİRME ---
function switchTab(tabId) {
    document.querySelectorAll('.sidebar-menu button').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`button[onclick="switchTab('${tabId}')"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });
    const selectedTab = document.getElementById(tabId);
    selectedTab.style.display = 'block';
    selectedTab.classList.add('active');
}