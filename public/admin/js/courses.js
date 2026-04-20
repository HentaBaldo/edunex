// Sayfa yüklendiğinde çalışması için
document.addEventListener('DOMContentLoaded', async () => {
    const list = document.getElementById('pendingCoursesList');
    
    if (!list) {
        console.error('[ADMIN COURSES] pendingCoursesList element bulunamadı. HTML dosyasını kontrol et.');
        return;
    }
    
    await fetchPendingCourses();
});

async function fetchPendingCourses() {
    // DÜZELTME 1: list değişkenini try bloğunun DIŞINA aldık. 
    // Böylece catch bloğu da bu değişkene erişebilecek.
    const list = document.getElementById('pendingCoursesList');
    
    if (!list) {
        console.error('[ADMIN COURSES] Element hala bulunamıyor');
        return;
    }

    try {
        list.innerHTML = '<tr><td colspan="6" class="text-center">Yükleniyor...</td></tr>';
        
        // DÜZELTME 2: Ham fetch yerine api.js içindeki ApiService'i kullanıyoruz.
        // Bu sayede token otomatik olarak gönderilecek ve 401 hatası kalkacak.
        const data = await ApiService.get('/admin/pending-courses');
        
        if (!data.success || !Array.isArray(data.courses)) {
            throw new Error('Geçersiz API yanıtı');
        }
        
        if (data.courses.length === 0) {
            list.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Onay bekleyen kurs yok</td></tr>';
            return;
        }
        
        list.innerHTML = data.courses.map(course => `
            <tr>
                <td>${course.baslik}</td>
                <td>${course.Egitmen ? course.Egitmen.ad + ' ' + course.Egitmen.soyad : 'Bilinmiyor'}</td>
                <td><span class="badge bg-warning">${course.durum}</span></td>
                <td>${new Date(course.olusturulma_tarihi).toLocaleDateString('tr-TR')}</td>
                <td>
                    <button class="btn btn-sm btn-success" onclick="approveCourse('${course.id}')">Onayla</button>
                    <button class="btn btn-sm btn-danger" onclick="rejectCourse('${course.id}')">Reddet</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('[ADMIN COURSES FETCH] Hata:', error);
        // list değişkeni artık yukarıda tanımlı olduğu için burada hata vermeyecek.
        list.innerHTML = `<tr><td colspan="6" class="text-danger">Hata: ${error.message}</td></tr>`;
    }
}

async function approveCourse(courseId) {
    try {
        // Ham fetch yerine ApiService.put kullanıyoruz
        await ApiService.put(`/admin/approve-course/${courseId}`, {});
        
        await fetchPendingCourses();
        alert('Kurs onaylandı');
    } catch (error) {
        console.error('[APPROVE COURSE] Hata:', error);
        alert('Hata: ' + error.message);
    }
}

async function rejectCourse(courseId) {
    try {
        // Ham fetch yerine ApiService.put kullanıyoruz
        await ApiService.put(`/admin/reject-course/${courseId}`, {});
        
        await fetchPendingCourses();
        alert('Kurs reddedildi');
    } catch (error) {
        console.error('[REJECT COURSE] Hata:', error);
        alert('Hata: ' + error.message);
    }
}