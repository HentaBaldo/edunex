/**
 * EduNex Admin - Destek Merkezi
 * Sol: filtreli liste; Sag: WhatsApp-tarzi mesajlasma. Admin cevap yaziyor
 * (backend otomatik durum='cevaplandi' yapar ve kullaniciya bildirim atar).
 */

const SupportAdmin = (() => {
    const state = {
        tickets: [],
        currentDurum: '',          // '', 'acik', 'cevaplandi', 'kapali'
        search: '',
        selectedId: null,
        currentTicket: null,       // detail payload
        pollHandle: null,
        searchDebounce: null,
    };

    // ─── Helpers ────────────────────────────────────────────────────────────
    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }
    function initials(ad, soyad) {
        const a = (ad || '').trim().charAt(0).toUpperCase();
        const b = (soyad || '').trim().charAt(0).toUpperCase();
        return (a + b) || '?';
    }
    function formatDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const today = new Date();
        if (d.toDateString() === today.toDateString()) {
            return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        }
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
    function formatDateTime(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    }
    function showToast(message, variant = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const palette = {
            success: { bg: '#dcfce7', border: '#86efac', color: '#166534', icon: 'fa-circle-check' },
            error:   { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', icon: 'fa-circle-exclamation' },
            info:    { bg: '#dbeafe', border: '#93c5fd', color: '#1e40af', icon: 'fa-circle-info' },
        };
        const p = palette[variant] || palette.info;
        const el = document.createElement('div');
        el.style.cssText = `pointer-events:auto;background:${p.bg};border:1px solid ${p.border};color:${p.color};padding:12px 16px;border-radius:10px;display:flex;gap:10px;align-items:flex-start;font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,0.08);min-width:280px;max-width:380px;transform:translateX(120%);transition:transform 0.25s ease;`;
        el.innerHTML = `<i class="fas ${p.icon}" style="margin-top:2px;"></i><div style="flex:1;line-height:1.4;">${escapeHtml(message)}</div>`;
        container.appendChild(el);
        requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; });
        setTimeout(() => {
            el.style.transform = 'translateX(120%)';
            setTimeout(() => el.remove(), 250);
        }, 3800);
    }

    // ─── API ───────────────────────────────────────────────────────────────
    async function fetchTickets() {
        const params = new URLSearchParams();
        if (state.currentDurum) params.set('durum', state.currentDurum);
        if (state.search) params.set('search', state.search);
        params.set('limit', '100');
        const resp = await ApiService.get(`/admin/support/tickets?${params.toString()}`);
        return resp;
    }
    async function fetchTicketDetail(id) {
        const resp = await ApiService.get(`/admin/support/tickets/${id}`);
        return resp?.data;
    }
    async function sendReply(id, mesaj) {
        return await ApiService.post(`/admin/support/tickets/${id}/messages`, { mesaj });
    }
    async function closeTicket(id) {
        return await ApiService.put?.bind(ApiService); // not used, see below
    }

    // ─── Render: liste + sayilar ───────────────────────────────────────────
    function renderTickets(tickets) {
        const listEl = document.getElementById('ticketList');
        if (!Array.isArray(tickets) || tickets.length === 0) {
            listEl.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Bu filtrede talep yok.</p>
                </div>`;
            return;
        }
        listEl.innerHTML = tickets.map(t => {
            const u = t.Kullanici || {};
            const ad = `${u.ad || ''} ${u.soyad || ''}`.trim() || (u.eposta || 'Kullanıcı');
            const rolTag = u.rol === 'egitmen' ? 'EĞİTMEN' : u.rol === 'admin' ? 'ADMIN' : 'ÖĞRENCİ';
            const isActive = t.id === state.selectedId ? ' active' : '';
            return `
                <div class="ticket-item${isActive}" data-id="${escapeHtml(t.id)}" style="position:relative;">
                    <div class="user-avatar">${escapeHtml(initials(u.ad, u.soyad))}</div>
                    <div class="ti-body">
                        <div class="ti-row">
                            <span class="ti-name">${escapeHtml(ad)}</span>
                            <span class="ti-date">${escapeHtml(formatDate(t.olusturulma_tarihi))}</span>
                        </div>
                        <div class="ti-konu">${escapeHtml(t.konu)}</div>
                        <div class="ti-tags">
                            <span class="badge-mini badge-${escapeHtml(t.durum)}">${escapeHtml(t.durum)}</span>
                            <span class="badge-mini badge-kat">${escapeHtml(t.kategori)}</span>
                            <span class="badge-mini" style="background:#f1f5f9;color:#64748b;">${rolTag}</span>
                        </div>
                    </div>
                    <button class="ti-delete-btn" data-delete-id="${escapeHtml(t.id)}" title="Sohbeti sil" style="position:absolute; top:8px; right:8px; background:none; border:none; color:#dc2626; cursor:pointer; padding:6px; border-radius:6px; font-size:0.85rem; opacity:0.7;" onmouseover="this.style.background='#fee2e2'; this.style.opacity='1';" onmouseout="this.style.background='none'; this.style.opacity='0.7';"><i class="fas fa-trash"></i></button>
                </div>`;
        }).join('');

        listEl.querySelectorAll('.ticket-item').forEach(el => {
            el.addEventListener('click', (e) => {
                // Sil butonuna tiklandiysa secimi tetikleme.
                if (e.target.closest('.ti-delete-btn')) return;
                selectTicket(el.dataset.id);
            });
        });

        // Sil butonu — SweetAlert onayi ile.
        listEl.querySelectorAll('.ti-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const tid = btn.dataset.deleteId;
                await handleDeleteTicket(tid);
            });
        });
    }

    async function handleDeleteTicket(ticketId) {
        if (!ticketId) return;
        const ok = await notify.confirm({
            title: 'Sohbeti sil?',
            text: 'Bu destek talebi ve tum mesajlari kalici olarak silinecek. Bu islem geri alinamaz.',
            confirmText: 'Evet, sil',
            cancelText: 'Vazgec',
            type: 'error'
        });
        if (!ok) return;

        try {
            await ApiService.delete(`/admin/support/tickets/${ticketId}`);
            showToast('Sohbet silindi.', 'success');
            // Acik thread silinen ticket'sa panoyu temizle.
            if (state.selectedId === ticketId) {
                state.selectedId = null;
                state.currentTicket = null;
                const empty = document.getElementById('threadEmpty');
                const active = document.getElementById('threadActive');
                if (empty) empty.style.display = '';
                if (active) active.style.display = 'none';
            }
            await reloadList();
        } catch (err) {
            console.error('[SUPPORT] silme hatasi:', err);
            showToast(err.message || 'Sohbet silinemedi.', 'error');
        }
    }

    function renderCounts(counts) {
        const c = counts || {};
        const total = (c.acik || 0) + (c.cevaplandi || 0) + (c.kapali || 0);
        document.getElementById('cnt-all').textContent = total;
        document.getElementById('cnt-acik').textContent = c.acik || 0;
        document.getElementById('cnt-cevaplandi').textContent = c.cevaplandi || 0;
        document.getElementById('cnt-kapali').textContent = c.kapali || 0;
    }

    async function reloadList() {
        try {
            const resp = await fetchTickets();
            state.tickets = resp?.data || [];
            renderTickets(state.tickets);
            renderCounts(resp?.counts);
        } catch (e) {
            console.error('[SUPPORT] list yenileme hatasi:', e);
            document.getElementById('ticketList').innerHTML = `
                <div class="empty-state" style="color:#dc2626;">
                    <i class="fas fa-circle-exclamation"></i>
                    <p>Liste yüklenemedi: ${escapeHtml(e.message || '')}</p>
                </div>`;
        }
    }

    // ─── Render: thread ────────────────────────────────────────────────────
    function renderThread(ticket) {
        state.currentTicket = ticket;
        document.getElementById('threadEmpty').style.display = 'none';
        document.getElementById('threadActive').style.display = 'flex';

        const u = ticket.Kullanici || {};
        const ad = `${u.ad || ''} ${u.soyad || ''}`.trim() || (u.eposta || 'Kullanıcı');

        document.getElementById('threadAvatar').textContent = initials(u.ad, u.soyad);
        document.getElementById('threadKonu').textContent = ticket.konu;
        document.getElementById('threadKullanici').textContent = ad;
        document.getElementById('threadKategori').textContent = ticket.kategori;
        const durumEl = document.getElementById('threadDurum');
        durumEl.textContent = ticket.durum;
        durumEl.className = `badge-durum ${ticket.durum}`;

        // Kapat butonu durumu
        const btnClose = document.getElementById('btnCloseTicket');
        if (ticket.durum === 'kapali') {
            btnClose.disabled = true;
            btnClose.innerHTML = '<i class="fas fa-lock"></i> Kapalı';
        } else {
            btnClose.disabled = false;
            btnClose.innerHTML = '<i class="fas fa-lock"></i> Bileti Kapat';
        }

        // Mesajlar
        const msgsEl = document.getElementById('threadMessages');
        const mesajlar = ticket.Mesajlar || [];
        msgsEl.innerHTML = mesajlar.map(m => {
            const g = m.Gonderen || {};
            const adminMesaji = g.rol === 'admin';
            const mineClass = adminMesaji ? 'from-me' : 'from-other';
            const authorTag = adminMesaji
                ? ''
                : `<span class="msg-author">${escapeHtml(`${g.ad || ''} ${g.soyad || ''}`.trim() || 'Kullanıcı')}</span>`;
            return `
                <div class="msg ${mineClass}">
                    ${authorTag}
                    <div>${escapeHtml(m.mesaj)}</div>
                    <span class="msg-time">${escapeHtml(formatDateTime(m.olusturulma_tarihi))}</span>
                </div>`;
        }).join('');

        // Auto-scroll bottom
        msgsEl.scrollTop = msgsEl.scrollHeight;

        // Composer kilidi
        const composer = document.getElementById('composerForm');
        const sendBtn = document.getElementById('composerSend');
        const input = document.getElementById('composerInput');
        const isClosed = ticket.durum === 'kapali';
        composer.classList.toggle('locked', isClosed);
        sendBtn.disabled = isClosed;
        input.disabled = isClosed;
        input.placeholder = isClosed ? 'Bilet kapalı — yeni mesaj eklenemez.' : 'Yanıtınızı yazın...';
    }

    async function selectTicket(id) {
        if (!id) return;
        state.selectedId = id;
        // Aktif satir highlight
        document.querySelectorAll('.ticket-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === id);
        });
        try {
            const detail = await fetchTicketDetail(id);
            if (detail) renderThread(detail);
        } catch (e) {
            console.error('[SUPPORT] detay yukleme hatasi:', e);
            showToast(e.message || 'Talep detayı yüklenemedi.', 'error');
        }
    }

    // ─── Composer ──────────────────────────────────────────────────────────
    function autoGrowComposer() {
        const ta = document.getElementById('composerInput');
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
    }
    async function handleSubmit(e) {
        e.preventDefault();
        if (!state.selectedId) return;
        const ta = document.getElementById('composerInput');
        const mesaj = (ta.value || '').trim();
        if (mesaj.length < 2) return;

        const btn = document.getElementById('composerSend');
        btn.disabled = true;
        try {
            await sendReply(state.selectedId, mesaj);
            ta.value = '';
            autoGrowComposer();
            updateCounter(ta, document.getElementById('composerCounter'), 1000);
            // Detayi yeniden cek (yeni mesaj + durum 'cevaplandi' yansisin).
            const detail = await fetchTicketDetail(state.selectedId);
            if (detail) renderThread(detail);
            // Liste de durum/siralama icin yenilensin.
            await reloadList();
        } catch (err) {
            console.error('[SUPPORT] cevap gonderme hatasi:', err);
            showToast(err.message || 'Mesaj gönderilemedi.', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    async function handleCloseTicket() {
        if (!state.currentTicket) return;
        if (state.currentTicket.durum === 'kapali') return;
        const ok = await notify.confirm({
            title: 'Bileti kapat',
            text: 'Bu bileti kapatmak istediğinize emin misiniz? Kullanıcı yeni mesaj ekleyemeyecek.',
            confirmText: 'Kapat',
            cancelText: 'Vazgeç',
            type: 'warning'
        });
        if (!ok) return;
        try {
            await ApiService.patch(`/admin/support/tickets/${state.currentTicket.id}/status`, { durum: 'kapali' });
            showToast('Bilet kapatıldı.', 'success');
            const detail = await fetchTicketDetail(state.currentTicket.id);
            if (detail) renderThread(detail);
            await reloadList();
        } catch (e) {
            console.error('[SUPPORT] kapatma hatasi:', e);
            showToast(e.message || 'Bilet kapatılamadı.', 'error');
        }
    }

    // ─── Bindings ──────────────────────────────────────────────────────────
    function bind() {
        // Sekmeler
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.currentDurum = btn.dataset.durum || '';
                reloadList();
            });
        });
        // Arama (debounced)
        document.getElementById('searchInput').addEventListener('input', (e) => {
            clearTimeout(state.searchDebounce);
            state.searchDebounce = setTimeout(() => {
                state.search = e.target.value.trim();
                reloadList();
            }, 300);
        });
        // Composer
        const composer = document.getElementById('composerForm');
        composer.addEventListener('submit', handleSubmit);
        const ta = document.getElementById('composerInput');
        const counter = document.getElementById('composerCounter');
        ta.addEventListener('input', autoGrowComposer);
        ta.addEventListener('input', () => updateCounter(ta, counter, 1000));
        ta.addEventListener('keydown', (e) => {
            // Enter -> gonder, Shift+Enter -> yeni satir
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                composer.requestSubmit();
            }
        });
        // Kapat butonu
        document.getElementById('btnCloseTicket').addEventListener('click', handleCloseTicket);
    }

    // Karakter sayacı (uyarı renkleri ile)
    function updateCounter(textarea, counterEl, max) {
        if (!textarea || !counterEl) return;
        const len = textarea.value.length;
        counterEl.textContent = `${len} / ${max}`;
        counterEl.classList.remove('warn', 'danger');
        if (len >= max) counterEl.classList.add('danger');
        else if (len >= max * 0.9) counterEl.classList.add('warn');
    }

    async function init() {
        bind();
        await reloadList();

        // URL ?ticket=<id> -> dogrudan aç
        const params = new URLSearchParams(window.location.search);
        const ticketId = params.get('ticket');
        if (ticketId) {
            await selectTicket(ticketId);
        }
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => SupportAdmin.init());
