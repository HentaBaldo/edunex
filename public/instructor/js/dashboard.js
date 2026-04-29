import { UIHelper } from './modules/ui-helper.js';

document.addEventListener('DOMContentLoaded', async () => {
    if (!UIHelper.checkInstructorAccess()) return;
    await Promise.all([loadDashboardStats(), loadMyCourses()]);
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

function renderKpi(kpi) {
    const trend = kpi.kazanc_trendi;
    const trendHtml = trend !== null
        ? `<span class="kpi-trend ${trend >= 0 ? 'trend-up' : 'trend-down'}">
               <i class="fas fa-arrow-${trend >= 0 ? 'up' : 'down'}"></i> ${Math.abs(trend)}%
           </span>`
        : '';

    const cards = [
        { icon: 'fas fa-users', color: 'blue', label: 'Toplam Öğrenci', value: kpi.toplam_ogrenci.toLocaleString('tr-TR'), sub: `${kpi.yayinda_kurs} yayında kurs` },
        { icon: 'fas fa-wallet', color: 'green', label: 'Toplam Net Kazanç', value: `₺${kpi.toplam_net_kazanc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, sub: '' },
        { icon: 'fas fa-chart-bar', color: 'purple', label: 'Bu Ayki Gelir', value: `₺${kpi.bu_ay_kazanc.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, sub: trendHtml },
        { icon: 'fas fa-star', color: 'orange', label: 'Ortalama Puan', value: kpi.ortalama_puan > 0 ? `${kpi.ortalama_puan} / 5` : '—', sub: `${kpi.toplam_yorum} değerlendirme` }
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

async function loadMyCourses() {
    const courseListDiv = document.getElementById('courseList');
    if (!courseListDiv) return;
    try {
        const result = await ApiService.get('/courses/my-courses');
        const courses = result.data || [];
        if (courses.length === 0) { renderEmptyState(courseListDiv); return; }
        courseListDiv.innerHTML = '';
        courses.forEach(course => courseListDiv.insertAdjacentHTML('beforeend', createCourseCard(course)));
    } catch (error) {
        console.error('[DASHBOARD] Kurslar yüklenemedi:', error.message);
        renderErrorState(courseListDiv, error.message);
    }
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
    return `
        <div class="course-card-alt" data-course-id="${course.id}">
            <div class="course-card-body">
                <span class="course-badge ${statusClass}"><i class="${getStatusIcon(course.durum)}"></i> ${statusLabel}</span>
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
