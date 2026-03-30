document.addEventListener('DOMContentLoaded', fetchPendingCourses);

async function fetchPendingCourses() {
    try {
        const result = await ApiService.get('/admin/pending-courses');
        if (result.success) {
            const list = document.getElementById('pendingCoursesList');
            if(result.data.length === 0) {
                list.innerHTML = '<tr><td colspan="6" style="text-align:center;">Bekleyen kurs yok.</td></tr>';
                return;
            }
            list.innerHTML = result.data.map(course => `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 15px;">${course.baslik}</td>
                    <td>${course.Egitmen ? course.Egitmen.ad + ' ' + course.Egitmen.soyad : 'Bilinmiyor'}</td>
                    <td>${course.Category ? course.Category.ad : '-'}</td>
                    <td>${course.fiyat} TL</td>
                    <td><span class="badge badge-pending">İncelemede</span></td>
                    <td style="text-align:right;">
                        <button onclick="approveCourse('${course.id}')" style="background: #22c55e; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;">Onayla</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error("Kurslar çekilemedi", error);
    }
}

async function approveCourse(id) {
    if(!confirm('Bu kursu onaylamak istiyor musunuz?')) return;
    try {
        // DİKKAT: Rota '/api/admin/courses/:id/approve' ve method PUT olarak düzeltildi
        const result = await ApiService.put(`/admin/courses/${id}/approve`, {});
        if (result.success) {
            alert('Kurs başarıyla yayınlandı!');
            fetchPendingCourses(); 
        }
    } catch (error) {
        alert(error.message);
    }
}