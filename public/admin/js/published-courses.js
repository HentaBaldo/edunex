/**
 * EduNex Admin - Yayındaki Kurslar ve Gelişmiş Raporlama JS
 */

let allReports = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchPublishedReport();
});

// 1. GENEL RAPORU ÇEK (KURS LİSTESİ)
async function fetchPublishedReport() {
    const container = document.getElementById('reportContainer');
    try {
        container.innerHTML = '<div style="text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Sistem taranıyor...</p></div>';
        
        const response = await ApiService.get('/admin/published-courses-report');
        if (!response.success) throw new Error('Veri alınamadı.');

        allReports = response.data;
        renderReports(allReports);

    } catch (error) {
        container.innerHTML = `<div class="error-msg" style="color:red; text-align:center;">Hata: ${error.message}</div>`;
    }
}

// 2. KURS KARTLARINI VE BUTONLARI OLUŞTUR
function renderReports(courses) {
    const container = document.getElementById('reportContainer');
    container.innerHTML = '';

    if (courses.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#64748b;">Yayında kurs bulunamadı.</p>';
        return;
    }

    courses.forEach(course => {
        const studentCount = course.CourseEnrollments ? course.CourseEnrollments.length : 0;
        const instructorName = course.Egitmen ? `${course.Egitmen.ad} ${course.Egitmen.soyad}` : 'Bilinmiyor';
        const categoryName = course.Category ? course.Category.ad : 'Genel';

        const courseCard = `
            <div class="course-report-card" style="margin-bottom:20px; border:1px solid #e2e8f0; border-radius:12px; background:#fff;">
                <div class="course-info-bar" style="padding:15px 20px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0;">
                    <div>
                        <h3 style="margin:0; font-size:1.1rem; color:#1e293b;">${course.baslik}</h3>
                        <small style="color:#64748b;">Eğitmen: <strong>${instructorName}</strong> | Kategori: ${categoryName}</small>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn-primary" onclick="viewCourseContent('${course.id}')" style="background:#3b82f6; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">
                            <i class="fas fa-play-circle"></i> İçerik İncele
                        </button>
                        <button class="btn-secondary" onclick="viewParticipants('${course.id}')" style="background:#10b981; color:white; border:none; padding:8px 12px; border-radius:6px; cursor:pointer;">
                            <i class="fas fa-users"></i> Katılımcılar (${studentCount})
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', courseCard);
    });
}

/**
 * Kurs İçeriği ve Tüm Detaylar (Gelişmiş Tanrı Modu)
 */
window.viewCourseContent = async (courseId) => {
    const modal = document.getElementById('courseDetailModal');
    const body = document.getElementById('courseContentBody');
    modal.style.display = 'flex';
    body.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Kurs verileri derinlemesine taranıyor...</p></div>';

    try {
        const response = await ApiService.get(`/admin/courses/${courseId}/full-content`);
        const course = response.data;
        const libraryId = response.bunnyLibraryId;

        document.getElementById('modalCourseTitle').innerText = course.baslik;

        // --- SORUN 2 ÇÖZÜMÜ: TAM KURS BİLGİLERİ (Kategori, Fiyat, Seviye vb.) ---
        let html = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:15px; background:#f8fafc; padding:20px; border-radius:12px; border:1px solid #e2e8f0; margin-bottom:25px;">
                <div><small style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:0.7rem;">Kategori</small><div style="font-weight:600; color:#1e293b;">${course.Category?.ad || '-'}</div></div>
                <div><small style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:0.7rem;">Fiyat</small><div style="font-weight:600; color:#1e293b;">${course.fiyat > 0 ? course.fiyat + ' ₺' : 'Ücretsiz'}</div></div>
                <div><small style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:0.7rem;">Seviye / Dil</small><div style="font-weight:600; color:#1e293b;">${course.seviye} / ${course.dil}</div></div>
                <div><small style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:0.7rem;">Kazanımlar</small><div style="font-size:0.8rem; color:#475569;">${course.kazanimlar || '-'}</div></div>
                <div style="grid-column: 1 / -1;"><small style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:0.7rem;">Gereksinimler</small><div style="font-size:0.8rem; color:#475569;">${course.gereksinimler || '-'}</div></div>
            </div>
        `;

        if (!course.Sections || course.Sections.length === 0) {
            html += '<div style="background:#fef2f2; padding:15px; border-radius:8px; color:#dc2626; text-align:center;">Uyarı: Müfredat boş!</div>';
        } else {
            course.Sections.forEach(sec => {
                html += `
                <div class="modal-section" style="margin-bottom: 20px; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; background:#fff;">
                    <div style="background:#f1f5f9; padding:12px 15px; border-bottom:1px solid #cbd5e1;">
                        <h4 style="margin:0; font-size:0.95rem; color:#1e293b;"><i class="fas fa-folder-open" style="color:#3b82f6;"></i> ${sec.sira_numarasi}. Bölüm: ${sec.baslik}</h4>
                        <p style="margin:4px 0 0; font-size:0.75rem; color:#64748b;">${sec.aciklama || 'Bölüm açıklaması yok.'}</p>
                    </div>
                    <div style="padding:5px;">
                        ${(sec.Lessons || []).map(les => {
                            let actionButtons = '';
                            const isBunny = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
                            
                            // 1. BUTON: Yüklü Video veya Dosya (video_saglayici_id)
                            if (les.video_saglayici_id) {
                                if (isBunny(les.video_saglayici_id)) {
                                    actionButtons += `<button onclick="viewVideo('${les.video_saglayici_id}', '${libraryId}')" style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600;"><i class="fas fa-play"></i> Yüklü İzle</button>`;
                                } else {
                                    actionButtons += `<button onclick="viewFile('${les.video_saglayici_id}')" style="background:#10b981; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600;"><i class="fas fa-file-pdf"></i> Dosyayı Aç</button>`;
                                }
                            }

                            // 2. BUTON: Harici URL (kaynak_url) - SORUN 3 ÇÖZÜMÜ
                            if (les.kaynak_url && les.kaynak_url !== les.video_saglayici_id) {
                                actionButtons += `<button onclick="viewExternalVideo('${les.kaynak_url}')" style="background:#ef4444; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600; margin-left:5px;"><i class="fab fa-youtube"></i> URL Video</button>`;
                            }

                            return `
                                <div style="padding:12px 15px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
                                    <div style="flex:1;">
                                        <div style="font-weight:600; color:#334155; font-size:0.85rem;">${les.sira_numarasi}. ${les.baslik}</div>
                                        <div style="font-size:0.75rem; color:#64748b; margin-top:3px;">${les.aciklama || 'Ders açıklaması yok.'}</div>
                                        ${les.kaynak_url ? `<div style="font-size:0.65rem; color:#94a3b8; font-family:monospace; margin-top:4px;">Link: ${les.kaynak_url}</div>` : ''}
                                    </div>
                                    <div style="display:flex; gap:5px; flex-shrink:0;">${actionButtons}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>`;
            });
        }
        body.innerHTML = html;
    } catch (error) {
        body.innerHTML = `<div style="text-align:center; padding:20px; color:red;">Hata: ${error.message}</div>`;
    }
};

// 4. KATILIMCI İLERLEME RAPORUNU GETİR
window.viewParticipants = async (courseId) => {
    const modal = document.getElementById('participantsModal');
    const body = document.getElementById('participantsBody');
    
    modal.style.display = 'flex';
    body.innerHTML = '<div style="text-align:center;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Öğrenci verileri analiz ediliyor...</p></div>';

    try {
        const response = await ApiService.get(`/admin/courses/${courseId}/participants`);
        const participants = response.data;

        let html = `
            <table class="participant-table" style="width:100%; border-collapse:collapse;">
                <thead>
                    <tr style="text-align:left; border-bottom:2px solid #e2e8f0; color:#64748b; font-size:0.85rem;">
                        <th style="padding:10px;">Öğrenci</th>
                        <th style="padding:10px;">E-posta</th>
                        <th style="padding:10px;">İlerleme</th>
                    </tr>
                </thead>
                <tbody>
        `;

        if (participants.length === 0) {
            html += '<tr><td colspan="3" style="text-align:center; padding:20px; color:#94a3b8;">Bu kursa henüz kayıtlı öğrenci yok.</td></tr>';
        } else {
            participants.forEach(p => {
                const yuzde = p.ilerleme_yuzdesi || 0;
                const color = yuzde === 100 ? '#10b981' : '#3b82f6';
                html += `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:10px;"><strong>${p.Ogrenci.ad} ${p.Ogrenci.soyad}</strong></td>
                        <td style="padding:10px; color:#64748b;">${p.Ogrenci.eposta}</td>
                        <td style="padding:10px;">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div style="flex-grow:1; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
                                    <div style="width:${yuzde}%; height:100%; background:${color};"></div>
                                </div>
                                <span style="font-weight:bold; color:${color}; font-size:0.85rem;">%${yuzde}</span>
                            </div>
                        </td>
                    </tr>
                `;
            });
        }

        html += `</tbody></table>`;
        body.innerHTML = html;
    } catch (error) {
        body.innerHTML = `<p style="color:red;">Hata: ${error.message}</p>`;
    }
};

// YARDIMCI FONKSİYONLAR
window.closeModal = (modalId) => {
    document.getElementById(modalId).style.display = 'none';
};

/**
 * Video İzle ve İndir (BunnyCDN)
 */
window.viewVideo = (videoGuid, libraryId) => {
    const videoUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoGuid}?autoplay=false`;
    // BunnyCDN doğrudan indirme linki (Eğer API izin veriyorsa)
    const downloadUrl = `https://video.bunnycdn.com/play/${libraryId}/${videoGuid}`; 

    const videoModal = `
        <div id="adminVideoViewer" style="position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 10001; display: flex; align-items: center; justify-content: center;" onclick="if(event.target.id === 'adminVideoViewer') this.remove()">
            <div style="width: 90%; max-width: 1000px; background: #000; border-radius: 12px; overflow: hidden;">
                <div style="padding: 12px 20px; background: #1e293b; color: white; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.9rem;"><i class="fas fa-play-circle"></i> Video Önizleme</span>
                    <a href="${downloadUrl}" target="_blank" style="background: #3b82f6; color: white; padding: 5px 12px; border-radius: 4px; text-decoration: none; font-size: 0.8rem; font-weight: 600;"><i class="fas fa-external-link-alt"></i> Video Kaynağına Git / İndir</a>
                </div>
                <div style="position: relative; padding-bottom: 56.25%; height: 0;">
                    <iframe src="${videoUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;" allowfullscreen></iframe>
                </div>
                <div style="padding: 10px; text-align: center; color: #94a3b8; font-size: 0.75rem;">Kapatmak için dışarıya tıklayın.</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', videoModal);
};

/**
 * Harici Video (YouTube vb.) İzleme
 */
window.viewExternalVideo = (videoSource) => {
    let videoUrl = "";
    let directLink = videoSource; 
    
    if (videoSource.includes('youtube.com') || videoSource.includes('youtu.be')) {
        const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = videoSource.match(regExp);
        const ytId = (match && match[2].length === 11) ? match[2] : null;

        if (ytId) {
            // NOCookie kullanmak izleme problemlerini en aza indirir
            videoUrl = `https://www.youtube-nocookie.com/embed/${ytId}?rel=0`;
            directLink = `https://www.youtube.com/watch?v=${ytId}`; 
        } else {
            alert("Video kimliği ayrıştırılamadı."); return;
        }
    } else if (videoSource.includes('vimeo.com')) {
        const vimeoId = videoSource.split('vimeo.com/')[1]?.split('/')[0]?.split('?')[0];
        videoUrl = `https://player.vimeo.com/video/${vimeoId}`;
    }

    const videoModal = `
        <div id="extVideoViewer" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.98); z-index: 99999; display: flex; flex-direction: column; align-items: center; justify-content: center;" onclick="if(event.target.id === 'extVideoViewer') this.remove()">
            <div style="width: 90vw; max-width: 1000px; display: flex; justify-content: flex-end; margin-bottom: 12px;">
                <a href="${directLink}" target="_blank" style="background:#ef4444; color:white; padding:8px 16px; border-radius:8px; text-decoration:none; font-weight:600; font-size:0.9rem; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);"><i class="fab fa-youtube"></i> Oynatıcı Hata Verirse Buradan Aç</a>
            </div>
            <div style="width: 90vw; max-width: 1000px; background:#000; border-radius:12px; overflow:hidden; border:1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
                <div style="position:relative; padding-bottom:56.25%; height:0; overflow:hidden;">
                    <iframe 
                        src="${videoUrl}" 
                        style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                        referrerpolicy="strict-origin-when-cross-origin" 
                        allowfullscreen>
                    </iframe>
                </div>
            </div>
            <div style="margin-top:15px; color:#94a3b8; font-size:0.8rem;">Kapatmak için dışarıya tıklayın</div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', videoModal);
};
/**
 * Dosya Aç (PDF, Resim vb.) - Mevcut Ekranda Görüntüleme ve İndirme
 */
window.viewFile = (fileUrl) => {
    const extension = fileUrl.split('.').pop().toLowerCase();
    let content = '';
    
    // Tarayıcıda önizleme içeriği
    if (['pdf'].includes(extension)) {
        content = `<iframe src="${fileUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"></iframe>`;
    } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) {
        content = `<img src="${fileUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: auto;">`;
    } else {
        content = `<div style="text-align:center; padding:50px;"><i class="fas fa-file-alt fa-4x" style="color:#cbd5e1;"></i><p style="margin-top:15px; color:#475569;">Bu dosya türü önizlenemiyor.</p></div>`;
    }
    
    const fileModal = `
        <div id="adminFileViewer" style="position: fixed; inset: 0; background: rgba(15, 23, 42, 0.9); z-index: 10001; display: flex; align-items: center; justify-content: center;" onclick="if(event.target.id === 'adminFileViewer') this.remove()">
            <div style="width: 90vw; height: 90vh; background: #fff; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);">
                <div style="padding: 15px 20px; background: #1e293b; color: white; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 600;"><i class="fas fa-file-download"></i> Belge Görüntüleyici</span>
                    <div style="display: flex; gap: 10px;">
                        <a href="${fileUrl}" download class="btn-download" style="background: #10b981; color: white; padding: 6px 15px; border-radius: 6px; text-decoration: none; font-size: 0.85rem; font-weight: 600;"><i class="fas fa-download"></i> Cihaza İndir</a>
                        <button onclick="document.getElementById('adminFileViewer').remove()" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer;">&times;</button>
                    </div>
                </div>
                <div style="flex-grow: 1; position: relative; background: #f8fafc; display: flex; align-items: center; justify-content: center;">
                    ${content}
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', fileModal);
};

function filterReports() {
    const q = document.getElementById('courseSearch').value.toLowerCase();
    const filtered = allReports.filter(c => 
        c.baslik.toLowerCase().includes(q) || 
        (c.Egitmen && (c.Egitmen.ad + ' ' + c.Egitmen.soyad).toLowerCase().includes(q))
    );
    renderReports(filtered);
}