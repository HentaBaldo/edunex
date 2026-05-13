import { UIHelper } from './modules/ui-helper.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!UIHelper.checkInstructorAccess()) return;
    await Promise.all([
        loadDashboardStats(),
        loadMyCourses(),
        loadFollowers(),
        checkSubMerchantBanner(),
    ]);
});

async function loadDashboardStats() {
    try {
        const result = await ApiService.get('/instructor/dashboard/stats');
        const data = result.data;
        renderKpi(data.kpi);
        renderCharts(data.grafik);
        renderPerfTable(data.kurs_performanslari);
        renderReviews(data.son_yorumlar);
    } catch (err) {
        console.error('[DASHBOARD] İstatistikler yüklenemedi:', err.message);
        renderKpiError();
    }
}

// Takipci listesi (isim/avatar) icin /follows/my-followers cagrisi.
// KPI degerini dashboard/stats endpointi zaten dondurdugu icin burada KPI'yi tekrar yazmiyoruz.
async function loadFollowers() {
    try {
        const result = await ApiService.get('/follows/my-followers');
        const liste  = result?.data?.ogrenciler || [];
        const sayi   = result?.data?.followerCount ?? result?.data?.toplam ?? liste.length;
        renderFollowersList(liste, sayi);
    } catch (err) {
        console.warn('[DASHBOARD] Takipci listesi yuklenemedi:', err.message);
        const liste = document.getElementById('followersList');
        if (liste) liste.innerHTML = '<p style="color:#ef4444;padding:14px 0;text-align:center;">Takipçi listesi yüklenemedi.</p>';
    }
}

function renderFollowersList(ogrenciler, sayi) {
    const text  = document.getElementById('followersCountText');
    const liste = document.getElementById('followersList');
    if (text)  text.textContent = `${sayi} takipçi`;
    if (!liste) return;

    if (!ogrenciler.length) {
        liste.innerHTML = '<p style="color:#94a3b8;padding:18px 0;text-align:center;">Henüz takipçiniz yok. Kurslarınızı yayınladıkça takipçi sayınız artacak.</p>';
        return;
    }
    liste.innerHTML = ogrenciler.slice(0, 12).map(t => {
        const o = t.ogrenci || {};
        const tam = `${o.ad || ''} ${o.soyad || ''}`.trim() || 'İsimsiz Öğrenci';
        const avatar = o.profil_fotografi
            ? `<img src="${escapeHtml(o.profil_fotografi)}" alt="${escapeHtml(tam)}" class="review-avatar">`
            : `<div class="review-avatar-placeholder">${(tam[0] || '?').toUpperCase()}</div>`;
        return `
            <div class="review-item" style="display:flex;align-items:center;gap:12px;">
                ${avatar}
                <div style="flex:1;min-width:0;">
                    <strong>${escapeHtml(tam)}</strong>
                    <div style="font-size:0.8rem;color:#64748b;">${escapeHtml(o.eposta || '')}</div>
                </div>
            </div>`;
    }).join('');
}

function renderKpi(kpi) {
    const trend = kpi.kazanc_trendi;
    const trendHtml = trend !== null
        ? `<span class="kpi-trend ${trend >= 0 ? 'trend-up' : 'trend-down'}">
               <i class="fas fa-arrow-${trend >= 0 ? 'up' : 'down'}"></i> ${Math.abs(trend)}%
           </span>`
        : '';

    const takipci = Number(kpi.followerCount ?? kpi.toplam_takipci ?? 0);
    const cards = [
        { icon: 'fas fa-users', color: 'blue', label: 'Toplam Öğrenci', value: kpi.toplam_ogrenci.toLocaleString('tr-TR'), sub: `${kpi.yayinda_kurs} yayında kurs` },
        { icon: 'fas fa-wallet', color: 'green', label: 'Toplam Net Kazanç', value: `₺${kpi.toplam_net_kazanc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, sub: '' },
        { icon: 'fas fa-chart-bar', color: 'purple', label: 'Bu Ayki Gelir', value: `₺${kpi.bu_ay_kazanc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, sub: trendHtml },
        { icon: 'fas fa-star', color: 'orange', label: 'Ortalama Puan', value: kpi.ortalama_puan > 0 ? `${kpi.ortalama_puan} / 5` : '—', sub: `${kpi.toplam_yorum} değerlendirme` },
        // 5. kart artik dashboard/stats endpointi tek seferde donuyor; loadFollowers
        // sadece alttaki listeyi doldurmak icin kalir.
        { icon: 'fas fa-user-friends', color: 'blue', label: 'Toplam Takipçi', value: takipci.toLocaleString('tr-TR'), sub: 'Eğitmen profili takipçileri' }
    ];

    document.getElementById('kpiGrid').innerHTML = cards.map(c => `
        <div class="kpi-card">
            <div class="kpi-icon kpi-icon--${c.color}"><i class="${c.icon}"></i></div>
            <div class="kpi-body">
                <p class="kpi-label">${c.label}</p>
                <p class="kpi-value">${c.value}</p>
                <div class="kpi-sub">${c.sub}</div>
            </div>
        </div>
    `).join('');
}

function renderKpiError() {
    document.getElementById('kpiGrid').innerHTML = '<p style="color:#ef4444;grid-column:1/-1;">İstatistikler yüklenemedi.</p>';
}

let earningsChartInstance = null;
let enrollmentChartInstance = null;

function renderCharts(grafik) {
    const labels = grafik.aylik_kazanc.map(a => a.etiket);
    const kazancData = grafik.aylik_kazanc.map(a => a.deger);

    if (earningsChartInstance) earningsChartInstance.destroy();
    earningsChartInstance = new Chart(document.getElementById('earningsChart'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Net Kazanç (₺)',
                data: kazancData,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37,99,235,0.08)',
                borderWidth: 2.5,
                pointRadius: 4,
                pointBackgroundColor: '#2563eb',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: v => `₺${v.toLocaleString('tr-TR')}` } },
                x: { grid: { display: false } }
            }
        }
    });

    const aktifKurslar = grafik.kurs_dagilimi.filter(k => k.deger > 0);
    const COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#be185d'];

    if (enrollmentChartInstance) enrollmentChartInstance.destroy();

    if (aktifKurslar.length === 0) {
        document.getElementById('enrollmentChart').parentElement.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px 0;">Henüz kayıt verisi yok.</p>';
        return;
    }

    enrollmentChartInstance = new Chart(document.getElementById('enrollmentChart'), {
        type: 'doughnut',
        data: {
            labels: aktifKurslar.map(k => k.etiket),
            datasets: [{ data: aktifKurslar.map(k => k.deger), backgroundColor: COLORS, borderWidth: 2, borderColor: '#fff', hoverOffset: 8 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} öğrenci` } } },
            cutout: '62%'
        }
    });

    document.getElementById('doughnutLegend').innerHTML = aktifKurslar.map((k, i) => `
        <div class="legend-item">
            <span class="legend-dot" style="background:${COLORS[i % COLORS.length]}"></span>
            <span class="legend-text">${escapeHtml(k.etiket)}</span>
            <span class="legend-val">${k.deger}</span>
        </div>
    `).join('');
}

function renderPerfTable(kurslar) {
    const statusMap = {
        taslak: ['badge-taslak', 'TASLAK'],
        onay_bekliyor: ['badge-onay_bekliyor', 'ONAY BEKLİYOR'],
        onaylandi: ['badge-onaylandi', 'ONAYLANDI'],
        yayinda: ['badge-yayinda', 'YAYINDA'],
        arsiv: ['badge-arsiv', 'ARŞİV']
    };

    if (!kurslar || kurslar.length === 0) {
        document.getElementById('perfTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:30px;">Henüz kurs yok.</td></tr>';
        return;
    }

    document.getElementById('perfTableBody').innerHTML = kurslar.map(k => {
        const [cls, lbl] = statusMap[k.durum] || ['badge-taslak', k.durum];
        const stars = renderStars(k.ortalama_puan);
        return `
            <tr>
                <td class="td-title">${escapeHtml(k.baslik)}</td>
                <td><span class="course-badge ${cls}">${lbl}</span></td>
                <td class="td-num">₺${k.toplam_kazanc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                <td class="td-num">${k.ogrenci_sayisi}</td>
                <td><div class="star-cell">${stars} <span>${k.ortalama_puan > 0 ? k.ortalama_puan : '—'}</span></div></td>
                <td>
                    <div class="progress-cell">
                        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${k.tamamlanma_orani}%"></div></div>
                        <span>%${k.tamamlanma_orani}</span>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderReviews(yorumlar) {
    const container = document.getElementById('recentReviews');
    if (!yorumlar || yorumlar.length === 0) {
        container.innerHTML = '<p class="reviews-empty">Henüz yorum yapılmamış.</p>';
        return;
    }
    container.innerHTML = yorumlar.map(y => {
        const tarih = new Date(y.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
        const stars = renderStars(y.puan);
        const avatar = y.profil_fotografi
            ? `<img src="${y.profil_fotografi}" alt="${escapeHtml(y.ogrenci_ad)}" class="review-avatar">`
            : `<div class="review-avatar-placeholder">${(y.ogrenci_ad[0] || '?').toUpperCase()}</div>`;
        return `
            <div class="review-item">
                <div class="review-meta">
                    ${avatar}
                    <div class="review-meta-text">
                        <strong>${escapeHtml(y.ogrenci_ad)}</strong>
                        <span class="review-date">${tarih}</span>
                    </div>
                    <div class="review-stars">${stars}</div>
                </div>
                ${y.yorum ? `<p class="review-text">${escapeHtml(y.yorum)}</p>` : ''}
            </div>
        `;
    }).join('');
}

function renderStars(puan) {
    return Array.from({ length: 5 }, (_, i) =>
        `<i class="fas fa-star${i < Math.round(puan) ? '' : '-o'}" style="color:${i < Math.round(puan) ? '#f59e0b' : '#d1d5db'};font-size:0.75rem;"></i>`
    ).join('');
}

// Sekme filtresi için tüm kurslar belleğe alınıp client-side filtrelenir
let _instructorCourses = [];
let _activeStatusFilter = 'all';

async function loadMyCourses() {
    const courseListDiv = document.getElementById('courseList');
    if (!courseListDiv) return;
    try {
        const result = await ApiService.get('/courses/my-courses');
        _instructorCourses = result.data || [];

        if (_instructorCourses.length === 0) { renderEmptyState(courseListDiv); return; }

        renderCourseTabsCounters(_instructorCourses);
        wireCourseTabs();
        applyCourseFilter(_activeStatusFilter);
    } catch (error) {
        console.error('[DASHBOARD] Kurslar yüklenemedi:', error.message);
        renderErrorState(courseListDiv, error.message);
    }
}

function renderCourseTabsCounters(list) {
    const counts = { all: list.length, yayinda: 0, taslak: 0, onay_bekliyor: 0 };
    list.forEach(c => { if (counts[c.durum] !== undefined) counts[c.durum]++; });
    Object.keys(counts).forEach(k => {
        const el = document.getElementById(`cnt-${k}`);
        if (el) el.textContent = counts[k];
    });
}

function wireCourseTabs() {
    const tabs = document.querySelectorAll('#courseTabs .course-tab');
    tabs.forEach(tab => {
        if (tab.dataset.bound === '1') return;
        tab.dataset.bound = '1';
        tab.addEventListener('click', () => {
            tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            _activeStatusFilter = tab.dataset.filter;
            applyCourseFilter(_activeStatusFilter);
        });
    });
}

function applyCourseFilter(filter) {
    const courseListDiv = document.getElementById('courseList');
    const emptyEl = document.getElementById('courseEmptyFilter');
    if (!courseListDiv) return;

    const filtered = filter === 'all'
        ? _instructorCourses
        : _instructorCourses.filter(c => c.durum === filter);

    if (filtered.length === 0) {
        courseListDiv.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'flex';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    courseListDiv.innerHTML = filtered.map(createCourseCard).join('');
}

function renderEmptyState(container) {
    container.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-book-open"></i>
            <h3>Henüz bir kurs oluşturmadınız</h3>
            <p>Uzmanlığınızı paylaşmaya başlamak için ilk kursunuzu oluşturun.</p>
            <a href="/instructor/create-course.html" class="btn-primary-lg-alt"><i class="fas fa-plus"></i> Yeni Kurs Oluştur</a>
        </div>`;
}

function renderErrorState(container, message) {
    container.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Hata: ${message}</p>
            <button onclick="location.reload()" class="btn-primary-lg-alt" style="margin-top:15px;"><i class="fas fa-redo"></i> Tekrar Dene</button>
        </div>`;
}

function createCourseCard(course) {
    const statusClass = `badge-${course.durum}`;
    const statusLabel = getStatusLabel(course.durum);
    const categoryName = course.Category?.ad || 'Genel';
    const sectionCount = course.Sections?.length || 0;
    const priceDisplay = course.fiyat > 0 ? `${parseFloat(course.fiyat).toFixed(2)} ₺` : 'Ücretsiz';
    const cover = course.kapak_fotografi
        ? `<img src="${escapeHtml(course.kapak_fotografi)}" alt="${escapeHtml(course.baslik)}" class="course-card-cover-img">`
        : `<div class="course-card-cover-placeholder"><i class="fas fa-graduation-cap"></i></div>`;

    return `
        <div class="course-card-alt" data-course-id="${course.id}" data-status="${course.durum}">
            <div class="course-card-cover">
                ${cover}
                <span class="course-badge ${statusClass} course-badge-overlay"><i class="${getStatusIcon(course.durum)}"></i> ${statusLabel}</span>
            </div>
            <div class="course-card-body">
                <h3 class="course-card-title">${escapeHtml(course.baslik)}</h3>
                <div class="course-card-info">
                    <span><i class="fas fa-folder-open"></i> ${sectionCount} bölüm</span>
                    <span><i class="fas fa-tag"></i> ${escapeHtml(categoryName)}</span>
                    <span><i class="fas fa-wallet"></i> ${priceDisplay}</span>
                </div>
            </div>
            <div class="course-card-actions">
                <a href="/instructor/edit-course.html?id=${course.id}" class="btn-edit-link" title="Kursu yönet"><i class="fas fa-cog"></i> Yönet</a>
                <a href="/main/course-detail.html?id=${course.id}" class="btn-view-link" title="Kursu önizle"><i class="fas fa-eye"></i> Önizle</a>
            </div>
        </div>`;
}

function getStatusLabel(durum) {
    return { taslak: 'TASLAK', onay_bekliyor: 'ONAY BEKLİYOR', onaylandi: 'ONAYLANDI', yayinda: 'YAYINDA', arsiv: 'ARŞİV' }[durum] || 'BİLİNMİYOR';
}

function getStatusIcon(durum) {
    return { taslak: 'fas fa-file-alt', onay_bekliyor: 'fas fa-hourglass-half', onaylandi: 'fas fa-check-circle', yayinda: 'fas fa-rocket', arsiv: 'fas fa-archive' }[durum] || 'fas fa-question-circle';
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

window.loadMyCourses = loadMyCourses;

// ─────────────────────────────────────────────────────────
// iyzico SubMerchant Kurulum Banner'ı
// ─────────────────────────────────────────────────────────

const IYZICO_OK_KEY = 'edunex_iyzico_registered';

/**
 * Sayfa yüklenince SubMerchant durumunu kontrol et.
 * localStorage'da onay varsa banner'ı hiç açma (gereksiz API çağrısı yok).
 * Yoksa banner'ı göster ve buton eventini wire et.
 */
async function checkSubMerchantBanner() {
    if (localStorage.getItem(IYZICO_OK_KEY) === '1') return;

    const banner = document.getElementById('iyzicoSetupBanner');
    if (!banner) return;
    banner.style.display = 'flex';

    const btn = document.getElementById('iyzicoConnectBtn');
    if (!btn) return;

    btn.addEventListener('click', handleSubMerchantConnect);
}

async function handleSubMerchantConnect() {
    const btn = document.getElementById('iyzicoConnectBtn');
    if (!btn || btn.disabled) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Bağlanıyor...</span>';

    try {
        const result = await ApiService.post('/instructor/payment/submerchant', {});

        if (result?.success) {
            const banner = document.getElementById('iyzicoSetupBanner');
            localStorage.setItem(IYZICO_OK_KEY, '1');

            // Butonu başarı görseline dönüştür
            btn.disabled = true;
            btn.classList.add('success');
            btn.innerHTML = '<i class="fas fa-check-circle"></i> <span>iyzico Hesabınız Bağlı</span>';

            // 3 saniye sonra banner'ı kapat
            setTimeout(() => {
                if (banner) {
                    banner.style.transition = 'opacity 0.4s';
                    banner.style.opacity = '0';
                    setTimeout(() => { banner.style.display = 'none'; }, 400);
                }
            }, 3000);

            showToast(
                result.data?.already_registered
                    ? 'iyzico hesabınız zaten bağlı. Her şey yolunda!'
                    : 'iyzico Alt Üye İşyeri hesabınız başarıyla oluşturuldu!',
                'success'
            );
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;

        const msg = err.message || 'Bağlantı kurulamadı.';
        showToast(msg, 'error');

        // IBAN/TCKN eksikse profil sayfasına yönlendirme öner
        if (msg.toLowerCase().includes('iban') || msg.toLowerCase().includes('kimlik')) {
            const banner = document.getElementById('iyzicoSetupBanner');
            if (banner) {
                const body = banner.querySelector('.iyzico-banner-body p');
                if (body) {
                    body.innerHTML = `<strong style="color:#9a3412;">⚠ ${escapeHtml(msg)}</strong>
                        <br><a href="/profile/index.html" style="color:#f97316;font-weight:700;">→ Profilinizi tamamlayın</a>`;
                }
            }
        }
    }
}

/**
 * Hafif toast bildirimi.
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} [durationMs]
 */
function showToast(message, type = 'info', durationMs = 4500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.35s';
        setTimeout(() => el.remove(), 400);
    }, durationMs);
}
