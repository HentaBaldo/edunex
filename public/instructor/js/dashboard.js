function renderCourses(courses) {
    const grid = document.getElementById('courseList'); // HTML'deki ID ile aynı olmalı
    
    if (!courses || courses.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align:center; padding: 40px;">Henüz kurs eklemediniz.</p>';
        return;
    }

    grid.innerHTML = courses.map(course => {
        const statusClass = course.yayinlandi ? 'badge-published' : 'badge-draft';
        const statusText = course.yayinlandi ? 'Yayında' : 'Taslak';

        return `
            <div class="course-card-alt">
                <div class="course-card-body">
                    <span class="course-badge ${statusClass}">${statusText}</span>
                    <h3 class="course-card-title" style="margin: 10px 0; font-size: 1.1rem;">${course.baslik}</h3>
                    <p style="font-size: 0.85rem; color: #64748b;">
                        <i class="fas fa-tag"></i> ${course.Category ? course.Category.ad : 'Genel'}
                    </p>
                </div>
                <div class="course-card-actions">
                    <a href="/instructor/edit-course.html?id=${course.id}" style="background: #e2e8f0; color: #475569;">Düzenle</a>
                    <a href="/course-detail.html?id=${course.id}" style="background: #2563eb; color: white;">Önizle</a>
                </div>
            </div>
        `;
    }).join('');
}