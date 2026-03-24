function authSekmeDegistir(tip) {
    const formGiris = document.getElementById('formGiris');
    const formKayit = document.getElementById('formKayit');
    const tabGiris = document.getElementById('tabGiris');
    const tabKayit = document.getElementById('tabKayit');

    if(formGiris) formGiris.style.display = tip === 'giris' ? 'block' : 'none';
    if(formKayit) formKayit.style.display = tip === 'kayit' ? 'block' : 'none';
    if(tabGiris) tabGiris.classList.toggle('active', tip === 'giris');
    if(tabKayit) tabKayit.classList.toggle('active', tip === 'kayit');
}

const kayitFormu = document.getElementById('kayitFormu');
if(kayitFormu) {
    kayitFormu.onsubmit = async (e) => {
        e.preventDefault();
        const sonuc = document.getElementById('authSonuc');
        const veriler = {
            ad: document.getElementById('regAd').value,
            soyad: document.getElementById('regSoyad').value,
            eposta: document.getElementById('regEposta').value,
            sifre: document.getElementById('regSifre').value,
            rol: document.getElementById('regRol').value
        };

        const res = await apiIstegi('/api/auth/kayit', 'POST', veriler);
        
        if(res.ok) {
            sonuc.style.color = "var(--primary-color)";
            sonuc.innerText = "Kayıt başarılı! Giriş yapabilirsiniz.";
            setTimeout(() => authSekmeDegistir('giris'), 1500);
        } else {
            sonuc.style.color = "#e11d48";
            sonuc.innerText = (res.data.hata || "Hata oluştu.");
        }
    };
}

const girisFormu = document.getElementById('girisFormu');
if(girisFormu) {
    girisFormu.onsubmit = async (e) => {
        e.preventDefault();
        const veriler = {
            eposta: document.getElementById('eposta_giris').value,
            sifre: document.getElementById('sifre_giris').value
        };

        const res = await apiIstegi('/api/auth/giris', 'POST', veriler);
        
        if(res.ok) {
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('kullaniciAdSoyad', res.data.kullaniciAdSoyad);
            window.location.href = '/main/index.html';
        } else {
            alert("Giriş Başarısız: " + (res.data.hata || "Bilgilerinizi kontrol edin."));
        }
    };
}