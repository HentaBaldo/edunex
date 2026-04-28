/**
 * EduNex Admin - Kurs Takibi (Yayında / İade / Arşiv / Silinmiş)
 */

let allReports = [];
let currentFilter = 'yayinda';

document.addEventListener('DOMContentLoaded', () => {
    fetchPublishedReport();
});

// 1. RAPORU CEK (filtreli)
async function fetchPublishedReport() {
    const container = document.getElementById('reportContainer');
    try {
        container.innerHTML = '<div style="text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Sistem taranıyor...</p></div>';

        const search = document.getElementById('courseSearch')?.value?.trim() || '';
        const qs = new URLSearchParams({ filter: currentFilter });
        if (search) qs.set('search', search);

        const response = await ApiService.get(`/admin/courses-tracking?${qs.toString()}`);
        if (!response.success) throw new Error('Veri alınamadı.');

        allReports = response.data;

        // Sekme rozet sayilari
        if (response.counts) {
            document.getElementById('count-yayinda').innerText = response.counts.yayinda;
            document.getElementById('count-iade').innerText = response.counts.iade;
            document.getElementById('count-arsiv').innerText = response.counts.arsiv;
            document.getElementById('count-silinmis').innerText = response.counts.silinmis;
        }

        renderReports(allReports);

    } catch (error) {
        container.innerHTML = `<div class="error-msg" style="color:red; text-align:center;">Hata: ${error.message}</div>`;
    }
}

// Sekme degistirme
window.switchFilter = (filter) => {
    currentFilter = filter;
    document.querySelectorAll('.filter-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.filter === filter);
    });
    fetchPublishedReport();
};

// 2. KART RENDER (filtreye gore aksiyonlar degisir)
function renderReports(courses) {
    const container = document.getElementById('reportContainer');
    container.innerHTML = '';

    if (courses.length === 0) {
        const emptyMessages = {
            yayinda: 'Yayında kurs bulunamadı.',
            iade: 'İade edilmiş kurs yok.',
            arsiv: 'Arşivde kurs yok.',
            silinmis: 'Silinmiş kurs yok.'
        };
        container.innerHTML = `<p style="text-align:center; color:#64748b; padding:40px;">${emptyMessages[currentFilter] || 'Kurs bulunamadı.'}</p>`;
        return;
    }

    courses.forEach(course => {
        const studentCount = course.CourseEnrollments ? course.CourseEnrollments.length : 0;
        const instructorName = course.Egitmen ? `${course.Egitmen.ad} ${course.Egitmen.soyad}` : 'Bilinmiyor';
        const categoryName = course.Category ? course.Category.ad : 'Genel';

        // Status rozetleri (filtreye gore)
        let statusBadge = '';
        let cardBorder = '#e2e8f0';
        if (currentFilter === 'yayinda' && course.onaydan_sonra_duzenlendi_mi) {
            statusBadge = `<span title="Bu kurs onaydan/yayından sonra eğitmen tarafından düzenlendi" style="display:inline-block; background:#fef3c7; color:#92400e; border:1px solid #fbbf24; padding:3px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; margin-left:8px;"><i class="fas fa-pen"></i> Düzenlenmiş</span>`;
            cardBorder = '#fbbf24';
        } else if (currentFilter === 'iade') {
            const iadeAt = course.iade_tarihi ? new Date(course.iade_tarihi).toLocaleString('tr-TR') : '';
            statusBadge = `<span title="${iadeAt ? 'İade: ' + iadeAt : ''}" style="display:inline-block; background:#fed7aa; color:#9a3412; border:1px solid #fb923c; padding:3px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; margin-left:8px;"><i class="fas fa-undo"></i> İade Edilmiş</span>`;
            cardBorder = '#fb923c';
        } else if (currentFilter === 'arsiv') {
            statusBadge = `<span style="display:inline-block; background:#e0e7ff; color:#3730a3; border:1px solid #818cf8; padding:3px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; margin-left:8px;"><i class="fas fa-archive"></i> Arşivde</span>`;
            cardBorder = '#818cf8';
        } else if (currentFilter === 'silinmis') {
            const silAt = course.silinme_tarihi ? new Date(course.silinme_tarihi).toLocaleString('tr-TR') : '';
            statusBadge = `<span title="${silAt ? 'Silinme: ' + silAt : ''}" style="display:inline-block; background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:3px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; margin-left:8px;"><i class="fas fa-trash"></i> Silinmiş</span>`;
            cardBorder = '#fca5a5';
        }

        const lastEditText = course.son_duzenleme_tarihi
            ? ` | Son düzenleme: ${new Date(course.son_duzenleme_tarihi).toLocaleString('tr-TR')}`
            : '';

        // Sebep banner'i (iade veya silinmis ise)
        let reasonBanner = '';
        if (currentFilter === 'iade' && course.iade_sebebi) {
            reasonBanner = `<div style="background:#fff7ed; padding:10px 15px; border-bottom:1px solid #fed7aa; font-size:0.82rem; color:#9a3412;"><strong>İade sebebi:</strong> ${escapeHtml(course.iade_sebebi)}</div>`;
        } else if (currentFilter === 'silinmis' && course.silme_sebebi) {
            reasonBanner = `<div style="background:#fef2f2; padding:10px 15px; border-bottom:1px solid #fca5a5; font-size:0.82rem; color:#991b1b;"><strong>Silme sebebi:</strong> ${escapeHtml(course.silme_sebebi)}</div>`;
        }

        // Aksiyon butonlari (filtreye gore)
        const actions = buildActionButtons(course, currentFilter);

        const courseCard = `
            <div class="course-report-card" style="margin-bottom:20px; border:1px solid ${cardBorder}; border-radius:12px; background:#fff;">
                <div class="course-info-bar" style="padding:15px 20px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid ${cardBorder};">
                    <div>
                        <h3 style="margin:0; font-size:1.1rem; color:#1e293b;">${escapeHtml(course.baslik)}${statusBadge}</h3>
                        <small style="color:#64748b;">Eğitmen: <strong>${escapeHtml(instructorName)}</strong> | Kategori: ${escapeHtml(categoryName)}${lastEditText}</small>
                    </div>
                    <div class="action-btn-row">${actions}</div>
                </div>
                ${reasonBanner}
            </div>
        `;
        container.insertAdjacentHTML('beforeend', courseCard);
    });
}

function buildActionButtons(course, filter) {
    const id = course.id;
    const enrollCount = course.CourseEnrollments ? course.CourseEnrollments.length : 0;
    const incele = `<button class="btn-content" onclick="viewCourseContent('${id}')"><i class="fas fa-play-circle"></i> İçerik İncele</button>`;
    const katilim = `<button class="btn-participants" onclick="viewParticipants('${id}')"><i class="fas fa-users"></i> Katılımcılar (${enrollCount})</button>`;

    if (filter === 'yayinda') {
        return `${incele} ${katilim}
            <button class="btn-unpublish" onclick="openUnpublishModal('${id}', '${escapeAttr(course.baslik)}')"><i class="fas fa-undo"></i> Yayından Kaldır</button>
            <button class="btn-delete" onclick="openDeleteModal('${id}', '${escapeAttr(course.baslik)}', ${enrollCount})"><i class="fas fa-trash"></i> Sil</button>`;
    }
    if (filter === 'iade') {
        return `${incele} ${katilim}
            <button class="btn-republish" onclick="openRepublishModal('${id}', '${escapeAttr(course.baslik)}')"><i class="fas fa-broadcast-tower"></i> Yayına Al</button>
            <button class="btn-delete" onclick="openDeleteModal('${id}', '${escapeAttr(course.baslik)}', ${enrollCount})"><i class="fas fa-trash"></i> Sil</button>`;
    }
    if (filter === 'arsiv') {
        return `${incele} ${katilim}
            <button class="btn-republish" onclick="openRepublishModal('${id}', '${escapeAttr(course.baslik)}')"><i class="fas fa-broadcast-tower"></i> Yayına Al</button>
            <button class="btn-delete" onclick="openDeleteModal('${id}', '${escapeAttr(course.baslik)}', ${enrollCount})"><i class="fas fa-trash"></i> Sil</button>`;
    }
    if (filter === 'silinmis') {
        return `${incele}
            <button class="btn-restore" onclick="openRestoreModal('${id}', '${escapeAttr(course.baslik)}')"><i class="fas fa-trash-restore"></i> Geri Yükle</button>`;
    }
    return '';
}

// ----- AKSIYON MODALLARI -----

window.openUnpublishModal = (id, baslik) => {
    const html = `
        <div class="action-modal" id="actionModal" onclick="if(event.target.id==='actionModal') closeActionModal()">
            <div class="action-modal-card">
                <h3><i class="fas fa-undo" style="color:#f97316;"></i> Yayından Kaldır</h3>
                <div class="alert alert-warn">
                    <strong>"${escapeHtml(baslik)}"</strong> kursu <strong>taslağa geri çekilecek</strong>.
                    <ul style="margin:8px 0 0; padding-left:18px;">
                        <li>Öğrenciler artık kursa erişemeyecek</li>
                        <li>Eğitmen iadenizi görüp düzeltme yapıp tekrar onaya gönderebilecek</li>
                    </ul>
                </div>
                <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px; color:#374151;">İade sebebi (en az 10 karakter, eğitmen görecek):</label>
                <textarea id="actionReason" placeholder="Örn: 3. bölüm 4. ders videosunun ses kalitesi çok düşük, lütfen yeniden yükleyiniz."></textarea>
                <div class="modal-actions">
                    <button class="btn-modal btn-cancel" onclick="closeActionModal()">İptal</button>
                    <button class="btn-modal btn-confirm-warn" onclick="confirmUnpublish('${id}')">Yayından Kaldır</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};

window.confirmUnpublish = async (id) => {
    const sebep = document.getElementById('actionReason').value.trim();
    if (sebep.length < 10) {
        alert('Sebep en az 10 karakter olmalı.');
        return;
    }
    try {
        const r = await ApiService.put(`/admin/courses/${id}/unpublish`, { sebep });
        if (r.success) {
            closeActionModal();
            alert('✓ Kurs yayından kaldırıldı (taslağa iade edildi).');
            fetchPublishedReport();
        }
    } catch (err) {
        alert('Hata: ' + err.message);
    }
};

window.openRepublishModal = (id, baslik) => {
    const html = `
        <div class="action-modal" id="actionModal" onclick="if(event.target.id==='actionModal') closeActionModal()">
            <div class="action-modal-card">
                <h3><i class="fas fa-broadcast-tower" style="color:#16a34a;"></i> Yayına Al</h3>
                <div class="alert alert-info">
                    <strong>"${escapeHtml(baslik)}"</strong> kursu doğrudan <strong>yayına alınacak</strong>. Eğitmen onayı beklenmeyecek.
                </div>
                <div class="modal-actions">
                    <button class="btn-modal btn-cancel" onclick="closeActionModal()">İptal</button>
                    <button class="btn-modal btn-confirm-success" onclick="confirmRepublish('${id}')">Yayına Al</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};

window.confirmRepublish = async (id) => {
    try {
        const r = await ApiService.put(`/admin/courses/${id}/republish`, {});
        if (r.success) {
            closeActionModal();
            alert('✓ Kurs yayına alındı.');
            fetchPublishedReport();
        }
    } catch (err) {
        alert('Hata: ' + err.message);
    }
};

window.openDeleteModal = (id, baslik, enrollCount) => {
    const isHardDelete = enrollCount === 0; // Yaklasik gosterim; backend kesin karari verir (enrollment + order_item).
    const alertClass = isHardDelete ? 'alert-danger' : 'alert-warn';
    const alertContent = isHardDelete
        ? `<strong>UYARI: Bu kurs KALICI olarak silinecek!</strong><br>0 öğrenci kayıtlı görünüyor — geri alınamayan tam silme uygulanacak.<br><small>(Backend siparişleri de kontrol edip kesin kararı verir; satış varsa otomatik olarak soft-delete'e düşer.)</small>`
        : `<strong>Bu kurs gizlenecek (soft delete).</strong><br>${enrollCount} öğrenci kayıtlı. Soft delete uygulanacak — kurs öğrenciler ve mağazadan kaybolur ama "Silinmiş" sekmesinden geri yüklenebilir.`;

    const html = `
        <div class="action-modal" id="actionModal" onclick="if(event.target.id==='actionModal') closeActionModal()">
            <div class="action-modal-card">
                <h3><i class="fas fa-trash" style="color:#dc2626;"></i> Kursu Sil</h3>
                <p style="margin:0 0 12px; color:#475569;"><strong>"${escapeHtml(baslik)}"</strong></p>
                <div class="alert ${alertClass}">${alertContent}</div>
                <label style="display:block; font-size:0.85rem; font-weight:600; margin-bottom:6px; color:#374151;">Silme sebebi (en az 10 karakter, denetim için):</label>
                <textarea id="actionReason" placeholder="Örn: Telif ihlali içeriği. Eğitmenle yazışıldı, içerik kaldırıldı."></textarea>
                <div class="modal-actions">
                    <button class="btn-modal btn-cancel" onclick="closeActionModal()">İptal</button>
                    <button class="btn-modal btn-confirm-danger" onclick="confirmDelete('${id}')">Sil</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
};

window.confirmDelete = async (id) => {
    const sebep = document.getElementById('actionReason').value.trim();
    if (sebep.length < 10) {
        alert('Sebep en az 10 karakter olmalı.');
        return;
    }
    try {
        const r = await ApiService.delete(`/admin/courses/${id}`, { sebep });
        if (r.success) {
            closeActionModal();
            const modeText = r.mode === 'hard' ? 'kalıcı olarak silindi' : `gizlendi (soft delete: ${r.enrollment_count} öğrenci, ${r.order_count} sipariş ilişkili)`;
            alert(`✓ Kurs ${modeText}.`);
            fetchPublishedReport();
        }
    } catch (err) {
        alert('Hata: ' + err.message);
    }
};

window.openRestoreModal = (id, baslik) => {
    if (!confirm(`"${baslik}" kursunu geri yüklemek istediğinize emin misiniz?\n\nKurs eski durumuna dönecek (hangi durumda silindiyse).`)) return;
    confirmRestore(id);
};

const confirmRestore = async (id) => {
    try {
        const r = await ApiService.post(`/admin/courses/${id}/restore`, {});
        if (r.success) {
            alert('✓ Kurs geri yüklendi.');
            fetchPublishedReport();
        }
    } catch (err) {
        alert('Hata: ' + err.message);
    }
};

window.closeActionModal = () => {
    document.getElementById('actionModal')?.remove();
};

// ----- HELPERS -----
function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
}

// ----- KURS ICERIGI MODAL (degismedi, sadece silinmis durumda da calismasi icin esnetildi) -----
window.viewCourseContent = async (courseId) => {
    const modal = document.getElementById('courseDetailModal');
    const body = document.getElementById('courseContentBody');
    modal.style.display = 'flex';
    body.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Kurs verileri taranıyor...</p></div>';

    try {
        const response = await ApiService.get(`/admin/courses/${courseId}/full-content`);
        const course = response.data;
        const libraryId = response.bunnyLibraryId;

        document.getElementById('modalCourseTitle').innerText = course.baslik;

        let html = '';

        // Onay sonrasi duzenleme uyari bandi
        if (course.onaydan_sonra_duzenlendi_mi) {
            const lastEdit = course.son_duzenleme_tarihi
                ? new Date(course.son_duzenleme_tarihi).toLocaleString('tr-TR')
                : 'bilinmiyor';
            html += `
                <div style="background:#fef3c7; border:1px solid #fbbf24; color:#92400e; padding:14px 18px; border-radius:10px; margin-bottom:18px; display:flex; align-items:center; gap:12px;">
                    <i class="fas fa-exclamation-triangle" style="font-size:1.3rem;"></i>
                    <div>
                        <div style="font-weight:700; font-size:0.95rem;">Bu kurs onaydan/yayından sonra eğitmen tarafından düzenlendi.</div>
                        <div style="font-size:0.8rem; margin-top:2px;">Son düzenleme: <strong>${lastEdit}</strong> — Aşağıda gizlenmiş bölüm/dersler de işaretlenmiştir.</div>
                    </div>
                </div>
            `;
        }

        // Iade veya silinmis ise ek bant
        if (course.admin_tarafindan_iade_edildi && course.iade_sebebi) {
            html += `
                <div style="background:#fff7ed; border:1px solid #fb923c; color:#9a3412; padding:14px 18px; border-radius:10px; margin-bottom:18px;">
                    <strong><i class="fas fa-undo"></i> Bu kurs admin tarafından iade edildi.</strong>
                    <div style="font-size:0.85rem; margin-top:4px;">Sebep: ${escapeHtml(course.iade_sebebi)}</div>
                </div>
            `;
        }
        if (course.silindi_mi) {
            html += `
                <div style="background:#fef2f2; border:1px solid #fca5a5; color:#991b1b; padding:14px 18px; border-radius:10px; margin-bottom:18px;">
                    <strong><i class="fas fa-trash"></i> Bu kurs silinmiş durumda.</strong>
                    ${course.silme_sebebi ? `<div style="font-size:0.85rem; margin-top:4px;">Sebep: ${escapeHtml(course.silme_sebebi)}</div>` : ''}
                </div>
            `;
        }

        // KURS BILGI GRIDI
        html += `
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
                const secHidden = !!sec.gizli_mi;
                const secHiddenAt = sec.gizlenme_tarihi ? new Date(sec.gizlenme_tarihi).toLocaleString('tr-TR') : null;
                const secBadge = secHidden
                    ? `<span title="${secHiddenAt ? 'Gizlenme: ' + secHiddenAt : ''}" style="display:inline-block; background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:2px 8px; border-radius:6px; font-size:0.7rem; font-weight:600; margin-left:8px;"><i class="fas fa-eye-slash"></i> Gizli</span>`
                    : '';
                const secStyle = secHidden
                    ? 'margin-bottom: 20px; border: 1px dashed #fca5a5; border-radius: 10px; overflow: hidden; background:#fef2f2; opacity:0.85;'
                    : 'margin-bottom: 20px; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; background:#fff;';

                html += `
                <div class="modal-section" style="${secStyle}">
                    <div style="background:${secHidden ? '#fee2e2' : '#f1f5f9'}; padding:12px 15px; border-bottom:1px solid ${secHidden ? '#fca5a5' : '#cbd5e1'};">
                        <h4 style="margin:0; font-size:0.95rem; color:#1e293b;"><i class="fas fa-folder-open" style="color:${secHidden ? '#991b1b' : '#3b82f6'};"></i> ${sec.sira_numarasi}. Bölüm: ${sec.baslik}${secBadge}</h4>
                        <p style="margin:4px 0 0; font-size:0.75rem; color:#64748b;">${sec.aciklama || 'Bölüm açıklaması yok.'}</p>
                    </div>
                    <div style="padding:5px;">
                        ${(sec.Lessons || []).map(les => {
                            let actionButtons = '';
                            const isBunny = (str) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

                            if (les.video_saglayici_id) {
                                if (isBunny(les.video_saglayici_id)) {
                                    actionButtons += `<button onclick="viewVideo('${les.video_saglayici_id}', '${libraryId}')" style="background:#3b82f6; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600;"><i class="fas fa-play"></i> Yüklü İzle</button>`;
                                } else {
                                    actionButtons += `<button onclick="viewFile('${les.video_saglayici_id}')" style="background:#10b981; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600;"><i class="fas fa-file-pdf"></i> Dosyayı Aç</button>`;
                                }
                            }
                            if (les.kaynak_url && les.kaynak_url !== les.video_saglayici_id) {
                                actionButtons += `<button onclick="viewExternalVideo('${les.kaynak_url}')" style="background:#ef4444; color:white; border:none; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:0.75rem; font-weight:600; margin-left:5px;"><i class="fab fa-youtube"></i> URL Video</button>`;
                            }

                            const lesHidden = !!les.gizli_mi;
                            const lesHiddenAt = les.gizlenme_tarihi ? new Date(les.gizlenme_tarihi).toLocaleString('tr-TR') : null;
                            const lesBadge = lesHidden
                                ? `<span title="${lesHiddenAt ? 'Gizlenme: ' + lesHiddenAt : ''}" style="display:inline-block; background:#fee2e2; color:#991b1b; border:1px solid #fca5a5; padding:2px 6px; border-radius:5px; font-size:0.65rem; font-weight:600; margin-left:6px;"><i class="fas fa-eye-slash"></i> Gizli</span>`
                                : '';
                            const lesRowStyle = lesHidden
                                ? 'padding:12px 15px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:#fff7f7;'
                                : 'padding:12px 15px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;';

                            return `
                                <div style="${lesRowStyle}">
                                    <div style="flex:1;">
                                        <div style="font-weight:600; color:${lesHidden ? '#991b1b' : '#334155'}; font-size:0.85rem; ${lesHidden ? 'text-decoration:line-through;' : ''}">${les.sira_numarasi}. ${les.baslik}${lesBadge}</div>
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

// 4. KATILIMCI ILERLEME RAPORU
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

// YARDIMCI FONKSIYONLAR
window.closeModal = (modalId) => {
    document.getElementById(modalId).style.display = 'none';
};

window.viewVideo = (videoGuid, libraryId) => {
    const videoUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${videoGuid}?autoplay=false`;
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

window.viewExternalVideo = (videoSource) => {
    let videoUrl = "";
    let directLink = videoSource;

    if (videoSource.includes('youtube.com') || videoSource.includes('youtu.be')) {
        const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = videoSource.match(regExp);
        const ytId = (match && match[2].length === 11) ? match[2] : null;
        if (ytId) {
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
                    <iframe src="${videoUrl}" style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
                </div>
            </div>
            <div style="margin-top:15px; color:#94a3b8; font-size:0.8rem;">Kapatmak için dışarıya tıklayın</div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', videoModal);
};

window.viewFile = (fileUrl) => {
    const extension = fileUrl.split('.').pop().toLowerCase();
    let content = '';
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
