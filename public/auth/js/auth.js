/**
 * EduNex Authentication Module
 * Handles user login, registration, and UI state management.
 * (Admin login logic has been strictly isolated to the admin portal).
 */

document.addEventListener('DOMContentLoaded', () => {
    initAuthTabs();
    initRegistration();
    initLogin();
    initForgotPassword();
    initResetPassword();
    autoOpenResetFromUrl();
});

// --- Section/Tab Navigator (login/register tablari + forgot/reset paneleri) ---
// Mevcut tab sistemi sadece login<->register tab'i icin yapilmis; forgot ve reset
// tab'i degil, AYRI panellerdir. Tum panelleri tek noktadan kontrol icin bu helper.
function showAuthPanel(targetSectionId) {
    const sectionIds = ['loginSection', 'registerSection', 'forgotSection', 'resetSection'];
    sectionIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', id === targetSectionId);
    });

    // Login/Register tab gorsel state'i — forgot/reset acikken iki tab da pasif gozuksun
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    if (tabLogin && tabRegister) {
        tabLogin.classList.toggle('active', targetSectionId === 'loginSection');
        tabRegister.classList.toggle('active', targetSectionId === 'registerSection');
        // forgot/reset aktif iken tab bar hala gorunur ama hicbiri 'active' degil
    }
}

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

// --- Forgot Password Logic ---
// Akis: Kullanici "Sifremi Unuttum" linkine basar -> forgot panel acilir -> eposta
// gonderir -> backend (POST /auth/forgot-password) generic 200 doner -> kullaniciya
// "mail kontrol edin" mesaji gosteririz. Backend enumeration koruma mantigi sayesinde
// kullanici kayitli olmasa dahi ayni mesaj doner; bu BILINCLI bir tasarim.
function initForgotPassword() {
    const openBtn = document.getElementById('openForgotBtn');
    const backBtn = document.getElementById('backToLoginFromForgotBtn');
    const forgotForm = document.getElementById('forgotForm');

    if (openBtn) {
        openBtn.addEventListener('click', () => {
            const forgotMsg = document.getElementById('forgotMessage');
            if (forgotMsg) forgotMsg.className = 'message-box';
            const epostaInput = document.getElementById('forgotEposta');
            // Login formundan eposta'yi onceden tasi (UX ozeni)
            const logEposta = document.getElementById('logEposta');
            if (epostaInput && logEposta?.value) epostaInput.value = logEposta.value.trim();
            showAuthPanel('forgotSection');
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => showAuthPanel('loginSection'));
    }

    if (!forgotForm) return;

    forgotForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        setFormMessage('forgotMessage', 'Talebiniz iletiliyor...', 'info');
        toggleSubmitButton('forgotSubmitBtn', true, 'Gonderiliyor...');

        const payload = {
            eposta: document.getElementById('forgotEposta').value.trim()
        };

        try {
            const result = await ApiService.post('/auth/forgot-password', payload);
            // Backend her durumda generic 200 mesaji doner — basari mesajini direkt gosteririz.
            setFormMessage(
                'forgotMessage',
                result.message || 'Eger bu e-posta kayitliysa, sifre sifirlama bagantisi gonderildi. Lutfen gelen kutunuzu (ve spam klasorunuzu) kontrol edin.',
                'success'
            );
            forgotForm.reset();
        } catch (error) {
            console.error('[AUTH MODULE] Forgot password error:', error.message);
            // 429 (rate limit) veya 400 (eposta eksik) gibi hatalar buraya duser.
            setFormMessage('forgotMessage', error.message || 'Talep gonderilirken bir hata olustu.', 'error');
        } finally {
            toggleSubmitButton('forgotSubmitBtn', false);
        }
    });
}

// --- Reset Password Logic ---
// Akis: Mail linkinden gelinir -> URL'de ?reset=<token> bulunur -> resetSection acilir
// -> kullanici yeni sifreyi iki kere girer -> backend (POST /auth/reset-password) sifreyi
// guncellestirir -> 1.5 sn sonra login paneline doner. Token'i localStorage'a YAZMAYIZ
// (oturum acmaz; sadece sifre guncellemesi). Kullanici yeniden login olur.
function initResetPassword() {
    const backBtn = document.getElementById('backToLoginFromResetBtn');
    const resetForm = document.getElementById('resetForm');

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            // Token'i URL'den temizleyerek panel degis — geri donulurse istemeden tekrar acilmasin
            window.history.replaceState({}, document.title, window.location.pathname);
            showAuthPanel('loginSection');
        });
    }

    if (!resetForm) return;

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newPassword = document.getElementById('resetNewPassword').value;
        const newPasswordConfirm = document.getElementById('resetNewPasswordConfirm').value;

        // Frontend savunma katmani — backend ZATEN ayni kontrolleri yapiyor ama
        // kullaniciya tek tikta net feedback verelim, gereksiz network gidisini ondelelim.
        if (newPassword.length < 8) {
            setFormMessage('resetMessage', 'Yeni sifre en az 8 karakter olmalidir.', 'error');
            return;
        }
        if (newPassword !== newPasswordConfirm) {
            setFormMessage('resetMessage', 'Sifreler eslesmiyor. Lutfen tekrar deneyin.', 'error');
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('reset');

        if (!token) {
            setFormMessage('resetMessage', 'Sifirlama bagantisi gecersiz veya eksik. Lutfen mailinizdeki butonu kullanin.', 'error');
            return;
        }

        setFormMessage('resetMessage', 'Sifreniz guncelleniyor...', 'info');
        toggleSubmitButton('resetSubmitBtn', true, 'Guncelleniyor...');

        try {
            const result = await ApiService.post('/auth/reset-password', {
                token,
                newPassword
            });

            setFormMessage(
                'resetMessage',
                result.message || 'Sifreniz basariyla guncellendi. Giris ekranina yonlendiriliyorsunuz...',
                'success'
            );
            resetForm.reset();

            // URL'deki token'i temizle (yenileme bombosu)
            setTimeout(() => {
                window.history.replaceState({}, document.title, window.location.pathname);
                showAuthPanel('loginSection');
            }, 1800);

        } catch (error) {
            console.error('[AUTH MODULE] Reset password error:', error.message);
            // Backend 'Sifre sifirlama bagantisi gecersiz veya suresi dolmus...' net mesaj doner.
            setFormMessage('resetMessage', error.message || 'Sifre guncellenirken bir hata olustu.', 'error');
        } finally {
            toggleSubmitButton('resetSubmitBtn', false);
        }
    });
}

// --- URL'de ?reset=<token> varsa otomatik reset panelini ac ---
// Sayfa ilk yuklendiginde calisir; token yoksa hicbir sey yapmaz (default login acik kalir).
function autoOpenResetFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('reset');
    if (token && token.length >= 16) {
        showAuthPanel('resetSection');
    }
    // verified=true query'si (email dogrulama redirect) icin login ekraninda generic bilgi mesaji
    if (urlParams.get('verified') === 'true') {
        setFormMessage('logMessage', 'E-posta adresiniz dogrulandi. Lutfen giris yapin.', 'success');
    }
}