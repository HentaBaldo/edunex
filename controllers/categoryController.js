const { Category } = require('../models');

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