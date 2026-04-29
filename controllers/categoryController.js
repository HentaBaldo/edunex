const { Category, Course, Profile, Review } = require('../models');
const { Op } = require('sequelize');

exports.getAllCategories = async (req, res, next) => {
    try {
        const categories = await Category.findAll({
            order: [['ad', 'ASC']]
        });

        return res.status(200).json({
            success: true,
            message: 'Kategoriler başarıyla getirildi.',
            data: categories
        });

    } catch (error) {
        next(error);
    }
};

exports.getCategoryWithCourses = async (req, res, next) => {
    try {
        const { categoryId } = req.params;

        const kategori = await Category.findByPk(categoryId, {
            attributes: ['id', 'ad', 'slug', 'ust_kategori_id']
        });

        if (!kategori) {
            return res.status(404).json({ success: false, message: 'Kategori bulunamadı.' });
        }

        const altKategoriler = await Category.findAll({
            where: { ust_kategori_id: categoryId },
            attributes: ['id', 'ad', 'slug'],
            order: [['ad', 'ASC']]
        });

        const altKategoriIdleri = altKategoriler.map(k => k.id);
        const hedefIdler        = [categoryId, ...altKategoriIdleri];

        const kurslar = await Course.findAll({
            where: {
                kategori_id:  { [Op.in]: hedefIdler },
                durum:        'yayinda',
                silindi_mi:   false
            },
            attributes: ['id', 'baslik', 'aciklama', 'fiyat', 'kategori_id', 'olusturulma_tarihi'],
            include: [
                {
                    model:      Profile,
                    as:         'Egitmen',
                    attributes: ['id', 'ad', 'soyad'],
                    required:   false
                },
                {
                    model:    Category,
                    attributes: ['id', 'ad'],
                    required: false
                },
                {
                    model:    Review,
                    attributes: ['puan'],
                    required: false
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        const kurslarHesapli = kurslar.map(k => {
            const yorumlar    = k.Reviews || [];
            const toplamYorum = yorumlar.length;
            const ortalama    = toplamYorum > 0
                ? parseFloat((yorumlar.reduce((t, r) => t + r.puan, 0) / toplamYorum).toFixed(1))
                : 0;

            const plain = k.get({ plain: true });
            delete plain.Reviews;
            return { ...plain, istatistikler: { ortalama_puan: ortalama, toplam_yorum: toplamYorum } };
        });

        return res.json({
            success: true,
            data: {
                kategori:      kategori.get({ plain: true }),
                altKategoriler: altKategoriler.map(k => k.get({ plain: true })),
                kurslar:       kurslarHesapli,
                toplam_kurs:   kurslarHesapli.length
            }
        });

    } catch (error) {
        next(error);
    }
};