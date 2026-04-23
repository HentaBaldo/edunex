/**
 * EduNex Admin - Kullanıcı Yönetimi (V3 - Tam Veritabanı ve İstatistik Uyumu)
 */

const API_URL = '/api/admin/users';
let currentPage = 1;
let currentRoleFilter = ''; 

// API İstekleri için Header ayarları
function getHeaders() {
    const token = localStorage.getItem('edunex_admin_token');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
    };
}

document.addEventListener('DOMContentLoaded', () => {
    fetchUsers(currentPage, currentRoleFilter);
});

// URL'nin başına protokol ekleyerek dış bağlantı olmasını sağlayan yardımcı fonksiyon
const ensureAbsoluteUrl = (url) => {
    if (!url) return '#';
    return (url.startsWith('http://') || url.startsWith('https://')) ? url : `https://${url}`;
};

// Sekme (Tab) Filtreleme Fonksiyonu
window.changeRoleFilter = (role) => {
    currentRoleFilter = role;
    currentPage = 1;

    // Sekmelerin görsel aktifliğini güncelle
    document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
    
    const targetTab = role === '' ? 'tab-all' : `tab-${role}`;
    if (document.getElementById(targetTab)) {
        document.getElementById(targetTab).classList.add('active');
    }

    fetchUsers(currentPage, currentRoleFilter);
};

// Backend'den kullanıcıları çeken fonksiyon
async function fetchUsers(page = 1, role = '') {
    try {
        const tbody = document.getElementById('usersList');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Yükleniyor...</td></tr>';

        let queryUrl = `${API_URL}?page=${page}&limit=10`;
        if (role) {
            queryUrl += `&rol=${role}`;
        }

        const response = await fetch(queryUrl, { headers: getHeaders() });
        const result = await response.json();

        if (result.success) {
            if (result.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#64748b;">Eşleşen kullanıcı bulunamadı.</td></tr>';
            } else {
                renderTable(result.data);
            }
            renderPagination(result.pagination.totalPages, result.pagination.currentPage);
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#ef4444;">Hata: ${result.message}</td></tr>`;
        }
    } catch (error) {
        console.error('Veriler çekilirken hata oluştu:', error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Sunucu bağlantı hatası!</td></tr>';
    }
}

// Gelen verileri HTML tablosuna basan fonksiyon
function renderTable(users) {
    const tbody = document.getElementById('usersList');
    tbody.innerHTML = '';

    const loggedInUser = JSON.parse(localStorage.getItem('edunex_admin_user') || '{}');

    users.forEach(user => {
        const isMe = loggedInUser.id === user.id;
        const isAdmin = user.rol === 'admin'; // Rolün admin olup olmadığını kontrol ediyoruz
        
        const roleColors = {
            'admin': { bg: '#fee2e2', text: '#991b1b' },
            'egitmen': { bg: '#fef3c7', text: '#92400e' },
            'ogrenci': { bg: '#dbeafe', text: '#1e40af' }
        };
        const color = roleColors[user.rol] || { bg: '#f1f5f9', text: '#475569' };

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500; color: #1e293b;">
                ${user.ad} ${user.soyad} 
                ${isMe ? '<span style="font-size:0.6rem; background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; margin-left:5px; vertical-align:middle;">SEN</span>' : ''}
            </td>
            <td style="color: #64748b;">${user.eposta}</td>
            <td style="color: #64748b; font-size: 0.85rem;">-</td> 
            <td>
                <span style="background: ${color.bg}; color: ${color.text}; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;">
                    ${user.rol}
                </span>
            </td>
            <td style="text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                ${isAdmin ? '' : `<button class="btn-view" onclick="viewUser('${user.id}')" style="background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; transition: 0.2s;"><i class="fas fa-eye"></i> İncele</button>`}
                
                ${(isMe || isAdmin)
                    ? `<span style="color: #cbd5e1; font-size: 0.85rem; display: flex; align-items: center;"><i class="fas fa-shield-alt"></i> Korunuyor</span>`
                    : `<button class="btn-delete" onclick="deleteUser('${user.id}')" style="background: #fee2e2; color: #ef4444; border: 1px solid #fca5a5; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem; transition: 0.2s;"><i class="fas fa-trash-alt"></i></button>`
                }
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// İNCELE (GOD MODE) FONKSİYONU - TÜM VERİTABANI ALANLARI EKLENDİ
// İNCELE (GOD MODE) FONKSİYONU
window.viewUser = async (id) => {
    const modal = document.getElementById('userModalOverlay');
    const body = document.getElementById('userModalBody');
    
    modal.style.display = 'flex';
    body.innerHTML = '<div style="text-align:center; padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:#3b82f6;"></i><p style="margin-top:10px; color:#64748b;">Veritabanı taranıyor...</p></div>';

    try {
        const response = await fetch(`${API_URL}/${id}`, { headers: getHeaders() });
        const result = await response.json();

        if (!result.success || !result.data) {
            throw new Error(result.message || "Kullanıcı verisi alınamadı.");
        }

        const user = result.data;
        const stats = result.stats || {};
        const details = user.StudentDetail || user.InstructorDetail || {};

        // Sosyal Medya İkonları Listesi
        const socials = [
            { icon: 'fa-globe', val: user.website, label: 'Web' }, 
            { icon: 'fa-linkedin', val: user.linkedin, label: 'LinkedIn' },
            { icon: 'fa-instagram', val: user.instagram, label: 'Instagram' }, 
            { icon: 'fa-x-twitter', val: user.x_twitter, label: 'X' },
            { icon: 'fa-youtube', val: user.youtube, label: 'YouTube' }, 
            { icon: 'fa-facebook', val: user.facebook, label: 'Facebook' },
            { icon: 'fa-tiktok', val: user.tiktok, label: 'TikTok' }
        ].filter(s => s.val);

        // İstatistik HTML'i
        let statHtml = '';
        if (user.rol === 'egitmen') {
            statHtml = `
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:15px;">
                <div style="background:#f0fdf4; padding:12px; border-radius:8px; text-align:center; border:1px solid #bbf7d0;">
                    <b style="color:#16a34a; font-size:1.2rem;">${stats.aktif || 0}</b><br><small style="color:#15803d; font-weight:600; font-size:0.65rem;">YAYINDA</small>
                </div>
                <div style="background:#fff7ed; padding:12px; border-radius:8px; text-align:center; border:1px solid #ffedd5;">
                    <b style="color:#ea580c; font-size:1.2rem;">${stats.onayBekleyen || 0}</b><br><small style="color:#9a3412; font-weight:600; font-size:0.65rem;">BEKLEYEN</small>
                </div>
                <div style="background:#f8fafc; padding:12px; border-radius:8px; text-align:center; border:1px solid #e2e8f0;">
                    <b style="color:#64748b; font-size:1.2rem;">${stats.taslak || 0}</b><br><small style="color:#475569; font-weight:600; font-size:0.65rem;">TASLAK</small>
                </div>
            </div>`;
        } else if (user.rol === 'ogrenci') {
            statHtml = `
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:15px;">
                <div style="background:#eff6ff; padding:12px; border-radius:8px; text-align:center; border:1px solid #dbeafe;">
                    <b style="color:#2563eb; font-size:1.2rem;">${stats.toplam || 0}</b><br><small style="color:#1e40af; font-weight:600; font-size:0.65rem;">TOPLAM KURS</small>
                </div>
                <div style="background:#f0fdf4; padding:12px; border-radius:8px; text-align:center; border:1px solid #bbf7d0;">
                    <b style="color:#16a34a; font-size:1.2rem;">${stats.tamamlanan || 0}</b><br><small style="color:#15803d; font-weight:600; font-size:0.65rem;">BİTİRDİĞİ</small>
                </div>
                <div style="background:#fffbeb; padding:12px; border-radius:8px; text-align:center; border:1px solid #fef3c7;">
                    <b style="color:#d97706; font-size:1.2rem;">${stats.devamEden || 0}</b><br><small style="color:#92400e; font-weight:600; font-size:0.65rem;">DEVAM EDEN</small>
                </div>
            </div>`;
        }

        body.innerHTML = `
            <div style="display:flex; align-items:center; gap:20px; margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid #f1f5f9;">
                <div style="width:70px; height:70px; background:#f1f5f9; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2rem; color:#94a3b8; border:2px solid #e2e8f0;">
                    <i class="fas ${user.rol === 'egitmen' ? 'fa-chalkboard-teacher' : 'fa-user-graduate'}"></i>
                </div>
                <div>
                    <h3 style="margin:0; font-size:1.3rem; color:#0f172a;">${user.ad} ${user.soyad}</h3>
                    <p style="margin:2px 0; color:#64748b; font-size:0.9rem;">${user.eposta}</p>
                    <div style="margin-top:5px; font-size:0.8rem; color:#94a3b8;"><i class="fas fa-map-marker-alt"></i> ${user.sehir || 'Konum Belirtilmedi'}</div>
                </div>
            </div>

            ${statHtml}

            <div style="background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; margin-bottom: 15px;">
                <h4 style="margin: 0 0 10px; color: #334155; font-size: 0.85rem; text-transform:uppercase; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">${user.rol.toUpperCase()} DETAYLARI</h4>
                ${user.rol === 'egitmen' ? `
                    <p style="margin-bottom:8px;"><strong>Unvan:</strong> ${details.unvan || '-'}</p>
                    <p style="margin-bottom:8px;"><strong>Deneyim:</strong> ${details.deneyim_yili || 0} Yıl</p>
                    <p style="margin-bottom:8px;"><strong>IBAN:</strong> <code style="color:#059669; font-weight:700;">${details.iban_no || 'GİRİLMEMİŞ'}</code></p>
                ` : `
                    <p style="margin-bottom:8px;"><strong>Eğitim Seviyesi:</strong> ${details.egitim_seviyesi || '-'}</p>
                `}
                <p style="margin-bottom:8px;"><strong>Başlık:</strong> ${details.baslik || '-'}</p>
                <p style="margin-bottom:0;"><strong>Biyografi:</strong> ${details.biyografi || 'Henüz eklenmemiş.'}</p>
            </div>

            <div style="background:#f8fafc; padding:15px; border-radius:10px; border:1px solid #e2e8f0; margin-bottom:15px;">
                <h4 style="font-size:0.8rem; color:#64748b; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.5px;">GİZLİLİK VE DURUM</h4>
                <div style="font-size:0.85rem; display:flex; gap:15px;">
                    <span><i class="fas fa-check-circle" style="color:${user.profil_herkese_acik_mi ? '#10b981' : '#ef4444'};"></i> Profil ${user.profil_herkese_acik_mi ? 'Açık' : 'Gizli'}</span>
                    <span><i class="fas fa-check-circle" style="color:${user.alinan_kurslari_goster ? '#10b981' : '#ef4444'};"></i> Kurslar ${user.alinan_kurslari_goster ? 'Görünür' : 'Gizli'}</span>
                </div>
            </div>

            <div style="margin-bottom:10px;">
                <h4 style="font-size:0.8rem; color:#64748b; margin-bottom:12px; text-transform:uppercase;">SOSYAL BAĞLANTILAR</h4>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    ${socials.length > 0 ? socials.map(s => `
                        <a href="${ensureAbsoluteUrl(s.val)}" target="_blank" title="${s.label}" style="width:45px; height:45px; border:1px solid #cbd5e1; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#334155; text-decoration:none; background:#fff; transition:0.2s;">
                            <i class="fab ${s.icon} fa-lg"></i>
                        </a>`).join('') : '<small style="color:#94a3b8; font-style:italic;">Hiçbir sosyal medya veya web bağlantısı eklenmemiş.</small>'}
                </div>
            </div>

            <div style="font-size:0.65rem; color:#cbd5e1; font-family:monospace; text-align:right; margin-top:20px;">SİSTEM ID: ${user.id}</div>
        `;

    } catch (error) {
        console.error("Detay Hatası:", error);
        body.innerHTML = `<div style="color:#ef4444; text-align:center; padding:20px;">
            <i class="fas fa-exclamation-triangle fa-2x"></i>
            <p style="margin-top:10px;"><strong>Veri hatası:</strong> ${error.message}</p>
        </div>`;
    }
};

window.closeUserModal = () => {
    document.getElementById('userModalOverlay').style.display = 'none';
};

// Kullanıcı Silme Fonksiyonu
window.deleteUser = async (id) => {
    if (!confirm('⚠️ DİKKAT! Bu kullanıcıyı kalıcı olarak silmek istediğinize emin misiniz?')) return;

    try {
        const response = await fetch(`${API_URL}/${id}`, { 
            method: 'DELETE', 
            headers: getHeaders() 
        });
        const result = await response.json();

        if (result.success) {
            fetchUsers(currentPage, currentRoleFilter); 
        } else {
            alert('❌ Hata: ' + result.message);
        }
    } catch (error) {
        console.error('Silme hatası:', error);
    }
};

// Sayfalama (Pagination) Butonlarını Oluşturan Fonksiyon (ReferenceError ÇÖZÜLDÜ)
function renderPagination(totalPages, page) {
    currentPage = page;
    const paginationDiv = document.getElementById('paginationControls');
    paginationDiv.innerHTML = '';

    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        btn.className = (i === page) ? 'active' : '';
        btn.onclick = () => fetchUsers(i, currentRoleFilter);
        paginationDiv.appendChild(btn);
    }
}