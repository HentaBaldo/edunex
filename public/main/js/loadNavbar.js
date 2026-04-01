document.addEventListener("DOMContentLoaded", async () => {
    const navbarContainer = document.getElementById('navbar-container');
    if (!navbarContainer) return;

    try {
        const response = await fetch('/components/navbar.html');
        const html = await response.text();
        navbarContainer.innerHTML = html;
        
        // KRİTİK NOKTA: Navbar HTML olarak sayfaya eklendikten HEMEN SONRA bu fonksiyonları tetikliyoruz.
        
        // 1. Sağ üstteki profil menüsünü (veya giriş butonunu) doldurur
        if (typeof checkAuth === 'function') {
            checkAuth();
        }
        
        // 2. Mega menüdeki kategorileri doldurur
        if (typeof loadCategoriesForMenu === 'function') {
            loadCategoriesForMenu();
        }
        
    } catch (error) {
        console.error('Navbar yuklenemedi:', error);
    }
});