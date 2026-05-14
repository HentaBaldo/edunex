const { v4: uuidv4 } = require('uuid');
const { Certificate, CourseEnrollment, Course, Profile } = require('../models');
const { generateCertificatePdf, renderCertificatePdfToStream } = require('../services/certificateService');
const { uploadCertificate, isBunnyStorageEnabled } = require('../services/bunnyService');

/**
 * Sertifika verisini hazırlar (yoksa oluşturur).
 * PDF üretilir → Bunny'e yüklenir → sertifika_url veritabanına kaydedilir.
 * Bunny yapılandırılmamışsa on-demand PDF endpointi fallback olarak kalır.
 * @returns {Promise<Certificate|null>}
 */
const generateCertificate = async (ogrenciId, kursId) => {
    const enrollment = await CourseEnrollment.findOne({
        where: { ogrenci_id: ogrenciId, kurs_id: kursId },
        include: [
            { model: Course,   attributes: ['baslik'] },
            { model: Profile,  as: 'Ogrenci', attributes: ['ad', 'soyad'] }
        ]
    });

    if (!enrollment) return null;

    const existing = await Certificate.findOne({ where: { kayit_id: enrollment.id } });
    if (existing) return existing;

    const sertifika_kodu = uuidv4();

    // Sertifika kaydını önce oluştur (URL sonradan güncellenir)
    const cert = await Certificate.create({
        kayit_id: enrollment.id,
        sertifika_kodu,
        verilis_tarihi: new Date()
    });

    // PDF üret → Bunny'e yükle (arkaplanda; ana akışı bloklamaz)
    _uploadCertificateAsync(cert, enrollment).catch(err => {
        console.error(`[CERT] Bunny yükleme hatası (${sertifika_kodu}):`, err.message);
    });

    return cert;
};

/**
 * PDF buffer oluşturup Bunny'e yükler, ardından sertifika_url'yi günceller.
 * @private
 */
const _uploadCertificateAsync = async (cert, enrollment) => {
    if (!isBunnyStorageEnabled()) {
        console.warn('[CERT] Bunny Storage devre dışı — sertifika_url güncellenmedi.');
        return;
    }

    const ad          = `${enrollment?.Ogrenci?.ad || ''} ${enrollment?.Ogrenci?.soyad || ''}`.trim() || 'Öğrenci';
    const kursBaslik  = enrollment?.Course?.baslik || 'Kurs';
    const tarih       = new Date(cert.verilis_tarihi).toLocaleDateString('tr-TR');

    const pdfBuffer = await generateCertificatePdf({
        ad,
        kursBaslik,
        sertifika_kodu: cert.sertifika_kodu,
        tarih
    });

    const fileName      = `cert_${cert.sertifika_kodu}.pdf`;
    const sertifika_url = await uploadCertificate(pdfBuffer, fileName);

    await cert.update({ sertifika_url });
    console.log(`[CERT] Sertifika Bunny'e yüklendi: ${sertifika_url}`);
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
            sertifika_id:    c.id,
            sertifika_kodu:  c.sertifika_kodu,
            verilis_tarihi:  c.verilis_tarihi,
            // CDN URL varsa kullan; yoksa on-demand endpoint fallback
            pdf_link: c.sertifika_url || `/api/certificates/${c.sertifika_kodu}/pdf`,
            kurs: {
                id:             c.CourseEnrollment?.Course?.id,
                baslik:         c.CourseEnrollment?.Course?.baslik,
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
 * CDN URL varsa redirect eder; yoksa anlık PDF üretip stream eder (fallback).
 * Public erişim — UUID kod tahmin edilemez.
 */
const downloadCertificatePdf = async (req, res, next) => {
    try {
        const { kod } = req.params;

        const cert = await Certificate.findOne({
            where: { sertifika_kodu: kod },
            include: [{
                model: CourseEnrollment,
                include: [
                    { model: Course,  attributes: ['baslik'] },
                    { model: Profile, as: 'Ogrenci', attributes: ['ad', 'soyad'] }
                ]
            }]
        });

        if (!cert) {
            return res.status(404).json({ status: 'error', message: 'Sertifika bulunamadı.' });
        }

        // Bunny CDN'de kalıcı URL varsa doğrudan yönlendir
        if (cert.sertifika_url) {
            return res.redirect(302, cert.sertifika_url);
        }

        // Fallback: anlık render (eski sertifikalar veya Bunny devre dışıysa)
        const enrollment = cert.CourseEnrollment;
        const ad         = `${enrollment?.Ogrenci?.ad || ''} ${enrollment?.Ogrenci?.soyad || ''}`.trim() || 'Öğrenci';
        const kursBaslik = enrollment?.Course?.baslik || 'Kurs';
        const tarih      = new Date(cert.verilis_tarihi).toLocaleDateString('tr-TR');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="cert_${cert.sertifika_kodu}.pdf"`);
        res.setHeader('Cache-Control', 'private, max-age=3600');

        await renderCertificatePdfToStream(res, {
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
