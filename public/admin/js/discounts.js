/**
 * Admin Indirim Yonetimi
 */
(function () {
    let allDiscounts = [];
    let allCourses = [];

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    function fmtDate(d) {
        if (!d) return '—';
        try { return new Date(d).toLocaleDateString('tr-TR', { day:'2-digit', month:'short', year:'numeric' }); }
        catch { return '—'; }
    }

    async function loadDiscounts() {
        const finansman = document.getElementById('filterFinansman').value;
        const aktif = document.getElementById('filterAktif').value;
        const scope = document.getElementById('filterScope').value;

        const params = new URLSearchParams();
        if (finansman) params.set('finansman', finansman);
        if (aktif) params.set('aktif', aktif);
        if (scope === 'global') params.set('global', 'true');

        try {
            const res = await ApiService.get('/discounts/admin/all?' + params.toString());
            allDiscounts = res.data || [];
            renderList();
        } catch (err) {
            console.error('[DISCOUNT-ADMIN] yukleme hatasi:', err);
            document.getElementById('discountList').innerHTML =
                `<div class="empty-state">Hata: ${escapeHtml(err.message)}</div>`;
        }
    }

    async function loadCourses() {
        try {
            const res = await ApiService.get('/admin/courses?durum=onayli&limit=500');
            allCourses = res.data?.rows || res.data || [];
        } catch (err) {
            console.warn('[DISCOUNT-ADMIN] kurs listesi alinamadi:', err.message);
            allCourses = [];
        }
    }

    function renderList() {
        const grid = document.getElementById('discountList');
        if (!allDiscounts.length) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-inbox fa-2x" style="margin-bottom:12px;"></i><p>Henüz indirim yok. "Yeni Kampanya" ile başlayın.</p></div>';
            return;
        }

        grid.innerHTML = allDiscounts.map(d => {
            const isGlobal = !d.ders_id;
            const cls = `disc-card ${d.finansman_tarafi === 'platform' ? 'platform' : 'egitmen-side'} ${isGlobal ? 'global' : ''} ${!d.aktif_mi ? 'inactive' : ''}`;
            const indir = d.yuzde_indirim ? `%${d.yuzde_indirim}` : `₺${d.sabit_indirim}`;
            const dersBaslik = d.Course?.baslik || (isGlobal ? '🌐 Tüm Dersler' : 'Bilinmeyen Kurs');

            return `
                <div class="${cls}">
                    <div>
                        <span class="disc-badge ${d.finansman_tarafi === 'platform' ? 'platform' : 'egitmen-b'}">
                            ${d.finansman_tarafi === 'platform' ? '🏢 EduNex' : '👨‍🏫 Eğitmen'}
                        </span>
                        ${isGlobal ? '<span class="disc-badge global-b">🌐 Global</span>' : ''}
                        ${!d.aktif_mi ? '<span class="disc-badge inactive-b">Pasif</span>' : ''}
                    </div>
                    <div class="disc-title">${escapeHtml(d.baslik)}</div>
                    <div class="disc-amount">${indir} indirim</div>
                    <div class="disc-meta"><strong>Kapsam:</strong> ${escapeHtml(dersBaslik)}</div>
                    <div class="disc-meta">${fmtDate(d.baslangic)} → ${fmtDate(d.bitis)}</div>
                    ${d.aciklama ? `<div class="disc-meta" style="font-style:italic; margin-top:6px;">${escapeHtml(d.aciklama).slice(0, 120)}</div>` : ''}
                    <div class="disc-actions">
                        <button onclick="editDiscount('${d.id}')"><i class="fas fa-edit"></i> Düzenle</button>
                        <button onclick="toggleDiscount('${d.id}', ${!d.aktif_mi})">
                            <i class="fas ${d.aktif_mi ? 'fa-pause' : 'fa-play'}"></i> ${d.aktif_mi ? 'Pasif Yap' : 'Aktif Yap'}
                        </button>
                        <button class="danger" onclick="deleteDiscount('${d.id}')"><i class="fas fa-trash"></i> Sil</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function fillCourseSelect() {
        const sel = document.getElementById('m_dersId');
        sel.innerHTML = '<option value="">Kurs seçin...</option>' +
            allCourses.map(c => `<option value="${c.id}">${escapeHtml(c.baslik)} (${c.fiyat} ₺)</option>`).join('');
    }

    window.openDiscountModal = (existingId) => {
        document.getElementById('m_id').value = existingId || '';
        document.getElementById('modalTitle').textContent = existingId ? 'Kampanya Düzenle' : 'Yeni Kampanya';

        if (existingId) {
            const d = allDiscounts.find(x => x.id === existingId);
            if (!d) return;
            document.getElementById('m_baslik').value = d.baslik || '';
            document.getElementById('m_aciklama').value = d.aciklama || '';
            document.getElementById('m_yuzde').value = d.yuzde_indirim || '';
            document.getElementById('m_sabit').value = d.sabit_indirim || '';
            document.getElementById('m_baslangic').value = d.baslangic ? new Date(d.baslangic).toISOString().slice(0,16) : '';
            document.getElementById('m_bitis').value = d.bitis ? new Date(d.bitis).toISOString().slice(0,16) : '';
            document.getElementById('m_scope').value = d.ders_id ? 'specific' : 'global';
            document.getElementById('m_courseGroup').style.display = d.ders_id ? 'block' : 'none';
            document.getElementById('m_dersId').value = d.ders_id || '';
            document.getElementById('m_finansman').value = d.finansman_tarafi || 'platform';
            document.getElementById('m_aktif').checked = !!d.aktif_mi;
        } else {
            document.getElementById('m_baslik').value = '';
            document.getElementById('m_aciklama').value = '';
            document.getElementById('m_yuzde').value = '';
            document.getElementById('m_sabit').value = '';
            document.getElementById('m_baslangic').value = '';
            document.getElementById('m_bitis').value = '';
            document.getElementById('m_scope').value = 'global';
            document.getElementById('m_courseGroup').style.display = 'none';
            document.getElementById('m_dersId').value = '';
            document.getElementById('m_finansman').value = 'platform';
            document.getElementById('m_aktif').checked = true;
        }

        document.getElementById('discountModal').classList.add('active');
    };

    window.closeDiscountModal = () => {
        document.getElementById('discountModal').classList.remove('active');
    };

    window.editDiscount = (id) => window.openDiscountModal(id);

    window.toggleDiscount = async (id, newActive) => {
        try {
            await ApiService.patch(`/discounts/${id}`, { aktif_mi: newActive });
            await loadDiscounts();
        } catch (err) { notify.error('Hata: ' + err.message); }
    };

    window.deleteDiscount = async (id) => {
        const ok = await notify.confirm({
            title: 'Kampanyayı sil',
            text: 'Bu kampanyayı silmek istediğinize emin misiniz?',
            confirmText: 'Sil',
            cancelText: 'Vazgeç',
            type: 'error'
        });
        if (!ok) return;
        try {
            await ApiService.delete(`/discounts/${id}`);
            notify.success('Kampanya silindi.');
            await loadDiscounts();
        } catch (err) { notify.error('Hata: ' + err.message); }
    };

    window.saveDiscount = async () => {
        const id = document.getElementById('m_id').value;
        const baslik = document.getElementById('m_baslik').value.trim();
        const aciklama = document.getElementById('m_aciklama').value.trim() || null;
        const yuzde = parseInt(document.getElementById('m_yuzde').value, 10) || null;
        const sabit = parseFloat(document.getElementById('m_sabit').value) || null;
        const baslangic = document.getElementById('m_baslangic').value || null;
        const bitis = document.getElementById('m_bitis').value || null;
        const scope = document.getElementById('m_scope').value;
        const dersId = scope === 'specific' ? document.getElementById('m_dersId').value : null;
        const finansman = document.getElementById('m_finansman').value;
        const aktif = document.getElementById('m_aktif').checked;

        if (baslik.length < 3) { notify.warning('Başlık en az 3 karakter olmalıdır.'); return; }
        if (!yuzde && !sabit)  { notify.warning('Yüzde veya sabit indirim girin.'); return; }
        if (yuzde && sabit)    { notify.warning('Sadece birini doldurun: yüzde ya da sabit.'); return; }
        if (scope === 'specific' && !dersId) { notify.warning('Lütfen bir ders seçin.'); return; }

        const payload = {
            ders_id: dersId,
            baslik, aciklama,
            yuzde_indirim: yuzde,
            sabit_indirim: sabit,
            baslangic, bitis,
            finansman_tarafi: finansman,
            aktif_mi: aktif,
        };

        try {
            if (id) await ApiService.patch(`/discounts/${id}`, payload);
            else await ApiService.post('/discounts', payload);
            window.closeDiscountModal();
            await loadDiscounts();
        } catch (err) {
            notify.error('Hata: ' + (err.message || 'Kayit basarisiz.'));
        }
    };

    // Scope select degisirse ders dropdownunu goster/gizle
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('m_scope').addEventListener('change', (e) => {
            document.getElementById('m_courseGroup').style.display = e.target.value === 'specific' ? 'block' : 'none';
        });
        ['filterFinansman','filterAktif','filterScope'].forEach(id => {
            document.getElementById(id).addEventListener('change', loadDiscounts);
        });

        Promise.all([loadCourses(), loadDiscounts()]).then(() => fillCourseSelect());

        // Admin adi
        try {
            const user = JSON.parse(localStorage.getItem('edunex_user') || '{}');
            document.getElementById('adminName').textContent = user.ad ? `${user.ad} ${user.soyad || ''}` : 'Yönetici';
        } catch {}
    });
})();
