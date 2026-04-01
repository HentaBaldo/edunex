const { Category } = require('../models');

/**
 * Tüm Kategorileri Listele
 * @route GET /api/categories
 */
exports.getAllCategories = async (req, res, next) => {
    try {
        const categories = await Category.findAll({
            order: [['ad', 'ASC']]
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