/**
 * EduNex Admin - Yorum (Review) Moderasyonu
 *
 * Reviews tablosunun composite primary key'i var: (kurs_id, ogrenci_id).
 * Bu yuzden silme islemi iki parametre ile yapilir.
 */

const { Op } = require('sequelize');
const { Review, Profile, Course } = require('../models');

/**
 * Tum yorumlari listeler (admin moderasyon).
 * Profile (Yazar) ve Course direkt include edilir.
 *
 * Query:
 *   ?page=1&limit=20
 *   ?kurs_id=<uuid>   (opsiyonel - belirli bir kursun yorumlari)
 *   ?q=<arama>        (opsiyonel - kurs basligi veya yorum icinde arama)
 *   ?puanMin=1&puanMax=5  (opsiyonel - puan araligi)
 *
 * @route GET /api/admin/reviews
 */
exports.listReviews = async (req, res, next) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;

        const where = {};
        if (req.query.kurs_id) where.kurs_id = req.query.kurs_id;

        const puanMin = parseInt(req.query.puanMin, 10);
        const puanMax = parseInt(req.query.puanMax, 10);
        if (!isNaN(puanMin) || !isNaN(puanMax)) {
            where.puan = {};
            if (!isNaN(puanMin)) where.puan[Op.gte] = puanMin;
            if (!isNaN(puanMax)) where.puan[Op.lte] = puanMax;
        }

        // Arama: yorum metninde veya kurs basliginda
        const searchTerm = (req.query.q || '').trim();
        const include = [
            {
                model: Profile,
                as: 'Yazar',
                attributes: ['id', 'ad', 'soyad', 'eposta', 'profil_fotografi'],
                required: false,
            },
            {
                model: Course,
                attributes: ['id', 'baslik'],
                required: false,
                where: searchTerm ? { baslik: { [Op.like]: `%${searchTerm}%` } } : undefined,
            },
        ];

        if (searchTerm) {
            where[Op.or] = [
                { yorum: { [Op.like]: `%${searchTerm}%` } },
                { '$Course.baslik$': { [Op.like]: `%${searchTerm}%` } },
            ];
            // Course'u required:true yapmak istemiyoruz, OR koşulu yeterli;
            // ama Sequelize'in `$Model.field$` literal'i icin include zaten yukarida.
            // Course where'i kaldiriyoruz; ana where[Op.or] tarafindan yonetilecek.
            include[1].where = undefined;
        }

        const { count, rows } = await Review.findAndCountAll({
            where,
            include,
            order: [['olusturulma_tarihi', 'DESC']],
            limit,
            offset,
            distinct: true, // composite PK + include'lu count icin guvenli
            subQuery: false,
        });

        // Composite PK oldugu icin frontend'in benzersiz key uretmesi gerek
        const data = rows.map(r => ({
            kurs_id: r.kurs_id,
            ogrenci_id: r.ogrenci_id,
            puan: r.puan,
            yorum: r.yorum,
            olusturulma_tarihi: r.olusturulma_tarihi,
            yazar: r.Yazar
                ? {
                    id: r.Yazar.id,
                    ad: r.Yazar.ad,
                    soyad: r.Yazar.soyad,
                    eposta: r.Yazar.eposta,
                    profil_fotografi: r.Yazar.profil_fotografi,
                }
                : null,
            kurs: r.Course
                ? { id: r.Course.id, baslik: r.Course.baslik }
                : null,
        }));

        return res.json({
            success: true,
            data,
            pagination: {
                total: count,
                page,
                limit,
                total_pages: Math.ceil(count / limit) || 1,
            },
        });
    } catch (error) {
        console.error('[ADMIN REVIEW LIST] Hata:', error.message);
        next(error);
    }
};

/**
 * Composite PK ile yorum siler.
 * @route DELETE /api/admin/reviews/:kurs_id/:ogrenci_id
 */
exports.deleteReview = async (req, res, next) => {
    try {
        const { kurs_id, ogrenci_id } = req.params;
        if (!kurs_id || !ogrenci_id) {
            const err = new Error('Eksik parametre: kurs_id ve ogrenci_id zorunlu.');
            err.statusCode = 400;
            throw err;
        }

        const deleted = await Review.destroy({ where: { kurs_id, ogrenci_id } });
        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Silinecek yorum bulunamadi.',
            });
        }

        return res.json({
            success: true,
            message: 'Yorum silindi.',
            data: { kurs_id, ogrenci_id },
        });
    } catch (error) {
        console.error('[ADMIN REVIEW DELETE] Hata:', error.message);
        next(error);
    }
};
