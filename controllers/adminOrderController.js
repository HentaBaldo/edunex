/**
 * EduNex Admin - Sipariş & Ödeme Görüntüleme Controller'ı
 * Yalnızca okunur endpoint'ler. Mevcut tüm rotalar adminRoutes üzerinden
 * verifyToken + isAdmin middleware'lerinin arkasında çalışır.
 */

const { Op } = require('sequelize');
const {
    sequelize,
    Order,
    OrderItem,
    Course,
    Profile,
    PaymentTransaction,
} = require('../models');

/**
 * Siparişleri listeler. Filtreler: durum, arama (öğrenci adı/eposta/sipariş id),
 * tarih aralığı; sayfalama destekler.
 * @route GET /api/admin/orders
 */
exports.listOrders = async (req, res, next) => {
    try {
        const {
            durum,
            q,
            from,
            to,
            page = 1,
            limit = 20,
        } = req.query;

        const where = {};
        if (durum) where.durum = durum;
        if (from || to) {
            where.olusturulma_tarihi = {};
            if (from) where.olusturulma_tarihi[Op.gte] = new Date(from);
            if (to) where.olusturulma_tarihi[Op.lte] = new Date(to);
        }
        if (q) {
            // siparis id ile birebir eslesme
            where[Op.or] = [
                { id: q },
                { islem_id: q },
                { conversation_id: q },
            ];
        }

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
        const offset = (pageNum - 1) * limitNum;

        const userWhere = {};
        if (q && !where[Op.or]) {
            // eposta/ad arayisi (id aramasiyla degil)
        }

        const { rows, count } = await Order.findAndCountAll({
            where,
            include: [
                {
                    model: Profile,
                    attributes: ['id', 'ad', 'soyad', 'eposta'],
                    required: false,
                    where: q && !/^[0-9a-f-]{36}$/i.test(q) ? {
                        [Op.or]: [
                            { eposta: { [Op.like]: `%${q}%` } },
                            { ad: { [Op.like]: `%${q}%` } },
                            { soyad: { [Op.like]: `%${q}%` } },
                        ],
                    } : undefined,
                },
                {
                    model: OrderItem,
                    attributes: ['id', 'kurs_id', 'odenen_fiyat'],
                    include: [{ model: Course, attributes: ['id', 'baslik'] }],
                },
            ],
            order: [['olusturulma_tarihi', 'DESC']],
            limit: limitNum,
            offset,
            distinct: true,
        });

        return res.status(200).json({
            status: 'success',
            data: {
                items: rows,
                pagination: {
                    total: count,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(count / limitNum),
                },
            },
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Sipariş detayı: siparis + alici + kalemler (kurs) + odeme islemleri.
 * @route GET /api/admin/orders/:id
 */
exports.getOrderDetail = async (req, res, next) => {
    try {
        const { id } = req.params;

        const order = await Order.findByPk(id, {
            include: [
                {
                    model: Profile,
                    attributes: ['id', 'ad', 'soyad', 'eposta', 'sehir'],
                    required: false,
                },
                {
                    model: OrderItem,
                    include: [{ model: Course, attributes: ['id', 'baslik', 'fiyat', 'egitmen_id'] }],
                },
                {
                    model: PaymentTransaction,
                    separate: true,
                    order: [['olusturulma_tarihi', 'ASC']],
                },
            ],
        });

        if (!order) {
            const err = new Error('Sipariş bulunamadı.');
            err.statusCode = 404;
            throw err;
        }

        return res.status(200).json({ status: 'success', data: order });
    } catch (error) {
        next(error);
    }
};

/**
 * Sipariş özeti: toplam ciro, başarılı/başarısız sayıları.
 * @route GET /api/admin/orders/summary
 */
exports.getOrdersSummary = async (req, res, next) => {
    try {
        const rows = await Order.findAll({
            attributes: [
                'durum',
                [sequelize.fn('COUNT', sequelize.col('id')), 'adet'],
                [sequelize.fn('SUM', sequelize.col('toplam_tutar')), 'toplam'],
            ],
            group: ['durum'],
            raw: true,
        });

        const summary = { tamamlandi: { adet: 0, toplam: 0 }, beklemede: { adet: 0, toplam: 0 }, basarisiz: { adet: 0, toplam: 0 }, iade_edildi: { adet: 0, toplam: 0 } };
        for (const r of rows) {
            summary[r.durum] = {
                adet: Number(r.adet) || 0,
                toplam: Number(r.toplam) || 0,
            };
        }

        const toplamCiro = summary.tamamlandi.toplam;
        const toplamSiparis = Object.values(summary).reduce((s, v) => s + v.adet, 0);

        return res.status(200).json({
            status: 'success',
            data: { summary, toplamCiro, toplamSiparis },
        });
    } catch (error) {
        next(error);
    }
};
