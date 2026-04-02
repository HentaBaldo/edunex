const { CourseEnrollment, Course, Profile } = require('../models');
const { UniqueConstraintError, ValidationError } = require('sequelize');

/**
 * Öğrenciyi bir kursa kayıt etme
 * @route POST /api/enrollments
 * EAGER LOADING + Unique Constraint Handling
 */
exports.enrollCourse = async (req, res, next) => {
    try {
        const { kurs_id } = req.body;
        const ogrenci_id = req.user.id;

        // 1. Validasyon: kurs_id gerekli mi?
        if (!kurs_id) {
            const error = new Error('Kurs ID gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        // 2. Kursun var mı ve yayında mı kontrol et
        const course = await Course.findOne({
            where: { id: kurs_id, durum: 'yayinda' },
            attributes: ['id', 'baslik', 'fiyat', 'egitmen_id']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı veya yayında değildir.');
            error.statusCode = 404;
            throw error;
        }

        // 3. Kayıt oluştur (Unique constraint varsa otomatik hata verecek)
        const enrollment = await CourseEnrollment.create({
            ogrenci_id,
            kurs_id,
            ilerleme_yuzdesi: 0,
            kayit_tarihi: new Date()
        });

        return res.status(201).json({
            status: 'success',
            message: `"${course.baslik}" kursuna başarıyla kaydoldunuz.`,
            data: {
                enrollment_id: enrollment.id,
                kurs_id: enrollment.kurs_id,
                kayit_tarihi: enrollment.kayit_tarihi
            }
        });
    } catch (error) {
        // UNIQUE CONSTRAINT HATASI YAKALAMA
        if (error.name === 'SequelizeUniqueConstraintError') {
            const err = new Error('Zaten bu kursa kayıtlısınız.');
            err.statusCode = 400;
            return next(err);
        }

        // Diğer validasyon hataları
        if (error.name === 'SequelizeValidationError') {
            const err = new Error('Geçersiz veri: ' + error.errors.map(e => e.message).join(', '));
            err.statusCode = 400;
            return next(err);
        }

        next(error);
    }
};

/**
 * Öğrencinin kayıt olduğu tüm kursları getir
 * @route GET /api/enrollments/my-courses
 * EAGER LOADING: Course + Instructor (Profile) bilgisini tek sorguyla al
 */
exports.getMyEnrollments = async (req, res, next) => {
    try {
        const ogrenci_id = req.user.id;

        // EAGER LOADING: CourseEnrollment -> Course -> Profile (Egitmen)
        const enrollments = await CourseEnrollment.findAll({
            where: { ogrenci_id },
            attributes: ['id', 'ogrenci_id', 'kurs_id', 'ilerleme_yuzdesi', 'kayit_tarihi'],
            include: [
                {
                    model: Course,
                    attributes: ['id', 'baslik', 'alt_baslik', 'fiyat', 'seviye', 'dil', 'egitmen_id'],
                    include: [
                        {
                            model: Profile,
                            as: 'Egitmen',
                            attributes: ['id', 'ad', 'soyad', 'profil_fotografi'],
                            required: false
                        }
                    ],
                    required: true
                }
            ],
            order: [['kayit_tarihi', 'DESC']],
            subQuery: false  // N+1 hatası önlemek için önemli
        });

        // Eğer kayıt yoksa boş array döndür
        if (enrollments.length === 0) {
            return res.status(200).json({
                status: 'success',
                message: 'Henüz hiçbir kursa kayıt olmamışsınız.',
                data: []
            });
        }

        return res.status(200).json({
            status: 'success',
            message: 'Kayıtlı kurslarınız başarıyla alındı.',
            data: enrollments
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Öğrencinin belirli bir kursun kayıt bilgisini getir
 * @route GET /api/enrollments/:courseId
 * EAGER LOADING + Ownership Check
 */
exports.getEnrollmentDetail = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const ogrenci_id = req.user.id;

        const enrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id, kurs_id: courseId },
            attributes: ['id', 'ogrenci_id', 'kurs_id', 'ilerleme_yuzdesi', 'kayit_tarihi'],
            include: [
                {
                    model: Course,
                    attributes: ['id', 'baslik', 'fiyat', 'seviye', 'dil'],
                    include: [
                        {
                            model: Profile,
                            as: 'Egitmen',
                            attributes: ['id', 'ad', 'soyad'],
                            required: false
                        }
                    ],
                    required: true
                }
            ]
        });

        if (!enrollment) {
            const error = new Error('Bu kursa kayıt bulunmamaktadır.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            status: 'success',
            message: 'Kayıt bilgisi başarıyla alındı.',
            data: enrollment
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Kurs ilerleme yüzdesini güncelle
 * @route PUT /api/enrollments/:courseId/progress
 * Ownership Check + Progress Validation
 */
exports.updateProgress = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { ilerleme_yuzdesi } = req.body;
        const ogrenci_id = req.user.id;

        // Validasyon
        if (ilerleme_yuzdesi === undefined) {
            const error = new Error('İlerleme yüzdesi gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        if (ilerleme_yuzdesi < 0 || ilerleme_yuzdesi > 100) {
            const error = new Error('İlerleme yüzdesi 0 ile 100 arasında olmalıdır.');
            error.statusCode = 400;
            throw error;
        }

        // Kayıt bul
        const enrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id, kurs_id: courseId }
        });

        if (!enrollment) {
            const error = new Error('Bu kursa kayıt bulunmamaktadır.');
            error.statusCode = 404;
            throw error;
        }

        // Güncelle
        await enrollment.update({ ilerleme_yuzdesi });

        return res.status(200).json({
            status: 'success',
            message: 'İlerlemeniz başarıyla güncellendi.',
            data: {
                kurs_id: enrollment.kurs_id,
                ilerleme_yuzdesi: enrollment.ilerleme_yuzdesi
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Kurstan ayrılma / Kaydı iptal etme
 * @route DELETE /api/enrollments/:courseId
 * Ownership Check
 */
exports.unenrollCourse = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const ogrenci_id = req.user.id;

        // Kayıt bul
        const enrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id, kurs_id: courseId }
        });

        if (!enrollment) {
            const error = new Error('Bu kursa kayıt bulunmamaktadır.');
            error.statusCode = 404;
            throw error;
        }

        // Sil
        await enrollment.destroy();

        return res.status(200).json({
            status: 'success',
            message: 'Kurs kaydı başarıyla iptal edildi.'
        });
    } catch (error) {
        next(error);
    }
};