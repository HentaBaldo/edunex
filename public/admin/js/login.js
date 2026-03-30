/**
 * EduNex - Admin Login Controller
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('adminLoginForm');
    const messageBox = document.getElementById('adminLogMessage');
    const submitBtn = document.getElementById('adminSubmitBtn');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('adminEposta').value.trim();
            const password = document.getElementById('adminSifre').value.trim();

            // Butonu bekleme moduna al
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Dogrulaniyor...';
            
            messageBox.className = 'message-box';
            messageBox.textContent = '';

            try {
                // DiKKAT: Normal /auth/login degil, izole edilmis admin rotasi
                const response = await ApiService.post('/admin/login', { 
                    eposta: email, 
                    sifre: password 
                });

                if (response && response.token) {
                    // Admin token ve bilgilerini guvenli bir sekilde sakla
                    localStorage.setItem('edunex_admin_token', response.token);
                    localStorage.setItem('edunex_admin_user', JSON.stringify(response.user));
                    
                    messageBox.textContent = 'Kimlik dogrulandi. Panele yonlendiriliyorsunuz...';
                    messageBox.classList.add('active', 'success');
                    
                    setTimeout(() => {
                        window.location.href = '/admin/dashboard.html';
                    }, 1000);
                } else {
                    throw new Error(response.message || 'Giris basarisiz.');
                }
            } catch (error) {
                messageBox.textContent = error.message || 'Sunucu ile baglanti kurulamadi.';
                messageBox.classList.add('active', 'error');
                
                // Hata durumunda butonu eski haline getir
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Sisteme Giris Yap <i class="fas fa-arrow-right"></i>';
            }
        });
    }
});