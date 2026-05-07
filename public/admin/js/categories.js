/**
 * EduNex Admin - Kategori Yönetimi
 * CRUD + KPI + filtre + multipart yükleme.
 */

const ADMIN_API = '/api/categories/admin';
let _categories = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchCategories();
});

// === Auth header ===
function authHeaders() {
    const token = localStorage.getItem('edunex_admin_token');
    return { 'Authorization': `Bearer ${token}` };
}

// === Toast ===
function showToast(message, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    t.innerHTML = `<i class="fas ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.transition = 'opacity 0.3s';
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}

function escapeHtml(text) {
    if (text === null || typeof text === 'undefined') return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// === Veri çek ===
async function fetchCategories() {
    const tbody = document.getElementById('categoriesList');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#64748b;"><i class="fas fa-spinner fa-spin"></i> Yükleniyor...</td></tr>';

    try {
        const res = await fetch(`${ADMIN_API}/list`, { headers: authHeaders() });
        const result = await res.json();

        if (!result.success) throw new Error(result.message || 'Veri alınamadı.');

        _categories = result.data || [];
        renderKpis(_categories);
        renderTable(_categories);
    } catch (error) {
        console.error('Kategori listesi hatası:', error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#ef4444;"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(error.message)}</td></tr>`;
        showToast('Kategoriler yüklenemedi: ' + error.message, 'error');
    }
}

// === KPI ===
function renderKpis(list) {
    const total = list.length;
    const empty = list.filter(c => (c.kurs_sayisi || 0) === 0).length;

    let popular = null;
    list.forEach(c => {
        if (!popular || (c.toplam_ogrenci || 0) > (popular.toplam_ogrenci || 0)) popular = c;
    });

    const rated = list.filter(c => parseFloat(c.yildiz_ortalamasi) > 0);
    const avgYildiz = rated.length > 0
        ? (rated.reduce((s, c) => s + parseFloat(c.yildiz_ortalamasi), 0) / rated.length)
        : 0;

    document.getElementById('kpiToplam').textContent = total;
    document.getElementById('kpiBos').textContent = empty;
    document.getElementById('kpiYildiz').textContent = avgYildiz.toFixed(2);

    const popEl = document.getElementById('kpiPopuler');
    const popSub = document.getElementById('kpiPopulerSub');
    if (popular && (popular.toplam_ogrenci || 0) > 0) {
        popEl.textContent = popular.ad;
        popEl.title = popular.ad;
        popSub.textContent = `${popular.toplam_ogrenci} öğrenci • ${popular.kurs_sayisi} kurs`;
    } else {
        popEl.textContent = 'Henüz Yok';
        popSub.textContent = 'Hiç kayıt bulunmadı';
    }
}

// === Yıldız HTML ===
function buildStars(rating) {
    const r = parseFloat(rating) || 0;
    const full = Math.floor(r);
    const half = (r - full) >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    let html = '<span class="stars">';
    for (let i = 0; i < full; i++)  html += '<i class="fas fa-star"></i>';
    if (half) html += '<i class="fas fa-star-half-alt"></i>';
    for (let i = 0; i < empty; i++) html += '<i class="far fa-star empty"></i>';
    html += `</span><span class="star-text">${r.toFixed(2)}/5</span>`;
    return html;
}

// === Tablo render ===
function renderTable(list) {
    const tbody = document.getElementById('categoriesList');
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px; color:#64748b;">Eşleşen kategori bulunamadı.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(c => {
        const desc = c.aciklama
            ? escapeHtml(c.aciklama.length > 90 ? c.aciklama.slice(0, 90) + '…' : c.aciklama)
            : '<em style="color:#94a3b8;">Açıklama yok</em>';

        const cover = c.kapak_fotografi
            ? `<img src="${escapeHtml(c.kapak_fotografi)}" alt="${escapeHtml(c.ad)}" class="cat-cover" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'cat-cover-placeholder',innerHTML:'<i class=\\'fas fa-image\\'></i>'}))">`
            : `<div class="cat-cover-placeholder"><i class="fas fa-image"></i></div>`;

        const kursSayi = parseInt(c.kurs_sayisi || 0, 10);
        const ogrSayi  = parseInt(c.toplam_ogrenci || 0, 10);
        const status   = kursSayi > 0
            ? '<span class="badge badge-active">Aktif</span>'
            : '<span class="badge badge-empty">Boş</span>';

        return `
        <tr>
            <td>
                <div class="cat-name-cell">
                    ${cover}
                    <div>
                        <div class="name">${escapeHtml(c.ad)}</div>
                        <div class="slug">${escapeHtml(c.slug)}</div>
                    </div>
                </div>
            </td>
            <td><div class="cat-desc">${desc}</div></td>
            <td style="text-align:center; font-weight:700; color:#0f172a;">${kursSayi}</td>
            <td style="text-align:center; font-weight:700; color:#0f172a;">${ogrSayi.toLocaleString('tr-TR')}</td>
            <td style="white-space:nowrap;">${buildStars(c.yildiz_ortalamasi)}</td>
            <td style="text-align:center;">${status}</td>
            <td>
                <div class="row-actions">
                    <button class="btn-icon edit" onclick="openEditModal('${c.id}')" title="Düzenle"><i class="fas fa-edit"></i></button>
                    <button class="btn-icon delete" onclick="deleteCategory('${c.id}', '${escapeHtml(c.ad).replace(/'/g, "\\'")}')" title="Sil"><i class="fas fa-trash-alt"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

// === Filtreleme ===
window.filterTable = () => {
    const term = document.getElementById('searchInput').value.trim().toLowerCase();
    if (!term) return renderTable(_categories);
    const filtered = _categories.filter(c =>
        (c.ad || '').toLowerCase().includes(term) ||
        (c.slug || '').toLowerCase().includes(term) ||
        (c.aciklama || '').toLowerCase().includes(term)
    );
    renderTable(filtered);
};

// === Modal Aç/Kapat ===
window.openCreateModal = () => {
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-tag" style="color:#3b82f6; margin-right:8px;"></i> Yeni Kategori';
    document.getElementById('submitBtnLabel').textContent = 'Oluştur';
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('filePreview').style.display = 'none';
    document.getElementById('categoryModal').classList.add('show');
};

window.openEditModal = (id) => {
    const cat = _categories.find(c => c.id === id);
    if (!cat) return showToast('Kategori bulunamadı.', 'error');

    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit" style="color:#3b82f6; margin-right:8px;"></i> Kategori Düzenle';
    document.getElementById('submitBtnLabel').textContent = 'Güncelle';
    document.getElementById('categoryForm').reset();
    document.getElementById('categoryId').value = cat.id;
    document.getElementById('ad').value = cat.ad || '';
    document.getElementById('aciklama').value = cat.aciklama || '';

    const preview = document.getElementById('filePreview');
    if (cat.kapak_fotografi) {
        document.getElementById('filePreviewImg').src = cat.kapak_fotografi;
        document.getElementById('filePreviewName').textContent = 'Mevcut görsel (değiştirmek için yeni dosya seçin)';
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }

    document.getElementById('categoryModal').classList.add('show');
};

window.closeModal = () => {
    document.getElementById('categoryModal').classList.remove('show');
};

// Overlay click → kapat
document.getElementById('categoryModal').addEventListener('click', (e) => {
    if (e.target.id === 'categoryModal') closeModal();
});

// === Dosya Önizleme ===
window.previewFile = (event) => {
    const file = event.target.files[0];
    const preview = document.getElementById('filePreview');
    if (!file) { preview.style.display = 'none'; return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('filePreviewImg').src = e.target.result;
        document.getElementById('filePreviewName').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
};

// === Form Gönderim ===
window.submitForm = async (event) => {
    if (event && event.preventDefault) event.preventDefault();

    const id = document.getElementById('categoryId').value;
    const ad = document.getElementById('ad').value.trim();
    const aciklama = document.getElementById('aciklama').value.trim();
    const fileInput = document.getElementById('kapak_fotografi');

    if (!ad || ad.length < 2) {
        showToast('Kategori adı en az 2 karakter olmalı.', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('ad', ad);
    formData.append('aciklama', aciklama);
    if (fileInput.files[0]) formData.append('kapak_fotografi', fileInput.files[0]);

    const submitBtn = document.getElementById('submitBtn');
    const originalLabel = document.getElementById('submitBtnLabel').textContent;
    submitBtn.disabled = true;
    document.getElementById('submitBtnLabel').textContent = 'Kaydediliyor...';

    try {
        const url    = id ? `${ADMIN_API}/${id}` : `${ADMIN_API}`;
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method,
            headers: authHeaders(), // Content-Type: FormData kendisi koyacak
            body: formData
        });
        const result = await res.json();

        if (!result.success) throw new Error(result.message || 'İşlem başarısız.');

        showToast(id ? 'Kategori başarıyla güncellendi.' : 'Kategori başarıyla oluşturuldu.', 'success');
        closeModal();
        fetchCategories();
    } catch (error) {
        console.error('Form gönderim hatası:', error);
        showToast(error.message || 'Sunucu hatası.', 'error');
    } finally {
        submitBtn.disabled = false;
        document.getElementById('submitBtnLabel').textContent = originalLabel;
    }
};

// === Silme ===
window.deleteCategory = async (id, ad) => {
    if (!confirm(`"${ad}" kategorisini silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz.`)) return;

    try {
        const res = await fetch(`${ADMIN_API}/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        const result = await res.json();

        if (!result.success) {
            showToast(result.message || 'Silme işlemi reddedildi.', 'error');
            return;
        }

        showToast('Kategori başarıyla silindi.', 'success');
        fetchCategories();
    } catch (error) {
        console.error('Silme hatası:', error);
        showToast('Sunucu hatası: ' + error.message, 'error');
    }
};
