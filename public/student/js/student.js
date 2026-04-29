/**
 * EduNex - Öğrenme Merkezi (Learning Hub) Dashboard
 * Version: 3.0
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkStudentAccess()) return;
    setHeroName();
    await loadDashboardData();
    loadDashboardCartBadge();
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
        if (!data.kurslar || data.kurslar.length === 0) {
            renderEmptyState(grid);
            return;
        }

        grid.innerHTML = '';
        data.kurslar.forEach(course => {
            grid.insertAdjacentHTML('beforeend', buildCourseCard(course));
        });

        // Progress bar animasyonu
        requestAnimationFrame(() => {
            document.querySelectorAll('.lh-bar-fill[data-progress]').forEach(bar => {
                const pct = bar.dataset.progress;
                setTimeout(() => { bar.style.width = pct + '%'; }, 100);
            });
        });

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

    const thumbHtml = course.kapak_fotografi
        ? `<div class="lh-card-thumb" style="background-image:url('${course.kapak_fotografi}');background-size:cover;background-position:center;"></div>`
        : `<div class="lh-card-thumb lh-card-thumb--placeholder"><i class="fas fa-play-circle"></i></div>`;

    const progressColor = progress >= 100 ? '#16a34a' : progress > 0 ? 'var(--primary-color)' : '#cbd5e1';

    return `
        <div class="lh-course-card">
            ${thumbHtml}
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
                    <a href="/main/course-detail.html?id=${course.kurs_id}" class="lh-btn-continue">
                        <i class="fas fa-info-circle"></i> Kurs Detayı
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

function logout() {
    if (typeof ApiService !== 'undefined' && ApiService.logout) {
        ApiService.logout();
    } else {
        localStorage.removeItem('edunex_token');
        localStorage.removeItem('edunex_user');
        window.location.href = '/auth/index.html';
    }
}
