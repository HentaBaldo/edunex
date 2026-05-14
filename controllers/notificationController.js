/**
 * EduNex Bildirim (Notification) Controller
 *
 * Tasarim notlari:
 * - Kalicilik: Bildirimler kullanici cikis yapsa bile DB'de durur. Sadece olusturulma
 *   tarihinden itibaren son 24 saatlik pencerede gosterilir. Okunan bildirim SILINMEZ,
 *   sadece okundu_mu=true yapilir.
 * - Dinamik statu (Stateful) - SECENEK B (Dinamik Payload):
 *     canli_yayin tipi icin GET sirasinda ilgili LiveSession.durum kontrol edilir;
 *     'tamamlandi' veya 'iptal' ise frontend'e gidecek payload uzerinde icerik
 *     'Canlı ders sona erdi.' olarak ezilir ve hedef_url null'a cekilir.
 *     Bu sayede tek dogruluk kaynagi LiveSession kalir; cron'da bildirim manipulasyonuna
 *     ihtiyac yoktur (Secenek A yerine tercih edildi).
 */

const { Op } = require('sequelize');
const { Notification, LiveSession } = require('../models');

const SON_X_SAAT = Number(process.env.NOTIFICATION_WINDOW_HOURS || 24);

/**
 * Bir bildirim listesini dinamik olarak isle:
 *   - tip='canli_yayin' ve kaynak_id'si olan kayitlar icin LiveSession tek seferde
 *     toplu sorguyla cekilir (N+1 yok).
 *   - Oturum 'tamamlandi'/'iptal' ise icerik & hedef_url uzerine yazilir.
 *   - Bildirimin orijinali DB'de degismez; sadece response payload override edilir.
 */
async function dinamikYansit(bildirimler) {
    if (!Array.isArray(bildirimler) || bildirimler.length === 0) return bildirimler;

    const canliKaynakIds = [
        ...new Set(
            bildirimler
                .filter(b => b.tip === 'canli_yayin' && b.kaynak_id)
                .map(b => b.kaynak_id)
        ),
    ];

    if (canliKaynakIds.length === 0) {
        return bildirimler.map(b => b.toJSON());
    }

    const oturumlar = await LiveSession.findAll({
        where: { id: { [Op.in]: canliKaynakIds } },
        attributes: ['id', 'durum', 'baslik'],
    });
    const durumMap = new Map(oturumlar.map(s => [s.id, s.durum]));

    return bildirimler.map(b => {
        const plain = b.toJSON();
        if (plain.tip === 'canli_yayin' && plain.kaynak_id) {
            const durum = durumMap.get(plain.kaynak_id);
            // Oturum bulunamadiysa (silinmis) ya da bitmisse / iptal edilmisse:
            //   - Linki kaldir (frontend tiklanamaz hale getirir)
            //   - Icerigi standart bitis metniyle ez.
            if (!durum || durum === 'tamamlandi' || durum === 'iptal') {
                plain.icerik = 'Canlı ders sona erdi.';
                plain.hedef_url = null;
                plain.canli_durum = durum || 'silindi';
            } else {
                plain.canli_durum = durum;
            }
        }
        return plain;
    });
}

/**
 * Mevcut kullanicinin SON 24 SAAT icindeki bildirimleri (okunmamis + okunmus).
 * Okundu sayisi rozet icin ayri donulur.
 *
 * @route GET /api/notifications/unread
 *   (Route ismi backward-compat; gerçekte 24h penceresinde tum bildirimleri doner.)
 */
exports.getUnreadNotifications = async (req, res, next) => {
    try {
        const kullanici_id = req.user?.id;
        if (!kullanici_id) {
            const err = new Error('Oturum bilgisi cozumlenemedi.');
            err.statusCode = 401;
            throw err;
        }

        // Son 24 saat (env ile override edilebilir).
        const esik = new Date(Date.now() - SON_X_SAAT * 60 * 60 * 1000);

        const notifications = await Notification.findAll({
            where: {
                kullanici_id,
                olusturulma_tarihi: { [Op.gte]: esik },
            },
            order: [['olusturulma_tarihi', 'DESC']],
            limit: 50,
        });

        // SECENEK B: Dinamik payload — canli_yayin bildirimleri icin gercek-zamanli statu.
        const payload = await dinamikYansit(notifications);

        // Okunmamis sayisi yine ham model uzerinden hesaplanir (dinamik mapping render icindir).
        const okunmamis_sayisi = notifications.reduce((acc, b) => acc + (b.okundu_mu ? 0 : 1), 0);

        return res.status(200).json({
            status: 'success',
            data: {
                okunmamis_sayisi,
                bildirimler: payload,
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
 * Okunan kayit DB'den SILINMEZ; sadece okundu_mu=true yapilir.
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
