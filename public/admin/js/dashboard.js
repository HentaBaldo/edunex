/**
 * EduNex Admin - Dashboard İstatistikleri Kontrolcüsü
 */

document.addEventListener('DOMContentLoaded', () => {
    // ✅ Admin token kontrol
    const adminToken = localStorage.getItem('edunex_admin_token');
    if (!adminToken) {
        window.location.href = '/admin/login.html';
        return;
    }
    
    // İstatistikleri çek
    fetchDashboardStats();
});

async function fetchDashboardStats() {
    try {
        // ✅ FIX: Admin token ile header oluştur
        const token = localStorage.getItem('edunex_admin_token');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        
        const response = await fetch('/api/admin/stats', { headers });
        const result = await response.json();

        if (result.success) {
            document.getElementById('totalUsers').innerText = result.data.totalUsers;
            document.getElementById('activeCourses').innerText = result.data.activeCourses;
            document.getElementById('pendingCourses').innerText = result.data.pendingCourses;
        } else {
            throw new Error(result.message);
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