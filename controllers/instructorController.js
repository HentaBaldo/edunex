/**
 * EduNex - Instructor Controller
 * Eğitmenlerin kurs ve ders (video) işlemlerini yönetir.
 */

// Veritabanı modellerini içeri aktarıyoruz
const { Lesson } = require('../models');

/**
 * Yeni Ders Oluşturma ve Video Yükleme İşlemi
 * @route POST /api/instructor/upload
 */
exports.createLessonWithVideo = async (req, res, next) => {
    try {
        const file = req.file;
        // FormData üzerinden gelen ders bilgilerini alıyoruz
        const { bolum_id, baslik, sure_saniye, onizleme_mi } = req.body;

        // 1. Dosya kontrolü
        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Lütfen bir video dosyası yükleyin.'
            });
        }

        // 2. Eksik bilgi kontrolü (Veritabanı tutarlılığı için)
        if (!bolum_id || !baslik) {
            return res.status(400).json({
                success: false,
                message: 'Bölüm bilgisi ve ders başlığı eksik.'
            });
        }

        // 3. Sıra numarasını belirle (Bölümdeki mevcut en yüksek sırayı bulup 1 ekler)
        const maxSira = await Lesson.max('sira_numarasi', {
            where: { bolum_id }
        });
        const nextOrder = (maxSira || 0) + 1;

        // 4. Dersi Veritabanına Kaydet
        const newLesson = await Lesson.create({
            bolum_id,
            baslik,
            video_saglayici_id: file.filename, // Multer'ın oluşturduğu dosya adı
            sure_saniye: parseInt(sure_saniye) || 0,
            onizleme_mi: onizleme_mi === 'true' || onizleme_mi === true,
            sira_numarasi: nextOrder,
            icerik_tipi: 'video'
        });

        // 5. Başarılı yanıt dön
        return res.status(200).json({
            success: true,
            message: 'Video başarıyla yüklendi ve ders müfredata eklendi.',
            data: newLesson
        });

    } catch (error) {
        console.error('[INSTRUCTOR CONTROLLER] Video yükleme hatası:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Video işlenirken sunucu tarafında bir hata oluştu.'
        });
    }
};