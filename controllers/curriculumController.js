const { CourseSection, Lesson, Course } = require('../models');

/**
 * Yeni Bölüm Oluşturma
 * @route POST /api/curriculum/sections
 */
exports.createSection = async (req, res, next) => {
    try {
        const { kurs_id, baslik, aciklama } = req.body;
        const userId = req.user.id;

        if (!kurs_id || !baslik) {
            const error = new Error('Kurs ID ve başlık gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        // YETKİ KONTROLÜ: Kursun varlığını ve sahibini tek sorguda kontrol et
        const course = await Course.findOne({
            where: { id: kurs_id, egitmen_id: userId },
            attributes: ['id']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı veya bu kursa bölüm ekleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Mevcut en yüksek sıra numarasını bul
        const maxSira = await CourseSection.max('sira_numarasi', {
            where: { kurs_id }
        });

        const nextOrder = (maxSira || 0) + 1;

        const section = await CourseSection.create({
            kurs_id,
            baslik,
            aciklama,
            sira_numarasi: nextOrder
        });

        return res.status(201).json({
            status: 'success',
            message: 'Bölüm başarıyla oluşturuldu.',
            data: section
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Yeni Ders Oluşturma
 * @route POST /api/curriculum/lessons
 */
exports.createLesson = async (req, res, next) => {
    try {
        const { bolum_id, baslik, icerik_tipi, kaynak_url, sure_saniye, onizleme_mi, aciklama } = req.body;
        const userId = req.user.id;

        if (!bolum_id || !baslik) {
            const error = new Error('Bölüm ID ve başlık gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        // YETKİ KONTROLÜ: Bölümün ilişkili olduğu kursun sahibi mi kontrol et
        const section = await CourseSection.findOne({
            where: { id: bolum_id },
            attributes: ['id', 'kurs_id'],
            include: [{
                model: Course,
                attributes: ['id', 'egitmen_id'],
                required: true
            }]
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (section.Course.egitmen_id !== userId) {
            const error = new Error('Bu bölüme ders ekleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Sıra numarasını belirle
        const maxSira = await Lesson.max('sira_numarasi', {
            where: { bolum_id }
        });
        const nextOrder = (maxSira || 0) + 1;

        const lesson = await Lesson.create({
            bolum_id,
            baslik,
            icerik_tipi,
            kaynak_url,
            sure_saniye: sure_saniye || 0,
            onizleme_mi: onizleme_mi === true || onizleme_mi === 'true' ? 1 : 0,
            aciklama,
            sira_numarasi: nextOrder
        });

        return res.status(201).json({
            status: 'success',
            message: 'Ders başarıyla eklendi.',
            data: lesson
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Bölüm Güncelleme
 * @route PUT /api/curriculum/sections/:id
 */
exports.updateSection = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { baslik, aciklama } = req.body;
        const userId = req.user.id;

        const section = await CourseSection.findOne({
            where: { id },
            attributes: ['id', 'kurs_id', 'baslik', 'aciklama'],
            include: [{
                model: Course,
                attributes: ['id', 'egitmen_id'],
                required: true
            }]
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (section.Course.egitmen_id !== userId) {
            const error = new Error('Bu bölümü güncelleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        await section.update({
            baslik: baslik || section.baslik,
            aciklama: aciklama || section.aciklama
        });

        return res.status(200).json({
            status: 'success',
            message: 'Bölüm başarıyla güncellendi.',
            data: section
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Ders Güncelleme
 * @route PUT /api/curriculum/lessons/:id
 */
exports.updateLesson = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { baslik, icerik_tipi, kaynak_url, sure_saniye, onizleme_mi, aciklama } = req.body;
        const userId = req.user.id;

        const lesson = await Lesson.findOne({
            where: { id },
            include: [{
                model: CourseSection,
                include: [{
                    model: Course,
                    attributes: ['id', 'egitmen_id']
                }]
            }]
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (lesson.CourseSection.Course.egitmen_id !== userId) {
            const error = new Error('Bu dersi güncelleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        await lesson.update({
            baslik: baslik || lesson.baslik,
            icerik_tipi: icerik_tipi || lesson.icerik_tipi, // icelik_tipi yazımı düzeltildi
            kaynak_url: kaynak_url || lesson.kaynak_url,
            sure_saniye: sure_saniye !== undefined ? sure_saniye : lesson.sure_saniye,
            onizleme_mi: onizleme_mi !== undefined ? (onizleme_mi === true || onizleme_mi === 'true' ? 1 : 0) : lesson.onizleme_mi,
            aciklama: aciklama || lesson.aciklama
        });

        return res.status(200).json({
            status: 'success',
            message: 'Ders başarıyla güncellendi.',
            data: lesson
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Bölüm Silme
 * @route DELETE /api/curriculum/sections/:id
 */
exports.deleteSection = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const section = await CourseSection.findOne({
            where: { id },
            include: [{
                model: Course,
                attributes: ['id', 'egitmen_id']
            }]
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (section.Course.egitmen_id !== userId) {
            const error = new Error('Bu bölümü silme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        await Lesson.destroy({ where: { bolum_id: id } });
        await section.destroy();

        return res.status(200).json({
            status: 'success',
            message: 'Bölüm ve ilişkili dersler başarıyla silindi.'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Ders Silme
 * @route DELETE /api/curriculum/lessons/:id
 */
exports.deleteLesson = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const lesson = await Lesson.findOne({
            where: { id },
            include: [{
                model: CourseSection,
                include: [{
                    model: Course,
                    attributes: ['id', 'egitmen_id']
                }]
            }]
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (lesson.CourseSection.Course.egitmen_id !== userId) {
            const error = new Error('Bu dersi silme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        await lesson.destroy();

        return res.status(200).json({
            status: 'success',
            message: 'Ders başarıyla silindi.'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Tüm Müfredatı Getir (Bölümler + Dersler)
 * @route GET /api/curriculum/:courseId
 */
exports.getFullCurriculum = async (req, res, next) => {
    try {
        const { courseId } = req.params;

        const curriculum = await CourseSection.findAll({
            where: { kurs_id: courseId },
            attributes: ['id', 'kurs_id', 'baslik', 'aciklama', 'sira_numarasi'],
            include: [{
                model: Lesson,
                as: 'Lessons',
                attributes: ['id', 'bolum_id', 'baslik', 'icerik_tipi', 'sure_saniye', 'onizleme_mi', 'sira_numarasi', 'kaynak_url'],
                required: false
            }],
            order: [
                ['sira_numarasi', 'ASC'],
                [{ model: Lesson, as: 'Lessons' }, 'sira_numarasi', 'ASC']
            ]
        });

        return res.status(200).json({
            status: 'success',
            message: curriculum.length === 0 ? 'Bu kurs için henüz bölüm eklenmemiş.' : 'Müfredat başarıyla alındı.',
            data: curriculum
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Belirli Bölümün Derslerini Getir
 * @route GET /api/curriculum/sections/:sectionId/lessons
 */
exports.getSectionLessons = async (req, res, next) => {
    try {
        const { sectionId } = req.params;

        const lessons = await Lesson.findAll({
            where: { bolum_id: sectionId },
            attributes: ['id', 'bolum_id', 'baslik', 'icerik_tipi', 'sure_saniye', 'onizleme_mi', 'sira_numarasi', 'kaynak_url', 'aciklama'],
            order: [['sira_numarasi', 'ASC']]
        });

        return res.status(200).json({
            status: 'success',
            message: 'Bölüm dersleri başarıyla alındı.',
            data: lessons
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Ders Detaylarını Getir
 * @route GET /api/curriculum/lessons/:lessonId
 */
exports.getLessonDetail = async (req, res, next) => {
    try {
        const { lessonId } = req.params;

        const lesson = await Lesson.findOne({
            where: { id: lessonId },
            include: [{
                model: CourseSection,
                attributes: ['id', 'baslik', 'kurs_id'],
                include: [{
                    model: Course,
                    attributes: ['id', 'baslik'],
                    required: true
                }]
            }]
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            status: 'success',
            message: 'Ders detayları başarıyla alındı.',
            data: lesson
        });
    } catch (error) {
        next(error);
    }
};