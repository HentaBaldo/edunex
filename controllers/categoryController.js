const { Category } = require('../models');

/**
 * Tüm Kategorileri Listele
 * @route GET /api/categories
 */
exports.getAllCategories = async (req, res, next) => {
    try {
        // KISITLAMA KALDIRILDI: Artık 'ust_kategori_id' dahil tüm kolonlar gelecek
        const categories = await Category.findAll({
            order: [['ad', 'ASC']] // Alfabetik sıralama devam ediyor
        });

        // Standart Başarılı Yanıt Formatı
        return res.status(200).json({
            status: 'success',
            message: 'Categories retrieved successfully.',
            data: categories
        });

    } catch (error) {
        next(error);
    }
};