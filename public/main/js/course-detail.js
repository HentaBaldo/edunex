/**
 * EduNex - Kurs Detay Mantığı (Course Detail Logic)
 */

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');

    if (!courseId) {
        window.location.href = '/';
        return;
    }

    try {
        const result = await ApiService.get(`/courses/details/${courseId}`);
        const course = result.data;

        if (!course) throw new Error("Kurs verisi bulunamadı.");

        // Arayüz (UI) Güncellemeleri
        document.getElementById('courseTitle').innerText = course.baslik;
        document.getElementById('courseSubTitle').innerText = course.alt_baslik || '';
        document.getElementById('courseInstructor').innerHTML = `<i class="fas fa-chalkboard-teacher"></i> Eğitmen: ${course.Egitmen.ad} ${course.Egitmen.soyad}`;
        document.getElementById('coursePrice').innerText = course.fiyat > 0 ? `${course.fiyat} ₺` : 'Ücretsiz';

        const curriculumDiv = document.getElementById('curriculumList');
        curriculumDiv.innerHTML = ''; // Yükleniyor yazısını temizle

        if (course.Sections && course.Sections.length > 0) {
            course.Sections.forEach(section => {
                const sectionHtml = `
                    <div class="curriculum-section">
                        <header class="section-title-box">
                            <strong><i class="fas fa-folder-open"></i> ${section.baslik}</strong>
                        </header>
                        <div class="section-lessons">
                            ${section.Lessons.map(lesson => `
                                <div class="lesson-row">
                                    <div class="lesson-left">
                                        <i class="fas ${lesson.icerik_tipi === 'video' ? 'fa-play-circle' : 'fa-file-alt'} lesson-icon"></i>
                                        <span class="lesson-name">${lesson.baslik}</span>
                                    </div>
                                    <div class="lesson-right">
                                        <span class="lesson-time">${lesson.sure_saniye ? Math.floor(lesson.sure_saniye/60) + ' dk' : ''}</span>
                                        <span class="lesson-lock">${lesson.onizleme_mi ? '<i class="fas fa-eye" style="color:var(--primary-color);"></i>' : '<i class="fas fa-lock" style="color:#94a3b8;"></i>'}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                curriculumDiv.insertAdjacentHTML('beforeend', sectionHtml);
            });
        } else {
            curriculumDiv.innerHTML = '<p class="info-message">Bu kurs için henüz müfredat eklenmemiş.</p>';
        }

    } catch (error) {
        console.error("[HATA] Kurs detayları çekilemedi:", error.message);
        alert("Kurs detayları yüklenemedi. Ana sayfaya yönlendiriliyorsunuz.");
        window.location.href = '/';
    }
});