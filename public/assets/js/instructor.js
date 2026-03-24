let seciliKursId = null;
let suAnkiSeciliBolumId = null;

// ==========================================
// KURS EKLEME VE ÖNİZLEME
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
    const gorselInput = document.getElementById('k_gorsel');
    const prevImg = document.getElementById('prev_img');
    if(prevImg && gorselInput) {
        if(gorselInput.value) { 
            prevImg.style.backgroundImage = `url('${gorselInput.value}')`; 
            prevImg.style.backgroundSize = 'cover'; 
        } else { 
            prevImg.style.backgroundImage = 'none'; 
        }
    }
}

const kursEkleFormu = document.getElementById('kursEkleFormu');
if(kursEkleFormu){
    kursEkleFormu.onsubmit = async (e) => {
        e.preventDefault();
        const k_kategori_id = document.getElementById('k_kategori_id').value;
        if (!k_kategori_id) { alert("Lütfen bir kategori seçin!"); return; }

        const yeniKurs = {
            baslik: document.getElementById('k_baslik').value,
            alt_baslik: document.getElementById('k_kisa_aciklama') ? document.getElementById('k_kisa_aciklama').value : "",
            aciklama: document.getElementById('k_detay_aciklama').value,
            seviye: document.getElementById('k_seviye').value,
            kategori_id: k_kategori_id,
            fiyat: parseFloat(document.getElementById('k_fiyat').value) || 0,
            kapak_fotografi_url: document.getElementById('k_gorsel').value,
            dil: 'Türkçe'
        };

        const res = await apiIstegi('/api/kurslar', 'POST', yeniKurs);
        
        if(res.ok) { 
            alert("Kurs basariyla olusturuldu!"); 
            // Taslak oluştuktan sonra ID'yi al ve bölüm listelemeye geç
            if(res.data && res.data.id) {
                seciliKursId = res.data.id;
                bolumleriListele();
            } else {
                location.reload(); 
            }
        } else { 
            alert("Hata olustu."); 
        }
    };
}

// ==========================================
// MÜFREDAT: BÖLÜM VE DERS YÖNETİMİ
// ==========================================
async function egitmenPanelKurslariniGetir() {
    const grid = document.getElementById('egitmenKurslari');
    if(!grid) return;

    const res = await apiIstegi('/api/kurslarim');
    
    if(res.ok) {
        grid.innerHTML = res.data.length > 0 ? res.data.map(k => `
            <div style="background:white; padding:20px; border-radius:15px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <div>
                    <h3 style="margin:0; font-size:16px;">${k.baslik}</h3>
                    <small style="color:#94a3b8;">${k.kategori_ad || 'Kategorisiz'} | ${k.durum ? k.durum.toUpperCase() : 'TASLAK'}</small>
                </div>
                <button class="action-btn" style="width:auto; padding:8px 20px;" onclick="kursDuzenleModaliniAc('${k.id}', '${k.baslik}')">Duzenle</button>
            </div>
        `).join('') : '<p style="text-align:center; color:#94a3b8; padding:20px;">Henüz kursunuz yok.</p>';
    }
}

async function kursDuzenleModaliniAc(kursId, kursBaslik) {
    seciliKursId = kursId;
    const baslikEleman = document.getElementById('duzenleKursBaslik');
    if(baslikEleman) baslikEleman.innerText = kursBaslik + " - Yönetim Paneli";
    
    // Eğer eski mantıkla modal üzerinden çalışmaya devam ediliyorsa modalı aç
    modalAc('kursDuzenleModal');

    // Kurs detaylarını getirip kazanım ve gereksinimleri doldurma
    const res = await apiIstegi('/api/kurslar/hepsi'); 
    if(res.ok) {
        const kurs = res.data.find(k => k.id == kursId);
        if(kurs) {
            const editKazanimlar = document.getElementById('edit_kazanimlar');
            const editGereksinimler = document.getElementById('edit_gereksinimler');
            if(editKazanimlar) editKazanimlar.value = kurs.kazanimlar || "";
            if(editGereksinimler) editGereksinimler.value = kurs.gereksinimler || "";
        }
    }
    
    bolumleriListele();
}

async function kursGenelBilgiGuncelle() {
    const veriler = {
        kazanimlar: document.getElementById('edit_kazanimlar') ? document.getElementById('edit_kazanimlar').value : "",
        gereksinimler: document.getElementById('edit_gereksinimler') ? document.getElementById('edit_gereksinimler').value : ""
    };

    const res = await apiIstegi(`/api/kurslar/${seciliKursId}/detay-guncelle`, 'PUT', veriler);

    if(res.ok) {
        alert("Kurs detaylari guncellendi!");
    } else {
        alert("Güncelleme başarısız.");
    }
}

async function bolumleriListele() {
    if(!seciliKursId) return;
    const liste = document.getElementById('bolumlerListesi');
    if(!liste) return;

    const res = await apiIstegi(`/api/kurslar/${seciliKursId}/bolumler`);
    
    if(res.ok && res.data.length > 0) {
        liste.innerHTML = res.data.map(b => `
            <div class="bolum-kart" onclick="dersleriListele(${b.id}, '${b.baslik}')" style="padding:10px; background:white; margin-bottom:10px; border-radius:8px; border:1px solid #e2e8f0; cursor:pointer;">
                <span>${b.baslik}</span>
            </div>
        `).join('');
    } else { 
        liste.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:12px;">Henüz bölüm eklenmedi.</p>'; 
    }
}

async function dersleriListele(bolumId, bolumBaslik) {
    suAnkiSeciliBolumId = bolumId;
    const dersBosMesaj = document.getElementById('dersBosMesaj');
    const dersYonetimAlani = document.getElementById('dersYonetimAlani');
    const seciliBolumAdi = document.getElementById('seciliBolumAdi');
    
    if(dersBosMesaj) dersBosMesaj.style.display = 'none';
    if(dersYonetimAlani) dersYonetimAlani.style.display = 'block';
    if(seciliBolumAdi) seciliBolumAdi.innerText = bolumBaslik + " Dersleri";
    
    const liste = document.getElementById('derslerListesi');
    if(!liste) return;

    const res = await apiIstegi(`/api/bolumler/${bolumId}/dersler`);
    
    if(res.ok && res.data.length > 0) {
        liste.innerHTML = res.data.map(d => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:#f8fafc; border-radius:6px; margin-bottom:5px;">
                <span>${d.baslik}</span>
            </div>
        `).join('');
    } else {
        liste.innerHTML = '<p style="padding:10px; color:#94a3b8;">Bu bölüm henüz boş.</p>';
    }
}

function bolumEkleModalAc() { modalAc('bolumEkleModal'); }
function dersEkleModalAc() { modalAc('dersEkleModal'); }

async function bolumKaydet() {
    const baslikInput = document.getElementById('yeniBolumBaslik');
    if(!baslikInput || !baslikInput.value) return alert("Lütfen bir bölüm başlığı girin!");

    const res = await apiIstegi('/api/bolumler/ekle', 'POST', { 
        kurs_id: seciliKursId, 
        baslik: baslikInput.value 
    });
    
    if(res.ok) {
        modalKapat('bolumEkleModal');
        baslikInput.value = ""; 
        bolumleriListele(); 
    } else {
        alert("Hata: " + (res.data.hata || "İşlem başarısız."));
    }
}

async function dersKaydet() {
    if (!suAnkiSeciliBolumId) return alert("Lütfen önce bir bölüm seçin!");

    const yeniDersBaslik = document.getElementById('yeniDersBaslik');
    const yeniDersVideo = document.getElementById('yeniDersVideo');

    if(!yeniDersBaslik || !yeniDersBaslik.value || !yeniDersVideo || !yeniDersVideo.value) {
        return alert("Başlık ve URL zorunludur!");
    }

    const data = {
        bolum_id: suAnkiSeciliBolumId,
        baslik: yeniDersBaslik.value,
        aciklama: document.getElementById('yeniDersAciklama') ? document.getElementById('yeniDersAciklama').value : "",
        icerik_tipi: document.getElementById('yeniDersTipi') ? document.getElementById('yeniDersTipi').value : "video",
        video_url: yeniDersVideo.value, 
        kaynak_url: document.getElementById('yeniDersKaynakUrl') ? document.getElementById('yeniDersKaynakUrl').value : "",
        sure: document.getElementById('yeniDersSure') ? document.getElementById('yeniDersSure').value : 0,
        onizleme_mi: document.getElementById('yeniDersOnizleme') ? document.getElementById('yeniDersOnizleme').checked : false
    };

    const res = await apiIstegi('/api/dersler/ekle', 'POST', data);

    if(res.ok) {
        alert("Ders tüm detaylarıyla müfredata eklendi!");
        modalKapat('dersEkleModal');
        const seciliBolumMetni = document.getElementById('seciliBolumAdi') ? document.getElementById('seciliBolumAdi').innerText.replace(" Dersleri", "") : "Bölüm";
        dersleriListele(suAnkiSeciliBolumId, seciliBolumMetni);
    } else {
        alert("Hata: " + (res.data.hata || "Ders kaydedilemedi."));
    }
}

// Sayfa yüklendiğinde Eğitmen panelinde kursları listele
document.addEventListener('DOMContentLoaded', () => {
    egitmenPanelKurslariniGetir();
});