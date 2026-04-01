const { CourseSection, Lesson, Course } = require('../models');

exports.createSection = async (req, res, next) => {
    try {
        const { kurs_id, baslik, aciklama } = req.body;
        const egitmen_id = req.user.id;

        if (!kurs_id || !baslik) {
            const error = new Error('Kurs ID ve başlık zorunludur.');
            error.statusCode = 400;
            throw error;
        }
        const course = await Course.findOne({ where: { id: kurs_id, egitmen_id } });
        if (!course) {
            const error = new Error('Bu kursa bölüm ekleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        const maxSira = await CourseSection.max('sira_numarasi', { where: { kurs_id } });
        const nextOrder = (maxSira || 0) + 1;

        const section = await CourseSection.create({
            kurs_id,
            baslik,
            aciklama,
            sira_numarasi: nextOrder
        });

        return res.status(201).json({
            success: true,
            message: 'Bölüm başarıyla oluşturuldu.',
            data: section
        });
    } catch (error) {
        next(error);
    }
};

exports.createLesson = async (req, res, next) => {
    try {
        const { bolum_id, baslik, icerik_tipi, kaynak_url, sure_saniye, onizleme_mi, aciklama } = req.body;
        const egitmen_id = req.user.id;

        if (!bolum_id || !baslik) {
            const error = new Error('Bölüm ID ve başlık zorunludur.');
            error.statusCode = 400;
            throw error;
        }
        const section = await CourseSection.findOne({
            where: { id: bolum_id },
            include: [{ model: Course, where: { egitmen_id } }]
        });

        if (!section) {
            const error = new Error('Bu bölüme ders ekleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        const maxSira = await Lesson.max('sira_numarasi', { where: { bolum_id } });
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
            success: true,
            message: 'Ders başarıyla eklendi.',
            data: lesson
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteSection = async (req, res, next) => {
    try {
        const { id } = req.params;
        const egitmen_id = req.user.id;
        const section = await CourseSection.findOne({
            where: { id },
            include: [{ model: Course, where: { egitmen_id } }]
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı veya silme yetkiniz yok.');
            error.statusCode = 404;
            throw error;
        }

        await section.destroy();
        return res.status(200).json({
            success: true,
            message: 'Bölüm ve içindeki dersler başarıyla silindi.'
        });
    } catch (error) {
        next(error);
    }
};

exports.deleteLesson = async (req, res, next) => {
    try {
        const { id } = req.params;
        const egitmen_id = req.user.id;
        const lesson = await Lesson.findOne({
            where: { id },
            include: [{
                model: CourseSection,
                include: [{ model: Course, where: { egitmen_id } }]
            }]
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı veya silme yetkiniz yok.');
            error.statusCode = 404;
            throw error;
        }

        await lesson.destroy();

        return res.status(200).json({
            success: true,
            message: 'Ders başarıyla silindi.'
        });
    } catch (error) {
        next(error);
    }
};

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
            success: true,
            message: 'Müfredat başarıyla getirildi.',
            data: curriculum
        });
    } catch (error) {
        next(error);
    }
};