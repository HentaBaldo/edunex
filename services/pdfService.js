/**
 * EduNex - Sipariş Dekontu (PDF) üreteci.
 *
 * Tasarım, admin panelindeki "Sipariş Detayı" modalının yapısını birebir
 * yansıtır: üst başlık, 3 sütunlu üst bilgi ızgarası, sipariş kalemleri
 * tablosu ve ödeme işlemleri logları.
 *
 * Fontlar `services/certificateService` ile aynı klasörden okunur — orada
 * uygulama açılışında Montserrat indiriliyor. Font bulunamazsa pdfkit'in
 * gömülü Helvetica ailesine düşeriz (Türkçe karakterler bozulmaz çünkü
 * pdfkit Helvetica'da WinAnsi/Latin-1 desteğine sahiptir; ama kalite
 * düşer). Bu sebeple aşağıdaki API, font path'ini dışarıdan da alabilir.
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// ---------- Sabitler ----------

const DEFAULT_FONTS_DIR = path.join(__dirname, '..', 'fonts');
const COLORS = {
    primary:   '#1e3a8a', // EduNex laciverti
    accent:    '#c9a84c', // Altın vurgu
    text:      '#0f172a',
    muted:     '#64748b',
    border:    '#e2e8f0',
    rowAlt:    '#f8fafc',
    success:   '#059669',
    danger:    '#ef4444',
};

// ---------- Font Yönetimi ----------

/**
 * Verilen dizinde Montserrat-Regular/Bold .ttf var mı kontrol eder ve
 * pdfkit dokümanına kaydeder. Yoksa Helvetica fallback'ine düşer.
 *
 * @param {PDFKit.PDFDocument} doc
 * @param {string} fontsDir - .ttf dosyalarının bulunduğu klasör.
 * @returns {{R:string,B:string}} Doküman üzerinde `doc.font(R/B)` ile kullanılacak isimler.
 */
function _registerFonts(doc, fontsDir) {
    const regPath  = path.join(fontsDir, 'Montserrat-Regular.ttf');
    const boldPath = path.join(fontsDir, 'Montserrat-Bold.ttf');

    const hasCustom = fs.existsSync(regPath) && fs.existsSync(boldPath);
    if (!hasCustom) {
        return { R: 'Helvetica', B: 'Helvetica-Bold' };
    }
    doc.registerFont('Montserrat-Regular', regPath);
    doc.registerFont('Montserrat-Bold',    boldPath);
    return { R: 'Montserrat-Regular', B: 'Montserrat-Bold' };
}

// ---------- Yardımcı Biçimleyiciler ----------

const _safe = (v, fallback = '-') => {
    if (v === null || v === undefined || v === '') return fallback;
    return String(v);
};

const _fmtTRY = (val) => {
    const n = Number(val || 0);
    return n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
};

const _fmtDateTime = (iso) => {
    if (!iso) return '-';
    try {
        return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
        return String(iso);
    }
};

const _statusLabel = (durum) => {
    switch (String(durum || '').toLowerCase()) {
        case 'tamamlandi':  return 'TAMAMLANDI';
        case 'beklemede':   return 'BEKLEMEDE';
        case 'basarisiz':   return 'BAŞARISIZ';
        case 'iade_edildi': return 'İADE EDİLDİ';
        default:            return _safe(durum, '-').toUpperCase();
    }
};

const _statusColor = (durum) => {
    switch (String(durum || '').toLowerCase()) {
        case 'tamamlandi':  return COLORS.success;
        case 'iade_edildi': return COLORS.muted;
        case 'basarisiz':   return COLORS.danger;
        default:            return COLORS.muted;
    }
};

// ---------- Çizim Yardımcıları ----------

/**
 * Bir "etiket + değer" hücresi çizer. Admin modaldaki .cell yapısını taklit eder.
 */
function _drawMetaCell(doc, R, B, { x, y, w, label, value, valueColor }) {
    doc.font(R).fontSize(8).fillColor(COLORS.muted)
        .text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.5 });

    doc.font(B).fontSize(10).fillColor(valueColor || COLORS.text)
        .text(value, x, y + 12, { width: w, ellipsis: true, height: 26 });
}

/**
 * Sayfa üstüne başlık + kurumsal şerit çizer.
 */
function _drawHeader(doc, R, B) {
    const left  = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    // Marka şeridi
    doc.rect(0, 0, doc.page.width, 6).fill(COLORS.primary);

    // EduNex marka adı (sağ üst)
    doc.font(B).fontSize(16).fillColor(COLORS.primary)
        .text('EduNex', left, 30, { width: right - left, align: 'right' });
    doc.font(R).fontSize(9).fillColor(COLORS.muted)
        .text('Online Eğitim Platformu', left, 50, { width: right - left, align: 'right' });

    // Başlık
    doc.font(B).fontSize(22).fillColor(COLORS.text)
        .text('Sipariş Dekontu', left, 30);
    doc.font(R).fontSize(9).fillColor(COLORS.muted)
        .text('Bu belge bir ödeme makbuzudur ve resmi fatura yerine geçmez.', left, 56);

    // Ayraç çizgisi
    doc.moveTo(left, 80).lineTo(right, 80).lineWidth(0.5).strokeColor(COLORS.border).stroke();

    return 92; // bir sonraki bölümün başlayabileceği Y
}

/**
 * Üst bilgi ızgarası — Admin modalındaki 8 cell'i 3 sütuna böler.
 */
function _drawMetaGrid(doc, R, B, order, startY) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    const profile = order.Profile || {};
    const ogrenciAdSoyad = [profile.ad, profile.soyad].filter(Boolean).join(' ').trim() || 'Silinmiş kullanıcı';
    const ogrenciEposta  = _safe(profile.eposta, '-');

    // 3 sütun
    const totalW = right - left;
    const gap = 14;
    const colW = (totalW - gap * 2) / 3;
    const rowH = 44;

    const cells = [
        // Sütun 1 — Sipariş
        { col: 0, row: 0, label: 'Sipariş No',          value: _safe(order.id) },
        { col: 0, row: 1, label: 'Tutar',                value: _fmtTRY(order.toplam_tutar) },
        { col: 0, row: 2, label: 'İyzico Payment ID',    value: _safe(order.islem_id, '-') },

        // Sütun 2 — Müşteri
        { col: 1, row: 0, label: 'Tarih',                value: _fmtDateTime(order.olusturulma_tarihi) },
        { col: 1, row: 1, label: 'Öğrenci',              value: `${ogrenciAdSoyad}\n${ogrenciEposta}` },
        { col: 1, row: 2, label: 'Conversation ID',      value: _safe(order.conversation_id, '-') },

        // Sütun 3 — Ödeme
        { col: 2, row: 0, label: 'Durum',                value: _statusLabel(order.durum), valueColor: _statusColor(order.durum) },
        { col: 2, row: 1, label: 'Sağlayıcı',            value: _safe(order.saglayici, 'iyzico') },
        { col: 2, row: 2, label: 'Para Birimi',          value: _safe(order.para_birimi, 'TRY') },
    ];

    for (const c of cells) {
        const x = left + c.col * (colW + gap);
        const y = startY + c.row * rowH;
        _drawMetaCell(doc, R, B, { x, y, w: colW, label: c.label, value: c.value, valueColor: c.valueColor });
    }

    return startY + rowH * 3 + 4;
}

/**
 * Sipariş kalemleri tablosu (ince yatay çizgili).
 */
function _drawItemsTable(doc, R, B, order, startY) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const items = Array.isArray(order.OrderItems) ? order.OrderItems : [];

    // Bölüm başlığı
    doc.font(B).fontSize(12).fillColor(COLORS.text)
        .text(`Sipariş Kalemleri (${items.length})`, left, startY);
    let y = startY + 20;

    // Başlık satırı
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.8).strokeColor(COLORS.text).stroke();
    y += 6;
    doc.font(B).fontSize(9).fillColor(COLORS.muted)
        .text('KURS', left, y, { width: (right - left) * 0.65 })
        .text('TUTAR', left, y, { width: right - left, align: 'right' });
    y += 14;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(COLORS.border).stroke();
    y += 6;

    if (items.length === 0) {
        doc.font(R).fontSize(10).fillColor(COLORS.muted)
            .text('Bu siparişe ait kalem bulunamadı.', left, y);
        return y + 18;
    }

    items.forEach((it) => {
        // Sayfa sonu kontrolü
        if (y > doc.page.height - doc.page.margins.bottom - 120) {
            doc.addPage();
            y = doc.page.margins.top;
        }

        const baslik = _safe(it.Course?.baslik, 'Silinmiş kurs');
        doc.font(R).fontSize(10).fillColor(COLORS.text)
            .text(baslik, left, y, { width: (right - left) * 0.65, ellipsis: true });
        doc.font(B).fontSize(10).fillColor(COLORS.text)
            .text(_fmtTRY(it.odenen_fiyat), left, y, { width: right - left, align: 'right' });

        y += 18;
        doc.moveTo(left, y).lineTo(right, y).lineWidth(0.3).strokeColor(COLORS.border).stroke();
        y += 4;
    });

    // Toplam satırı
    y += 6;
    doc.font(B).fontSize(11).fillColor(COLORS.text)
        .text('Genel Toplam', left, y, { width: (right - left) * 0.65 })
        .text(_fmtTRY(order.toplam_tutar), left, y, { width: right - left, align: 'right' });

    return y + 22;
}

/**
 * Ödeme işlemleri (loglar): initialize / retrieve / callback / refund.
 */
function _drawPaymentTransactions(doc, R, B, order, startY) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const txs = Array.isArray(order.PaymentTransactions) ? order.PaymentTransactions : [];

    doc.font(B).fontSize(12).fillColor(COLORS.text)
        .text(`Ödeme İşlemleri (${txs.length})`, left, startY);
    let y = startY + 20;

    if (txs.length === 0) {
        doc.font(R).fontSize(10).fillColor(COLORS.muted)
            .text('Bu sipariş için kayıtlı ödeme adımı bulunamadı.', left, y);
        return y + 16;
    }

    txs.forEach((tx) => {
        if (y > doc.page.height - doc.page.margins.bottom - 70) {
            doc.addPage();
            y = doc.page.margins.top;
        }

        // Satır arkaplanı
        doc.rect(left, y, right - left, 42).fill(COLORS.rowAlt);

        const success = String(tx.durum || '').toLowerCase().includes('success');
        const headerColor = success ? COLORS.success : COLORS.text;

        doc.font(B).fontSize(10).fillColor(headerColor)
            .text(`${_safe(tx.islem_tipi)} · ${_safe(tx.saglayici, 'iyzico')}`, left + 8, y + 6);

        doc.font(R).fontSize(9).fillColor(COLORS.muted)
            .text(`Tarih: ${_fmtDateTime(tx.olusturulma_tarihi)}`, left + 8, y + 22);

        const rightBlockX = left + (right - left) / 2;
        doc.font(R).fontSize(9).fillColor(COLORS.text)
            .text(`Payment ID: ${_safe(tx.payment_id, '-')}`, rightBlockX, y + 6, { width: right - rightBlockX - 8 });
        doc.font(R).fontSize(9).fillColor(success ? COLORS.success : COLORS.danger)
            .text(`Durum: ${_safe(tx.durum, '-')}`, rightBlockX, y + 22, { width: right - rightBlockX - 8 });

        y += 48;
    });

    return y;
}

/**
 * Sayfa altı bilgilendirme şeridi.
 */
function _drawFooter(doc, R) {
    const left  = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const y = doc.page.height - doc.page.margins.bottom + 10;

    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(COLORS.border).stroke();
    doc.font(R).fontSize(8).fillColor(COLORS.muted)
        .text(
            'EduNex Online Eğitim Platformu · destek@edunex.com · Bu belge elektronik olarak üretilmiştir.',
            left, y + 6, { width: right - left, align: 'center' }
        );
}

// ---------- Ana API ----------

/**
 * Sipariş verisinden PDF üretir ve verilen yazılabilir stream'e pipe'lar.
 * Controller bunu `res.pipe(...)` ile istemciye dosya olarak indirtir.
 *
 * @param {object} options
 * @param {object} options.order - Sequelize Order instance (Profile + OrderItems[Course] + PaymentTransactions include edilmiş).
 * @param {NodeJS.WritableStream} options.output - PDF'in yazılacağı stream (örn: Express res).
 * @param {string} [options.fontsDir] - Montserrat .ttf'lerinin bulunduğu klasör. Vermezsen ../fonts kullanılır.
 */
function streamOrderReceiptPdf({ order, output, fontsDir } = {}) {
    if (!order) throw new Error('streamOrderReceiptPdf: order zorunlu.');
    if (!output || typeof output.write !== 'function') {
        throw new Error('streamOrderReceiptPdf: output yazılabilir bir stream olmalı.');
    }

    const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: {
            Title: `EduNex Dekont - ${_safe(order.id)}`,
            Author: 'EduNex',
            Subject: 'Sipariş Dekontu',
        },
    });

    const { R, B } = _registerFonts(doc, fontsDir || DEFAULT_FONTS_DIR);

    doc.pipe(output);

    let cursorY = _drawHeader(doc, R, B);
    cursorY = _drawMetaGrid(doc, R, B, order, cursorY + 4) + 18;
    cursorY = _drawItemsTable(doc, R, B, order, cursorY) + 14;
    cursorY = _drawPaymentTransactions(doc, R, B, order, cursorY);
    _drawFooter(doc, R);

    doc.end();
    return doc;
}

// ──────────────────────────────────────────────────────────────
// EĞİTMEN HAK EDİŞ DEKONTU (Marketplace Payout Receipt)
// ──────────────────────────────────────────────────────────────
//
// Pazaryeri (marketplace) standardına göre eğitmenin kendi cirosu için
// üretilen finansal dekont. Müşteri bilgisi KVKK gereği maskelenir:
// "Ahmet Y." gibi, ve e-posta gizlenir. Eğitmen kim olduğunu görmek için
// kendi admin/satış paneline bakar — dekont yasal belge niteliğindedir.

/**
 * Müşteri adını KVKK uyumlu maskeler: 'Ahmet Yılmaz' -> 'Ahmet Y.'
 * Eposta maskelemesi: 'ahmet.yilmaz@x.com' -> 'a***@x.com'
 */
function _maskCustomer(profile) {
    if (!profile) return { ad: '—', eposta: '—' };
    const ad = _safe(profile.ad, '').trim();
    const soyad = _safe(profile.soyad, '').trim();
    const adFmt = ad + (soyad ? ` ${soyad.charAt(0).toUpperCase()}.` : '');

    const ep = _safe(profile.eposta, '').trim();
    let epFmt = '—';
    if (ep && ep.includes('@')) {
        const [u, d] = ep.split('@');
        epFmt = (u.charAt(0) || '?') + '***@' + d;
    }
    return { ad: adFmt || '—', eposta: epFmt };
}

function _maskIban(iban) {
    if (!iban) return '— (IBAN tanımlı değil)';
    const cleaned = String(iban).replace(/\s+/g, '');
    if (cleaned.length < 8) return cleaned;
    return cleaned.slice(0, 6) + ' **** **** **** ' + cleaned.slice(-4);
}

/**
 * Hak ediş dekontunun finansal tablosunu çizer.
 *
 * @param {object} fin
 * @param {number} fin.brut          - Brüt satış fiyatı (TRY)
 * @param {number} fin.iyzicoFee     - İyzico kesintisi (genellikle 0 — açıklamayla)
 * @param {number} fin.platformFee   - EduNex platform komisyonu
 * @param {number} fin.komisyonOrani - Yüzde (örn 30)
 * @param {number} fin.net           - Eğitmenin net hak edişi
 */
function _drawPayoutFinanceTable(doc, R, B, fin, startY) {
    const left  = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const tableW = right - left;
    const labelW = tableW * 0.66;

    doc.font(B).fontSize(12).fillColor(COLORS.text)
        .text('Finansal Döküm', left, startY);
    let y = startY + 22;

    const rows = [
        { label: 'Brüt Satış Fiyatı',                       value: fin.brut,        sign: '+' },
        { label: 'İyzico İşlem Komisyonu',                  value: fin.iyzicoFee,   sign: '-', note: 'Platform tarafından karşılanmaktadır.' },
        { label: `EduNex Platform Komisyonu (%${Number(fin.komisyonOrani || 0).toFixed(2)})`, value: fin.platformFee, sign: '-' },
    ];

    // Üst çerçeve
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.8).strokeColor(COLORS.text).stroke();
    y += 8;

    rows.forEach((r) => {
        const amount = Number(r.value || 0);
        const text   = (r.sign === '-' ? '- ' : '') + _fmtTRY(Math.abs(amount));

        doc.font(R).fontSize(10).fillColor(COLORS.text)
            .text(r.label, left + 4, y, { width: labelW - 8 });

        const valueColor = r.sign === '-' ? COLORS.danger : COLORS.text;
        doc.font(B).fontSize(10).fillColor(valueColor)
            .text(text, left, y, { width: tableW - 4, align: 'right' });

        y += 16;

        if (r.note) {
            doc.font(R).fontSize(8).fillColor(COLORS.muted)
                .text(r.note, left + 4, y, { width: labelW - 8 });
            y += 12;
        }

        doc.moveTo(left, y).lineTo(right, y).lineWidth(0.25).strokeColor(COLORS.border).stroke();
        y += 6;
    });

    // Net hak ediş satırı — vurgulu kart
    y += 4;
    doc.rect(left, y, tableW, 36).fill(COLORS.primary);
    doc.font(B).fontSize(11).fillColor('#ffffff')
        .text('Net Hak Ediş (Kazancınız)', left + 12, y + 12, { width: labelW - 12 });
    doc.font(B).fontSize(14).fillColor('#ffffff')
        .text(_fmtTRY(fin.net), left, y + 9, { width: tableW - 12, align: 'right' });

    return y + 44;
}

/**
 * Eğitmen meta bilgisi paneli (sol blok) + öğrenci/sipariş bilgisi (sağ blok, maskelenmiş).
 */
function _drawInstructorMeta(doc, R, B, { instructor, order, iban, durumLabel }, startY) {
    const left  = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const totalW = right - left;
    const colW = (totalW - 14) / 2;

    const masked = _maskCustomer(order.Profile);
    const adSoyad = [instructor?.ad, instructor?.soyad].filter(Boolean).join(' ').trim() || '—';

    // Sol — Hak Sahibi (Eğitmen)
    _drawMetaCell(doc, R, B, { x: left, y: startY, w: colW, label: 'Hak Sahibi (Eğitmen)', value: adSoyad });
    _drawMetaCell(doc, R, B, { x: left, y: startY + 36, w: colW, label: 'IBAN',  value: _maskIban(iban) });
    _drawMetaCell(doc, R, B, { x: left, y: startY + 72, w: colW, label: 'Hak Ediş Durumu', value: durumLabel });

    // Sağ — Satış Bilgisi (Sipariş + Maskelenmiş Müşteri)
    const x2 = left + colW + 14;
    _drawMetaCell(doc, R, B, { x: x2, y: startY,      w: colW, label: 'Sipariş No', value: _safe(order.id) });
    _drawMetaCell(doc, R, B, { x: x2, y: startY + 36, w: colW, label: 'Satış Tarihi', value: _fmtDateTime(order.olusturulma_tarihi) });
    _drawMetaCell(doc, R, B, { x: x2, y: startY + 72, w: colW, label: 'Müşteri',     value: `${masked.ad}\n${masked.eposta}` });

    return startY + 108;
}

/**
 * Eğitmenin satın alınan kursları (yalnızca KENDİ kursları) — tek tek listele.
 */
function _drawSoldCourses(doc, R, B, items, startY) {
    const left  = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    doc.font(B).fontSize(12).fillColor(COLORS.text)
        .text('Satılan Kurs(lar)', left, startY);
    let y = startY + 20;

    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.4).strokeColor(COLORS.border).stroke();
    y += 6;

    if (!items.length) {
        doc.font(R).fontSize(10).fillColor(COLORS.muted)
            .text('Bu dekonta dahil kurs bulunamadı.', left, y);
        return y + 16;
    }

    items.forEach((it) => {
        if (y > doc.page.height - doc.page.margins.bottom - 200) {
            doc.addPage();
            y = doc.page.margins.top;
        }
        doc.font(R).fontSize(10).fillColor(COLORS.text)
            .text(_safe(it.title), left, y, { width: (right - left) * 0.65, ellipsis: true });
        doc.font(B).fontSize(10).fillColor(COLORS.text)
            .text(_fmtTRY(it.brut), left, y, { width: right - left, align: 'right' });
        y += 16;
        doc.moveTo(left, y).lineTo(right, y).lineWidth(0.25).strokeColor(COLORS.border).stroke();
        y += 4;
    });

    return y + 6;
}

/**
 * Eğitmen Hak Ediş Dekontu PDF'ini üretir ve verilen stream'e pipe'lar.
 *
 * @param {object} options
 * @param {object} options.order              - Order instance (Profile + filtered OrderItems[Course])
 * @param {object} options.instructorProfile  - { id, ad, soyad, eposta }
 * @param {string} [options.iban]             - Eğitmenin maskelenmemiş IBAN'ı (PDF içinde maskelenir)
 * @param {Array}  options.earnings           - InstructorEarning satırları (siparis_kalemi_id eşli)
 * @param {NodeJS.WritableStream} options.output
 * @param {string} [options.fontsDir]
 */
function streamInstructorPayoutPdf({ order, instructorProfile, iban, earnings, output, fontsDir } = {}) {
    if (!order) throw new Error('streamInstructorPayoutPdf: order zorunlu.');
    if (!output || typeof output.write !== 'function') {
        throw new Error('streamInstructorPayoutPdf: output yazılabilir bir stream olmalı.');
    }

    // Yalnızca bu eğitmenin kurslarına ait kalemler — controller filtrelemiş olsa da
    // burada da bir kez daha emin oluyoruz (defense in depth).
    const myItems = (order.OrderItems || []).filter(
        (it) => it.Course && it.Course.egitmen_id === instructorProfile?.id
    );

    // Finansal toplamlar — InstructorEarning kayıtlarından (gerçek kayıt) hesaplanır.
    // Earning yoksa OrderItem.odenen_fiyat'tan tahmini bir hesap çıkarılır.
    const earningsByItem = new Map();
    (earnings || []).forEach((e) => {
        if (e.siparis_kalemi_id) earningsByItem.set(e.siparis_kalemi_id, e);
    });

    let totalBrut = 0, totalPlatformFee = 0, totalNet = 0;
    let oranSample = 0;
    const itemRows = myItems.map((it) => {
        const e = earningsByItem.get(it.id);
        const brut = Number(it.odenen_fiyat || 0);
        const platformFee = e ? Number(e.platform_kesintisi || 0) : 0;
        const net = e ? Number(e.net_tutar || 0) : brut; // earning yoksa net=brut görünür (uyarı dipnotu eklenir)
        totalBrut += brut;
        totalPlatformFee += platformFee;
        totalNet += net;
        if (e && e.komisyon_orani) oranSample = Number(e.komisyon_orani);
        return { title: it.Course?.baslik || 'Silinmiş kurs', brut };
    });

    const fin = {
        brut: totalBrut,
        iyzicoFee: 0, // Pazaryeri sözleşmesinde gateway bedeli platform tarafından karşılanır.
        platformFee: totalPlatformFee,
        komisyonOrani: oranSample,
        net: totalNet,
    };

    // Hak ediş durumu — en az bir earning kaydı 'paid' ise ödenmiş, değilse pending durumunu yansıt.
    const allDurums = (earnings || []).map((e) => e.durum);
    let durumLabel = 'Hesaplanıyor';
    if (allDurums.length) {
        if (allDurums.every((d) => d === 'paid'))            durumLabel = 'ÖDENDİ';
        else if (allDurums.some((d) => d === 'cancelled'))   durumLabel = 'İPTAL EDİLDİ';
        else if (allDurums.every((d) => d === 'available'))  durumLabel = 'ÖDEME BEKLİYOR';
        else if (allDurums.some((d) => d === 'pending'))     durumLabel = 'İADE PENCERESİNDE (T+14)';
        else                                                 durumLabel = 'İŞLEMDE';
    }

    const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: {
            Title: `EduNex Hak Edis Dekontu - ${_safe(order.id)}`,
            Author: 'EduNex',
            Subject: 'Egitmen Hak Edis Dekontu',
        },
    });

    const { R, B } = _registerFonts(doc, fontsDir || DEFAULT_FONTS_DIR);
    doc.pipe(output);

    // --- Header ---
    const left  = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    doc.rect(0, 0, doc.page.width, 6).fill(COLORS.primary);
    doc.font(B).fontSize(16).fillColor(COLORS.primary)
        .text('EduNex', left, 30, { width: right - left, align: 'right' });
    doc.font(R).fontSize(9).fillColor(COLORS.muted)
        .text('Pazaryeri / Marketplace', left, 50, { width: right - left, align: 'right' });
    doc.font(B).fontSize(22).fillColor(COLORS.text)
        .text('Hak Ediş Dekontu', left, 30);
    doc.font(R).fontSize(9).fillColor(COLORS.muted)
        .text('Bu belge, EduNex Pazaryeri sözleşmesi kapsamında üretilen finansal döküm dekontudur.', left, 56);
    doc.moveTo(left, 80).lineTo(right, 80).lineWidth(0.5).strokeColor(COLORS.border).stroke();

    let cursorY = 96;
    cursorY = _drawInstructorMeta(doc, R, B, { instructor: instructorProfile, order, iban, durumLabel }, cursorY) + 16;
    cursorY = _drawSoldCourses(doc, R, B, itemRows, cursorY) + 14;
    cursorY = _drawPayoutFinanceTable(doc, R, B, fin, cursorY) + 14;

    // Pazaryeri / KVKK / yasal bilgi notu
    if (cursorY < doc.page.height - doc.page.margins.bottom - 80) {
        doc.font(R).fontSize(8).fillColor(COLORS.muted)
            .text(
                'Açıklamalar:\n' +
                '• İyzico işlem komisyonu, EduNex tarafından platform komisyonu içinden karşılanır; eğitmenden ek kesinti yapılmaz.\n' +
                '• Müşteri kimlik bilgileri KVKK gereği yalnızca tanımlayıcı düzeyde gösterilmiştir.\n' +
                '• Net hak ediş tutarı, sipariş tarihinden itibaren 14 günlük iade penceresi kapandıktan sonra ödemeye uygun (available) duruma geçer.\n' +
                '• Bu dekont resmi fatura yerine geçmez; vergi yükümlülüğünüz için kendi mali müşavirinize danışın.',
                left, cursorY, { width: right - left, align: 'left', lineGap: 2 }
            );
    }

    _drawFooter(doc, R);
    doc.end();
    return doc;
}

module.exports = {
    streamOrderReceiptPdf,
    streamInstructorPayoutPdf,
};
