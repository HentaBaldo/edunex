/**
 * EduNex Instructor - Curriculum Management (Edit Course)
 */

let courseId = null;
let deleteAction = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkInstructorAccess()) return;

    const urlParams = new URLSearchParams(window.location.search);
    courseId = urlParams.get('id');

    if (!courseId) {
        alert("Gecersiz Kurs ID'si.");
        window.location.href = '/instructor/dashboard.html';
        return;
    }

    await loadCurriculum();
});

// --- Authentication & Access Control ---
function checkInstructorAccess() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');
    
    if (!token || !userJson) {
        window.location.href = '/auth/index.html'; 
        return false;
    }
    
    try {
        const user = JSON.parse(userJson);
        if (user.rol !== 'egitmen') {
            window.location.href = '/main/index.html'; 
            return false;
        }
        return true;
    } catch (error) {
        console.error('[EDIT COURSE] Access Check Error:', error.message);
        return false;
    }
}

function logout() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) {
        ApiService.logout();
    } else { 
        localStorage.clear(); 
        window.location.href = '/auth/index.html'; 
    }
}

// --- Curriculum Rendering ---
async function loadCurriculum() {
    const listDiv = document.getElementById('mufredatListesi');
    if (!listDiv) return;

    listDiv.innerHTML = '<p style="text-align:center; padding: 30px; color:#64748b;">Mufredat yukleniyor...</p>';
    
    try {
        const result = await ApiService.get(`/curriculum/${courseId}`);
        const sections = result.data || [];
        
        if (sections.length === 0) {
            listDiv.innerHTML = `
                <div style="text-align:center; padding: 40px; border: 2px dashed #cbd5e1; border-radius: 12px; margin-top:20px;">
                    <i class="fas fa-folder-open" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 15px;"></i>
                    <p style="color:#475569;">Henuz bir bolum eklemediniz. Ilk bolumunuzu olusturarak baslayin!</p>
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
                            <button onclick="initDeleteSection('${bolum.id}')" class="btn-delete-icon" title="Bolumu Sil"><i class="fas fa-trash-alt"></i></button>
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
        console.error('[EDIT COURSE] Load Curriculum Error:', error.message);
        listDiv.innerHTML = `<div class="message-box error active">Hata: ${error.message}</div>`;
    }
}

function renderLessons(lessons) {
    if (!lessons || lessons.length === 0) {
        return '<p style="text-align:center; color:#94a3b8; font-size:0.9rem; margin-top:15px;">Bu bolumde henuz ders yok.</p>';
    }
    
    return lessons.map(ders => {
        const icon = ders.icerik_tipi === 'video' ? 'fa-play-circle' : 'fa-file-alt';
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
        `;
    }).join('');
}

// --- Modal Management ---
function showSectionModal() { 
    const modal = document.getElementById('bolumEkleModal');
    if (modal) modal.style.display = 'flex'; 
}

function closeSectionModal() { 
    const modal = document.getElementById('bolumEkleModal');
    const form = document.getElementById('bolumEkleForm');
    if (modal) modal.style.display = 'none'; 
    if (form) form.reset(); 
}

function showLessonModal(bolumId) {
    const modal = document.getElementById('dersEkleModal');
    const input = document.getElementById('secili_bolum_id');
    if (input) input.value = bolumId;
    if (modal) modal.style.display = 'flex';
}

function closeLessonModal() { 
    const modal = document.getElementById('dersEkleModal');
    const form = document.getElementById('dersEkleForm');
    if (modal) modal.style.display = 'none'; 
    if (form) form.reset(); 
}

// --- Form Submissions (Add Section & Lesson) ---
document.getElementById('bolumEkleForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const baslikInput = document.getElementById('bolum_baslik');
    const aciklamaInput = document.getElementById('bolum_aciklama');
    
    const payload = { 
        kurs_id: courseId, 
        baslik: baslikInput ? baslikInput.value.trim() : '', 
        aciklama: aciklamaInput ? aciklamaInput.value.trim() : '' 
    };
    
    try {
        await ApiService.post('/curriculum/sections', payload);
        closeSectionModal();
        await loadCurriculum();
    } catch (error) { 
        console.error('[EDIT COURSE] Add Section Error:', error.message);
        alert(`Bolum eklenirken hata olustu: ${error.message}`); 
    }
});

document.getElementById('dersEkleForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Ekle';
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Video Yukleniyor...';
    }

    const formData = new FormData();
    const bolumId = document.getElementById('secili_bolum_id')?.value;
    const baslik = document.getElementById('ders_baslik')?.value.trim();
    const sureSaniye = document.getElementById('sure_saniye')?.value || '0';
    const onizlemeMi = document.getElementById('onizleme_mi')?.checked || false;
    
    formData.append('bolum_id', bolumId);
    formData.append('baslik', baslik);
    formData.append('sure_saniye', sureSaniye);
    formData.append('onizleme_mi', onizlemeMi);
    
    const videoInput = document.getElementById('video_dosyasi');
    if (videoInput && videoInput.files[0]) {
        formData.append('video', videoInput.files[0]);
    } else {
        alert("Lutfen bir video dosyasi secin.");
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/instructor/upload', { 
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${localStorage.getItem('edunex_token')}` 
            },
            body: formData
        });
        
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Sunucu hatasi (404/500)");
        }

        if (result.success) {
            closeLessonModal();
            await loadCurriculum();
            alert("Video basariyla yuklendi ve ders olusturuldu!");
        } else {
            throw new Error(result.message || "Bilinmeyen bir hata olustu.");
        }
    } catch (error) {
        console.error("[EDIT COURSE] Video Upload Error:", error);
        alert("Yukleme hatasi: " + error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
});

// --- Delete Operations ---
function initDeleteSection(id) {
    const title = document.getElementById('confirmTitle');
    const message = document.getElementById('confirmMessage');
    const modal = document.getElementById('confirmModal');
    
    if (title) title.innerText = "Bolumu Sil?";
    if (message) message.innerText = "Bu bolumu ve icindeki tum dersleri kalici olarak sileceksiniz.";
    if (modal) modal.style.display = 'flex';
    
    deleteAction = async () => {
        try { 
            await ApiService.delete(`/curriculum/sections/${id}`); 
            closeConfirmModal(); 
            await loadCurriculum(); 
        } catch (error) { 
            console.error('[EDIT COURSE] Delete Section Error:', error.message);
            alert(`Silme hatasi: ${error.message}`); 
        }
    };
}

function initDeleteLesson(id) {
    const title = document.getElementById('confirmTitle');
    const message = document.getElementById('confirmMessage');
    const modal = document.getElementById('confirmModal');
    
    if (title) title.innerText = "Dersi Sil?";
    if (message) message.innerText = "Bu dersi silmek istediginize emin misiniz?";
    if (modal) modal.style.display = 'flex';
    
    deleteAction = async () => {
        try { 
            await ApiService.delete(`/curriculum/lessons/${id}`); 
            closeConfirmModal(); 
            await loadCurriculum(); 
        } catch (error) { 
            console.error('[EDIT COURSE] Delete Lesson Error:', error.message);
            alert(`Silme hatasi: ${error.message}`); 
        }
    };
}

document.getElementById('confirmBtn')?.addEventListener('click', () => { 
    if (deleteAction) deleteAction(); 
});

function closeConfirmModal() { 
    const modal = document.getElementById('confirmModal');
    if (modal) modal.style.display = 'none'; 
    deleteAction = null; 
}

// --- Approval Submission ---
async function sendCourseForApproval() {
    if (!confirm("Kursu yonetici onayina gondermek istediginize emin misiniz?")) return;
    
    try {
        await ApiService.put(`/courses/${courseId}/status`, { durum: 'onay_bekliyor' });
        alert("Kurs basariyla onaya gonderildi.");
        window.location.href = '/instructor/dashboard.html';
    } catch (error) { 
        console.error('[EDIT COURSE] Send Approval Error:', error.message);
        alert(`Onaya gonderilirken hata olustu: ${error.message}`); 
    }
}

// --- Tab Switching ---
function switchTab(tabId) {
    document.querySelectorAll('.sidebar-menu button').forEach(btn => btn.classList.remove('active'));
    
    const activeBtn = document.querySelector(`button[onclick="switchTab('${tabId}')"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });
    
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
        selectedTab.style.display = 'block';
        selectedTab.classList.add('active');
    }
}