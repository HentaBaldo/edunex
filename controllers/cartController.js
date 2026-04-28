/**
 * EduNex Sepet (Cart) Controller
 * Öğrencinin ödeme öncesi kurs sepetini yönetir.
 */

const { Cart, CartItem, Course, CourseEnrollment, Profile } = require('../models');

/**
 * Mevcut kullanıcının sepetini bulur, yoksa oluşturur.
 */
async function getOrCreateCart(kullanici_id) {
    const [cart] = await Cart.findOrCreate({
        where: { kullanici_id },
        defaults: { kullanici_id },
    });
    return cart;
}

/**
 * Sepeti kurs detayları ile birlikte getirir.
 * @route GET /api/cart
 */
exports.getCart = async (req, res, next) => {
    try {
        const kullanici_id = req.user.id;
        const cart = await getOrCreateCart(kullanici_id);

        const items = await CartItem.findAll({
            where: { sepet_id: cart.id },
            include: [{
                model: Course,
                attributes: ['id', 'baslik', 'alt_baslik', 'fiyat', 'seviye', 'dil', 'durum', 'egitmen_id'],
                include: [{
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['id', 'ad', 'soyad', 'profil_fotografi'],
                    required: false,
                }],
                required: true,
            }],
            order: [['eklenme_tarihi', 'DESC']],
        });

        const toplam = items.reduce((sum, it) => sum + Number(it.Course?.fiyat || 0), 0);

        return res.status(200).json({
            status: 'success',
            data: {
                sepet_id: cart.id,
                kalem_sayisi: items.length,
                toplam_tutar: Number(toplam.toFixed(2)),
                para_birimi: 'TRY',
                items,
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Sepete kurs ekler.
 * @route POST /api/cart/items
 * body: { kurs_id }
 */
exports.addItem = async (req, res, next) => {
    try {
        const kullanici_id = req.user.id;
        const { kurs_id } = req.body;

        if (!kurs_id) {
            const err = new Error('Kurs ID gereklidir.');
            err.statusCode = 400;
            throw err;
        }

        // Kurs yayında mı? (silinmis veya iade edilmis kurslar sepete eklenemez)
        const course = await Course.findOne({
            where: { id: kurs_id, durum: 'yayinda', silindi_mi: false },
            attributes: ['id', 'baslik', 'fiyat'],
        });
        if (!course) {
            const err = new Error('Kurs bulunamadi veya yayinda degil.');
            err.statusCode = 404;
            throw err;
        }

        // Zaten kayıtlı mı?
        const existingEnrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id: kullanici_id, kurs_id },
        });
        if (existingEnrollment) {
            const err = new Error('Bu kursa zaten kayitlisiniz.');
            err.statusCode = 400;
            throw err;
        }

        const cart = await getOrCreateCart(kullanici_id);

        try {
            const item = await CartItem.create({ sepet_id: cart.id, kurs_id });
            return res.status(201).json({
                status: 'success',
                message: `"${course.baslik}" sepete eklendi.`,
                data: { item_id: item.id, kurs_id },
            });
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                const err = new Error('Bu kurs zaten sepetinizde.');
                err.statusCode = 400;
                return next(err);
            }
            throw e;
        }
    } catch (error) {
        next(error);
    }
};

/**
 * Sepetten bir kursu kaldirir.
 * @route DELETE /api/cart/items/:kurs_id
 */
exports.removeItem = async (req, res, next) => {
    try {
        const kullanici_id = req.user.id;
        const { kurs_id } = req.params;

        const cart = await getOrCreateCart(kullanici_id);
        const deleted = await CartItem.destroy({
            where: { sepet_id: cart.id, kurs_id },
        });

        if (!deleted) {
            const err = new Error('Sepette bu kurs bulunamadi.');
            err.statusCode = 404;
            throw err;
        }

        return res.status(200).json({ status: 'success', message: 'Kurs sepetten kaldirildi.' });
    } catch (error) {
        next(error);
    }
};

/**
 * Sepeti tamamen bosaltir.
 * @route DELETE /api/cart
 */
exports.clearCart = async (req, res, next) => {
    try {
        const kullanici_id = req.user.id;
        const cart = await getOrCreateCart(kullanici_id);
        await CartItem.destroy({ where: { sepet_id: cart.id } });
        return res.status(200).json({ status: 'success', message: 'Sepet bosaltildi.' });
    } catch (error) {
        next(error);
    }
};

module.exports.getOrCreateCart = getOrCreateCart;
