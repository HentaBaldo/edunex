document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verileri Getir
    const res = await apiIstegi('/api/profil');
    
    if (res.ok) {
        const data = res.data;
        
        // Kişisel Bilgiler (Profil Tablosu)
        if(document.getElementById('profAd')) document.getElementById('profAd').value = data.ad || '';
        if(document.getElementById('profSoyad')) document.getElementById('profSoyad').value = data.soyad || '';
        
        // Öğrenci Detayları (ogrenci_detaylari Tablosu)
        if(document.getElementById('profBaslik')) document.getElementById('profBaslik').value = data.OgrenciDetay?.baslik || '';
        if(document.getElementById('profBiyo')) document.getElementById('profBiyo').value = data.OgrenciDetay?.biyografi || '';
        if(document.getElementById('profEgitim')) document.getElementById('profEgitim').value = data.OgrenciDetay?.egitim_seviyesi || 'diğer';

        // İstatistikleri Yazdır (Dönüşüm yaparak)
        if(document.getElementById('statKayitli')) document.getElementById('statKayitli').innerText = data.OgrenciDetay?.toplam_kayitli_kurs || 0;
        if(document.getElementById('statTamamlanan')) document.getElementById('statTamamlanan').innerText = data.OgrenciDetay?.tamamlanan_kurs_sayisi || 0;
        
        // Saniyeyi Dakikaya Çevir
        const saniye = data.OgrenciDetay?.toplam_izleme_suresi || 0;
        if(document.getElementById('statSure')) document.getElementById('statSure').innerText = Math.floor(saniye / 60) + " dk";
    }
});

// 2. Güncelleme İşlemi
const profilFormuStudent = document.getElementById('profilFormuStudent');
if (profilFormuStudent) {
    profilFormuStudent.onsubmit = async (e) => {
        e.preventDefault();

        const veriler = {
            ad: document.getElementById('profAd').value,
            soyad: document.getElementById('profSoyad').value,
            // Detay tablosu verileri
            baslik: document.getElementById('profBaslik').value,
            biyografi: document.getElementById('profBiyo').value,
            egitim_seviyesi: document.getElementById('profEgitim').value
        };

        const res = await apiIstegi('/api/profil/guncelle', 'PUT', veriler);

        if (res.ok) {
            alert("Profil başarıyla güncellendi!");
            localStorage.setItem('kullaniciAdSoyad', `${veriler.ad} ${veriler.soyad}`);
            arayuzuGuncelle();
        } else {
            alert("Hata: " + res.data.hata);
        }
    };
}