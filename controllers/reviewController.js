const { Review, CourseEnrollment, StudentDetail, Profile, Course } = require('../models');

/**
 * Öğrencinin kursa puan ve yorum bırakması (veya güncellemesi)
 * POST /api/reviews
 */
exports.addOrUpdateReview = async (req, res) => {
    try {
        const ogrenciId = req.user.id;
        const { kurs_id, puan, yorum } = req.body;

        if (!kurs_id || !puan) {
            return res.status(400).json({ success: false, message: 'Kurs ID ve puan zorunludur.' });
        }

        if (puan < 1 || puan > 5) {
            return res.status(400).json({ success: false, message: 'Puan 1 ile 5 arasında olmalıdır.' });
        }

        const enrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id: ogrenciId, kurs_id }
        });

        if (!enrollment) {
            return res.status(403).json({ success: false, message: 'Sadece satın aldığınız kursları değerlendirebilirsiniz.' });
        }

        const [review, created] = await Review.upsert({
            kurs_id,
            ogrenci_id: ogrenciId,
            puan,
            yorum: yorum ? String(yorum).slice(0, 2000) : null,
            olusturulma_tarihi: new Date()
        });

        return res.status(200).json({
            success: true,
            message: created ? 'Değerlendirmeniz başarıyla eklendi.' : 'Değerlendirmeniz güncellendi.',
            data: review
        });

    } catch (error) {
        console.error('[REVIEW ADD ERROR]', error);
        res.status(500).json({ success: false, message: 'Değerlendirme kaydedilirken hata oluştu.' });
    }
};

/**
 * Öğrencinin kendi yorumunu silmesi
 * DELETE /api/reviews/:courseId
 */
exports.deleteReview = async (req, res) => {
    try {
        const ogrenciId = req.user.id;
        const { courseId } = req.params;

        const deleted = await Review.destroy({
            where: { kurs_id: courseId, ogrenci_id: ogrenciId }
        });

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Silinecek yorum bulunamadı.' });
        }

        return res.json({ success: true, message: 'Yorumunuz silindi.' });
    } catch (error) {
        console.error('[REVIEW DELETE ERROR]', error);
        res.status(500).json({ success: false, message: 'Yorum silinirken hata oluştu.' });
    }
};

/**
 * Bir kursun yorumlarını ve ortalama puanını getirir (sayfalama destekli)
 * GET /api/reviews/course/:courseId?page=1&limit=10
 */
exports.getCourseReviews = async (req, res) => {
    try {
        const { courseId } = req.params;
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(50, parseInt(req.query.limit) || 10);
        const offset = (page - 1) * limit;

        // Ortalama için tüm puanları çek (count + sum)
        const allReviews = await Review.findAll({
            where: { kurs_id: courseId },
            attributes: ['puan']
        });

        const toplam_degerlendirme = allReviews.length;
        let ortalama_puan = 0;
        if (toplam_degerlendirme > 0) {
            const toplamPuan = allReviews.reduce((sum, r) => sum + r.puan, 0);
            ortalama_puan = (toplamPuan / toplam_degerlendirme).toFixed(1);
        }

        const reviews = await Review.findAll({
            where: { kurs_id: courseId },
            include: [{
                model: StudentDetail,
                include: [{ model: Profile, attributes: ['ad', 'soyad', 'profil_fotografi'] }]
            }],
            order: [['olusturulma_tarihi', 'DESC']],
            limit,
            offset
        });

        return res.status(200).json({
            success: true,
            ortalama_puan: parseFloat(ortalama_puan),
            toplam_degerlendirme,
            pagination: {
                page,
                limit,
                total_pages: Math.ceil(toplam_degerlendirme / limit) || 1
            },
            data: reviews
        });

    } catch (error) {
        console.error('[REVIEW GET ERROR]', error);
        res.status(500).json({ success: false, message: 'Yorumlar getirilirken hata oluştu.' });
    }
};

/**
 * Admin: Tüm yorumları listele (filtre + sayfalama)
 * GET /api/admin/reviews?page=1&limit=20&kurs_id=xxx
 */
exports.adminListReviews = async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page)   || 1);
        const limit  = Math.min(100, parseInt(req.query.limit) || 20);
        const offset = (page - 1) * limit;
        const where  = req.query.kurs_id ? { kurs_id: req.query.kurs_id } : {};

        const { count, rows: reviews } = await Review.findAndCountAll({
            where,
            include: [
                {
                    model: StudentDetail,
                    include: [{ model: Profile, attributes: ['ad', 'soyad'] }]
                },
                {
                    model: Course,
                    attributes: ['baslik']
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']],
            limit,
            offset
        });

        return res.json({
            success: true,
            data: reviews,
            pagination: {
                total: count,
                page,
                limit,
                total_pages: Math.ceil(count / limit) || 1
            }
        });
    } catch (error) {
        console.error('[ADMIN REVIEW LIST ERROR]', error);
        res.status(500).json({ success: false, message: 'Yorumlar getirilirken hata oluştu.' });
    }
};

/**
 * Admin: Herhangi bir yorumu sil
 * DELETE /api/admin/reviews/:kurs_id/:ogrenci_id
 */
exports.adminDeleteReview = async (req, res) => {
    try {
        const { kurs_id, ogrenci_id } = req.params;

        const deleted = await Review.destroy({ where: { kurs_id, ogrenci_id } });

        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Yorum bulunamadı.' });
        }

        return res.json({ success: true, message: 'Yorum silindi.' });
    } catch (error) {
        console.error('[ADMIN REVIEW DELETE ERROR]', error);
        res.status(500).json({ success: false, message: 'Yorum silinirken hata oluştu.' });
    }
};
