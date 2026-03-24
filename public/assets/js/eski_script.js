// ==========================================
//           1. TEMEL MODAL İŞLEMLERİ
// ==========================================
function modalAc(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex'; 
}

function modalKapat(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none'; 
    if(document.getElementById('authSonuc')) document.getElementById('authSonuc').innerText = "";
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
}

function authSekmeDegistir(tip) {
    if(document.getElementById('formGiris')) document.getElementById('formGiris').style.display = tip === 'giris' ? 'block' : 'none';
    if(document.getElementById('formKayit')) document.getElementById('formKayit').style.display = tip === 'kayit' ? 'block' : 'none';
    if(document.getElementById('tabGiris')) document.getElementById('tabGiris').classList.toggle('active', tip === 'giris');
    if(document.getElementById('tabKayit')) document.getElementById('tabKayit').classList.toggle('active', tip === 'kayit');
}

// ==========================================
//           2. KİMLİK DOĞRULAMA (AUTH)
// ==========================================

if(document.getElementById('kayitFormu')){
    document.getElementById('kayitFormu').onsubmit = async (e) => {
        e.preventDefault();
        const sonuc = document.getElementById('authSonuc');
        const veriler = {
            ad: document.getElementById('regAd').value,
            soyad: document.getElementById('regSoyad').value,
            eposta: document.getElementById('regEposta').value,
            sifre: document.getElementById('regSifre').value,
            rol: document.getElementById('regRol').value
        };

        try {
            const res = await fetch('/api/kayit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(veriler)
            });
            const data = await res.json();
            if(res.ok) {
                sonuc.style.color = "var(--primary-color)";
                sonuc.innerText = "Kayit basarili! Giris yapabilirsiniz.";
                setTimeout(() => authSekmeDegistir('giris'), 1500);
            } else {
                sonuc.style.color = "#e11d48";
                sonuc.innerText = (data.hata || "Hata olustu.");
            }
        } catch (err) { console.error("Kayıt Hatası:", err); }
    };
}

if(document.getElementById('girisFormu')){
    document.getElementById('girisFormu').onsubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/giris', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eposta: document.getElementById('eposta_giris').value,
                    sifre: document.getElementById('sifre_giris').value
                })
            });
            const data = await res.json();
            if(res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('kullaniciAdSoyad', data.kullaniciAdSoyad);
                modalKapat('authModal');
                arayuzuGuncelle(); 
            } else {
                alert("Giris Basarisiz: " + (data.hata || "Bilgilerinizi kontrol edin."));
            }
        } catch (err) { console.error("Giriş Hatası:", err); }
    };
}

// ==========================================
//           3. KATEGORİ VE MEGA MENÜ
// ==========================================
async function kategorileriYukle() {
    try {
        const res = await fetch('/api/kategoriler');
        if(res.ok){
            const data = await res.json();
            window.allCategories = data;
            const parentList = document.getElementById('parentList');
            if(parentList){
                parentList.innerHTML = data.filter(k => !k.ust_kategori_id).map(p => `
                    <div class="cat-item p-item" onmouseenter="showChildren('${p.id}', this)">${p.ad} <span style="font-size:10px;">❯</span></div>
                `).join('');
            }
            const selectBox = document.getElementById('k_kategori_id');
            if(selectBox) {
                selectBox.innerHTML = '<option value="">Kategori Seçin...</option>' + 
                    data.map(k => `<option value="${k.id}">${k.ad}</option>`).join('');
            }
        }
    } catch(err) { console.log("Kategoriler yüklenemedi."); }
}

function showChildren(parentId, element) {
    document.querySelectorAll('.p-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    if(document.getElementById('grandChildCol')) document.getElementById('grandChildCol').style.display = 'none';
    const children = window.allCategories.filter(k => k.ust_kategori_id === parentId);
    if(document.getElementById('childList')) {
        document.getElementById('childList').innerHTML = children.map(c => `
            <div class="cat-item c-item" onmouseenter="showGrandChildren('${c.id}', this)">${c.ad} <span style="font-size:10px;">❯</span></div>
        `).join('');
    }
}

function showGrandChildren(childId, element) {
    document.querySelectorAll('.c-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    const grandChildren = window.allCategories.filter(k => k.ust_kategori_id === childId);
    if(grandChildren.length > 0) {
        if(document.getElementById('grandChildCol')) document.getElementById('grandChildCol').style.display = 'block';
        if(document.getElementById('grandChildList')) {
            document.getElementById('grandChildList').innerHTML = grandChildren.map(g => `<div class="cat-item">${g.ad}</div>`).join('');
        }
    } else { 
        if(document.getElementById('grandChildCol')) document.getElementById('grandChildCol').style.display = 'none'; 
    }
}

// ==========================================
//           4. ARAYÜZ VE PANELLER
// ==========================================
function arayuzuGuncelle() {
    const token = localStorage.getItem('token');
    if(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            if(document.getElementById('ziyaretciMenu')) document.getElementById('ziyaretciMenu').style.display = 'none';
            if(document.getElementById('uyeMenu')) document.getElementById('uyeMenu').style.display = 'block';
            if(document.getElementById('navIsim')) document.getElementById('navIsim').innerText = localStorage.getItem('kullaniciAdSoyad') + " ▼";
            
            if(payload.rol === 'egitmen') {
                if(document.getElementById('menuEgitmen')) document.getElementById('menuEgitmen').style.display = 'block';
                egitmenPanelAc();
            } else {
                if(document.getElementById('menuOgrenci')) document.getElementById('menuOgrenci').style.display = 'block';
                ogrenciPanelAc();
            }
        } catch(e) { cikisYap(); }
    } else {
        if(document.getElementById('ziyaretciMenu')) document.getElementById('ziyaretciMenu').style.display = 'block';
        if(document.getElementById('uyeMenu')) document.getElementById('uyeMenu').style.display = 'none';
        if(document.getElementById('anaPanel')) document.getElementById('anaPanel').innerHTML = `<div style="text-align:center; padding:100px;"><h1>EduNex'e Hoş Geldiniz</h1><p style="color:#64748b; font-size:18px;">Geleceği birlikte inşa edelim.</p></div>`;
        if(document.getElementById('egitmenPanel')) document.getElementById('egitmenPanel').style.display = 'none';
    }
}

async function egitmenPanelAc() {
    if(document.getElementById('anaPanel')) document.getElementById('anaPanel').style.display = 'none';
    if(document.getElementById('egitmenPanel')) document.getElementById('egitmenPanel').style.display = 'block';
    
    try {
        const res = await fetch('/api/kurslarim', { 
            headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`} 
        });
        
        if(res.ok) {
            const kurslar = await res.json();
            const grid = document.getElementById('egitmenKurslari');
            if(grid) {
                grid.innerHTML = kurslar.length > 0 ? kurslar.map(k => `
                    <div style="background:white; padding:20px; border-radius:15px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <div>
                            <h3 style="margin:0; font-size:16px;">${k.baslik}</h3>
                            <small style="color:#94a3b8;">${k.kategori_ad || 'Kategorisiz'} | ${k.durum.toUpperCase()}</small>
                        </div>
                        <button class="action-btn" style="width:auto; padding:8px 20px;" onclick="kursDuzenleModaliniAc('${k.id}', '${k.baslik}')">Duzenle</button>
                    </div>
                `).join('') : '<p style="text-align:center; color:#94a3b8; padding:20px;">Henüz kursunuz yok.</p>';
            }
        }
    } catch(err) { console.log("Kurslar çekilemedi."); }
}

async function ogrenciPanelAc() {
    const anaPanel = document.getElementById('anaPanel');
    if(!anaPanel) return;
    document.getElementById('egitmenPanel').style.display = 'none';
    anaPanel.style.display = 'block';
    anaPanel.innerHTML = `
        <div class="page-header"><h2>Kesfetmeye Basla</h2><p>Sana en uygun kursu seç ve öğrenmeye başla.</p></div>
        <div id="kursVitrinGrid" class="course-grid"><p style="text-align:center; padding:20px;">Kurslar yükleniyor...</p></div>
    `;

    try {
        const res = await fetch('/api/kurslar/hepsi');
        const kurslar = await res.json();
        const grid = document.getElementById('kursVitrinGrid');
        
        if(res.ok && kurslar.length > 0) {
            grid.innerHTML = kurslar.map(k => `
                <div class="course-card">
                    <div class="course-img" style="background-image: url('${k.kapak_fotografi_url || 'https://via.placeholder.com/300x150'}'); background-size: cover;"></div>
                    <div class="course-info">
                        <span class="badge">${k.seviye}</span>
                        <h3 class="course-title">${k.baslik}</h3>
                        <p style="font-size: 13px; color: #64748b; margin-bottom: 15px;">${k.alt_baslik || ''}</p>
                        <div class="course-meta">
                            <span>${k.puan_ortalamasi || '0.0'}</span>
                            <span class="price">${k.fiyat > 0 ? k.fiyat + ' ₺' : 'Ücretsiz'}</span>
                        </div>
                        <button class="action-btn" style="margin-top:15px; width:100%;" onclick="kursDetayGit('${k.id}')">Kursu İncele</button>
                    </div>
                </div>
            `).join('');
        } else {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:50px; background:white; border-radius:15px;">Henüz yayınlanmış bir kurs bulunmuyor.</div>';
        }
    } catch (err) { console.error("Kurslar yüklenemedi:", err); }
}

// ==========================================
//           5. KURS VE MÜFREDAT YÖNETİMİ
// ==========================================

let seciliKursId = null;
let suAnkiSeciliBolumId = null;

if(document.getElementById('kursEkleFormu')){
    document.getElementById('kursEkleFormu').onsubmit = async (e) => {
        e.preventDefault();
        const yeniKurs = {
            baslik: document.getElementById('k_baslik').value,
            alt_baslik: document.getElementById('k_kisa_aciklama').value,
            aciklama: document.getElementById('k_detay_aciklama').value,
            seviye: document.getElementById('k_seviye').value,
            kategori_id: document.getElementById('k_kategori_id').value,
            fiyat: parseFloat(document.getElementById('k_fiyat').value) || 0,
            kapak_fotografi_url: document.getElementById('k_gorsel').value,
            dil: 'Türkçe'
        };

        if (!yeniKurs.kategori_id) { alert("Lütfen bir kategori seçin!"); return; }

        try {
            const res = await fetch('/api/kurslar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify(yeniKurs)
            });
            if(res.ok) { alert("Kurs basariyla olusturuldu!"); location.reload(); }
            else { alert("Hata olustu."); }
        } catch(err) { alert("Sunucu bağlantı hatası!"); }
    };
}

// --- DÜZENLEME PANELİ İŞLEMLERİ ---
async function kursDuzenleModaliniAc(kursId, kursBaslik) {
    seciliKursId = kursId;
    if(document.getElementById('duzenleKursBaslik')) document.getElementById('duzenleKursBaslik').innerText = kursBaslik + " - Müfredat";
    modalAc('kursDuzenleModal');
    bolumleriListele();
}

async function bolumleriListele() {
    const liste = document.getElementById('bolumlerListesi');
    try {
        const res = await fetch(`/api/kurslar/${seciliKursId}/bolumler`, {
            headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`}
        });
        const bolumler = await res.json();
        if(bolumler.length > 0) {
            liste.innerHTML = bolumler.map(b => `
                <div class="bolum-kart" onclick="dersleriListele(${b.id}, '${b.baslik}')" style="padding:10px; background:white; margin-bottom:10px; border-radius:8px; border:1px solid #e2e8f0; cursor:pointer;">
                    <span>${b.baslik}</span>
                </div>
            `).join('');
        } else { liste.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:12px;">Henüz bölüm eklenmedi.</p>'; }
    } catch (err) { console.error("Bölüm listeleme hatası:", err); }
}


async function dersleriListele(bolumId, bolumBaslik) {
    suAnkiSeciliBolumId = bolumId;
    document.getElementById('dersBosMesaj').style.display = 'none'; // Uyarıyı gizle
    document.getElementById('dersYonetimAlani').style.display = 'block'; // Paneli göster
    if(document.getElementById('dersYonetimAlani')) document.getElementById('dersYonetimAlani').style.display = 'block';
    if(document.getElementById('seciliBolumAdi')) document.getElementById('seciliBolumAdi').innerText = bolumBaslik + " Dersleri";
    
    const liste = document.getElementById('derslerListesi');
    try {
        const res = await fetch(`/api/bolumler/${bolumId}/dersler`, {
            headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`}
        });
        const dersler = await res.json();
        liste.innerHTML = dersler.map(d => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:#f8fafc; border-radius:6px; margin-bottom:5px;">
                <span>${d.baslik}</span>
            </div>
        `).join('') || '<p style="padding:10px; color:#94a3b8;">Bu bölüm henüz boş.</p>';
    } catch (err) { console.error("Ders listeleme hatası:", err); }
}

// --- BÖLÜM VE DERS KAYDETME ---
function bolumEkleModalAc() { modalAc('bolumEkleModal'); }
function dersEkleModalAc() { modalAc('dersEkleModal'); }

async function bolumKaydet() {
    const baslik = document.getElementById('yeniBolumBaslik').value;
    if(!baslik) return alert("Lütfen bir bölüm başlığı girin!");

    try {
        const res = await fetch('/api/bolumler/ekle', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            },
            body: JSON.stringify({ 
                kurs_id: seciliKursId, // seciliKursId'nin dolu olduğundan emin ol
                baslik: baslik 
            })
        });
        
        if(res.ok) {
            modalKapat('bolumEkleModal');
            document.getElementById('yeniBolumBaslik').value = ""; // Kutuyu temizle
            bolumleriListele(); // Listeyi yenile
        } else {
            const errorData = await res.json();
            alert("Hata: " + errorData.hata);
        }
    } catch (err) { 
        console.error("Bölüm Kaydetme Hatası (Frontend):", err);
    }
}

async function dersKaydet() {
    if (!suAnkiSeciliBolumId) return alert("Lütfen önce bir bölüm seçin!");

    const data = {
        bolum_id: suAnkiSeciliBolumId,
        baslik: document.getElementById('yeniDersBaslik').value,
        aciklama: document.getElementById('yeniDersAciklama').value,
        icerik_tipi: document.getElementById('yeniDersTipi').value,
        video_url: document.getElementById('yeniDersVideo').value, // video_saglayici_id olarak gider
        kaynak_url: document.getElementById('yeniDersKaynakUrl').value,
        sure: document.getElementById('yeniDersSure').value,
        onizleme_mi: document.getElementById('yeniDersOnizleme').checked
    };

    if(!data.baslik || !data.video_url) return alert("Başlık ve URL zorunludur!");

    try {
        const res = await fetch('/api/dersler/ekle', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            },
            body: JSON.stringify(data)
        });

        if(res.ok) {
            alert("Ders tum detaylariyla mufredata eklendi!");
            modalKapat('dersEkleModal');
            dersleriListele(suAnkiSeciliBolumId, document.getElementById('seciliBolumAdi').innerText.replace(" Dersleri", ""));
        }
    } catch (err) { console.error(err); }
}

// ==========================================
//           6. CANLI ÖNİZLEME VE YARDIMCILAR
// ==========================================
function onizlemeGuncelle() {
    const fields = {
        baslik: ['k_baslik', 'prev_baslik', 'Kurs Başlığı'],
        fiyat: ['k_fiyat', 'prev_fiyat', 'Ücretsiz'],
        sure: ['k_sure', 'prev_sure', '0'],
        seviye: ['k_seviye', 'prev_seviye', 'Başlangıç']
    };
    for (let key in fields) {
        const input = document.getElementById(fields[key][0]);
        const output = document.getElementById(fields[key][1]);
        if (input && output) {
            let val = input.value;
            if (key === 'fiyat' && val > 0) val += ' ₺';
            output.innerText = val || fields[key][2];
        }
    }
    const gorsel = document.getElementById('k_gorsel') ? document.getElementById('k_gorsel').value : '';
    const prevImg = document.getElementById('prev_img');
    if(prevImg) {
        if(gorsel) { prevImg.style.backgroundImage = `url('${gorsel}')`; prevImg.style.backgroundSize = 'cover'; }
        else { prevImg.style.backgroundImage = 'none'; }
    }
}

// --- DÜZENLEME PANELİNİ ÖRNEKTEKİ GİBİ DOLDURMA ---
async function kursDuzenleModaliniAc(kursId, kursBaslik) {
    seciliKursId = kursId;
    document.getElementById('duzenleKursBaslik').innerText = kursBaslik + " - Yönetim Paneli";
    modalAc('kursDuzenleModal');

    try {
        // Kursun mevcut detaylarını getir (Kazanımlar, Gereksinimler vb.)
        const res = await fetch(`/api/kurslar/hepsi`); 
        const kurslar = await res.json();
        const kurs = kurslar.find(k => k.id == kursId);

        if(kurs) {
            // Örnekteki alanları dolduruyoruz
            document.getElementById('edit_kazanimlar').value = kurs.kazanimlar || "";
            document.getElementById('edit_gereksinimler').value = kurs.gereksinimler || "";
        }
        
        bolumleriListele(); // Mevcut bölümleri listele
    } catch (err) { console.error("Kurs detayları yüklenemedi."); }
}

// --- GENEL BİLGİLERİ (Kazanım/Gereksinim) GÜNCELLEME ---
async function kursGenelBilgiGuncelle() {
    const veriler = {
        kazanimlar: document.getElementById('edit_kazanimlar').value,
        gereksinimler: document.getElementById('edit_gereksinimler').value
    };

    try {
        const res = await fetch(`/api/kurslar/${seciliKursId}/detay-guncelle`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            },
            body: JSON.stringify(veriler)
        });

        if(res.ok) {
            alert("Kurs detaylari (Kazanimlar ve Gereksinimler) guncellendi!");
        }
    } catch (err) { alert("Güncelleme başarısız."); }
}

async function profilModalAc() {
    try {
        const res = await fetch('/api/profil', { headers: {'Authorization': `Bearer ${localStorage.getItem('token')}`} });
        if(res.ok) {
            const data = await res.json();
            modalAc('profilModal');
            if(document.getElementById('profAd')) document.getElementById('profAd').value = data.ad || '';
            if(document.getElementById('profSoyad')) document.getElementById('profSoyad').value = data.soyad || '';
            if(document.getElementById('profBiyo')) document.getElementById('profBiyo').value = data.biyografi || '';
            if(data.rol === 'egitmen') {
                if(document.getElementById('panelEgitmenExtra')) document.getElementById('panelEgitmenExtra').style.display = 'block';
                if(document.getElementById('profUnvan')) document.getElementById('profUnvan').value = data.unvan || '';
                if(document.getElementById('profIban')) document.getElementById('profIban').value = data.iban_no || '';
            }
        }
    } catch(err) { modalAc('profilModal'); }
}

function cikisYap() { localStorage.clear(); location.reload(); }
function kursDetayGit(id) { alert("Kurs detayları yakında! Kurs ID: " + id); }
// ==========================================
//           7. PROFİL GÜNCELLEME İŞLEMİ
// ==========================================
async function profilKaydet(event) {
    // Formun sayfa yenilemesini engelle
    if (event) event.preventDefault();

    // Formdaki güncel verileri topla
    const guncelVeriler = {
        ad: document.getElementById('profAd') ? document.getElementById('profAd').value : undefined,
        soyad: document.getElementById('profSoyad') ? document.getElementById('profSoyad').value : undefined,
        biyografi: document.getElementById('profBiyo') ? document.getElementById('profBiyo').value : undefined,
        unvan: document.getElementById('profUnvan') ? document.getElementById('profUnvan').value : undefined,
        iban_no: document.getElementById('profIban') ? document.getElementById('profIban').value : undefined,
    };

    try {
        const res = await fetch('/api/profil/guncelle', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            },
            body: JSON.stringify(guncelVeriler)
        });

        const veri = await res.json();

        if (res.ok) {
            alert("Profiliniz başarıyla güncellendi!");
            modalKapat('profilModal');
            arayuzuGuncelle(); // İsim değişmişse arayüze yansısın
        } else {
            alert("Güncelleme Hatası: " + (veri.hata || "Bilinmeyen bir hata oluştu."));
        }
    } catch (err) {
        console.error("Profil Kaydetme Hatası:", err);
        alert("Sunucuya bağlanılamadı.");
    }
}

// Profil formunun (varsa) submit olayını dinle
if(document.getElementById('profilFormu')) {
    document.getElementById('profilFormu').onsubmit = profilKaydet;
}
// BAŞLAT
kategorileriYukle();
arayuzuGuncelle();
