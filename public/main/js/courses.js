// public/main/js/courses.js

(function () {
    'use strict';

    // ─── State ────────────────────────────────────────────────────────────
    const state = {
        allCourses: [],
        allCategories: [],
        filters: {
            search: '',
            categories: [],   // array of category ids (numbers)
            price: 'all',     // 'all' | 'free' | 'paid'
            minRating: 0,
            sort: 'newest'
        },
        searchTimer: null
    };

    // ─── DOM refs ─────────────────────────────────────────────────────────
    const searchInput     = document.getElementById('searchInput');
    const sortSelect      = document.getElementById('sortSelect');
    const courseGrid      = document.getElementById('courseGrid');
    const skeletonGrid    = document.getElementById('skeletonGrid');
    const errorState      = document.getElementById('errorState');
    const errorMessage    = document.getElementById('errorMessage');
    const emptyState      = document.getElementById('emptyState');
    const resultsCount    = document.getElementById('resultsCount');
    const categoryFilters = document.getElementById('categoryFilters');

    // ─── Boot ─────────────────────────────────────────────────────────────
    async function init() {
        readUrlParams();
        buildSkeletonGrid();
        bindStaticEvents();

        try {
            await Promise.all([fetchCourses(), fetchCategories()]);
            buildCategoryFilters();
            syncUiFromState();
            apply();
        } catch (err) {
            showError(err.message);
        }
    }

    // ─── URL Sync ─────────────────────────────────────────────────────────
    function readUrlParams() {
        const p = new URLSearchParams(window.location.search);
        if (p.get('q'))        state.filters.search = p.get('q');
        if (p.get('category')) state.filters.categories = p.get('category').split(',').map(s => s.trim()).filter(Boolean);
        if (p.get('price'))    state.filters.price = p.get('price');
        if (p.get('rating'))   state.filters.minRating = parseFloat(p.get('rating')) || 0;
        if (p.get('sort'))     state.filters.sort = p.get('sort');
    }

    function updateUrl() {
        const p = new URLSearchParams();
        if (state.filters.search)            p.set('q', state.filters.search);
        const validCats = state.filters.categories.filter(id => id && typeof id === 'string');
        if (validCats.length) p.set('category', validCats.join(','));
        if (state.filters.price !== 'all')   p.set('price', state.filters.price);
        if (state.filters.minRating > 0)     p.set('rating', state.filters.minRating);
        if (state.filters.sort !== 'newest') p.set('sort', state.filters.sort);
        const qs = p.toString();
        history.replaceState(null, '', qs ? '?' + qs : window.location.pathname);
    }

    // ─── Data Fetching ────────────────────────────────────────────────────
    async function fetchCourses() {
        const res = await ApiService.get('/courses/published?limit=500');
        state.allCourses = res.data || [];
    }

    async function fetchCategories() {
        try {
            const res = await ApiService.get('/categories');
            state.allCategories = res.data || [];
        } catch {
            // fallback: derive unique categories from course data
            state.allCategories = [];
        }
    }

    // ─── UI Builders ──────────────────────────────────────────────────────
    function buildSkeletonGrid() {
        skeletonGrid.innerHTML = Array.from({ length: 8 }, () => `
            <div class="skeleton-card">
                <div class="skeleton-cover"></div>
                <div class="skeleton-body">
                    <div class="skeleton-line wide"></div>
                    <div class="skeleton-line medium"></div>
                    <div class="skeleton-line narrow"></div>
                    <div class="skeleton-line narrow"></div>
                </div>
            </div>
        `).join('');
    }

    function buildCategoryFilters() {
        // Prefer API categories; fallback to unique ones embedded in course data
        let cats = state.allCategories.length > 0
            ? state.allCategories.filter(c => c.id && c.ad)
            : [...new Map(
                state.allCourses
                    .filter(k => k.Category && k.Category.id && k.Category.ad)
                    .map(k => [k.Category.id, k.Category])
              ).values()];

        if (!cats.length) {
            categoryFilters.innerHTML = '<span class="no-categories">Kategori bulunamadı.</span>';
            return;
        }

        // IDs are UUIDs (strings) — never convert to Number
        categoryFilters.innerHTML = cats.map(cat => `
            <label class="filter-checkbox">
                <input type="checkbox" name="category" value="${cat.id}"
                    ${state.filters.categories.includes(cat.id) ? 'checked' : ''}>
                <span>${cat.ad.trim()}</span>
            </label>
        `).join('');

        categoryFilters.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                state.filters.categories = Array.from(
                    categoryFilters.querySelectorAll('input:checked')
                ).map(el => el.value);
                apply();
            });
        });
    }

    function syncUiFromState() {
        searchInput.value = state.filters.search;
        sortSelect.value = state.filters.sort;

        const priceEl = document.querySelector(`input[name="price"][value="${state.filters.price}"]`);
        if (priceEl) priceEl.checked = true;

        const ratingEl = document.querySelector(`input[name="rating"][value="${state.filters.minRating}"]`);
        if (ratingEl) ratingEl.checked = true;
    }

    // ─── Filter Engine ────────────────────────────────────────────────────
    function apply() {
        let result = [...state.allCourses];

        // --- Search (title + instructor name + category name)
        const term = state.filters.search.toLowerCase();
        if (term) {
            result = result.filter(k =>
                k.baslik.toLowerCase().includes(term) ||
                (k.Egitmen && `${k.Egitmen.ad} ${k.Egitmen.soyad}`.toLowerCase().includes(term)) ||
                (k.Category && k.Category.ad.toLowerCase().includes(term))
            );
        }

        // --- Category (UUID string comparison — never use Number() on UUIDs)
        if (state.filters.categories.length) {
            result = result.filter(k => k.Category && k.Category.id &&
                state.filters.categories.includes(String(k.Category.id)));
        }

        // --- Price
        if (state.filters.price === 'free') {
            result = result.filter(k => !k.fiyat || parseFloat(k.fiyat) === 0);
        } else if (state.filters.price === 'paid') {
            result = result.filter(k => k.fiyat && parseFloat(k.fiyat) > 0);
        }

        // --- Rating
        if (state.filters.minRating > 0) {
            result = result.filter(k => (k.istatistikler?.ortalama_puan || 0) >= state.filters.minRating);
        }

        // --- Sort
        switch (state.filters.sort) {
            case 'price_asc':
                result.sort((a, b) => parseFloat(a.fiyat || 0) - parseFloat(b.fiyat || 0));
                break;
            case 'price_desc':
                result.sort((a, b) => parseFloat(b.fiyat || 0) - parseFloat(a.fiyat || 0));
                break;
            case 'rating':
                result.sort((a, b) => (b.istatistikler?.ortalama_puan || 0) - (a.istatistikler?.ortalama_puan || 0));
                break;
            default: // newest
                result.sort((a, b) => new Date(b.olusturulma_tarihi) - new Date(a.olusturulma_tarihi));
        }

        updateUrl();
        render(result);
    }

    // ─── Render ───────────────────────────────────────────────────────────
    function render(courses) {
        skeletonGrid.classList.add('hidden');
        errorState.classList.add('hidden');

        resultsCount.textContent = `${courses.length} kurs bulundu`;

        if (!courses.length) {
            courseGrid.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        courseGrid.classList.remove('hidden');
        courseGrid.innerHTML = courses.map(kursKartiOlustur).join('');
    }

    function showError(msg) {
        skeletonGrid.classList.add('hidden');
        errorState.classList.remove('hidden');
        errorMessage.textContent = 'Kurslar yüklenirken hata oluştu: ' + msg;
    }

    // ─── Clear Filters ────────────────────────────────────────────────────
    function clearFilters() {
        state.filters = { search: '', categories: [], price: 'all', minRating: 0, sort: 'newest' };

        searchInput.value = '';
        sortSelect.value = 'newest';
        document.querySelectorAll('input[name="price"]').forEach(r => { r.checked = r.value === 'all'; });
        document.querySelectorAll('input[name="rating"]').forEach(r => { r.checked = r.value === '0'; });
        categoryFilters.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });

        apply();
    }

    // ─── Event Listeners ──────────────────────────────────────────────────
    function bindStaticEvents() {
        // Debounced search
        searchInput.addEventListener('input', e => {
            clearTimeout(state.searchTimer);
            state.searchTimer = setTimeout(() => {
                state.filters.search = e.target.value.trim();
                apply();
            }, 300);
        });

        sortSelect.addEventListener('change', e => {
            state.filters.sort = e.target.value;
            apply();
        });

        document.querySelectorAll('input[name="price"]').forEach(radio => {
            radio.addEventListener('change', e => {
                state.filters.price = e.target.value;
                apply();
            });
        });

        document.querySelectorAll('input[name="rating"]').forEach(radio => {
            radio.addEventListener('change', e => {
                state.filters.minRating = parseFloat(e.target.value);
                apply();
            });
        });

        document.getElementById('clearAllFilters').addEventListener('click', clearFilters);
        document.getElementById('emptyStateClear').addEventListener('click', clearFilters);
    }

    // ─── Card Builder ─────────────────────────────────────────────────────
    function yildizHtml(puan, yorumSayisi) {
        if (!puan || parseFloat(puan) === 0) {
            return `<div class="kurs-puan kurs-puan-bos"><i class="far fa-star"></i> Yeni</div>`;
        }
        const p = parseFloat(puan);
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= Math.floor(p))                          stars += '<i class="fas fa-star"></i>';
            else if (i === Math.ceil(p) && p % 1 !== 0)     stars += '<i class="fas fa-star-half-alt"></i>';
            else                                             stars += '<i class="far fa-star"></i>';
        }
        return `<div class="kurs-puan">
            <span class="puan-deger">${p.toFixed(1)}</span>
            <span class="yildizlar">${stars}</span>
            <span class="puan-yorum">(${yorumSayisi})</span>
        </div>`;
    }

    function kursKartiOlustur(kurs) {
        const egitmen = kurs.Egitmen ? `${kurs.Egitmen.ad} ${kurs.Egitmen.soyad}` : 'Eğitmen';
        const fiyat   = kurs.fiyat > 0 ? `${parseFloat(kurs.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
        const kategori = kurs.Category ? kurs.Category.ad : 'Genel';
        const puan     = kurs.istatistikler?.ortalama_puan || 0;
        const yorum    = kurs.istatistikler?.toplam_yorum  || 0;

        return `
            <a href="/main/course-detail.html?id=${kurs.id}" class="course-card">
                <div class="kurs-kart-ic">
                    <div class="kurs-kart-kapak">
                        <i class="fas fa-laptop-code"></i>
                        <span class="kurs-kategori-rozet">${kategori}</span>
                    </div>
                    <div class="kurs-kart-govde">
                        <h3 class="kurs-kart-baslik">${kurs.baslik}</h3>
                        <p class="kurs-kart-alt-baslik">${kurs.aciklama || ''}</p>
                        <p class="kurs-kart-egitmen"><i class="fas fa-chalkboard-teacher"></i> ${egitmen}</p>
                        ${yildizHtml(puan, yorum)}
                        <div class="kurs-kart-alt">
                            <span class="kurs-fiyat">${fiyat}</span>
                            <span class="kurs-incele">İncele <i class="fas fa-arrow-right"></i></span>
                        </div>
                    </div>
                </div>
            </a>
        `;
    }

    // ─── Start ────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);
})();
