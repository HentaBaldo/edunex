/**
 * EduNex - Kullanici Destek Hub'i (contact.html)
 * Eski static contact formu yerine: kullanici taleplerini listeler, yeni talep acar,
 * secili biletin mesaj gecmisini gosterir ve cevap yazmasini saglar.
 * Egitmen veya ogrenci ayni sayfayi kullanir (rol ayrimi yok — backend kullanici_id ile filtreler).
 */

const SupportUser = (() => {
    const state = {
        tickets: [],
        currentDurum: '',
        selectedId: null,
        currentTicket: null,
        currentUserId: null,
    };

    // ─── Helpers ───────────────────────────────────────────────────────────
    function escapeHtml(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
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

    function decodeUserIdFromJwt() {
        const token = localStorage.getItem('edunex_token') || localStorage.getItem('edunex_admin_token');
        if (!token) return null;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload?.id || null;
        } catch { return null; }
    }

    function isLoggedIn() { return !!ApiService.getActiveToken(); }

    // ─── API ───────────────────────────────────────────────────────────────
    async function fetchMyTickets() {
        const q = state.currentDurum ? `?durum=${encodeURIComponent(state.currentDurum)}` : '';
        const resp = await ApiService.get(`/support/tickets${q}`);
        return resp?.data || [];
    }
    async function fetchTicketDetail(id) {
        const resp = await ApiService.get(`/support/tickets/${id}`);
        return resp?.data;
    }
    async function createTicket(payload) {
        return await ApiService.post('/support/tickets', payload);
    }
    async function sendReply(id, mesaj) {
        return await ApiService.post(`/support/tickets/${id}/messages`, { mesaj });
    }

    // ─── Views ─────────────────────────────────────────────────────────────
    function showEmpty() {
        document.getElementById('detailEmpty').style.display = 'flex';
        document.getElementById('newTicketForm').style.display = 'none';
        document.getElementById('ticketThread').style.display = 'none';
    }
    function showForm() {
        document.getElementById('detailEmpty').style.display = 'none';
        document.getElementById('newTicketForm').style.display = 'block';
        document.getElementById('ticketThread').style.display = 'none';
        document.getElementById('newKonu').focus();
    }
    function showThread() {
        document.getElementById('detailEmpty').style.display = 'none';
        document.getElementById('newTicketForm').style.display = 'none';
        document.getElementById('ticketThread').style.display = 'flex';
    }

    // ─── Render ────────────────────────────────────────────────────────────
    function renderList(tickets) {
        const el = document.getElementById('userTicketList');
        if (!tickets || tickets.length === 0) {
            el.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Henüz bu kategoride bir talebiniz yok.</p>
                </div>`;
            return;
        }
        el.innerHTML = tickets.map(t => {
            const active = t.id === state.selectedId ? ' active' : '';
            return `
                <div class="ut-item${active}" data-id="${escapeHtml(t.id)}">
                    <div class="ut-konu">${escapeHtml(t.konu)}</div>
                    <div class="ut-meta">
                        <span class="dur-badge ${escapeHtml(t.durum)}">${escapeHtml(t.durum)}</span>
                        <span class="ut-date">${escapeHtml(formatDate(t.olusturulma_tarihi))}</span>
                    </div>
                </div>`;
        }).join('');
        el.querySelectorAll('.ut-item').forEach(node => {
            node.addEventListener('click', () => selectTicket(node.dataset.id));
        });
    }

    function renderThread(ticket) {
        state.currentTicket = ticket;
        showThread();

        document.getElementById('dthKonu').textContent = ticket.konu;
        const katEl = document.getElementById('dthKategori');
        katEl.textContent = ticket.kategori;
        const durEl = document.getElementById('dthDurum');
        durEl.textContent = ticket.durum;
        durEl.className = `dur-badge ${ticket.durum}`;
        document.getElementById('dthTarih').textContent = `Açılış: ${formatDateTime(ticket.olusturulma_tarihi)}`;

        const meId = state.currentUserId;
        const msgsEl = document.getElementById('dthMessages');
        msgsEl.innerHTML = (ticket.Mesajlar || []).map(m => {
            const benim = meId && m.gonderen_id === meId;
            const g = m.Gonderen || {};
            const yazar = benim ? '' :
                `<span class="b-author">${escapeHtml(`${g.ad || ''} ${g.soyad || ''}`.trim() || (g.rol === 'admin' ? 'EduNex Destek' : 'Kullanıcı'))}</span>`;
            return `
                <div class="bubble ${benim ? 'mine' : 'other'}">
                    ${yazar}
                    <div>${escapeHtml(m.mesaj)}</div>
                    <span class="b-time">${escapeHtml(formatDateTime(m.olusturulma_tarihi))}</span>
                </div>`;
        }).join('');
        msgsEl.scrollTop = msgsEl.scrollHeight;

        // Composer kilit
        const isClosed = ticket.durum === 'kapali';
        const form = document.getElementById('dthComposerForm');
        const note = document.getElementById('dthClosedNote');
        form.style.display = isClosed ? 'none' : 'flex';
        note.style.display = isClosed ? 'block' : 'none';
        document.getElementById('dthComposerInput').value = '';
    }

    // ─── Actions ───────────────────────────────────────────────────────────
    async function selectTicket(id) {
        if (!id) return;
        state.selectedId = id;
        document.querySelectorAll('.ut-item').forEach(el => {
            el.classList.toggle('active', el.dataset.id === id);
        });
        try {
            const detail = await fetchTicketDetail(id);
            if (detail) renderThread(detail);
        } catch (e) {
            console.error('[SUPPORT-USER] detay yukleme:', e);
            showToast(e.message || 'Talep detayı yüklenemedi.', 'error');
        }
    }

    async function reloadList(preserveSelection = false) {
        try {
            state.tickets = await fetchMyTickets();
            renderList(state.tickets);
            if (!preserveSelection) state.selectedId = null;
        } catch (e) {
            console.error('[SUPPORT-USER] liste hatasi:', e);
            const el = document.getElementById('userTicketList');
            el.innerHTML = `<div class="empty-state" style="color:#dc2626;">
                <i class="fas fa-circle-exclamation"></i>
                <p>Liste yüklenemedi: ${escapeHtml(e.message || '')}</p></div>`;
        }
    }

    async function handleNewTicketSubmit(e) {
        e.preventDefault();
        const konu = document.getElementById('newKonu').value.trim();
        const mesaj = document.getElementById('newMesaj').value.trim();
        const kategori = document.getElementById('newKategori').value;
        const errEl = document.getElementById('newTicketError');
        errEl.style.display = 'none';

        if (konu.length < 5) {
            errEl.textContent = 'Konu en az 5 karakter olmalı.';
            errEl.style.display = 'block';
            return;
        }
        if (mesaj.length < 2) {
            errEl.textContent = 'Mesaj boş olamaz.';
            errEl.style.display = 'block';
            return;
        }

        try {
            const resp = await createTicket({ konu, mesaj, kategori });
            const newId = resp?.data?.id;
            document.getElementById('newKonu').value = '';
            document.getElementById('newMesaj').value = '';
            document.getElementById('newKategori').value = 'diger';
            showToast('Destek talebiniz oluşturuldu.', 'success');
            await reloadList(true);
            if (newId) await selectTicket(newId);
            else showEmpty();
        } catch (err) {
            errEl.textContent = err.message || 'Talep oluşturulurken hata oluştu.';
            errEl.style.display = 'block';
        }
    }

    async function handleReplySubmit(e) {
        e.preventDefault();
        if (!state.currentTicket) return;
        const ta = document.getElementById('dthComposerInput');
        const mesaj = (ta.value || '').trim();
        if (mesaj.length < 2) return;
        try {
            await sendReply(state.currentTicket.id, mesaj);
            ta.value = '';
            const detail = await fetchTicketDetail(state.currentTicket.id);
            if (detail) renderThread(detail);
            await reloadList(true);
        } catch (err) {
            showToast(err.message || 'Mesaj gönderilemedi.', 'error');
        }
    }

    // ─── Bindings ──────────────────────────────────────────────────────────
    function bind() {
        document.getElementById('btnNewTicket').addEventListener('click', showForm);
        document.getElementById('newTicketCancel').addEventListener('click', () => {
            if (state.selectedId) selectTicket(state.selectedId);
            else showEmpty();
        });
        document.getElementById('newTicketForm').addEventListener('submit', handleNewTicketSubmit);
        document.getElementById('dthComposerForm').addEventListener('submit', handleReplySubmit);
        document.getElementById('btnBack').addEventListener('click', () => {
            state.selectedId = null;
            document.querySelectorAll('.ut-item').forEach(el => el.classList.remove('active'));
            showEmpty();
        });
        // Composer: Enter -> gonder, Shift+Enter -> yeni satir
        document.getElementById('dthComposerInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                document.getElementById('dthComposerForm').requestSubmit();
            }
        });
        document.querySelectorAll('.ut-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ut-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.currentDurum = btn.dataset.durum || '';
                reloadList();
            });
        });
    }

    async function init() {
        if (!isLoggedIn()) {
            document.getElementById('authNotice').style.display = 'flex';
            document.getElementById('supportGrid').style.display = 'none';
            return;
        }
        state.currentUserId = decodeUserIdFromJwt();
        bind();
        await reloadList();

        // Bildirimden gelen deep-link: ?ticket=<id>
        const params = new URLSearchParams(window.location.search);
        const tid = params.get('ticket');
        if (tid) {
            await selectTicket(tid);
        }
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => SupportUser.init());
