const { Lesson } = require('../models');

/**
 * Yeni Ders Oluşturma ve Video Yükleme İşlemi
 * @route POST /api/instructor/upload
 * @route POST /api/instructor/lessons/upload
 */
exports.createLessonWithVideo = async (req, res, next) => {
    try {
        const file = req.file;
        const { bolum_id, baslik, sure_saniye, onizleme_mi } = req.body;

        if (!file) {
            const error = new Error('Lütfen bir video dosyası yükleyin.');
            error.statusCode = 400;
            throw error;
        }

        if (!bolum_id || !baslik) {
            const error = new Error('Bölüm bilgisi ve ders başlığı eksik.');
            error.statusCode = 400;
            throw error;
        }

        const maxSira = await Lesson.max('sira_numarasi', { where: { bolum_id } });
        const nextOrder = (maxSira || 0) + 1;

        const newLesson = await Lesson.create({
            bolum_id,
            baslik,
            video_saglayici_id: file.filename,
            sure_saniye: parseInt(sure_saniye) || 0,
            onizleme_mi: onizleme_mi === 'true' || onizleme_mi === true,
            sira_numarasi: nextOrder,
            icerik_tipi: 'video'
        });

        return res.status(201).json({
            success: true,
            message: 'Video başarıyla yüklendi ve ders müfredata eklendi.',
            data: newLesson
        });

    } catch (error) {
        next(error);
    }
};