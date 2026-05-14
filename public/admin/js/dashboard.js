/**
 * EduNex Admin - Komuta Merkezi
 *
 * - Finansal & sayim widget'larini /api/admin/stats'tan ceker
 * - Birlesik aktivite akisini /api/admin/activity-feed'den ceker
 * - Son 7 gun satis trendini /api/admin/sales-trend + Chart.js ile cizer
 * - Client-side filtreleme: tip chip'leri + isim/kurs arama
 */

(function () {
    'use strict';

    // -------------------------------------------------------------------
    // STATE & SABITLER
    // -------------------------------------------------------------------
    const state = {
        feed: [],
        activeType: 'all',
        searchQuery: '',
        salesChart: null,
    };

    // Aktivite tipi -> { ikon, css class }
    const TYPE_CONFIG = {
        satin_alim:          { icon: 'fa-dollar-sign',     cls: 'type-purchase',    label: 'Satin Alim' },
        kursa_kayit:         { icon: 'fa-book-open',       cls: 'type-enroll',      label: 'Kursa Kayit' },
        yeni_yorum:          { icon: 'fa-comment-dots',    cls: 'type-review',      label: 'Yeni Yorum' },
        kurs_onay_talebi:    { icon: 'fa-hourglass-half',  cls: 'type-pending',     label: 'Kurs Onayi' },
        sertifika_tamamlama: { icon: 'fa-trophy',          cls: 'type-certificate', label: 'Sertifika' },
        canli_ders:          { icon: 'fa-broadcast-tower', cls: 'type-live',        label: 'Canli Ders' },
        yeni_kullanici:      { icon: 'fa-user-plus',       cls: 'type-newuser',     label: 'Yeni Kayit' },
    };

    const TR_AYLAR = [
        'Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran',
        'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik',
    ];

    // -------------------------------------------------------------------
    // YARDIMCILAR
    // -------------------------------------------------------------------
    function getAdminToken() {
        return localStorage.getItem('edunex_admin_token');
    }

    async function adminFetch(path) {
        const token = getAdminToken();
        if (!token) {
            window.location.replace('/admin/login.html');
            throw new Error('Admin token yok');
        }
        const res = await fetch(path, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
        });
        if (res.status === 401 || res.status === 403) {
            window.location.replace('/admin/login.html');
            throw new Error('Yetkisiz');
        }
        const body = await res.json();
        if (!body.success) {
            throw new Error(body.message || 'Sunucu hatasi');
        }
        return body;
    }

    function formatTRY(val) {
        const num = Number(val) || 0;
        return num.toLocaleString('tr-TR', {
            style: 'currency',
            currency: 'TRY',
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        });
    }

    function formatNumber(val) {
        return (Number(val) || 0).toLocaleString('tr-TR');
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

    // Zengin metni (HTML içerebilir) düz, kısaltılmış, güvenli metne çevir
    function plainText(html, maxLen) {
        if (html == null) return '';
        const d = document.createElement('div');
        d.innerHTML = String(html);
        let text = (d.textContent || '').replace(/\s+/g, ' ').trim();
        if (maxLen && text.length > maxLen) {
            text = text.slice(0, maxLen).trim() + '…';
        }
        return escapeHtml(text);
    }

    function timeAgo(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const diffMs = Date.now() - d.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 60) return 'simdi';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin} dk once`;
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) return `${diffH} saat once`;
        const diffD = Math.floor(diffH / 24);
        if (diffD < 7) return `${diffD} gun once`;
        return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // -------------------------------------------------------------------
    // STATS WIDGETS
    // -------------------------------------------------------------------
    async function loadStats() {
        try {
            const { data } = await adminFetch('/api/admin/stats');

            // Finansal
            setText('toplamCiro', formatTRY(data.toplamCiro));
            setText('aylikCiro', formatTRY(data.aylikCiro));
            setText('ayAdi', TR_AYLAR[new Date().getMonth()]);

            // Sayimlar
            setText('totalEnrollments', formatNumber(data.totalEnrollments));
            setText('totalCertificates', formatNumber(data.totalCertificates));
            setText('totalUsers', formatNumber(data.totalUsers));
            setText('totalStudents', formatNumber(data.totalStudents));
            setText('totalInstructors', formatNumber(data.totalInstructors));
            setText('activeCourses', formatNumber(data.activeCourses));
            setText('pendingCourses', formatNumber(data.pendingCourses));
            setText('upcomingLiveSessions', formatNumber(data.upcomingLiveSessions));

            // Yeni kayit & online takip
            setText('onlineKullanicilar', formatNumber(data.onlineKullanicilar || 0));
            setText('yeniKayitlar24h', formatNumber(data.yeniKayitlar24h || 0));
        } catch (err) {
            console.error('[KOMUTA MERKEZI] Stats hatasi:', err.message);
            // Kart'larin sonsuza dek '--' kalmamasi icin Hata isareti
            ['toplamCiro', 'aylikCiro', 'totalEnrollments', 'totalCertificates',
             'totalUsers', 'totalStudents', 'totalInstructors',
             'activeCourses', 'pendingCourses', 'upcomingLiveSessions',
             'onlineKullanicilar', 'yeniKayitlar24h']
                .forEach(id => setText(id, 'Hata'));
        }
    }

    // -------------------------------------------------------------------
    // ACTIVITY FEED
    // -------------------------------------------------------------------
    async function loadActivityFeed() {
        const listEl = document.getElementById('activityFeedList');
        try {
            const { data } = await adminFetch('/api/admin/activity-feed?limit=50');
            state.feed = Array.isArray(data) ? data : [];
            renderFeed();
        } catch (err) {
            console.error('[KOMUTA MERKEZI] Feed hatasi:', err.message);
            if (listEl) {
                listEl.innerHTML = `
                    <div class="feed-empty-state error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>Aktivite akisi yuklenemedi.</p>
                    </div>`;
            }
        }
    }

    function getFilteredFeed() {
        const q = state.searchQuery.trim().toLocaleLowerCase('tr-TR');
        return state.feed.filter(ev => {
            if (state.activeType !== 'all' && ev.type !== state.activeType) return false;
            if (!q) return true;
            const hay = [
                ev.baslik,
                ev.aciklama,
                ev.kullanici,
            ].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
            return hay.includes(q);
        });
    }

    function renderFeed() {
        const listEl = document.getElementById('activityFeedList');
        if (!listEl) return;

        const items = getFilteredFeed();
        if (items.length === 0) {
            listEl.innerHTML = `
                <div class="feed-empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>${state.feed.length === 0 ? 'Henuz bir aktivite yok.' : 'Filtreye uyan sonuc bulunamadi.'}</p>
                </div>`;
            return;
        }

        listEl.innerHTML = items.map(buildFeedItemHTML).join('');
    }

    function buildInspectHref(link) {
        if (!link || !link.page) return null;
        const url = new URL(link.page, window.location.origin);
        if (link.focus) url.searchParams.set('focus', link.focus);
        return url.pathname + url.search;
    }

    function buildFeedItemHTML(ev) {
        const cfg = TYPE_CONFIG[ev.type] || { icon: 'fa-circle-info', cls: 'type-default', label: ev.type };
        const tarihText = timeAgo(ev.tarih);
        const tutarBadge = (ev.type === 'satin_alim' && typeof ev.tutar === 'number')
            ? `<span class="feed-amount">${escapeHtml(formatTRY(ev.tutar))}</span>`
            : '';
        const puanBadge = (ev.type === 'yeni_yorum' && ev.puan)
            ? `<span class="feed-rating"><i class="fas fa-star"></i> ${escapeHtml(ev.puan)}/5</span>`
            : '';

        const href = buildInspectHref(ev.link);
        const inspectBtn = href
            ? `<a class="feed-inspect-btn" href="${escapeHtml(href)}" title="Detayi incele">
                   <i class="fas fa-eye"></i><span>Incele</span>
               </a>`
            : '';

        return `
            <div class="feed-item ${cfg.cls}" data-type="${escapeHtml(ev.type)}">
                <div class="feed-icon">
                    <i class="fas ${cfg.icon}"></i>
                </div>
                <div class="feed-body">
                    <div class="feed-line">
                        <span class="feed-type-badge">${escapeHtml(cfg.label)}</span>
                        <strong class="feed-title">${escapeHtml(ev.baslik || '')}</strong>
                        ${tutarBadge}
                        ${puanBadge}
                    </div>
                    <p class="feed-desc">${plainText(ev.aciklama, 150)}</p>
                </div>
                <div class="feed-meta">
                    <time class="feed-time" datetime="${escapeHtml(ev.tarih || '')}">${escapeHtml(tarihText)}</time>
                    ${inspectBtn}
                </div>
            </div>`;
    }

    // -------------------------------------------------------------------
    // FILTRE & ARAMA EVENT BAGLAMA
    // -------------------------------------------------------------------
    function bindFilterEvents() {
        // Tip chip'leri
        document.querySelectorAll('.filter-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.getAttribute('data-filter');
                state.activeType = filter || 'all';
                document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderFeed();
            });
        });

        // Arama (debounce 150ms)
        const searchEl = document.getElementById('feedSearchInput');
        if (searchEl) {
            let t = null;
            searchEl.addEventListener('input', (e) => {
                clearTimeout(t);
                t = setTimeout(() => {
                    state.searchQuery = e.target.value || '';
                    renderFeed();
                }, 150);
            });
        }

        // Yenile butonu
        const refreshBtn = document.getElementById('refreshFeedBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                refreshBtn.classList.add('loading');
                await Promise.all([loadActivityFeed(), loadStats(), loadSalesTrend()]);
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('loading');
            });
        }
    }

    // -------------------------------------------------------------------
    // SATIS TRENDI - Chart.js
    // -------------------------------------------------------------------
    async function loadSalesTrend() {
        const canvas = document.getElementById('salesTrendChart');
        if (!canvas) return;

        try {
            const { data } = await adminFetch('/api/admin/sales-trend?days=7');
            const seri = Array.isArray(data) ? data : [];

            // Backend artik gunIsmi (Pzt/Sal/...) ve gunTam aliyor.
            const labels = seri.map(d => d.gunIsmi || d.gun || '');
            const fullLabels = seri.map(d => d.gunTam || d.gun || '');
            const values = seri.map(d => Number(d.toplam || 0));
            const counts = seri.map(d => Number(d.siparis_sayisi || 0));

            const toplam = values.reduce((a, b) => a + b, 0);
            const siparis = counts.reduce((a, b) => a + b, 0);
            setText('chartSummary', `${formatTRY(toplam)} - ${formatNumber(siparis)} siparis`);

            if (typeof Chart === 'undefined') {
                console.warn('[KOMUTA MERKEZI] Chart.js yuklenemedi, grafik atlandi.');
                return;
            }

            // Refresh durumunda: chart varsa data'sini guncelle (destroy ETME, sadece update).
            if (state.salesChart) {
                state.salesChart.data.labels = labels;
                state.salesChart.data.datasets[0].data = values;
                // Tooltip callback'i icin guncel referanslari sakla
                state.chartContext = { values, counts, fullLabels };
                state.salesChart.update();
                return;
            }

            // Ilk olusturma
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 240);
            gradient.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
            gradient.addColorStop(1, 'rgba(59, 130, 246, 0.02)');

            state.chartContext = { values, counts, fullLabels };

            state.salesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Gunluk Ciro (TRY)',
                        data: values,
                        borderColor: '#3b82f6',
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2.5,
                        pointBackgroundColor: '#3b82f6',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                title: (items) => {
                                    const idx = items[0]?.dataIndex ?? 0;
                                    const ctx2 = state.chartContext || { fullLabels };
                                    return ctx2.fullLabels[idx] || '';
                                },
                                label: (item) => {
                                    const idx = item.dataIndex;
                                    const ctx2 = state.chartContext || { values, counts };
                                    return [
                                        `Ciro: ${formatTRY(ctx2.values[idx] || 0)}`,
                                        `Siparis: ${formatNumber(ctx2.counts[idx] || 0)}`,
                                    ];
                                },
                            },
                        },
                    },
                    scales: {
                        x: { grid: { display: false } },
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: (v) => formatTRY(v).replace(',00', ''),
                            },
                            grid: { color: '#e2e8f0' },
                        },
                    },
                },
            });
        } catch (err) {
            console.error('[KOMUTA MERKEZI] Sales trend hatasi:', err.message);
            setText('chartSummary', 'Veri alinamadi');
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
        bindFilterEvents();
        // Paralel baslat (3 endpoint birbirinden bagimsiz)
        loadStats();
        loadActivityFeed();
        // Chart.js script defer ile yuklenir, hazir olduktan sonra cek
        if (document.readyState === 'complete') {
            loadSalesTrend();
        } else {
            window.addEventListener('load', loadSalesTrend, { once: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
