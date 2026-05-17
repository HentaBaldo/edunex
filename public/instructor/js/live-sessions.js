/**
 * EduNex - Canlı Dersler (Live Sessions)
 * Tab-based UI: Aktif Yayınlar | Yayın Kayıtları
 */

let __sessions = [];
let __myCourses = [];
let __searchQuery = '';
let __statusFilter = 'all';
let __typeFilter = 'all';

// Cift sekme korumasi:
// startStream sonrasinda kart "Yayina Gir" -> "Odaya Gir" olarak yeniden renderlaniyor.
// Kullanici hizli cift-tikladiginda 2. tiklama yeni butona dustugu icin window.open
// iki kere cagriliyor. Bu Set ayni sessionId icin 3 sn boyunca yeniden tetiklenmeyi engeller.
const __opening = new Set();
function __lockOpen(id) {
    if (__opening.has(id)) return false;
    __opening.add(id);
    setTimeout(() => __opening.delete(id), 3000);
    return true;
}

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        await notify.alert({ title: 'Giriş gerekli', text: 'Lütfen giriş yapınız.', type: 'info' });
        window.location.href = '/auth/index.html';
        return;
    }

    // Element controls
    const createBtn = document.getElementById('createSessionBtn');
    const liveModalCloseBtn = document.getElementById('liveModalCloseBtn');
    const liveForm = document.getElementById('liveForm');
    const tabAktifBtn = document.getElementById('tabAktifBtn');
    const tabKayitBtn = document.getElementById('tabKayitBtn');
    const attendanceModalCloseBtn = document.getElementById('attendanceModalCloseBtn');

    if (!createBtn) { console.error('[LIVE-SESSIONS] createSessionBtn bulunamadı'); return; }
    if (!liveForm) { console.error('[LIVE-SESSIONS] liveForm bulunamadı'); return; }
    if (!tabAktifBtn) { console.error('[LIVE-SESSIONS] tabAktifBtn bulunamadı'); return; }
    if (!tabKayitBtn) { console.error('[LIVE-SESSIONS] tabKayitBtn bulunamadı'); return; }

    // Event listeners
    createBtn.addEventListener('click', () => openLiveModal());
    if (liveModalCloseBtn) liveModalCloseBtn.addEventListener('click', () => closeLiveModal());
    if (liveForm) liveForm.addEventListener('submit', handleFormSubmit);
    tabAktifBtn.addEventListener('click', () => switchTab('aktif'));
    tabKayitBtn.addEventListener('click', () => switchTab('kayit'));
    if (attendanceModalCloseBtn) attendanceModalCloseBtn.addEventListener('click', () => window.closeAttendanceModal());

    // Radio button change listener
    document.querySelectorAll('input[name="lf_yayin_tipi"]').forEach(r => {
        r.addEventListener('change', applyYayinTipiUI);
    });

    // Arama + filtre eventleri (anlık client-side)
    const searchEl = document.getElementById('liveSearchInput');
    const statusEl = document.getElementById('liveStatusFilter');
    const typeEl   = document.getElementById('liveTypeFilter');
    if (searchEl) searchEl.addEventListener('input', e => { __searchQuery = (e.target.value || '').toLowerCase().trim(); renderAllTabs(); });
    if (statusEl) statusEl.addEventListener('change', e => { __statusFilter = e.target.value; renderAllTabs(); });
    if (typeEl)   typeEl.addEventListener('change',   e => { __typeFilter = e.target.value;   renderAllTabs(); });

    // Load data
    await Promise.all([loadSessions(), loadMyCourses()]);
});

// Arama + filtre uygulayıcı (her iki sekme için)
function uygulaArama(list) {
    return list.filter(s => {
        if (__searchQuery && !(s.baslik || '').toLowerCase().includes(__searchQuery)) return false;
        if (__typeFilter !== 'all' && s.yayin_tipi !== __typeFilter) return false;
        return true;
    });
}

// ============ API & DATA ============

async function loadSessions() {
    try {
        const res = await ApiService.get('/live-sessions/my-sessions');
        __sessions = res.data || [];
        renderAllTabs();
    } catch (err) {
        const list = document.getElementById('tabAktifContent');
        if (list) list.innerHTML = `<p style="color:#dc2626; padding:20px;">${escapeHtml(err.message)}</p>`;
    }
}

async function loadMyCourses() {
    try {
        // Canli ders SADECE yayindaki kurslar icin acilabilir.
        // Backend tarafinda da assertInstructorOwnsCourse(requirePublished:true) ile zorlaniyor;
        // burada query param + client-side filtre ile UI ayni kurali yansitiyor.
        const res = await ApiService.get('/courses/my-courses?durum=yayinda');
        __myCourses = (res.data || []).filter(c => c.durum === 'yayinda');
        const sel = document.getElementById('lf_kurs_id');
        if (sel) {
            if (__myCourses.length === 0) {
                sel.innerHTML = '<option value="">— Yayında kursunuz yok —</option>';
            } else {
                sel.innerHTML = '<option value="">— Kurs Seçin —</option>' +
                    __myCourses.map(c => `<option value="${c.id}">${escapeHtml(c.baslik)}</option>`).join('');
            }
        }
    } catch (err) {
        toast('Kurslar yüklenemedi: ' + err.message, 'error');
    }
}

// ============ RENDERING ============

function renderAllTabs() {
    renderActiveTab();
    renderRecordingTab();
}

function renderActiveTab() {
    const activeList = document.getElementById('tabAktifContent');
    if (!activeList) return;

    let active = __sessions.filter(s => s.durum !== 'tamamlandi');
    active = uygulaArama(active);
    if (__statusFilter !== 'all') active = active.filter(s => s.durum === __statusFilter);

    if (active.length === 0) {
        activeList.innerHTML = `
            <div style="text-align:center; padding:40px;">
                <i class="fas fa-video" style="font-size:2.4rem; color:#cbd5e1;"></i>
                <p style="margin-top:12px; color:#64748b;">Filtreye uyan canlı ders yok.</p>
            </div>`;
        return;
    }

    activeList.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">
            ${active.map(renderActiveCard).join('')}
        </div>`;
}
function renderActiveCard(s) {
    const date = new Date(s.baslangic_tarihi);
    const dateLabel = date.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
    const tipBadge = s.yayin_tipi === 'genel'
        ? '<span style="padding:3px 8px; border-radius:10px; background:#d1fae5; color:#065f46; font-size:0.72rem; font-weight:600;"><i class="fas fa-globe"></i> Genel</span>'
        : '<span style="padding:3px 8px; border-radius:10px; background:#ede9fe; color:#5b21b6; font-size:0.72rem; font-weight:600;"><i class="fas fa-graduation-cap"></i> Kursa Özel</span>';
    const kursLabel = s.Course ? escapeHtml(s.Course.baslik) : '—';
    const isLive = s.durum === 'devam_ediyor';

    const durumColor = {
        planlandi: { bg:'#dbeafe', fg:'#1e40af', label:'Planlandı', icon:'fa-clock' },
        devam_ediyor: { bg:'#fee2e2', fg:'#991b1b', label:'Yayında', icon:'fa-circle' },
        iptal: { bg:'#f1f5f9', fg:'#475569', label:'İptal', icon:'fa-ban' },
    }[s.durum] || { bg:'#f1f5f9', fg:'#475569', label:s.durum, icon:'fa-circle' };

    // EĞER CANLIYSA: Odaya Geri Dön ve YAYINI BİTİR butonları çıkar
    // EĞER PLANLIYSA: Sadece Yayına Gir butonu çıkar
    let startBtnHTML = '';
    if (isLive) {
        startBtnHTML = `
            <div style="display:flex; gap:6px; flex:1;">
                <button type="button" onclick="window.enterLiveRoom('${s.id}', '${escapeHtml(s.jitsi_oda_adi || '')}')" class="btn-primary-lg-alt" style="flex:1; padding:9px 12px; font-size:0.82rem; text-align:center;"><i class="fas fa-video"></i> Odaya Gir</button>
                <button type="button" onclick="window.endSession('${s.id}')" class="btn-logout-alt" style="flex:1; padding:9px 12px; font-size:0.82rem; text-align:center; background:#dc2626; color:white; border:none;"><i class="fas fa-stop-circle"></i> Bitir</button>
            </div>
        `;
    } else {
        startBtnHTML = `<button type="button" onclick="window.startStream('${s.id}')" class="btn-primary-lg-alt" style="flex:1; padding:9px 12px; font-size:0.82rem; background:linear-gradient(135deg,#ef4444,#f97316); border:none;"><i class="fas fa-play"></i> Yayına Gir</button>`;
    }

    return `
        <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px; transition:box-shadow .2s;" onmouseover="this.style.boxShadow='0 8px 16px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                <h3 style="margin:0; font-size:1rem; color:#1e293b; line-height:1.3; flex:1;">${escapeHtml(s.baslik)}</h3>
                <span style="padding:3px 8px; border-radius:10px; background:${durumColor.bg}; color:${durumColor.fg}; font-size:0.72rem; font-weight:700; white-space:nowrap;"><i class="fas ${durumColor.icon}" style="font-size:0.55rem; ${isLive ? 'animation:pulse 1.4s infinite;' : ''}"></i> ${durumColor.label}</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">${tipBadge}</div>
            <div style="font-size:0.85rem; color:#64748b; display:flex; flex-direction:column; gap:6px;">
                <div><i class="fas fa-book" style="width:16px; color:#94a3b8;"></i> ${kursLabel}</div>
                <div><i class="fas fa-calendar" style="width:16px; color:#94a3b8;"></i> ${dateLabel}</div>
                <div><i class="fas fa-hourglass-half" style="width:16px; color:#94a3b8;"></i> ${s.sure_dakika} dk ${s.kayit_alinsin_mi ? '· <span style="color:#ef4444;"><i class="fas fa-record-vinyl"></i> Kayıt açık</span>' : ''}</div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:auto;">
                ${startBtnHTML}
                <button type="button" onclick="window.openAttendanceModal('${s.id}', '${escapeHtml(s.baslik)}')" class="btn-logout-alt" title="Yoklama" style="padding:9px 12px; font-size:0.82rem;"><i class="fas fa-eye"></i></button>
                ${isLive
                    ? `<button type="button" disabled title="Aktif yayındaki dersin bilgileri değiştirilemez" class="btn-logout-alt" style="padding:9px 12px; font-size:0.82rem; opacity:0.45; cursor:not-allowed;"><i class="fas fa-edit"></i></button>`
                    : `<button type="button" onclick="window.editLiveSession('${s.id}')" class="btn-logout-alt" title="Düzenle" style="padding:9px 12px; font-size:0.82rem;"><i class="fas fa-edit"></i></button>`}
                <button type="button" onclick="window.deleteSession('${s.id}')" class="btn-logout-alt" title="Sil" style="padding:9px 12px; font-size:0.82rem; color:#dc2626;"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
}
function renderRecordingTab() {
    const recordingList = document.getElementById('tabKayitContent');
    if (!recordingList) return;

    // SADECE 'tamamlandi' olanları getir. kayit_alinsin_mi filtresini kaldırdık!
    let recordings = __sessions.filter(s => s.durum === 'tamamlandi');
    recordings = uygulaArama(recordings);

    if (recordings.length === 0) {
        recordingList.innerHTML = `
            <div style="text-align:center; padding:40px;">
                <i class="fas fa-history" style="font-size:2.4rem; color:#cbd5e1;"></i>
                <p style="margin-top:12px; color:#64748b;">Henüz tamamlanmış geçmiş bir ders bulunmuyor.</p>
            </div>`;
        return;
    }

    recordingList.innerHTML = `
        <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.92rem;">
            <thead>
                <tr style="background:#f8fafc; text-align:left;">
                    <th style="padding:12px;">Başlık</th>
                    <th style="padding:12px;">Tip</th>
                    <th style="padding:12px;">Tarih</th>
                    <th style="padding:12px;">Durum</th>
                    <th style="padding:12px; text-align:right;">İşlem / Kayıt</th>
                </tr>
            </thead>
            <tbody>
                ${recordings.map(renderRecordingRow).join('')}
            </tbody>
        </table>
        </div>`;
}

function renderActiveRow(s) {
    const date = new Date(s.baslangic_tarihi);
    const dateLabel = date.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
    const tipBadge = s.yayin_tipi === 'genel'
        ? '<span style="padding:3px 8px; border-radius:10px; background:#d1fae5; color:#065f46; font-size:0.75rem;"><i class="fas fa-globe"></i> Genel</span>'
        : '<span style="padding:3px 8px; border-radius:10px; background:#ede9fe; color:#5b21b6; font-size:0.75rem;"><i class="fas fa-graduation-cap"></i> Kursa Özel</span>';
    const kursLabel = s.Course ? escapeHtml(s.Course.baslik) : '<span style="color:#94a3b8;">—</span>';
    const kayitBadge = s.kayit_alinsin_mi
        ? '<i class="fas fa-circle" style="color:#ef4444; font-size:0.6rem;"></i> Açık'
        : '<span style="color:#94a3b8;">Kapalı</span>';

    return `
        <tr style="border-top:1px solid #e2e8f0;">
            <td style="padding:12px;"><b>${escapeHtml(s.baslik)}</b></td>
            <td style="padding:12px;">${tipBadge}</td>
            <td style="padding:12px;">${kursLabel}</td>
            <td style="padding:12px; color:#475569;">${dateLabel}</td>
            <td style="padding:12px;">${s.sure_dakika} dk</td>
            <td style="padding:12px;">
                <select onchange="window.changeStatus('${s.id}', this.value)" style="padding:6px; border:1px solid #cbd5e1; border-radius:6px; font-size:0.8rem; background:#fff; cursor:pointer;">
                    <option value="${s.durum}" selected>${statusLabel(s.durum)}</option>
                    ${s.durum !== 'devam_ediyor' ? `<option value="devam_ediyor">Başlat</option>` : ''}
                    ${s.durum !== 'tamamlandi' ? `<option value="tamamlandi">Bitir</option>` : ''}
                    ${s.durum !== 'iptal' ? `<option value="iptal">İptal</option>` : ''}
                </select>
            </td>
            <td style="padding:12px;">${kayitBadge}</td>
            <td style="padding:12px; text-align:right; display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;">
                <button type="button" onclick="window.openAttendanceModal('${s.id}', '${escapeHtml(s.baslik)}')" class="btn-logout-alt" style="padding:6px 10px; font-size:0.78rem;"><i class="fas fa-eye"></i> Yoklama</button>
                <a href="/live/live-room.html?sessionId=${s.id}" target="_blank" class="btn-primary-lg-alt" style="padding:6px 10px; font-size:0.78rem;"><i class="fas fa-sign-in-alt"></i></a>
                <button type="button" onclick="window.editLiveSession('${s.id}')" class="btn-logout-alt" style="padding:6px 10px; font-size:0.78rem;"><i class="fas fa-edit"></i></button>
                <button type="button" onclick="window.deleteSession('${s.id}')" class="btn-logout-alt" style="padding:6px 10px; font-size:0.78rem; color:#dc2626;"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
}
function renderRecordingRow(s) {
    const date = new Date(s.baslangic_tarihi);
    const dateLabel = date.toLocaleString('tr-TR', { dateStyle: 'medium' });
    const tipBadge = s.yayin_tipi === 'genel'
        ? '<span style="padding:3px 8px; border-radius:10px; background:#d1fae5; color:#065f46; font-size:0.75rem;"><i class="fas fa-globe"></i> Genel</span>'
        : '<span style="padding:3px 8px; border-radius:10px; background:#ede9fe; color:#5b21b6; font-size:0.75rem;"><i class="fas fa-graduation-cap"></i> Kursa Özel</span>';

    // Kayıt istenip istenmemesine göre buton/metin mantığı.
    // Kayit varsa "Değiştir" butonu ile yeni dosya yukleme / link guncelleme akisini aciyoruz —
    // egitmen yanlis bir kaydi/sirali sürümü düzeltebilsin.
    let uploadBtn = '';
    if (s.kayit_alinsin_mi) {
        if (!s.kayit_video_url) {
            uploadBtn = `<button type="button" onclick="window.openUploadModal('${s.id}', '${escapeHtml(s.baslik)}')" class="btn-primary-lg-alt" style="padding:6px 12px; font-size:0.78rem;"><i class="fas fa-cloud-upload-alt"></i> Kaydı Yükle</button>`;
        } else {
            uploadBtn = `
                <span style="color:#10b981; font-size:0.85rem;"><i class="fas fa-check-circle"></i> Video Yüklü</span>
                <button type="button" onclick="window.openUploadModal('${s.id}', '${escapeHtml(s.baslik)}', true)" class="btn-logout-alt" title="Dosyayı/Linki Değiştir" style="padding:6px 10px; font-size:0.78rem; color:#2563eb;"><i class="fas fa-exchange-alt"></i> Değiştir</button>
            `;
        }
    } else {
        uploadBtn = `<span style="color:#94a3b8; font-size:0.85rem;"><i class="fas fa-video-slash"></i> Kayıt İstenmedi</span>`;
    }

    return `
        <tr style="border-top:1px solid #e2e8f0;">
            <td style="padding:12px;"><b>${escapeHtml(s.baslik)}</b></td>
            <td style="padding:12px;">${tipBadge}</td>
            <td style="padding:12px; color:#475569;">${dateLabel}</td>
            <td style="padding:12px;"><span style="padding:3px 8px; border-radius:10px; background:#e2e8f0; color:#475569; font-size:0.75rem;">Tamamlandı</span></td>
            <td style="padding:12px; text-align:right; display:flex; gap:6px; justify-content:flex-end; align-items:center; flex-wrap:wrap;">
                <button type="button" onclick="window.openAttendanceModal('${s.id}', '${escapeHtml(s.baslik)}')" class="btn-logout-alt" title="Yoklama Raporu" style="padding:6px 10px; font-size:0.78rem;"><i class="fas fa-eye"></i></button>
                ${uploadBtn}
                ${s.kayit_video_url ? `<a href="${escapeHtml(s.kayit_video_url)}" target="_blank" class="btn-logout-alt" style="padding:6px 10px; font-size:0.78rem;"><i class="fas fa-play"></i></a>` : ''}
                <button type="button" onclick="window.deleteSession('${s.id}')" class="btn-logout-alt" style="padding:6px 10px; font-size:0.78rem; color:#dc2626;"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
}

// ============ MODAL MANAGEMENT ============

function openLiveModal() {
    const modal = document.getElementById('liveModal');
    if (!modal) return;

    document.getElementById('liveModalTitle').textContent = 'Yeni Canlı Ders';
    const form = document.getElementById('liveForm');
    if (form) form.reset();

    const id = document.getElementById('lf_id');
    if (id) id.value = '';

    const sure = document.getElementById('lf_sure');
    if (sure) sure.value = 60;

    const radio = document.querySelector('input[name="lf_yayin_tipi"][value="kursa_ozel"]');
    if (radio) radio.checked = true;

    setMinDateNow();
    applyYayinTipiUI();
    modal.style.display = 'flex';
}

function closeLiveModal() {
    const modal = document.getElementById('liveModal');
    if (modal) modal.style.display = 'none';
}

window.openAttendanceModal = function (sessionId, sessionTitle) {
    const modal = document.getElementById('attendanceModal');
    if (!modal) return;

    const titleEl = document.getElementById('attendanceTitle');
    if (titleEl) titleEl.textContent = `Yoklama: ${sessionTitle}`;

    const content = document.getElementById('attendanceContent');
    if (content) content.innerHTML = '<p class="loading-text"><i class="fas fa-spinner fa-spin"></i> Yükleniyor...</p>';

    modal.style.display = 'flex';

    (async () => {
        try {
            const res = await ApiService.get(`/live-sessions/${sessionId}/attendance`);
            const { session, attendances } = res.data;

            if (!attendances || attendances.length === 0) {
                if (content) content.innerHTML = '<p style="color:#64748b; padding:20px; text-align:center;">Henüz katılım kaydı yok.</p>';
                return;
            }

            const sureDakika = session.sure_dakika || 60;
            let html = '<table style="width:100%; border-collapse:collapse; font-size:0.9rem;"><thead><tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;"><th style="text-align:left; padding:12px;">Öğrenci</th><th style="text-align:left; padding:12px;">Katılım Süresi</th><th style="text-align:left; padding:12px;">Oran</th></tr></thead><tbody>';

            attendances.forEach(a => {
                const p = a.Profile || {};
                const minutes = a.toplam_dakika || 0;
                const percent = a.katilim_orani ?? Math.min(100, Math.round((minutes / sureDakika) * 100));
                const adSoyad = escapeHtml((p.ad || '') + ' ' + (p.soyad || ''));

                html += `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:12px;"><b>${adSoyad}</b></td>
                        <td style="padding:12px; color:#475569;">${minutes} dk</td>
                        <td style="padding:12px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div style="flex:1; height:20px; background:#e2e8f0; border-radius:10px; overflow:hidden;">
                                    <div style="height:100%; background:${percent >= 75 ? '#10b981' : percent >= 50 ? '#f59e0b' : '#ef4444'}; width:${percent}%; transition:width 0.3s;"></div>
                                </div>
                                <span style="font-weight:600; color:#1e293b; min-width:40px; text-align:right;">${percent}%</span>
                            </div>
                        </td>
                    </tr>`;
            });

            html += '</tbody></table>';
            if (content) content.innerHTML = html;
        } catch (err) {
            if (content) content.innerHTML = `<p style="color:#dc2626; padding:20px;">${escapeHtml(err.message)}</p>`;
        }
    })();
}

window.closeAttendanceModal = function () {
    const modal = document.getElementById('attendanceModal');
    if (modal) modal.style.display = 'none';
};

// ============ TAB SWITCHING ============

function switchTab(tabName) {
    const tabAktif = document.getElementById('tabAktifContent');
    const tabKayit = document.getElementById('tabKayitContent');
    const btnAktif = document.getElementById('tabAktifBtn');
    const btnKayit = document.getElementById('tabKayitBtn');

    if (!tabAktif || !tabKayit || !btnAktif || !btnKayit) return;

    if (tabName === 'aktif') {
        tabAktif.style.display = 'block';
        tabKayit.style.display = 'none';
        btnAktif.style.borderBottomColor = 'var(--primary-color)';
        btnAktif.style.color = 'var(--primary-color)';
        btnKayit.style.borderBottomColor = 'transparent';
        btnKayit.style.color = '#64748b';
    } else if (tabName === 'kayit') {
        tabAktif.style.display = 'none';
        tabKayit.style.display = 'block';
        btnAktif.style.borderBottomColor = 'transparent';
        btnAktif.style.color = '#64748b';
        btnKayit.style.borderBottomColor = 'var(--primary-color)';
        btnKayit.style.color = 'var(--primary-color)';
    }
}

// ============ UPLOAD MODAL ============

window.openUploadModal = (sessionId, sessionTitle, isReplace = false) => {
    const existing = document.getElementById('uploadRecordingModal');
    if (existing) existing.remove();

    const baslik = isReplace ? 'Yayın Kaydını Değiştir' : 'Yayın Kaydı Yükle';
    const submitText = isReplace ? 'Yenisini Yükle' : 'Yükle';

    const modal = document.createElement('div');
    modal.id = 'uploadRecordingModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-box" style="max-width:440px;">
            <h3 class="modal-title">${escapeHtml(baslik)}</h3>
            <p style="color:#64748b; margin-bottom:12px;">${escapeHtml(sessionTitle)}</p>

            <!-- Sekmeler: dosya veya link -->
            <div style="display:flex; gap:6px; margin-bottom:14px; border-bottom:1px solid #e2e8f0;">
                <button type="button" id="urTabFile" class="ur-tab" style="flex:1; padding:10px 8px; background:none; border:none; border-bottom:2px solid var(--primary-color); color:var(--primary-color); font-weight:600; cursor:pointer;"><i class="fas fa-file-upload"></i> Dosya Yükle</button>
                <button type="button" id="urTabLink" class="ur-tab" style="flex:1; padding:10px 8px; background:none; border:none; border-bottom:2px solid transparent; color:#64748b; font-weight:600; cursor:pointer;"><i class="fas fa-link"></i> Link Gir</button>
            </div>

            <!-- Dosya Yukleme -->
            <form id="uploadForm">
                <div class="form-group">
                    <label class="form-label">MP4 veya WEBM dosyası</label>
                    <input type="file" id="uploadFile" accept="video/mp4,video/webm,.mp4,.webm" class="form-control" required>
                    <small style="display:block; margin-top:6px; color:#94a3b8; font-size:0.78rem;">${isReplace ? 'Yeni dosya, mevcut kaydın yerine geçer.' : 'Jitsi yerel kaydı (.webm) doğrudan yüklenebilir; sunucu tarafında dönüşüm yapılmaz.'}</small>
                </div>
                <div class="modal-actions">
                    <button type="submit" class="btn-primary-lg-alt">${escapeHtml(submitText)}</button>
                    <button type="button" class="btn-logout-alt" onclick="document.getElementById('uploadRecordingModal').remove();">İptal</button>
                </div>
            </form>

            <!-- Link Gir -->
            <form id="linkForm" style="display:none;">
                <div class="form-group">
                    <label class="form-label">Video Linki (https://...)</label>
                    <input type="url" id="linkInput" class="form-control" placeholder="https://iframe.mediadelivery.net/embed/..." required>
                    <small style="display:block; margin-top:6px; color:#94a3b8; font-size:0.78rem;">Bunny Stream embed linki veya başka bir HTTPS video adresi olabilir.</small>
                </div>
                <div class="modal-actions">
                    <button type="submit" class="btn-primary-lg-alt">Linki Kaydet</button>
                    <button type="button" class="btn-logout-alt" onclick="document.getElementById('uploadRecordingModal').remove();">İptal</button>
                </div>
            </form>

            <div id="uploadProgress" style="display:none; margin-top:16px;">
                <div style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                    <div id="uploadProgressBar" style="height:100%; background:var(--primary-color); width:0%; transition:width 0.3s;"></div>
                </div>
                <p style="font-size:0.85rem; color:#64748b; margin-top:8px; text-align:center;">Yükleniyor...</p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Sekme gecisi
    const tabFile = document.getElementById('urTabFile');
    const tabLink = document.getElementById('urTabLink');
    const uploadForm = document.getElementById('uploadForm');
    const linkForm = document.getElementById('linkForm');
    function activateTab(which) {
        if (which === 'file') {
            tabFile.style.borderBottomColor = 'var(--primary-color)';
            tabFile.style.color = 'var(--primary-color)';
            tabLink.style.borderBottomColor = 'transparent';
            tabLink.style.color = '#64748b';
            uploadForm.style.display = '';
            linkForm.style.display = 'none';
        } else {
            tabLink.style.borderBottomColor = 'var(--primary-color)';
            tabLink.style.color = 'var(--primary-color)';
            tabFile.style.borderBottomColor = 'transparent';
            tabFile.style.color = '#64748b';
            uploadForm.style.display = 'none';
            linkForm.style.display = '';
        }
    }
    tabFile.addEventListener('click', () => activateTab('file'));
    tabLink.addEventListener('click', () => activateTab('link'));

    // Dosya yukleme submit
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('uploadFile');
        if (!fileInput || !fileInput.files[0]) return;

        const formData = new FormData();
        formData.append('recording', fileInput.files[0]);

        const progressDiv = document.getElementById('uploadProgress');
        if (progressDiv) progressDiv.style.display = '';
        uploadForm.style.display = 'none';
        linkForm.style.display = 'none';

        try {
            await ApiService.postFormData(`/live-sessions/${sessionId}/upload-recording`, formData);
            toast(isReplace ? 'Kayıt değiştirildi.' : 'Kaydı yüklendi.', 'success');
            document.getElementById('uploadRecordingModal').remove();
            await loadSessions();
        } catch (err) {
            toast('Hata: ' + err.message, 'error');
            if (progressDiv) progressDiv.style.display = 'none';
            uploadForm.style.display = '';
        }
    });

    // Link guncelleme submit (PATCH)
    linkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = (document.getElementById('linkInput').value || '').trim();
        if (!/^https:\/\//i.test(url)) {
            toast('Geçerli bir https:// linki girin.', 'error');
            return;
        }
        try {
            await ApiService.patch(`/live-sessions/${sessionId}/recording`, { kayit_video_url: url });
            toast('Kayıt linki güncellendi.', 'success');
            document.getElementById('uploadRecordingModal').remove();
            await loadSessions();
        } catch (err) {
            toast('Hata: ' + err.message, 'error');
        }
    });
};

// ============ FORM & SESSION HANDLERS ============

async function handleFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('lf_id')?.value;
    const tip = document.querySelector('input[name="lf_yayin_tipi"]:checked')?.value || 'kursa_ozel';
    const tarihValue = document.getElementById('lf_tarih')?.value;
    const kursId = document.getElementById('lf_kurs_id')?.value;

    if (!tarihValue) { toast('Tarih seçmelisiniz.', 'error'); return; }

    if (new Date(tarihValue) < new Date()) {
        toast('Geçmiş bir tarihe canlı ders planlanamaz.', 'error');
        return;
    }

    if (tip === 'kursa_ozel' && !kursId) {
        toast('Kursa özel yayın için kurs seçmelisiniz.', 'error');
        return;
    }

    const payload = {
        kurs_id: tip === 'genel' ? null : kursId,
        yayin_tipi: tip,
        kayit_alinsin_mi: document.getElementById('lf_kayit')?.checked || false,
        baslik: document.getElementById('lf_baslik')?.value?.trim() || '',
        aciklama: document.getElementById('lf_aciklama')?.value?.trim() || '',
        baslangic_tarihi: new Date(tarihValue).toISOString(),
        sure_dakika: parseInt(document.getElementById('lf_sure')?.value || 60, 10),
    };

    try {
        if (id) {
            await ApiService.put(`/live-sessions/${id}`, payload);
            toast('Güncellendi.', 'success');
        } else {
            await ApiService.post('/live-sessions', payload);
            toast('Oluşturuldu.', 'success');
        }
        closeLiveModal();
        await loadSessions();
    } catch (err) {
        toast('Hata: ' + err.message, 'error');
    }
}

window.changeStatus = async (id, newStatus) => {
    try {
        await ApiService.put(`/live-sessions/${id}/status`, { durum: newStatus });
        toast('Durum güncellendi.', 'success');
        await loadSessions();
    } catch (err) {
        toast('Hata: ' + err.message, 'error');
    }
};

/**
 * "Yayına Gir" — eğitmen butonuna basınca:
 *  1) Backend'e PUT /live-sessions/:id/start gönder (durum otomatik 'devam_ediyor')
 *  2) 200 dönerse localStorage'a ID kaydet ve /canli-ders/ODA_ADI sayfasına yönlendir (yeni sekme)
 */
window.startStream = async (id) => {
    if (!__lockOpen(id)) return;
    try {
        const res = await ApiService.put(`/live-sessions/${id}/start`, {});
        const veri = res?.data || {};
        const url = veri.redirect_url || (veri.jitsi_oda_adi ? `/canli-ders/${veri.jitsi_oda_adi}` : null);

        if (!url) {
            toast('Oda adı alınamadı.', 'error');
            return;
        }

        localStorage.setItem('current_live_session_id', id);

        // Sekmeyi loadSessions()'tan ONCE ac:
        //   1) Kullanici aninda gorsel geribildirim alir, yeniden tiklama egilimi azalir.
        //   2) loadSessions() bekledigimiz icin async pencerede ikinci tiklama window.open'i tekrar tetikleyemez.
        window.open(url, '_blank');
        toast('Yayın başlatıldı.', 'success');
        await loadSessions();
    } catch (err) {
        toast('Yayın başlatılamadı: ' + err.message, 'error');
    }
};
window.editLiveSession = (id) => {
    const s = __sessions.find(x => x.id === id);
    if (!s) return;

    // Aktif yayindaki dersin bilgileri degistirilemez. Buton disabled olsa bile
    // konsol/DOM uzerinden bypass denemelerine karsi modal acilmadan once kontrol.
    if (s.durum === 'devam_ediyor') {
        toast('Aktif yayındaki dersin bilgileri değiştirilemez.', 'error');
        return;
    }

    document.getElementById('liveModalTitle').textContent = 'Canlı Dersi Düzenle';
    const idInput = document.getElementById('lf_id');
    if (idInput) idInput.value = s.id;

    const baslik = document.getElementById('lf_baslik');
    if (baslik) baslik.value = s.baslik || '';

    const aciklama = document.getElementById('lf_aciklama');
    if (aciklama) aciklama.value = s.aciklama || '';

    const tarih = document.getElementById('lf_tarih');
    if (tarih) tarih.value = toLocalDateTimeInput(s.baslangic_tarihi);

    const sure = document.getElementById('lf_sure');
    if (sure) sure.value = s.sure_dakika || 60;

    const kayit = document.getElementById('lf_kayit');
    if (kayit) kayit.checked = !!s.kayit_alinsin_mi;

    const tip = s.yayin_tipi === 'genel' ? 'genel' : 'kursa_ozel';
    const radio = document.querySelector(`input[name="lf_yayin_tipi"][value="${tip}"]`);
    if (radio) radio.checked = true;

    const kursId = document.getElementById('lf_kurs_id');
    if (kursId) kursId.value = s.kurs_id || '';

    setMinDateNow();
    applyYayinTipiUI();

    const modal = document.getElementById('liveModal');
    if (modal) modal.style.display = 'flex';
};

window.deleteSession = async (id) => {
    const ok = await notify.confirm({
        title: 'Canlı dersi sil',
        text: 'Bu canlı dersi silmek istediğinize emin misiniz?',
        confirmText: 'Sil',
        cancelText: 'Vazgeç',
        type: 'error'
    });
    if (!ok) return;
    try {
        await ApiService.delete(`/live-sessions/${id}`);
        toast('Silindi.', 'success');
        await loadSessions();
    } catch (err) {
        toast('Hata: ' + err.message, 'error');
    }
};

// ============ HELPERS ============

function applyYayinTipiUI() {
    const tip = document.querySelector('input[name="lf_yayin_tipi"]:checked')?.value || 'kursa_ozel';
    const kursGroup = document.getElementById('lf_kurs_group');
    const kursSelect = document.getElementById('lf_kurs_id');
    if (kursGroup) kursGroup.style.display = tip === 'genel' ? 'none' : 'block';
    if (kursSelect) {
        // Genel seçilirse kurs_id sıfırla ve disable et; backend'e yanlış kurs_id gitmesin.
        kursSelect.disabled = (tip === 'genel');
        if (tip === 'genel') kursSelect.value = '';
    }

    document.querySelectorAll('.lf-yayin-opt').forEach(opt => {
        const radio = opt.querySelector('input[type="radio"]');
        if (radio?.checked) {
            opt.style.borderColor = '#8b5cf6';
            opt.style.background = '#f5f3ff';
        } else {
            opt.style.borderColor = '#e2e8f0';
            opt.style.background = '#fff';
        }
    });
}

function setMinDateNow() {
    const input = document.getElementById('lf_tarih');
    if (!input) return;
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    input.min = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusLabel(durum) {
    const map = {
        planlandi: 'Planlandı',
        devam_ediyor: 'Devam Ediyor',
        tamamlandi: 'Tamamlandı',
        iptal: 'İptal'
    };
    return map[durum] || durum;
}

function toLocalDateTimeInput(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(text) {
    if (text == null) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) {
        if (window.notify) notify.toast(message, type);
        return;
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    // .toast varsayilan opacity:0; animasyon bitince gorunmez kaliyordu.
    // .toast-show sinifi opacity:1'i sabitler — kullanici bildirimi okuyabilsin.
    requestAnimationFrame(() => el.classList.add('toast-show'));
    setTimeout(() => {
        el.classList.remove('toast-show');
        setTimeout(() => el.remove(), 300);
    }, 4700);
}
// ==========================================
// EĞİTMEN YAYIN YÖNETİMİ (GİRİŞ VE BİTİRME)
// ==========================================

// Yayına zaten girilmişse sadece odaya bağlan (Backend'e Start atmaz)
window.enterLiveRoom = (sessionId, odaAdi) => {
    if (!__lockOpen(sessionId)) return;
    localStorage.setItem('current_live_session_id', sessionId);
    window.open(`/canli-ders/${odaAdi}`, '_blank');
};

// Yayını tamamen bitirip Yayın Kayıtları sekmesine düşürmek için
window.endSession = async (id) => {
    const ok = await notify.confirm({
        title: 'Yayını bitir',
        text: 'Yayını tamamen bitirmek istediğinize emin misiniz? Öğrenciler de dersten çıkarılacaktır.',
        confirmText: 'Evet, bitir',
        cancelText: 'Vazgeç',
        type: 'warning'
    });
    if (!ok) return;
    try {
        await ApiService.put(`/live-sessions/${id}/status`, { durum: 'tamamlandi' });
        toast('Yayın başarıyla sonlandırıldı.', 'success');
        
        // Listeleri yenile ki kart Aktif'ten Kayıtlar sekmesine geçsin
        await loadSessions(); 
        
    } catch (err) {
        toast('Yayın bitirilirken hata oluştu: ' + err.message, 'error');
    }
};