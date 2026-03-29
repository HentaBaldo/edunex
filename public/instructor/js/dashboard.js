/**
 * Egitmen panosunda (dashboard) yer alan kurs listesini DOM uzerine cizer.
 * Veri dizisini (array) isleyerek HTML kartlarina donusturur.
 * * @param {Array} courses - Egitmene ait kurs verilerini iceren dizi.
 */
function renderCourses(courses) {
    const grid = document.getElementById('courseList');
    
    // DOM elemani bulunamazsa isleme devam etme (Guvenlik Kontrolu)
    if (!grid) {
        console.warn('[INSTRUCTOR DASHBOARD] "courseList" ID\'li kapsayici eleman DOM uzerinde bulunamadi.');
        return;
    }

    // Veri bos veya tanimsiz ise standart bos durum (empty state) goster
    if (!Array.isArray(courses) || courses.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; border: 2px dashed #cbd5e1; border-radius: 8px;">
                <i class="fas fa-book" style="font-size: 2rem; color: #94a3b8; margin-bottom: 10px;" aria-hidden="true"></i>
                <p style="color: #475569; font-weight: 500; margin: 0;">Henuz bir kurs eklemediniz.</p>
            </div>
        `;
        return;
    }

    // Kurs verilerini donerek (map) HTML kartlarini olustur
    grid.innerHTML = courses.map(course => {
        // Durum kontrolu: Backend'den boolean veya string gelme ihtimaline karsi esnek yapi
        const isPublished = course.yayinlandi === true || course.durum === 'yayinda';
        const statusClass = isPublished ? 'badge-published' : 'badge-draft';
        const statusText = isPublished ? 'Yayinda' : 'Taslak';
        
        // Gecersiz veriler icin varsayilan atamalar (Fallback)
        const categoryName = (course.Category && course.Category.ad) ? course.Category.ad : 'Genel';
        const courseTitle = course.baslik || 'Isimsiz Kurs';

        return `
            <div class="course-card-alt">
                <div class="course-card-body">
                    <span class="course-badge ${statusClass}">${statusText}</span>
                    <h3 class="course-card-title" style="margin: 10px 0; font-size: 1.1rem;">${courseTitle}</h3>
                    <p style="font-size: 0.85rem; color: #64748b; margin: 0;">
                        <i class="fas fa-tag" aria-hidden="true"></i> ${categoryName}
                    </p>
                </div>
                <div class="course-card-actions" style="display: flex; gap: 10px; margin-top: 15px;">
                    <a href="/instructor/edit-course.html?id=${course.id}" class="btn-action" aria-label="${courseTitle} kursunu duzenle" style="flex: 1; background: #e2e8f0; color: #475569; text-decoration: none; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; text-align: center; font-weight: 500;">
                        Duzenle
                    </a>
                    <a href="/course-detail.html?id=${course.id}" class="btn-action" aria-label="${courseTitle} kursunu onizle" style="flex: 1; background: #2563eb; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; text-align: center; font-weight: 500;">
                        Onizle
                    </a>
                </div>
            </div>
        `;
    }).join('');
}