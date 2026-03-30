// public/instructor/js/modules/curriculum-view.js

export const CurriculumView = {
    renderLessons(lessons) {
        if (!lessons || lessons.length === 0) {
            return '<p style="text-align:center; color:#94a3b8; font-size:0.9rem; margin-top:15px;">Bu bölümde henüz ders yok.</p>';
        }
        
        return lessons.map(ders => {
            const icon = ders.icerik_tipi === 'video' ? 'fa-play-circle' : 'fa-file-alt';
            return `
            <div class="lesson-item">
                <div class="lesson-info">
                    <i class="fas ${icon}"></i>
                    <span>${ders.baslik}</span>
                </div>
                <button data-id="${ders.id}" class="btn-delete-lesson btn-delete-sm" title="Dersi Sil">
                    <i class="fas fa-times" style="color:#dc3545;"></i>
                </button>
            </div>`;
        }).join('');
    },

    renderCurriculum(sections, containerId) {
        const listDiv = document.getElementById(containerId);
        if (!listDiv) return;

        if (sections.length === 0) {
            listDiv.innerHTML = `
                <div style="text-align:center; padding: 40px; border: 2px dashed #cbd5e1; border-radius: 12px; margin-top:20px;">
                    <i class="fas fa-folder-open" style="font-size: 3rem; color: #cbd5e1; margin-bottom: 15px;"></i>
                    <p style="color:#475569;">Henüz bir bölüm eklemediniz.</p>
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
                        </div>
                        <div class="action-buttons">
                            <button data-id="${bolum.id}" class="btn-add-lesson-trigger btn-primary-sm"><i class="fas fa-plus"></i> Ders Ekle</button>
                            <button data-id="${bolum.id}" class="btn-delete-section btn-delete-icon" title="Bölümü Sil"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                    <div class="lessons-list" id="lessons-${bolum.id}">
                        ${this.renderLessons(bolum.Lessons)}
                    </div>
                </div>`;
            listDiv.insertAdjacentHTML('beforeend', sectionHtml);
        });
    }
};