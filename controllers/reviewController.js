const { Review, CourseEnrollment, StudentDetail, Profile, sequelize } = require('../models');

/**
 * Öğrencinin kursa puan ve yorum bırakması (veya güncellemesi)
 * POST /api/reviews
 */
exports.addOrUpdateReview = async (req, res) => {
    try {
        const ogrenciId = req.user.id; // Token'dan gelir
        const { kurs_id, puan, yorum } = req.body;

        if (!kurs_id || !puan) {
            return res.status(400).json({ success: false, message: 'Kurs ID ve puan zorunludur.' });
        }

        if (puan < 1 || puan > 5) {
            return res.status(400).json({ success: false, message: 'Puan 1 ile 5 arasında olmalıdır.' });
        }

        // 1. GÜVENLİK: Öğrenci bu kursu gerçekten almış mı?
        const enrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id: ogrenciId, kurs_id: kurs_id }
        });

        if (!enrollment) {
            return res.status(403).json({ success: false, message: 'Sadece satın aldığınız kursları değerlendirebilirsiniz.' });
        }

        // 2. Yorumu Ekle veya Güncelle (Upsert: Varsa günceller, yoksa yaratır)
        const [review, created] = await Review.upsert({
            kurs_id: kurs_id,
            ogrenci_id: ogrenciId,
            puan: puan,
            yorum: yorum || null,
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
 * Bir kursun tüm yorumlarını ve ortalama puanını getirir
 * GET /api/reviews/course/:courseId
 */
exports.getCourseReviews = async (req, res) => {
    try {
        const { courseId } = req.params;

        // Yorumları ve yorumu yapan öğrencinin profil bilgilerini çek
        const reviews = await Review.findAll({
            where: { kurs_id: courseId },
            include: [{
                model: StudentDetail,
                include: [{
                    model: Profile,
                    attributes: ['ad', 'soyad', 'profil_fotografi'] // Sadece herkese açık bilgiler
                }]
            }],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        // Matematik: Ortalama Puan Hesaplama
        let ortalama_puan = 0;
        if (reviews.length > 0) {
            const toplamPuan = reviews.reduce((sum, r) => sum + r.puan, 0);
            ortalama_puan = (toplamPuan / reviews.length).toFixed(1);
        }

        return res.status(200).json({
            success: true,
            ortalama_puan: parseFloat(ortalama_puan),
            toplam_degerlendirme: reviews.length,
            data: reviews
        });

    } catch (error) {
        console.error('[REVIEW GET ERROR]', error);
        res.status(500).json({ success: false, message: 'Yorumlar getirilirken hata oluştu.' });
    }
};