const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const FONTS_DIR = path.join(__dirname, '../fonts');

// Google Fonts Montserrat TTF (Stabil raw linkler)
// Orijinal tasarımcının deposundan, güvenilir jsDelivr CDN linkleri
const FONT_URLS = {
    'Montserrat-Regular': 'https://cdn.jsdelivr.net/gh/JulietaUla/Montserrat@master/fonts/ttf/Montserrat-Regular.ttf',
    'Montserrat-Bold':    'https://cdn.jsdelivr.net/gh/JulietaUla/Montserrat@master/fonts/ttf/Montserrat-Bold.ttf',
};

let _fontsPromise = null;

/**
 * Fontların yerel klasörde olup olmadığını kontrol eder, yoksa indirir.
 */
const ensureFonts = async () => {
    if (!fs.existsSync(FONTS_DIR)) {
        fs.mkdirSync(FONTS_DIR, { recursive: true });
    }

    await Promise.all(
        Object.entries(FONT_URLS).map(async ([name, url]) => {
            const dest = path.join(FONTS_DIR, `${name}.ttf`);
            if (fs.existsSync(dest)) return;
            try {
                console.log(`[CERT SERVICE] Font indiriliyor: ${name}`);
                const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
                fs.writeFileSync(dest, Buffer.from(res.data));
                console.log(`[CERT SERVICE] Font hazır: ${name}`);
            } catch (err) {
                console.warn(`[CERT SERVICE] Font indirilemedi (${name}): ${err.message}. Helvetica kullanılacak.`);
            }
        })
    );
};

const getFontsReady = () => {
    if (!_fontsPromise) _fontsPromise = ensureFonts();
    return _fontsPromise;
};

const fontFile = (name) => path.join(FONTS_DIR, `${name}.ttf`);
const fontsReady = () => {
    return fs.existsSync(fontFile('Montserrat-Regular')) && fs.existsSync(fontFile('Montserrat-Bold'));
};
/**
 * Sertifika Tasarımı (Çökmeye Karşı Güvenli & Doğru Değişken İsimleri)
 */
const _drawCertificate = (doc, data, R, B) => {
    // Veritabanından gelen doğru değişken isimleri (ad, kursBaslik, sertifika_kodu)
    const ogrenciAd = data?.ad ? String(data.ad) : 'İsimsiz Öğrenci';
    const kursAd = data?.kursBaslik ? String(data.kursBaslik) : 'İsimsiz Kurs';
    const tarih = data?.tarih ? String(data.tarih) : new Date().toLocaleDateString('tr-TR');
    const sertifikaNo = data?.sertifika_kodu ? String(data.sertifika_kodu) : 'EDU-00000000';

    // Arka Plan Beyaz
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#fff');

    // Dış Lacivert Çerçeve
    doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40)
       .lineWidth(8)
       .stroke('#1e3a8a');

    // İç Altın Şerit
    doc.rect(35, 35, doc.page.width - 70, doc.page.height - 70)
       .lineWidth(1.5)
       .stroke('#c9a84c');

    // Üst Başlık (EduNex)
    doc.font(B).fontSize(38).fillColor('#1e3a8a').text('EDUNEX ACADEMY', { align: 'center', y: 80 });
    
    doc.moveDown(0.5);
    doc.font(R).fontSize(14).fillColor('#64748b').text('EĞİTİM BAŞARI SERTİFİKASI', { align: 'center', characterSpacing: 2 });

    // Orta Metin
    doc.moveDown(2.5);
    doc.font(R).fontSize(16).fillColor('#000').text('Bu belge, aşağıdaki kursu başarıyla tamamlayan', { align: 'center' });

    // Öğrenci Adı (Artık kendi adın gelecek!)
    doc.moveDown(1);
    doc.font(B).fontSize(34).fillColor('#1e3a8a').text(ogrenciAd.toUpperCase(), { align: 'center' });

    // Kurs Bilgisi (Artık gerçek kurs adı gelecek!)
    doc.moveDown(1);
    doc.font(R).fontSize(16).fillColor('#000').text('adlı öğrenciye,', { align: 'center' });
    doc.moveDown(0.5);
    doc.font(B).fontSize(20).fillColor('#c9a84c').text(`"${kursAd}"`, { align: 'center' });
    doc.moveDown(0.5);
    doc.font(R).fontSize(16).fillColor('#000').text('eğitimini bitirdiği için takdim edilmiştir.', { align: 'center' });

    // Alt Bilgiler ve İmza
    const bottomY = 440;
    
    // Sol: Tarih ve Gerçek Sertifika No
    doc.font(R).fontSize(11).fillColor('#94a3b8').text(`Tarih: ${tarih}`, 80, bottomY);
    doc.text(`Sertifika No: ${sertifikaNo}`, 80, bottomY + 18);

    // Sağ: İmza Alanı
    doc.font(B).fontSize(14).fillColor('#1e3a8a').text('EduNex Direktörü', 580, bottomY);
    doc.font(R).fontSize(12).fillColor('#000').text('Hasan Talha Keskin', 580, bottomY + 18);

    // Dekoratif Mühür (Sol Alt)
    doc.circle(80, 100, 30).lineWidth(1).stroke('#c9a84c');
};
/**
 * PDF Üretip Buffer Döndürür (Bunny.net Upload İçin)
 */
const generateCertificatePdf = async (data) => {
    await getFontsReady();
    const useFont = fontsReady();
    const R = useFont ? 'Montserrat-Regular' : 'Helvetica';
    const B = useFont ? 'Montserrat-Bold' : 'Helvetica-Bold';

    return new Promise((resolve, reject) => {
        const chunks = [];
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });

        if (useFont) {
            doc.registerFont('Montserrat-Regular', fontFile('Montserrat-Regular'));
            doc.registerFont('Montserrat-Bold',    fontFile('Montserrat-Bold'));
        }

        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        _drawCertificate(doc, data, R, B);
        doc.end();
    });
};

/**
 * PDF → Stream (Fallback/Önizleme İçin)
 */
const renderCertificatePdfToStream = async (output, data) => {
    await getFontsReady();
    const useFont = fontsReady();
    const R = useFont ? 'Montserrat-Regular' : 'Helvetica';
    const B = useFont ? 'Montserrat-Bold' : 'Helvetica-Bold';

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });

    if (useFont) {
        doc.registerFont('Montserrat-Regular', fontFile('Montserrat-Regular'));
        doc.registerFont('Montserrat-Bold',    fontFile('Montserrat-Bold'));
    }

    doc.pipe(output);
    _drawCertificate(doc, data, R, B);
    doc.end();
};

module.exports = {
    generateCertificatePdf,
    renderCertificatePdfToStream,
    getFontsReady
};