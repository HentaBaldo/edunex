/**
 * EduNex Bildirim (Notification) Controller
 */

const { Notification } = require('../models');

/**
 * Mevcut kullanicinin okunmamis bildirimleri.
 * @route GET /api/notifications/unread
 */
exports.getUnreadNotifications = async (req, res, next) => {
    try {
        const kullanici_id = req.user?.id;
        if (!kullanici_id) {
            const err = new Error('Oturum bilgisi cozumlenemedi.');
            err.statusCode = 401;
            throw err;
        }

        const notifications = await Notification.findAll({
            where: { kullanici_id, okundu_mu: false },
            order: [['olusturulma_tarihi', 'DESC']],
            limit: 50,
        });

        return res.status(200).json({
            status: 'success',
            data: {
                okunmamis_sayisi: notifications.length,
                bildirimler: notifications,
            },
        });
    } catch (error) {
        console.error('[NOTIFICATION ERROR]', {
            op: 'getUnreadNotifications',
            kullanici_id: req.user?.id,
            name: error.name,
            message: error.message,
            original: error.original?.message,
        });
        next(error);
    }
};

/**
 * Tek bir bildirimi okundu olarak isaretler.
 * Yalnizca bildirimin sahibi tarafindan cagrilabilir.
 * @route PATCH /api/notifications/:id/read
 */
exports.markAsRead = async (req, res, next) => {
    try {
        const kullanici_id = req.user?.id;
        if (!kullanici_id) {
            const err = new Error('Oturum bilgisi cozumlenemedi.');
            err.statusCode = 401;
            throw err;
        }

        const { id } = req.params;
        if (!id) {
            const err = new Error('Bildirim ID gereklidir.');
            err.statusCode = 400;
            throw err;
        }

        const notification = await Notification.findByPk(id);
        if (!notification) {
            const err = new Error('Bildirim bulunamadi.');
            err.statusCode = 404;
            throw err;
        }

        // Sahiplik kontrolu (baska bir kullanicinin bildirimini okutamasin)
        if (notification.kullanici_id !== kullanici_id) {
            const err = new Error('Bu bildirime erisim yetkiniz yok.');
            err.statusCode = 403;
            throw err;
        }

        if (!notification.okundu_mu) {
            await notification.update({ okundu_mu: true });
        }

        return res.status(200).json({
            status: 'success',
            message: 'Bildirim okundu olarak isaretlendi.',
            data: { id: notification.id, okundu_mu: true },
        });
    } catch (error) {
        console.error('[NOTIFICATION ERROR]', {
            op: 'markAsRead',
            kullanici_id: req.user?.id,
            bildirim_id: req.params?.id,
            name: error.name,
            message: error.message,
            original: error.original?.message,
        });
        next(error);
    }
};
