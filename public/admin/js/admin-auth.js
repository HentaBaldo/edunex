/**
 * EduNex Admin - Güvenlik ve Yetki Kontrolü
 */

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAccess();
});

function checkAdminAccess() {
    const token = localStorage.getItem('edunex_token');
    const userJson = localStorage.getItem('edunex_user');

    if (!token || !userJson) {
        window.location.replace('/auth/index.html');
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

        // Adminin adını arayüze yazdır (Eğer ilgili element varsa)
        const adminNameEl = document.getElementById('adminName');
        if (adminNameEl) {
            adminNameEl.innerText = `${user.ad} ${user.soyad}`;
        }

    } catch (error) {
        console.error('[YETKİ HATASI] Kullanıcı verisi doğrulanamadı.');
        localStorage.clear();
        window.location.replace('/auth/index.html');
    }
}

function adminLogout() {
    localStorage.removeItem('edunex_token');
    localStorage.removeItem('edunex_user');
    window.location.replace('/auth/index.html');
}