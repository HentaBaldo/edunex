/**
 * EduNex Authentication Module
 * Handles user login, registration, and UI state management.
 * (Admin login logic has been strictly isolated to the admin portal).
 */

document.addEventListener('DOMContentLoaded', () => {
    initAuthTabs();
    initRegistration();
    initLogin();
});

// --- UI State Management Helpers ---
function setFormMessage(elementId, message, type = 'info') {
    const messageDiv = document.getElementById(elementId);
    if (!messageDiv) return;

    messageDiv.textContent = message;
    messageDiv.className = `message-box ${type} active`;
}

function toggleSubmitButton(buttonId, isDisabled, loadingText = '') {
    const button = document.getElementById(buttonId);
    if (!button) return;

    button.disabled = isDisabled;
    if (isDisabled && loadingText) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
    } else if (!isDisabled && button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
    }
}

// --- Tab Navigation Logic ---
function initAuthTabs() {
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginSection = document.getElementById('loginSection');
    const registerSection = document.getElementById('registerSection');

    if (!tabLogin || !tabRegister || !loginSection || !registerSection) return;

    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginSection.classList.add('active');
        registerSection.classList.remove('active');
    });

    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        registerSection.classList.add('active');
        loginSection.classList.remove('active');
    });
}

// --- Registration Logic ---
function initRegistration() {
    const registerForm = document.getElementById('registerForm');
    if (!registerForm) return;

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        setFormMessage('regMessage', 'Hesap olusturuluyor, lutfen bekleyin...', 'info');
        toggleSubmitButton('regSubmitBtn', true, 'Islem Yapiliyor...');

        const payload = {
            ad: document.getElementById('regAd').value.trim(),
            soyad: document.getElementById('regSoyad').value.trim(),
            eposta: document.getElementById('regEposta').value.trim(),
            sifre: document.getElementById('regSifre').value,
            rol: document.getElementById('regRol').value
        };

        try {
            const result = await ApiService.post('/auth/register', payload);
            
            setFormMessage('regMessage', result.message || 'Kayit islemi basarili.', 'success');
            registerForm.reset();
            
            setTimeout(() => {
                const tabLogin = document.getElementById('tabLogin');
                if (tabLogin) tabLogin.click();
            }, 2000);
        } catch (error) {
            console.error('[AUTH MODULE] Registration error:', error.message);
            setFormMessage('regMessage', error.message || 'Kayit sirasinda bir hata olustu.', 'error');
        } finally {
            toggleSubmitButton('regSubmitBtn', false);
        }
    });
}

// --- Login Logic ---
function initLogin() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        setFormMessage('logMessage', 'Kimlik dogrulaniyor...', 'info');
        toggleSubmitButton('loginSubmitBtn', true, 'Giris Yapiliyor...');

        const payload = {
            eposta: document.getElementById('logEposta').value.trim(),
            sifre: document.getElementById('logSifre').value
        };

        try {
            const result = await ApiService.post('/auth/login', payload);
            
            setFormMessage('logMessage', 'Giris basarili. Yonlendiriliyorsunuz...', 'success');
            
            localStorage.setItem('edunex_token', result.data.token);
            localStorage.setItem('edunex_user', JSON.stringify(result.data.user));
            
            // Rol bazli dinamik yonlendirme
            setTimeout(() => {
                const role = result.data.user.rol;
                const redirectMap = {
                    'egitmen': '/instructor/dashboard.html',
                    'ogrenci': '/main/index.html' // İleride öğrenci paneli yaparsan burayı '/student/dashboard.html' olarak güncelleyebilirsin.
                };
                
                // Eğer rol redirectMap'te yoksa (admin dahil) varsayılan olarak ana sayfaya atar.
                window.location.href = redirectMap[role] || '/main/index.html';
            }, 1000);

        } catch (error) {
            console.error('[AUTH MODULE] Login error:', error.message);
            setFormMessage('logMessage', error.message || 'Giris basarisiz. Bilgilerinizi kontrol edin.', 'error');
        } finally {
            toggleSubmitButton('loginSubmitBtn', false);
        }
    });
}