/**
 * EduNex Admin - Güvenlik ve Yetki Kontrolü
 */
document.addEventListener('DOMContentLoaded', () => {
    checkAdminAccess();
});

function checkAdminAccess() {
    // DOĞRU ANAHTARLAR: Admin portalında 'admin' takısı olanları kullanmalıyız
    const token = localStorage.getItem('edunex_admin_token');
    const userJson = localStorage.getItem('edunex_admin_user');

    if (!token || !userJson) {
        // Eğer admin token'ı yoksa direkt admin girişine yönlendir
        window.location.replace('/admin/login.html');
        return;
    }

    try {
        const user = JSON.parse(userJson);
        
        // Rol kontrolü: Sadece 'admin' girebilir
        if (user.rol !== 'admin') {
            alert('Bu sayfaya erişim yetkiniz yok.');
            window.location.replace('/main/index.html');
            return;
        }

        const adminNameEl = document.getElementById('adminName');
        if (adminNameEl) {
            adminNameEl.innerText = `${user.ad} ${user.soyad}`;
        }

    } catch (error) {
        console.error('[YETKİ HATASI] Kullanıcı verisi doğrulanamadı.');
        adminLogout();
    }
}

function adminLogout() {
    localStorage.removeItem('edunex_admin_token');
    localStorage.removeItem('edunex_admin_user');
    window.location.replace('/admin/login.html');
}