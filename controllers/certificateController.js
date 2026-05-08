const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const { Certificate, CourseEnrollment, Course, Profile } = require('../models');

/**
 * PDF icerigini verilen yazilabilir akisa (stream) yazar.
 * Render gibi ephemeral disk ortamlarinda dosya tutmak yerine her istek anlik
 * uretilir; bu sayede platform yeniden baslatildiginda sertifika kayiplari yasanmaz.
 */
const renderCertificatePdf = (output, { ad, kursBaslik, sertifika_kodu, tarih }) => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
        doc.pipe(output);

        const W = doc.page.width;
        const H = doc.page.height;

        doc.rect(0, 0, W, H).fill('#f0f4ff');
        doc.rect(20, 20, W - 40, H - 40).lineWidth(3).strokeColor('#1e3a8a').stroke();
        doc.rect(28, 28, W - 56, H - 56).lineWidth(1).strokeColor('#93c5fd').stroke();
        doc.moveTo(60, 70).lineTo(W - 60, 70).lineWidth(1).strokeColor('#3b82f6').stroke();

        doc.fillColor('#1e3a8a').fontSize(32).font('Helvetica-Bold')
           .text('BASARI SERTIFIKASI', 0, 85, { align: 'center' });

        doc.fillColor('#6b7280').fontSize(13).font('Helvetica')
           .text('Bu sertifika asagidaki kisinin kursu basariyla tamamladigini belgeler.', 0, 135, { align: 'center' });

        doc.moveTo(120, 165).lineTo(W - 120, 165).lineWidth(1).strokeColor('#d1d5db').stroke();

        doc.fillColor('#111827').fontSize(28).font('Helvetica-Bold')
           .text(ad, 60, 180, { align: 'center', width: W - 120 });

        doc.fillColor('#374151').fontSize(14).font('Helvetica')
           .text('asagidaki kursu basariyla tamamlamistir:', 0, 230, { align: 'center' });

        doc.fillColor('#1d4ed8').fontSize(20).font('Helvetica-Bold')
           .text(kursBaslik, 60, 265, { align: 'center', width: W - 120 });

        doc.moveTo(60, 320).lineTo(W - 60, 320).lineWidth(1).strokeColor('#93c5fd').stroke();

        doc.fillColor('#6b7280').fontSize(10).font('Helvetica')
           .text(`Verilme Tarihi: ${tarih}`, 60, 335)
           .text(`Sertifika No: ${sertifika_kodu}`, 60, 350);

        doc.fillColor('#1e3a8a').fontSize(16).font('Helvetica-Bold')
           .text('EduNex', W - 180, 330, { width: 120, align: 'center' });

        doc.fillColor('#6b7280').fontSize(10).font('Helvetica')
           .text('Online Egitim Platformu', W - 190, 350, { width: 140, align: 'center' });

        doc.end();
        output.on('finish', resolve);
        output.on('end', resolve);
        output.on('error', reject);
        doc.on('error', reject);
    });
};

/**
 * Sertifika verisini hazirlar (yoksa olusturur). Disk'e dosya yazmaz —
 * PDF iceriği indirme isteginde anlik uretilir (Render ephemeral storage uyumu).
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

    const cert = await Certificate.create({
        kayit_id: enrollment.id,
        sertifika_kodu,
        pdf_yolu: `/api/certificates/${sertifika_kodu}/pdf`,
        verilis_tarihi: new Date()
    });

    return cert;
};

/**
 * @route GET /api/certificates/my
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
            pdf_link: `/api/certificates/${c.sertifika_kodu}/pdf`,
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

/**
 * @route GET /api/certificates/:kod/pdf
 * Sertifika PDF'ini diskte tutmadan, istek aninda olusturup stream eder.
 * Public erisim — sertifika kodu UUID oldugu icin tahmin edilemez.
 */
const downloadCertificatePdf = async (req, res, next) => {
    try {
        const { kod } = req.params;

        const cert = await Certificate.findOne({
            where: { sertifika_kodu: kod },
            include: [{
                model: CourseEnrollment,
                include: [
                    { model: Course, attributes: ['baslik'] },
                    { model: Profile, as: 'Ogrenci', attributes: ['ad', 'soyad'] }
                ]
            }]
        });

        if (!cert) {
            return res.status(404).json({ status: 'error', message: 'Sertifika bulunamadi.' });
        }

        const enrollment = cert.CourseEnrollment;
        const ad = `${enrollment?.Ogrenci?.ad || ''} ${enrollment?.Ogrenci?.soyad || ''}`.trim() || 'Ogrenci';
        const kursBaslik = enrollment?.Course?.baslik || 'Kurs';
        const tarih = new Date(cert.verilis_tarihi).toLocaleDateString('tr-TR');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="cert_${cert.sertifika_kodu}.pdf"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');

        await renderCertificatePdf(res, {
            ad,
            kursBaslik,
            sertifika_kodu: cert.sertifika_kodu,
            tarih
        });
    } catch (error) {
        next(error);
    }
};

module.exports = { generateCertificate, getMyCertificates, downloadCertificatePdf };
