/**
 * EduNex Authentication Logic
 * Handles Login, Registration, and Tab Switching
 */

document.addEventListener('DOMContentLoaded', () => {
    initTabSystem();
});

// --- Tab Switching Logic ---
function initTabSystem() {
    const tabLogin = document.getElementById("tabLogin");
    const tabRegister = document.getElementById("tabRegister");
    const loginSection = document.getElementById("loginSection");
    const registerSection = document.getElementById("registerSection");

    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        loginSection.classList.add("active");
        registerSection.classList.remove("active");
    });

    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add("active");
        tabLogin.classList.remove("active");
        registerSection.classList.add("active");
        loginSection.classList.remove("active");
    });
}

// --- Registration Logic ---
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageDiv = document.getElementById('regMessage');
    const submitBtn = document.getElementById('regSubmitBtn');

    // Kullanıcıya gösterilen yükleme mesajı Türkçeleştirildi
    messageDiv.textContent = "Hesap oluşturuluyor, lütfen bekleyin...";
    messageDiv.className = "message-box active";
    submitBtn.disabled = true;

    const payload = {
        ad: document.getElementById('regAd').value.trim(),
        soyad: document.getElementById('regSoyad').value.trim(),
        eposta: document.getElementById('regEposta').value.trim(),
        sifre: document.getElementById('regSifre').value,
        rol: document.getElementById('regRol').value
    };

    try {
        const result = await ApiService.post('/auth/register', payload);
        messageDiv.textContent = result.message;
        messageDiv.className = "message-box success active";
        document.getElementById('registerForm').reset();
        
        // Success: Switch to login after 2 seconds
        setTimeout(() => document.getElementById("tabLogin").click(), 2000);
    } catch (error) {
        messageDiv.textContent = error.message;
        messageDiv.className = "message-box error active";
    } finally {
        submitBtn.disabled = false;
    }
});

// --- Login Logic ---
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const messageDiv = document.getElementById('logMessage');
    const submitBtn = document.getElementById('loginSubmitBtn');

    // Kullanıcıya gösterilen yükleme mesajı Türkçeleştirildi
    messageDiv.textContent = "Kimlik doğrulanıyor...";
    messageDiv.className = "message-box active";
    submitBtn.disabled = true;

    const payload = {
        eposta: document.getElementById('logEposta').value.trim(),
        sifre: document.getElementById('logSifre').value
    };

    try {
        const result = await ApiService.post('/auth/login', payload);
        
        messageDiv.textContent = "Giriş başarılı! Yönlendiriliyorsunuz...";
        messageDiv.className = "message-box success active";
        
        localStorage.setItem('edunex_token', result.data.token);
        localStorage.setItem('edunex_user', JSON.stringify(result.data.user));
        
        setTimeout(() => {
            const role = result.data.user.rol;
            window.location.href = (role === 'egitmen') 
                ? '/instructor/dashboard.html' 
                : '/main/index.html';
        }, 1000);

    } catch (error) {
        messageDiv.textContent = error.message;
        messageDiv.className = "message-box error active";
    } finally {
        submitBtn.disabled = false;
    }
});