/**
 * EduNex Admin - Dashboard İstatistikleri Kontrolcüsü
 */

document.addEventListener('DOMContentLoaded', () => {
    // Sayfa yüklendiğinde istatistikleri çek
    fetchDashboardStats();
});

async function fetchDashboardStats() {
    try {
        const token = localStorage.getItem('edunex_token');

        // Backend'e GET isteği atıyoruz
        const response = await fetch('/api/admin/stats', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // Güvenlik için token gönderiyoruz (Eğer backend tarafında JWT doğrulaması kurduysak)
                'Authorization': `Bearer ${token}` 
            }
        });

        const result = await response.json();

        if (result.success) {
            // Veriler başarıyla geldiyse ekrandaki kartlara yazdırıyoruz
            document.getElementById('totalUsers').innerText = result.data.totalUsers;
            document.getElementById('activeCourses').innerText = result.data.activeCourses;
            document.getElementById('pendingCourses').innerText = result.data.pendingCourses;
        } else {
            console.error('[HATA] Istatistikler alinamadi:', result.message);
            showErrorOnCards();
        }

    } catch (error) {
        console.error('[KRİTİK HATA] Sunucu baglantisi basarisiz:', error);
        showErrorOnCards();
    }
}

// Hata durumunda kartlarda sonsuz yükleme işareti dönmemesi için varsayılan değer atama
function showErrorOnCards() {
    document.getElementById('totalUsers').innerText = 'Hata';
    document.getElementById('activeCourses').innerText = 'Hata';
    document.getElementById('pendingCourses').innerText = 'Hata';
}