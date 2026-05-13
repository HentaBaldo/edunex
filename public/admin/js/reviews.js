/**
 * EduNex Admin - Yorum Moderasyonu
 *
 * - GET /api/admin/reviews (pagination + server-side search + puan filter)
 * - DELETE /api/admin/reviews/:kurs_id/:ogrenci_id
 * - Komuta Merkezi feed'inden ?focus=kurs_id:ogrenci_id ile gelinirse hedef karti vurgular.
 */

(function () {
    'use strict';

    const state = {
        page: 1,
        limit: 12,
        totalPages: 1,
        total: 0,
        rating: '',          // '' | '1'..'5'
        search: '',
        pendingDelete: null, // { kurs_id, ogrenci_id }
        focusKey: null,      // '<kurs_id>:<ogrenci_id>' (dashboard'dan gelirken)
    };

    // -------------------------------------------------------------------
    // YARDIMCILAR
    // -------------------------------------------------------------------
    function getAdminToken() {
        return localStorage.getItem('edunex_admin_token');
    }

    async function adminFetch(path, options = {}) {
        const token = getAdminToken();
        if (!token) {
            window.location.replace('/admin/login.html');
            throw new Error('Admin token yok');
        }
        const res = await fetch(path, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {}),
            },
        });
        if (res.status === 401 || res.status === 403) {
            window.location.replace('/admin/login.html');
            throw new Error('Yetkisiz');
        }
        const body = await res.json();
        if (!body.success) throw new Error(body.message || 'Sunucu hatasi');
        return body;
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function fmtDate(d) {
        if (!d) return '—';
        const date = new Date(d);
        if (isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('tr-TR', {
            day: '2-digit', month: 'short', year: 'numeric',
        });
    }

    function getInitials(ad, soyad) {
        const a = (ad || '').trim().charAt(0).toUpperCase();
        const b = (soyad || '').trim().charAt(0).toUpperCase();
        return (a + b) || '?';
    }

    function buildStars(puan) {
        const p = Math.max(0, Math.min(5, Number(puan) || 0));
        let html = '';
        for (let i = 1; i <= 5; i++) {
            html += `<i class="fas fa-star ${i <= p ? 'star-filled' : 'star-empty'}"></i>`;
        }
        return html;
    }

    function showToast(msg, type = 'success') {
        const c = document.getElementById('toastContainer');
        if (!c) return;
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.innerHTML = `<i class="fas fa-${type === 'success' ? 'circle-check' : 'circle-xmark'}"></i> ${escapeHtml(msg)}`;
        c.appendChild(t);
        setTimeout(() => {
            t.classList.add('toast-out');
            setTimeout(() => t.remove(), 300);
        }, 2800);
    }

    // -------------------------------------------------------------------
    // VERI CEKME
    // -------------------------------------------------------------------
    async function fetchReviews() {
        const grid = document.getElementById('reviewCardsGrid');
        const countInfo = document.getElementById('reviewsCountInfo');
        grid.innerHTML = `
            <div class="reviews-empty">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Yorumlar yukleniyor...</p>
            </div>`;
        countInfo.textContent = '...';

        const params = new URLSearchParams({
            page: state.page,
            limit: state.limit,
        });
        if (state.rating) {
            params.set('puanMin', state.rating);
            params.set('puanMax', state.rating);
        }
        if (state.search) {
            params.set('q', state.search);
        }

        try {
            const body = await adminFetch(`/api/admin/reviews?${params.toString()}`);
            const reviews = Array.isArray(body.data) ? body.data : [];
            state.totalPages = body.pagination?.total_pages || 1;
            state.total = body.pagination?.total || 0;

            countInfo.innerHTML = `<strong>${state.total}</strong> yorum
                · Sayfa ${body.pagination?.page || 1}/${state.totalPages}`;

            if (reviews.length === 0) {
                grid.innerHTML = `
                    <div class="reviews-empty">
                        <i class="fas fa-inbox"></i>
                        <p>Eslesen yorum bulunamadi.</p>
                    </div>`;
                renderPagination();
                return;
            }

            grid.innerHTML = reviews.map(buildReviewCardHTML).join('');
            renderPagination();
            applyFocusHighlight();
        } catch (err) {
            grid.innerHTML = `
                <div class="reviews-empty error">
                    <i class="fas fa-triangle-exclamation"></i>
                    <p>Yorumlar yuklenemedi: ${escapeHtml(err.message)}</p>
                </div>`;
            countInfo.textContent = '—';
        }
    }

    // -------------------------------------------------------------------
    // RENDER
    // -------------------------------------------------------------------
    function buildReviewCardHTML(r) {
        const ad = r.yazar?.ad || '';
        const soyad = r.yazar?.soyad || '';
        const adSoyad = `${ad} ${soyad}`.trim() || 'Bilinmeyen ogrenci';
        const initials = getInitials(ad, soyad);
        const avatar = r.yazar?.profil_fotografi
            ? `<img src="${escapeHtml(r.yazar.profil_fotografi)}" alt="${escapeHtml(adSoyad)}" class="review-avatar-img" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'review-avatar-initials',textContent:'${initials}'}))">`
            : `<div class="review-avatar-initials">${escapeHtml(initials)}</div>`;

        const kursAdi = r.kurs?.baslik || '—';
        const tarih = fmtDate(r.olusturulma_tarihi);
        const yorum = r.yorum || '';
        const focusKey = `${r.kurs_id}:${r.ogrenci_id}`;

        // "Devamini Oku" mantigi: 240+ karakter ise truncate'li goster
        const NEEDS_TRUNCATE = yorum.length > 240;
        const yorumHtml = yorum
            ? `<div class="review-text${NEEDS_TRUNCATE ? ' is-truncated' : ''}" data-truncated="${NEEDS_TRUNCATE ? 'true' : 'false'}">
                   <p>${escapeHtml(yorum)}</p>
                   ${NEEDS_TRUNCATE ? '<button type="button" class="review-toggle-btn">Devamini Oku</button>' : ''}
               </div>`
            : '<div class="review-text empty"><em>Bos yorum (yalniz puan).</em></div>';

        return `
            <article class="review-card" data-focus-key="${escapeHtml(focusKey)}" data-kurs="${escapeHtml(r.kurs_id)}" data-ogrenci="${escapeHtml(r.ogrenci_id)}">
                <header class="review-card-head">
                    <div class="review-author">
                        ${avatar}
                        <div class="review-author-meta">
                            <strong>${escapeHtml(adSoyad)}</strong>
                            <small><i class="fas fa-graduation-cap"></i> ${escapeHtml(kursAdi)}</small>
                        </div>
                    </div>
                    <div class="review-stars" title="${r.puan}/5">
                        ${buildStars(r.puan)}
                    </div>
                </header>
                ${yorumHtml}
                <footer class="review-card-foot">
                    <span class="review-date"><i class="far fa-calendar"></i> ${escapeHtml(tarih)}</span>
                    <button type="button" class="review-delete-btn" title="Yorumu sil">
                        <i class="fas fa-trash-alt"></i> Sil
                    </button>
                </footer>
            </article>`;
    }

    function renderPagination() {
        const container = document.getElementById('reviewsPagination');
        if (!container) return;
        if (state.totalPages <= 1) { container.innerHTML = ''; return; }

        const { page, totalPages } = { page: state.page, totalPages: state.totalPages };

        let html = `<button class="page-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i>
                    </button>`;
        for (let i = 1; i <= totalPages; i++) {
            const isEdge = (i === 1 || i === totalPages);
            const isNear = Math.abs(i - page) <= 2;
            if (isEdge || isNear) {
                html += `<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
            } else if (Math.abs(i - page) === 3) {
                html += `<span class="page-dots">…</span>`;
            }
        }
        html += `<button class="page-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                 </button>`;
        container.innerHTML = html;
    }

    // -------------------------------------------------------------------
    // EVENT BAGLAMA (event delegation)
    // -------------------------------------------------------------------
    function bindGlobalEvents() {
        // Toolbar - puan chip'leri
        document.querySelector('.reviews-rating-filter').addEventListener('click', (e) => {
            const btn = e.target.closest('.rating-chip');
            if (!btn) return;
            document.querySelectorAll('.rating-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.rating = btn.getAttribute('data-rating') || '';
            state.page = 1;
            fetchReviews();
        });

        // Toolbar - arama (debounce)
        const searchEl = document.getElementById('reviewSearchInput');
        let timer = null;
        searchEl.addEventListener('input', (e) => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                state.search = (e.target.value || '').trim();
                state.page = 1;
                fetchReviews();
            }, 280);
        });

        // Pagination + card icindeki butonlar (event delegation)
        document.body.addEventListener('click', (e) => {
            // Sayfalama
            const pageBtn = e.target.closest('.page-btn:not([disabled])');
            if (pageBtn) {
                const p = parseInt(pageBtn.getAttribute('data-page'), 10);
                if (!isNaN(p) && p >= 1 && p <= state.totalPages) {
                    state.page = p;
                    fetchReviews().then(() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    });
                }
                return;
            }

            // Devamini Oku
            const toggleBtn = e.target.closest('.review-toggle-btn');
            if (toggleBtn) {
                const wrap = toggleBtn.closest('.review-text');
                if (wrap) {
                    const isExpanded = wrap.classList.toggle('is-expanded');
                    toggleBtn.textContent = isExpanded ? 'Daha Az Goster' : 'Devamini Oku';
                }
                return;
            }

            // Sil
            const delBtn = e.target.closest('.review-delete-btn');
            if (delBtn) {
                const card = delBtn.closest('.review-card');
                if (card) {
                    state.pendingDelete = {
                        kurs_id: card.getAttribute('data-kurs'),
                        ogrenci_id: card.getAttribute('data-ogrenci'),
                    };
                    document.getElementById('deleteModal').hidden = false;
                }
                return;
            }
        });

        // Silme modal'i
        document.getElementById('cancelDeleteBtn').addEventListener('click', closeDeleteModal);
        document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
        document.getElementById('deleteModal').addEventListener('click', (e) => {
            if (e.target.id === 'deleteModal') closeDeleteModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !document.getElementById('deleteModal').hidden) {
                closeDeleteModal();
            }
        });
    }

    function closeDeleteModal() {
        document.getElementById('deleteModal').hidden = true;
        state.pendingDelete = null;
    }

    async function confirmDelete() {
        const target = state.pendingDelete;
        if (!target) { closeDeleteModal(); return; }
        const { kurs_id, ogrenci_id } = target;
        const btn = document.getElementById('confirmDeleteBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Siliniyor...';

        try {
            await adminFetch(
                `/api/admin/reviews/${encodeURIComponent(kurs_id)}/${encodeURIComponent(ogrenci_id)}`,
                { method: 'DELETE' }
            );
            showToast('Yorum silindi.', 'success');
            closeDeleteModal();
            fetchReviews();
        } catch (err) {
            showToast(`Silinemedi: ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-trash-alt"></i> Evet, Sil';
        }
    }

    // -------------------------------------------------------------------
    // ?focus=kurs_id:ogrenci_id ile gelirsek karti vurgula
    // -------------------------------------------------------------------
    function applyFocusHighlight() {
        if (!state.focusKey) return;
        const card = document.querySelector(`.review-card[data-focus-key="${CSS.escape(state.focusKey)}"]`);
        if (card) {
            card.classList.add('is-focused');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Bir kerelik animasyon
            setTimeout(() => card.classList.remove('is-focused-flash'), 2000);
            card.classList.add('is-focused-flash');
        }
    }

    function readFocusFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const focus = params.get('focus');
        if (focus && focus.includes(':')) {
            state.focusKey = focus;
        }
    }

    // -------------------------------------------------------------------
    // INIT
    // -------------------------------------------------------------------
    function init() {
        if (!getAdminToken()) {
            window.location.href = '/admin/login.html';
            return;
        }
        readFocusFromUrl();
        bindGlobalEvents();
        fetchReviews();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
