async function vitrinKurslariniYukle() {
    const grid = document.getElementById('kursVitrinGrid');
    if(!grid) return;

    grid.innerHTML = '<p style="text-align:center; padding:20px;">Kurslar yükleniyor...</p>';

    const res = await apiIstegi('/api/kurslar/hepsi');
    
    if(res.ok && res.data.length > 0) {
        grid.innerHTML = res.data.map(k => `
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
}

function kursDetayGit(id) { 
    alert("Kurs detayları yakında! Kurs ID: " + id); 
}

document.addEventListener('DOMContentLoaded', vitrinKurslariniYukle);