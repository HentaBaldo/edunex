document.addEventListener('DOMContentLoaded', fetchPendingCourses);

async function fetchPendingCourses() {
    const response = await fetch('/api/admin/pending-courses');
    const result = await response.json();
    
    if (result.success) {
        const list = document.getElementById('pendingCoursesList');
        list.innerHTML = result.data.map(course => `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 15px;">${course.baslik}</td>
                <td>${course.Egitmen ? course.Egitmen.ad + ' ' + course.Egitmen.soyad : 'Bilinmiyor'}</td>
                <td>${course.fiyat} TL</td>
                <td>
                    <button onclick="approveCourse('${course.id}')" style="background: #22c55e; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;">Onayla</button>
                    <button style="background: #ef4444; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer; margin-left: 5px;">Reddet</button>
                </td>
            </tr>
        `).join('');
    }
}

async function approveCourse(id) {
    if(!confirm('Bu kursu onaylamak istiyor musunuz?')) return;

    const response = await fetch(`/api/admin/approve/${id}`, { method: 'POST' });
    const result = await response.json();

    if (result.success) {
        alert('Kurs onaylandı!');
        fetchPendingCourses(); // Listeyi yenile
    }
}