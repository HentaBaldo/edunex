document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('edunex_token');
    if (!token) {
        window.location.href = '/auth/index.html';
        return;
    }
    await loadCertificates();
});

async function loadCertificates() {
    const grid = document.getElementById('certGrid');
    try {
        const res = await ApiService.get('/certificates/my');
        const list = res.data || [];

        document.getElementById('certCount').textContent = list.length;

        if (list.length === 0) {
            grid.innerHTML = `
                <div class="cert-empty" style="grid-column:1/-1;">
                    <i class="fas fa-certificate"></i>
                    <h3 style="color:#475569; margin-bottom:8px;">Henüz sertifikan yok</h3>
                    <p>Bir kursu %100 tamamladığında sertifikan burada görünür.</p>
                    <a href="/student/dashboard.html" style="display:inline-block;margin-top:16px;padding:10px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
                        <i class="fas fa-book-open"></i> Kurslarıma Git
                    </a>
                </div>`;
            return;
        }

        grid.innerHTML = list.map(c => {
            const tarih = new Date(c.verilis_tarihi).toLocaleDateString('tr-TR', { day:'2-digit', month:'long', year:'numeric' });
            const thumb = c.kurs?.kapak_fotografi
                ? `<img src="${escHtml(c.kurs.kapak_fotografi)}" alt="">`
                : `<i class="fas fa-graduation-cap cert-icon"></i>`;
            const pdfHref = c.pdf_link || '#';

            return `
                <div class="cert-card">
                    <div class="cert-card-thumb">${thumb}</div>
                    <div class="cert-card-body">
                        <h3>${escHtml(c.kurs?.baslik || 'Kurs')}</h3>
                        <p class="cert-date"><i class="fas fa-calendar-check"></i> ${tarih}</p>
                        <p class="cert-code"><i class="fas fa-fingerprint"></i> ${escHtml(c.sertifika_kodu)}</p>
                        <a href="${escHtml(pdfHref)}" target="_blank" class="btn-cert">
                            <i class="fas fa-file-pdf"></i> PDF Olarak Görüntüle / İndir
                        </a>
                    </div>
                </div>`;
        }).join('');

    } catch (err) {
        grid.innerHTML = `
            <div class="cert-empty" style="grid-column:1/-1;">
                <i class="fas fa-exclamation-triangle" style="color:#ef4444;"></i>
                <p>Sertifikalar yüklenemedi: ${escHtml(err.message)}</p>
            </div>`;
    }
}

function escHtml(t) {
    if (!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}
