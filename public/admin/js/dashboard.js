/**
 * EduNex Admin - Dashboard İstatistikleri Kontrolcüsü
 */

document.addEventListener('DOMContentLoaded', () => {
    // Sayfa yüklendiğinde istatistikleri çek
    fetchDashboardStats();
});

async function fetchDashboardStats() {
    try {
        // Ham fetch yerine düzelttiğimiz ApiService'i kullanıyoruz
        const result = await ApiService.get('/admin/stats');

        if (result.success) {
            document.getElementById('totalUsers').innerText = result.data.totalUsers;
            document.getElementById('activeCourses').innerText = result.data.activeCourses;
            document.getElementById('pendingCourses').innerText = result.data.pendingCourses;
        }
    } catch (error) {
        console.error('[HATA] İstatistikler alınamadı:', error.message);
        showErrorOnCards();
    }
}

// Hata durumunda kartlarda sonsuz yükleme işareti dönmemesi için varsayılan değer atama
function showErrorOnCards() {
    document.getElementById('totalUsers').innerText = 'Hata';
    document.getElementById('activeCourses').innerText = 'Hata';
    document.getElementById('pendingCourses').innerText = 'Hata';
}