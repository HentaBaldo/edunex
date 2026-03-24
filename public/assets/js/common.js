// ==========================================
// 1. API VE OTURUM YÖNETİMİ
// ==========================================
async function apiIstegi(url, method = 'GET', body = null) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        const response = await fetch(url, config);
        const data = await response.json();
        return { ok: response.ok, data };
    } catch (error) {
        console.error(`API Hatası (${url}):`, error);
        return { ok: false, data: { hata: "Sunucu bağlantı hatası." } };
    }
}

function arayuzuGuncelle() {
    const token = localStorage.getItem('token');
    const ziyaretciMenu = document.getElementById('ziyaretciMenu');
    const uyeMenu = document.getElementById('uyeMenu');
    const navIsim = document.getElementById('navIsim');

    if(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if(ziyaretciMenu) ziyaretciMenu.style.display = 'none';
            if(uyeMenu) uyeMenu.style.display = 'block';
            
            // İsim bilgisini alıp Merhaba metniyle birleştiriyoruz
            const adSoyad = localStorage.getItem('kullaniciAdSoyad') || 'Kullanıcı';
            if(navIsim) navIsim.innerText = "Merhaba " + adSoyad + " ▼";
            
        } catch(e) { 
            cikisYap(); 
        }
    } else {
        if(ziyaretciMenu) ziyaretciMenu.style.display = 'block';
        if(uyeMenu) uyeMenu.style.display = 'none';
    }
}

function ogrenimIcerigineGit() {
    const token = localStorage.getItem('token');
    if(!token) return cikisYap();
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        // Role göre yönlendirme yapılıyor
        if(payload.rol === 'egitmen') {
            window.location.href = '/instructor/course-editor.html'; 
        } else {
            window.location.href = '/student/dashboard.html';
        }
    } catch(e) {
        cikisYap();
    }
}

function profilSayfasinaGit() {
    const token = localStorage.getItem('token');
    if(!token) {
        console.log("[HATA] Token bulunamadı!");
        return cikisYap();
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        // Gelen veriyi konsolda görelim
        console.log("[BİLGİ] JWT İçeriği (Payload):", payload); 
        console.log("[BİLGİ] Okunan Rol:", payload.rol);
        
        if (payload.rol === 'egitmen') {
            window.location.href = '/instructor/profil.html'; 
        } else if (payload.rol === 'ogrenci') {
            window.location.href = '/student/profil.html';
        } else {
            console.log("[UYARI] Tanımsız Rol. Ana sayfaya yönlendiriliyor.");
            window.location.href = '/main/index.html';
        }
    } catch(e) {
        console.error("[HATA] Token çözülürken sorun oluştu:", e);
        cikisYap();
    }
}

function cikisYap() { 
    localStorage.clear(); 
    window.location.href = '/main/index.html'; 
}

// ==========================================
// 2. MODAL YÖNETİMİ
// ==========================================
function modalAc(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex'; 
}

function modalKapat(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none'; 
    const authSonuc = document.getElementById('authSonuc');
    if(authSonuc) authSonuc.innerText = "";
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

// ==========================================
// 3. KATEGORİ VE MEGA MENÜ YÖNETİMİ
// ==========================================
async function kategorileriYukle() {
    const res = await apiIstegi('/api/kategoriler');
    if(res.ok){
        window.allCategories = res.data;
        const parentList = document.getElementById('parentList');
        if(parentList){
            parentList.innerHTML = res.data.filter(k => !k.ust_kategori_id).map(p => `
                <div class="cat-item p-item" onmouseenter="showChildren('${p.id}', this)">${p.ad} <span style="font-size:10px;">❯</span></div>
            `).join('');
        }
        const selectBox = document.getElementById('k_kategori_id');
        if(selectBox) {
            selectBox.innerHTML = '<option value="">Kategori Seçin...</option>' + 
                res.data.map(k => `<option value="${k.id}">${k.ad}</option>`).join('');
        }
    } else {
        console.error("Kategoriler yüklenemedi.");
    }
}

function showChildren(parentId, element) {
    document.querySelectorAll('.p-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    const grandChildCol = document.getElementById('grandChildCol');
    if(grandChildCol) grandChildCol.style.display = 'none';
    
    const children = window.allCategories.filter(k => k.ust_kategori_id === parentId);
    const childList = document.getElementById('childList');
    if(childList) {
        childList.innerHTML = children.map(c => `
            <div class="cat-item c-item" onmouseenter="showGrandChildren('${c.id}', this)">${c.ad} <span style="font-size:10px;">❯</span></div>
        `).join('');
    }
}

function showGrandChildren(childId, element) {
    document.querySelectorAll('.c-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    const grandChildren = window.allCategories.filter(k => k.ust_kategori_id === childId);
    const grandChildCol = document.getElementById('grandChildCol');
    const grandChildList = document.getElementById('grandChildList');
    
    if(grandChildren.length > 0) {
        if(grandChildCol) grandChildCol.style.display = 'block';
        if(grandChildList) {
            grandChildList.innerHTML = grandChildren.map(g => `<div class="cat-item">${g.ad}</div>`).join('');
        }
    } else { 
        if(grandChildCol) grandChildCol.style.display = 'none'; 
    }
}

// ==========================================
// 4. PROFİL YÖNETİMİ
// ==========================================
async function profilModalAc() {
    const res = await apiIstegi('/api/profil');
    if(res.ok) {
        const data = res.data;
        modalAc('profilModal');
        if(document.getElementById('profAd')) document.getElementById('profAd').value = data.ad || '';
        if(document.getElementById('profSoyad')) document.getElementById('profSoyad').value = data.soyad || '';
        if(document.getElementById('profTel')) document.getElementById('profTel').value = data.telefon || '';
        if(document.getElementById('profBiyo')) document.getElementById('profBiyo').value = data.biyografi || '';
        if(data.rol === 'egitmen') {
            const panelEgitmenExtra = document.getElementById('panelEgitmenExtra');
            if(panelEgitmenExtra) panelEgitmenExtra.style.display = 'block';
            if(document.getElementById('profUnvan')) document.getElementById('profUnvan').value = data.unvan || '';
            if(document.getElementById('profIban')) document.getElementById('profIban').value = data.iban_no || '';
        }
    } else {
        modalAc('profilModal');
    }
}

async function profilKaydet(event) {
    if (event) event.preventDefault();

    const guncelVeriler = {
        ad: document.getElementById('profAd') ? document.getElementById('profAd').value : undefined,
        soyad: document.getElementById('profSoyad') ? document.getElementById('profSoyad').value : undefined,
        telefon: document.getElementById('profTel') ? document.getElementById('profTel').value : undefined,
        biyografi: document.getElementById('profBiyo') ? document.getElementById('profBiyo').value : undefined,
        unvan: document.getElementById('profUnvan') ? document.getElementById('profUnvan').value : undefined,
        iban_no: document.getElementById('profIban') ? document.getElementById('profIban').value : undefined,
    };

    const res = await apiIstegi('/api/profil/guncelle', 'PUT', guncelVeriler);

    if (res.ok) {
        alert("Profiliniz başarıyla güncellendi!");
        
        // Eğer isim değiştiyse arayüzü ve localStorage'i güncelle
        if (guncelVeriler.ad && guncelVeriler.soyad) {
            localStorage.setItem('kullaniciAdSoyad', `${guncelVeriler.ad} ${guncelVeriler.soyad}`);
        }
        
        modalKapat('profilModal');
        arayuzuGuncelle();
    } else {
        alert("Güncelleme Hatası: " + (res.data.hata || "Bilinmeyen bir hata oluştu."));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    kategorileriYukle();
    arayuzuGuncelle();
    const profilFormu = document.getElementById('profilFormu');
    if(profilFormu) profilFormu.onsubmit = profilKaydet;
});