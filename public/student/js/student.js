/**
 * EduNex - Öğrenme Merkezi (Learning Hub) Dashboard
 * Version: 3.0
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkStudentAccess()) return;
    setHeroName();
    await loadDashboardData();
    loadDashboardCartBadge();
    checkPaymentNotification();
});

function checkStudentAccess() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');
    if (!token || !userJson) {
        window.location.href = '/auth/index.html';
        return false;
    }
    try {
        const user = JSON.parse(userJson);
        if (user.rol === 'egitmen') {
            window.location.href = '/instructor/dashboard.html';
            return false;
        }
        return true;
    } catch {
        localStorage.removeItem('edunex_token');
        localStorage.removeItem('edunex_user');
        window.location.href = '/auth/index.html';
        return false;
    }
}

function setHeroName() {
    try {
        const user = JSON.parse(localStorage.getItem('edunex_user') || '{}');
        const name = user.ad || user.name || 'Öğrenci';
        const el = document.getElementById('heroName');
        if (el) el.textContent = escapeHtml(name);
    } catch { /* sessiz */ }
}

async function loadDashboardCartBadge() {
    const badge = document.getElementById('dashCartBadge');
    if (!badge) return;
    try {
        const r = await ApiService.get('/cart');
        const c = r?.data?.kalem_sayisi || 0;
        if (c > 0) {
            badge.textContent = c > 99 ? '99+' : String(c);
            badge.style.display = 'inline-flex';
        }
    } catch { /* sessiz */ }
}

// Sekme filtresi durumu (Devam eden / Tamamlanan)
const COMPLETION_THRESHOLD = 80; // %80 ve üzeri tamamlanmış sayılır
let _enrolledCourses = [];
let _activeProgressTab = 'ongoing';

async function loadDashboardData() {
    const grid = document.getElementById('enrolledCourses');
    if (!grid) return;

    try {
        const result = await ApiService.get('/enrollments/dashboard');
        const data = result.data;

        // --- İstatistikler ---
        setText('statTotal', data.istatistikler.toplam_kayit);
        setText('statCompleted', data.istatistikler.tamamlanan);
        setText('statCerts', data.istatistikler.sertifika);

        // --- Son Kurs (Devam Et Kartı) ---
        if (data.son_kurs) {
            renderResumeCard(data.son_kurs);
        }

        // --- Kurslar Grid ---
        _enrolledCourses = data.kurslar || [];

        if (_enrolledCourses.length === 0) {
            renderEmptyState(grid);
            const tabs = document.getElementById('lhTabs');
            if (tabs) tabs.style.display = 'none';
            return;
        }

        renderProgressCounters(_enrolledCourses);
        wireProgressTabs();
        applyProgressFilter(_activeProgressTab);

    } catch (error) {
        console.error('[DASHBOARD] Veri yüklenemedi:', error);
        grid.innerHTML = `
            <div class="lh-error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Veriler yüklenemedi: ${escapeHtml(error.message)}</p>
                <button onclick="loadDashboardData()" class="lh-btn-retry">Tekrar Dene</button>
            </div>
        `;
    }
}

function _isCompleted(course) {
    return Math.round(course.ilerleme_yuzdesi || 0) >= COMPLETION_THRESHOLD;
}

function renderProgressCounters(list) {
    const completed = list.filter(_isCompleted).length;
    const ongoing = list.length - completed;
    const c1 = document.getElementById('lhCntOngoing');
    const c2 = document.getElementById('lhCntCompleted');
    if (c1) c1.textContent = ongoing;
    if (c2) c2.textContent = completed;
}

function wireProgressTabs() {
    const tabs = document.querySelectorAll('#lhTabs .lh-tab');
    tabs.forEach(tab => {
        if (tab.dataset.bound === '1') return;
        tab.dataset.bound = '1';
        tab.addEventListener('click', () => {
            tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            _activeProgressTab = tab.dataset.filter;
            applyProgressFilter(_activeProgressTab);
        });
    });
}

function applyProgressFilter(filter) {
    const grid = document.getElementById('enrolledCourses');
    const empty = document.getElementById('lhEmptyFilter');
    const emptyText = document.getElementById('lhEmptyFilterText');
    if (!grid) return;

    const filtered = filter === 'completed'
        ? _enrolledCourses.filter(_isCompleted)
        : _enrolledCourses.filter(c => !_isCompleted(c));

    if (filtered.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        if (emptyText) {
            emptyText.textContent = filter === 'completed'
                ? 'Henüz tamamladığınız bir eğitim yok. Öğrenmeye devam edin!'
                : 'Devam eden eğitiminiz yok. Tamamlanan eğitimleri sekmeden inceleyebilirsiniz.';
        }
        return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = filtered.map(buildCourseCard).join('');

    // Progress bar animasyonu
    requestAnimationFrame(() => {
        grid.querySelectorAll('.lh-bar-fill[data-progress]').forEach(bar => {
            const pct = bar.dataset.progress;
            setTimeout(() => { bar.style.width = pct + '%'; }, 80);
        });
    });
}

function renderResumeCard(course) {
    const section = document.getElementById('resumeSection');
    if (!section) return;

    const thumb = document.getElementById('resumeThumb');
    const title = document.getElementById('resumeTitle');
    const instructor = document.getElementById('resumeInstructor');
    const bar = document.getElementById('resumeBar');
    const percent = document.getElementById('resumePercent');
    const btn = document.getElementById('resumeBtn');

    if (course.kapak_fotografi && thumb) {
        thumb.style.backgroundImage = `url('${course.kapak_fotografi}')`;
        thumb.style.backgroundSize = 'cover';
        thumb.style.backgroundPosition = 'center';
        thumb.innerHTML = '';
    }

    if (title) title.textContent = course.baslik || 'Kurs';
    if (instructor) instructor.innerHTML = `<i class="fas fa-chalkboard-teacher"></i> ${escapeHtml(course.egitmen)}`;
    if (percent) percent.textContent = `%${Math.round(course.ilerleme_yuzdesi)} Tamamlandı`;
    if (btn) btn.href = `/student/learning-room.html?id=${course.kurs_id}`;

    section.style.display = 'block';

    // Animasyon
    requestAnimationFrame(() => {
        setTimeout(() => {
            if (bar) bar.style.width = course.ilerleme_yuzdesi + '%';
        }, 200);
    });
}

function buildCourseCard(course) {
    const progress = Math.round(course.ilerleme_yuzdesi || 0);
    const title = escapeHtml(course.baslik || 'Başlıksız Kurs');
    const instructor = escapeHtml(course.egitmen || 'Bilinmeyen Eğitmen');
    const isCompleted = progress >= COMPLETION_THRESHOLD;

    const thumbHtml = course.kapak_fotografi
        ? `<div class="lh-card-thumb" style="background-image:url('${course.kapak_fotografi}');background-size:cover;background-position:center;"></div>`
        : `<div class="lh-card-thumb lh-card-thumb--placeholder"><i class="fas fa-play-circle"></i></div>`;

    const progressColor = isCompleted ? '#16a34a' : progress > 0 ? 'var(--primary-color)' : '#cbd5e1';
    const statusBadge = isCompleted
        ? '<span class="lh-status-badge lh-status-completed"><i class="fas fa-check-circle"></i> Tamamlandı</span>'
        : (progress > 0
            ? '<span class="lh-status-badge lh-status-ongoing"><i class="fas fa-play"></i> Devam Ediyor</span>'
            : '<span class="lh-status-badge lh-status-new"><i class="fas fa-flag"></i> Henüz Başlanmadı</span>');

    const ctaLabel = isCompleted ? 'Tekrar İzle' : (progress > 0 ? 'Devam Et' : 'Öğrenmeye Başla');
    const ctaIcon  = isCompleted ? 'fa-redo' : 'fa-play';

    return `
        <div class="lh-course-card">
            <div class="lh-card-thumb-wrap">
                ${thumbHtml}
                ${statusBadge}
            </div>
            <div class="lh-card-body">
                <h3 class="lh-card-title">${title}</h3>
                <p class="lh-card-instructor">
                    <i class="fas fa-chalkboard-teacher"></i> ${instructor}
                </p>
                <div class="lh-progress-wrap">
                    <div class="lh-bar-bg">
                        <div class="lh-bar-fill" data-progress="${progress}" style="width:0%;background:${progressColor};"></div>
                    </div>
                    <span class="lh-progress-label">%${progress} Tamamlandı</span>
                </div>
                <div class="lh-card-actions">
                    <a href="/student/learning-room.html?id=${course.kurs_id}" class="lh-btn-continue lh-btn-continue--primary">
                        <i class="fas ${ctaIcon}"></i> ${ctaLabel}
                    </a>
                    <button onclick="unenrollCourse('${course.kurs_id}')" class="lh-btn-unenroll" title="Kurstan Ayrıl">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderEmptyState(grid) {
    grid.innerHTML = `
        <div class="lh-empty-state">
            <div class="lh-empty-icon"><i class="fas fa-graduation-cap"></i></div>
            <h3>Henüz hiçbir kursa kayıt olmadınız</h3>
            <p>Binlerce kursu keşfet ve öğrenmeye hemen başla!</p>
            <a href="/main/index.html#courses" class="lh-btn-explore">
                <i class="fas fa-compass"></i> Kursları Keşfet
            </a>
        </div>
    `;
}

async function unenrollCourse(courseId) {
    if (!confirm('Kurstan ayrılmak istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;
    try {
        const result = await ApiService.delete(`/enrollments/${courseId}`);
        if (result.status === 'success') {
            alert('Kurs kaydı başarıyla iptal edildi.');
            await loadDashboardData();
        }
    } catch (error) {
        alert('Kurstan ayrılırken hata oluştu: ' + error.message);
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '0';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function checkPaymentNotification() {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('payment');
    if (!status) return;

    history.replaceState(null, '', window.location.pathname);

    const isSuccess = status === 'success';
    const reason = params.get('reason');

    const msg = isSuccess
        ? 'Tebrikler! Ödemeniz başarıyla alındı ve kurslarınız hesabınıza eklendi.'
        : `Ödeme tamamlanamadı${reason ? ': ' + decodeURIComponent(reason) : '.'}`;

    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        background:${isSuccess ? '#16a34a' : '#dc2626'};color:#fff;
        padding:14px 28px;border-radius:10px;font-size:0.95rem;font-weight:600;
        box-shadow:0 4px 20px rgba(0,0,0,.18);z-index:9999;
        animation:fadeInUp .3s ease;max-width:90vw;text-align:center;`;
    toast.textContent = (isSuccess ? '✓ ' : '✗ ') + msg;

    if (!document.getElementById('_paymentToastStyle')) {
        const s = document.createElement('style');
        s.id = '_paymentToastStyle';
        s.textContent = '@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
        document.head.appendChild(s);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

function logout() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) {
        ApiService.logout();
    } else {
        localStorage.removeItem('edunex_token');
        localStorage.removeItem('edunex_user');
        window.location.href = '/auth/index.html';
    }
}
