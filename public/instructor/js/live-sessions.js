/**
 * EduNex - Instructor Canlı Oturumlar (Live Sessions)
 * edit-course.html içindeki "Canlı Dersler" sekmesinin CRUD mantığı.
 */

const courseId = new URLSearchParams(window.location.search).get('id');
let sessionsCache = [];
let liveSessionsLoaded = false;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('canliOturumForm')?.addEventListener('submit', handleSaveSession);

    const originalSwitchTab = window.switchTab;
    window.switchTab = (tabId) => {
        if (typeof originalSwitchTab === 'function') originalSwitchTab(tabId);
        if (tabId === 'canli_dersler' && !liveSessionsLoaded) {
            loadSessions();
        }
    };

    window.showLiveSessionModal = openSessionModal;
    window.closeLiveSessionModal = closeSessionModal;
    window.editLiveSession = editSession;
    window.deleteLiveSession = deleteSession;
    window.openAttendanceModal = openAttendanceModal;
    window.closeAttendanceModal = () => {
        document.getElementById('yoklamaModal').style.display = 'none';
    };
});

async function loadSessions() {
    if (!courseId) return;
    const container = document.getElementById('canliOturumListesi');
    container.innerHTML = '<p class="loading-text"><i class="fas fa-spinner fa-spin"></i> Yükleniyor...</p>';

    try {
        const result = await ApiService.get(`/live-sessions/course/${courseId}`);
        sessionsCache = result.data || [];
        liveSessionsLoaded = true;
        renderSessions();
    } catch (error) {
        container.innerHTML = `
            <div class="empty-section">
                <i class="fas fa-exclamation-circle" style="color: #ef4444; font-size: 2rem; display: block; margin-bottom: 10px;"></i>
                <p>${escapeHtml(error.message)}</p>
            </div>`;
    }
}

function renderSessions() {
    const container = document.getElementById('canliOturumListesi');
    if (sessionsCache.length === 0) {
        container.innerHTML = `
            <div class="empty-section">
                <i class="fas fa-video" style="font-size: 2rem; display: block; margin-bottom: 10px; color: #94a3b8;"></i>
                <p>Bu kurs için henüz canlı oturum planlanmadı.</p>
            </div>`;
        return;
    }

    container.innerHTML = sessionsCache.map(renderSessionCard).join('');
}

function renderSessionCard(s) {
    const date = new Date(s.baslangic_tarihi);
    const dateLabel = date.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
    const statusClass = `status-${s.durum}`;

    return `
        <div class="section-item" id="live-session-${s.id}">
            <div class="section-header" style="cursor: default;">
                <div class="section-title-group">
                    <h4 style="display:flex; align-items:center; gap:10px;">
                        <i class="fas fa-video" style="color:#8b5cf6;"></i>
                        ${escapeHtml(s.baslik)}
                        <span class="live-badge ${statusClass}" style="font-size:0.75rem; padding:3px 10px; border-radius:12px; background:#e0e7ff; color:#4338ca;">
                            ${statusLabel(s.durum)}
                        </span>
                    </h4>
                    <div style="color:#64748b; font-size:0.9rem; margin-top:6px;">
                        <i class="far fa-clock"></i> ${dateLabel} · ${s.sure_dakika} dk
                    </div>
                    ${s.aciklama ? `<p style="color:#475569; margin-top:8px;">${escapeHtml(s.aciklama)}</p>` : ''}
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <a href="/live/live-room.html?sessionId=${s.id}" target="_blank" class="btn-primary-lg-alt" style="padding:8px 14px; font-size:0.85rem;">
                        <i class="fas fa-sign-in-alt"></i> Odaya Gir
                    </a>
                    <button type="button" onclick="openAttendanceModal('${s.id}')" class="btn-logout-alt" style="padding:8px 14px; font-size:0.85rem;">
                        <i class="fas fa-clipboard-list"></i> Yoklama
                    </button>
                    <button type="button" onclick="editLiveSession('${s.id}')" class="btn-logout-alt" style="padding:8px 14px; font-size:0.85rem;">
                        <i class="fas fa-edit"></i> Düzenle
                    </button>
                    <button type="button" onclick="deleteLiveSession('${s.id}')" class="btn-logout-alt" style="padding:8px 14px; font-size:0.85rem; color:#dc2626;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
}

function openSessionModal() {
    document.getElementById('canliOturumModalTitle').textContent = 'Yeni Canlı Oturum';
    document.getElementById('canliOturumForm').reset();
    document.getElementById('canli_oturum_id').value = '';
    document.getElementById('cs_sure').value = 60;
    document.getElementById('canliOturumModal').style.display = 'flex';
}

function closeSessionModal() {
    document.getElementById('canliOturumModal').style.display = 'none';
}

function editSession(id) {
    const s = sessionsCache.find(x => x.id === id);
    if (!s) return;
    document.getElementById('canliOturumModalTitle').textContent = 'Oturumu Düzenle';
    document.getElementById('canli_oturum_id').value = s.id;
    document.getElementById('cs_baslik').value = s.baslik || '';
    document.getElementById('cs_aciklama').value = s.aciklama || '';
    document.getElementById('cs_tarih').value = toLocalDateTimeInput(s.baslangic_tarihi);
    document.getElementById('cs_sure').value = s.sure_dakika || 60;
    document.getElementById('canliOturumModal').style.display = 'flex';
}

async function handleSaveSession(e) {
    e.preventDefault();
    const id = document.getElementById('canli_oturum_id').value;
    const payload = {
        kurs_id: courseId,
        baslik: document.getElementById('cs_baslik').value.trim(),
        aciklama: document.getElementById('cs_aciklama').value.trim(),
        baslangic_tarihi: new Date(document.getElementById('cs_tarih').value).toISOString(),
        sure_dakika: parseInt(document.getElementById('cs_sure').value, 10) || 60,
    };

    try {
        if (id) {
            await ApiService.put(`/live-sessions/${id}`, payload);
            toast('Oturum güncellendi.', 'success');
        } else {
            await ApiService.post('/live-sessions', payload);
            toast('Oturum oluşturuldu.', 'success');
        }
        closeSessionModal();
        await loadSessions();
    } catch (error) {
        toast(`Hata: ${error.message}`, 'error');
    }
}

async function deleteSession(id) {
    if (!confirm('Bu canlı oturumu silmek istediğinize emin misiniz?')) return;
    try {
        await ApiService.delete(`/live-sessions/${id}`);
        toast('Oturum silindi.', 'success');
        await loadSessions();
    } catch (error) {
        toast(`Hata: ${error.message}`, 'error');
    }
}

async function openAttendanceModal(id) {
    document.getElementById('yoklamaModal').style.display = 'flex';
    const body = document.getElementById('yoklamaContent');
    body.innerHTML = '<p class="loading-text"><i class="fas fa-spinner fa-spin"></i> Yükleniyor...</p>';

    try {
        const result = await ApiService.get(`/live-sessions/${id}/attendance`);
        const { session, attendances } = result.data;
        document.getElementById('yoklamaModalTitle').textContent = `Yoklama: ${session.baslik}`;

        if (!attendances || attendances.length === 0) {
            body.innerHTML = '<p style="color:#64748b; padding:20px; text-align:center;">Henüz katılım kaydı yok.</p>';
            return;
        }

        const totalSure = session.sure_dakika || 60;
        body.innerHTML = `
            <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="text-align:left; padding:10px; border-bottom:1px solid #e2e8f0;">Öğrenci</th>
                        <th style="text-align:left; padding:10px; border-bottom:1px solid #e2e8f0;">E-Posta</th>
                        <th style="text-align:right; padding:10px; border-bottom:1px solid #e2e8f0;">Süre</th>
                        <th style="text-align:right; padding:10px; border-bottom:1px solid #e2e8f0;">Oran</th>
                    </tr>
                </thead>
                <tbody>
                    ${attendances.map(a => {
                        const p = a.Profile || {};
                        const oran = Math.min(100, Math.round(((a.toplam_dakika || 0) / totalSure) * 100));
                        return `
                            <tr>
                                <td style="padding:10px; border-bottom:1px solid #f1f5f9;">${escapeHtml((p.ad || '') + ' ' + (p.soyad || ''))}</td>
                                <td style="padding:10px; border-bottom:1px solid #f1f5f9; color:#64748b;">${escapeHtml(p.eposta || '')}</td>
                                <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:right;"><b>${a.toplam_dakika || 0}</b> dk</td>
                                <td style="padding:10px; border-bottom:1px solid #f1f5f9; text-align:right;">${oran}%</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    } catch (error) {
        body.innerHTML = `<p style="color:#dc2626; padding:20px;">${escapeHtml(error.message)}</p>`;
    }
}

function statusLabel(d) {
    switch (d) {
        case 'planlandi': return 'Planlandı';
        case 'devam_ediyor': return 'Devam Ediyor';
        case 'tamamlandi': return 'Tamamlandı';
        case 'iptal': return 'İptal';
        default: return d || '-';
    }
}

function toLocalDateTimeInput(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        alert(message);
        return;
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}
