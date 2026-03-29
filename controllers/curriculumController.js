const { CourseSection, Lesson } = require('../models');

/**
 * Yeni Bölüm Oluşturma
 * @route POST /api/curriculum/sections
 */
exports.createSection = async (req, res, next) => {
    try {
        const { kurs_id, baslik, aciklama } = req.body;

        if (!kurs_id || !baslik) {
            const error = new Error('Course ID and title are required.');
            error.statusCode = 400;
            throw error;
        }

        // Mevcut en yüksek sıra numarasını bul (Daha akıcı bir mantık)
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
            message: 'Section created successfully.',
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

        if (!bolum_id || !baslik) {
            const error = new Error('Section ID and title are required.');
            error.statusCode = 400;
            throw error;
        }

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
            message: 'Lesson added successfully.',
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

        const deleted = await CourseSection.destroy({ where: { id } });

        if (!deleted) {
            const error = new Error('Section not found.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            status: 'success',
            message: 'Section and its lessons deleted successfully.'
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

        const deleted = await Lesson.destroy({ where: { id } });

        if (!deleted) {
            const error = new Error('Lesson not found.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            status: 'success',
            message: 'Lesson deleted successfully.'
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
            include: [{
                model: Lesson,
                as: 'Lessons',
                attributes: ['id', 'baslik', 'icerik_tipi', 'sure_saniye', 'onizleme_mi', 'sira_numarasi']
            }],
            order: [
                ['sira_numarasi', 'ASC'],
                [{ model: Lesson, as: 'Lessons' }, 'sira_numarasi', 'ASC']
            ]
        });

        return res.status(200).json({
            status: 'success',
            message: 'Full curriculum retrieved successfully.',
            data: curriculum
        });
    } catch (error) {
        next(error);
    }
};