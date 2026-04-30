const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const { Certificate, CourseEnrollment, Course, Profile } = require('../models');

const CERT_DIR = path.join(__dirname, '..', 'public', 'certificates');

if (!fs.existsSync(CERT_DIR)) {
    fs.mkdirSync(CERT_DIR, { recursive: true });
}

/**
 * PDF oluşturur ve sertifikayı DB'ye kaydeder.
 * Progress %100 olduğunda progressService tarafından çağrılır.
 * @returns {Promise<Certificate|null>}
 */
const generateCertificate = async (ogrenciId, kursId) => {
    const enrollment = await CourseEnrollment.findOne({
        where: { ogrenci_id: ogrenciId, kurs_id: kursId },
        include: [
            { model: Course, attributes: ['baslik'] },
            { model: Profile, as: 'Ogrenci', attributes: ['ad', 'soyad'] }
        ]
    });

    if (!enrollment) return null;

    const existing = await Certificate.findOne({ where: { kayit_id: enrollment.id } });
    if (existing) return existing;

    const sertifika_kodu = uuidv4();
    const dosyaAdi = `cert_${sertifika_kodu}.pdf`;
    const dosyaYolu = path.join(CERT_DIR, dosyaAdi);

    const ad = `${enrollment.Ogrenci?.ad || ''} ${enrollment.Ogrenci?.soyad || ''}`.trim() || 'Ogrenci';
    const kursBaslik = enrollment.Course?.baslik || 'Kurs';
    const tarih = new Date().toLocaleDateString('tr-TR');

    await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
        const stream = fs.createWriteStream(dosyaYolu);
        doc.pipe(stream);

        const W = doc.page.width;
        const H = doc.page.height;

        // Arka plan
        doc.rect(0, 0, W, H).fill('#f0f4ff');

        // Dış çerçeve
        doc.rect(20, 20, W - 40, H - 40).lineWidth(3).strokeColor('#1e3a8a').stroke();
        // İç çerçeve
        doc.rect(28, 28, W - 56, H - 56).lineWidth(1).strokeColor('#93c5fd').stroke();

        // Üst süsleme çizgisi
        doc.moveTo(60, 70).lineTo(W - 60, 70).lineWidth(1).strokeColor('#3b82f6').stroke();

        // Başlık
        doc.fillColor('#1e3a8a')
           .fontSize(32)
           .font('Helvetica-Bold')
           .text('BASARI SERTIFIKASI', 0, 85, { align: 'center' });

        doc.fillColor('#6b7280')
           .fontSize(13)
           .font('Helvetica')
           .text('Bu sertifika asagidaki kisinin kursu basariyla tamamladigini belgeler.', 0, 135, { align: 'center' });

        // Orta ayraç
        doc.moveTo(120, 165).lineTo(W - 120, 165).lineWidth(1).strokeColor('#d1d5db').stroke();

        // Öğrenci adı
        doc.fillColor('#111827')
           .fontSize(28)
           .font('Helvetica-Bold')
           .text(ad, 60, 180, { align: 'center', width: W - 120 });

        // Alt metin
        doc.fillColor('#374151')
           .fontSize(14)
           .font('Helvetica')
           .text('asagidaki kursu basariyla tamamlamistir:', 0, 230, { align: 'center' });

        // Kurs adı
        doc.fillColor('#1d4ed8')
           .fontSize(20)
           .font('Helvetica-Bold')
           .text(kursBaslik, 60, 265, { align: 'center', width: W - 120 });

        // Alt süsleme çizgisi
        doc.moveTo(60, 320).lineTo(W - 60, 320).lineWidth(1).strokeColor('#93c5fd').stroke();

        // Sol: tarih & kod
        doc.fillColor('#6b7280')
           .fontSize(10)
           .font('Helvetica')
           .text(`Verilme Tarihi: ${tarih}`, 60, 335)
           .text(`Sertifika No: ${sertifika_kodu}`, 60, 350);

        // Sağ: imza
        doc.fillColor('#1e3a8a')
           .fontSize(16)
           .font('Helvetica-Bold')
           .text('EduNex', W - 180, 330, { width: 120, align: 'center' });

        doc.fillColor('#6b7280')
           .fontSize(10)
           .font('Helvetica')
           .text('Online Egitim Platformu', W - 190, 350, { width: 140, align: 'center' });

        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
    });

    const cert = await Certificate.create({
        kayit_id: enrollment.id,
        sertifika_kodu,
        pdf_yolu: `/certificates/${dosyaAdi}`,
        verilis_tarihi: new Date()
    });

    return cert;
};

/**
 * @route GET /api/certificates/my
 * Ogrencinin kazandigi tum sertifikalari PDF linki ile doner
 */
const getMyCertificates = async (req, res, next) => {
    try {
        const ogrenci_id = req.user.id;

        const enrollments = await CourseEnrollment.findAll({
            where: { ogrenci_id },
            attributes: ['id', 'kurs_id'],
        });

        if (enrollments.length === 0) {
            return res.status(200).json({ status: 'success', data: [] });
        }

        const enrollmentIds = enrollments.map(e => e.id);

        const certificates = await Certificate.findAll({
            where: { kayit_id: enrollmentIds },
            include: [
                {
                    model: CourseEnrollment,
                    attributes: ['kurs_id'],
                    include: [
                        { model: Course, attributes: ['id', 'baslik', 'kapak_fotografi'] }
                    ]
                }
            ],
            order: [['verilis_tarihi', 'DESC']]
        });

        const data = certificates.map(c => ({
            sertifika_id: c.id,
            sertifika_kodu: c.sertifika_kodu,
            verilis_tarihi: c.verilis_tarihi,
            pdf_link: c.pdf_yolu,
            kurs: {
                id: c.CourseEnrollment?.Course?.id,
                baslik: c.CourseEnrollment?.Course?.baslik,
                kapak_fotografi: c.CourseEnrollment?.Course?.kapak_fotografi
            }
        }));

        return res.status(200).json({ status: 'success', data });
    } catch (error) {
        next(error);
    }
};

module.exports = { generateCertificate, getMyCertificates };
