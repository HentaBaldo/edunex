const { v4: uuidv4 } = require('uuid');
const { Certificate, CourseEnrollment, Course, Profile } = require('../models');
const { generateCertificatePdf, renderCertificatePdfToStream } = require('../services/certificateService');
const { uploadCertificate, isBunnyStorageEnabled } = require('../services/bunnyService');
const { sendCertificateEmailAsync } = require('../services/emailService');

/**
 * Sertifika verisini hazırlar (yoksa oluşturur).
 * PDF üretilir → öğrenciye e-posta (PDF ekli) gönderilir → Bunny'e yüklenir.
 * Bunny yapılandırılmamışsa on-demand PDF endpointi fallback olarak kalır.
 * @returns {Promise<Certificate|null>}
 */
const generateCertificate = async (ogrenciId, kursId) => {
    const enrollment = await CourseEnrollment.findOne({
        where: { ogrenci_id: ogrenciId, kurs_id: kursId },
        include: [
            { model: Course,   attributes: ['baslik'] },
            // eposta ALANI: sertifika e-postası gönderimi için zorunlu (Görev 22).
            { model: Profile,  as: 'Ogrenci', attributes: ['ad', 'soyad', 'eposta'] }
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

    // PDF üret → öğrenciye mail (ek olarak) → Bunny upload — hepsi arkaplanda, ana akışı bloklamaz.
    _processCertificateBackgroundAsync(cert, enrollment).catch(err => {
        console.error(`[CERT] Arkaplan işlemleri hatası (${sertifika_kodu}):`, err.message);
    });

    return cert;
};

/**
 * Sertifika sonrası arkaplan işleri (Görev 22 sonrası modüler refactor):
 *   1) PDF buffer üretimi (tek üretim, iki tüketici: mail eki + Bunny upload)
 *   2) Öğrenciye PDF ekli sertifika maili (fire-and-forget)
 *   3) Bunny Storage'a kalıcı upload + sertifika_url güncelleme (Bunny enabled ise)
 *
 * Her adım kendi try-catch'inde — birinin hatası diğerini engellemez:
 *   • PDF üretilemezse mail yine de (eksiz) gider, Bunny upload atlanır.
 *   • Mail kuyruk hatası Bunny upload'ı bozmaz.
 *   • Bunny hatası mailin gitmesini engellemez.
 *
 * @private
 */
const _processCertificateBackgroundAsync = async (cert, enrollment) => {
    const ad          = `${enrollment?.Ogrenci?.ad || ''} ${enrollment?.Ogrenci?.soyad || ''}`.trim() || 'Öğrenci';
    const kursBaslik  = enrollment?.Course?.baslik || 'Kurs';
    const tarih       = new Date(cert.verilis_tarihi).toLocaleDateString('tr-TR');

    // 1) PDF buffer — mail eki ve Bunny upload paylaşımlı tüketici.
    let pdfBuffer = null;
    try {
        pdfBuffer = await generateCertificatePdf({
            ad,
            kursBaslik,
            sertifika_kodu: cert.sertifika_kodu,
            tarih,
        });
    } catch (pdfErr) {
        console.error(`[CERT] PDF buffer üretilemedi (${cert.sertifika_kodu}):`, pdfErr.message);
    }

    // 2) Öğrenciye sertifika maili (PDF ekli; buffer yoksa mail eki olmadan gider) — fire-and-forget.
    try {
        const studentRecipient = {
            ad: enrollment?.Ogrenci?.ad || '',
            soyad: enrollment?.Ogrenci?.soyad || '',
            eposta: enrollment?.Ogrenci?.eposta || null,
        };
        if (studentRecipient.eposta) {
            sendCertificateEmailAsync(studentRecipient, kursBaslik, cert.sertifika_kodu, pdfBuffer);
        } else {
            console.warn(`[CERT] Öğrenci e-postası bulunamadı, sertifika maili atlandı (${cert.sertifika_kodu}).`);
        }
    } catch (mailErr) {
        console.error(`[CERT] Sertifika maili tetiklenirken hata (${cert.sertifika_kodu}):`, mailErr.message);
    }

    // 3) Bunny Storage kalıcı upload + sertifika_url güncelleme.
    if (!isBunnyStorageEnabled()) {
        console.warn('[CERT] Bunny Storage devre dışı — sertifika_url güncellenmedi.');
        return;
    }
    if (!pdfBuffer) {
        // PDF üretilemediği için Bunny'e yüklenecek içerik yok; on-demand fallback devrede kalır.
        console.warn(`[CERT] PDF buffer yok, Bunny upload atlandı (${cert.sertifika_kodu}).`);
        return;
    }
    try {
        const fileName      = `cert_${cert.sertifika_kodu}.pdf`;
        const sertifika_url = await uploadCertificate(pdfBuffer, fileName);
        await cert.update({ sertifika_url });
        console.log(`[CERT] Sertifika Bunny'e yüklendi: ${sertifika_url}`);
    } catch (bunnyErr) {
        console.error(`[CERT] Bunny yükleme hatası (${cert.sertifika_kodu}):`, bunnyErr.message);
    }
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
