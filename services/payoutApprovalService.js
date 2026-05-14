/**
 * EduNex Payout Approval Pipeline
 *
 * Tek bir InstructorEarning kaydini iyzico Marketplace approval API'sine surer
 * ve DB durumunu atomik olarak guncellemekten sorumludur.
 *
 * Kullanim noktalari (HER IKISI de bu modulu cagirir, ayri kod yolu tekrarlamaz):
 *   1) cron/payoutCron.js  - gece 03:00 toplu otomatik akis (T+14 sonrasi)
 *   2) controllers/adminPayoutController.js  - admin manuel "Simdi Onayla" / bulk
 *
 * Idempotency garantileri:
 *   - Earning durumu 'paid'/'cancelled' ise NOOP (zaten islenmis).
 *   - OrderItem.iyzico_item_transaction_id YOK ise iyzico'ya cagri atilmaz; 'skipped' donulur.
 *   - iyzico "already approved" donerse basari kabul edilir (catch'te tutulur).
 *   - Tum DB updates Sequelize transaction icinde; ya hep, ya hic.
 *
 * Yan etkiler:
 *   - InstructorEarning.durum = 'paid'
 *   - InstructorEarning.odeme_tarihi = NOW()
 *   - InstructorEarning.islem_dekont_no = 'IYZICO:<paymentId>'  (auto)
 *                                       veya manuel referans (admin override)
 *   - OrderItem.hakedis_durumu = 'onaylandi'  (kritik: iade penceresinin kapanma sinyali)
 */

const { sequelize, InstructorEarning, OrderItem, Order } = require('../models');
const iyzicoService = require('./iyzicoService');

/**
 * Tek bir hakedis kaydini onayla (iyzico + DB).
 *
 * @param {object} params
 * @param {string} params.earningId           - InstructorEarning UUID
 * @param {string} [params.source]            - 'cron' | 'admin' (audit icin)
 * @param {string} [params.dekontPrefix]      - islem_dekont_no on ekini override eder (default 'IYZICO')
 * @returns {Promise<{
 *    status: 'approved'|'already_paid'|'skipped'|'failed',
 *    earningId: string,
 *    paymentId?: string|null,
 *    reason?: string,
 *    error?: string
 * }>}
 */
async function approveEarning({ earningId, source = 'cron', dekontPrefix = 'IYZICO' } = {}) {
    if (!earningId) {
        return { status: 'failed', earningId, error: 'earningId zorunlu.' };
    }

    // 1) Kaydi ve iliskili OrderItem'i tek sorguyla cek.
    const earning = await InstructorEarning.findByPk(earningId, {
        include: [{
            model: OrderItem,
            attributes: ['id', 'iyzico_item_transaction_id', 'hakedis_durumu', 'siparis_id'],
            required: false,
        }],
    });
    if (!earning) {
        return { status: 'failed', earningId, error: 'Hakedis kaydi bulunamadi.' };
    }

    // 2) Idempotency: zaten islenmis durumlar
    if (earning.durum === 'paid') {
        return { status: 'already_paid', earningId };
    }
    if (earning.durum === 'cancelled') {
        return { status: 'skipped', earningId, reason: 'Iptal edilmis hakedis.' };
    }

    // 3) Transaction ID yok ise iyzico cagrisi yapilamaz.
    const txId = earning.OrderItem?.iyzico_item_transaction_id;
    if (!txId) {
        console.warn('[PAYOUT APPROVAL] iyzico_item_transaction_id eksik, atlandi.', {
            earningId, siparis_kalemi_id: earning.siparis_kalemi_id, source,
        });
        return {
            status: 'skipped',
            earningId,
            reason: 'iyzico transaction id eksik (legacy kayit veya marketplace disi odeme).',
        };
    }

    // 4) iyzico'ya approval cagrisi (DB transaction'i DISINDA - long HTTP call).
    let iyzicoResult;
    try {
        iyzicoResult = await iyzicoService.approvePayment(txId, {
            conversationId: `approve-${earningId}`,
        });
    } catch (iyzErr) {
        console.error('[PAYOUT APPROVAL] iyzico hatasi:', {
            earningId, txId, source,
            errorMessage: iyzErr.message,
            errorCode: iyzErr.iyzicoResult?.errorCode,
        });
        return {
            status: 'failed',
            earningId,
            error: iyzErr.message,
            iyzico_error_code: iyzErr.iyzicoResult?.errorCode || null,
        };
    }

    // 5) iyzico OK -> DB'yi atomik guncelle.
    const paymentId = iyzicoResult.paymentId || null;
    const dekont = paymentId ? `${dekontPrefix}:${paymentId}` : `${dekontPrefix}:auto-${Date.now()}`;

    const t = await sequelize.transaction();
    try {
        // Yarisi koridordan baska bir worker tarafindan hallediliyor olabilir;
        // WHERE clause'unda durum != 'paid' yazarak race-condition'a karsi koruma.
        const [updatedCount] = await InstructorEarning.update(
            {
                durum: 'paid',
                odeme_tarihi: new Date(),
                islem_dekont_no: dekont,
            },
            {
                where: { id: earningId, durum: { [require('sequelize').Op.ne]: 'paid' } },
                transaction: t,
            }
        );

        // OrderItem.hakedis_durumu da senkron: 'onaylandi' (iade penceresinin kapandiginin sinyali).
        // CourseEnrollment'i etkilemez; sadece iade akisinin engellenmesini saglar.
        if (earning.OrderItem?.id) {
            await OrderItem.update(
                { hakedis_durumu: 'onaylandi' },
                { where: { id: earning.OrderItem.id }, transaction: t }
            );
        }

        await t.commit();

        if (updatedCount === 0) {
            // Race: baska bir worker zaten paid yapmis.
            console.warn('[PAYOUT APPROVAL] Race: zaten paid yapilmis, iyzico approval bossa.', { earningId, txId });
            return { status: 'already_paid', earningId, paymentId };
        }

        console.log('[PAYOUT APPROVAL OK]', {
            earningId, txId, paymentId,
            alreadyApproved: iyzicoResult.alreadyApproved,
            source,
            dekont,
        });

        return {
            status: 'approved',
            earningId,
            paymentId,
            alreadyApproved: !!iyzicoResult.alreadyApproved,
        };
    } catch (dbErr) {
        try { await t.rollback(); } catch (_) {}
        // KRITIK: iyzico PARAYI AKTARDI ama DB guncellemesi patladi.
        // Bu durumda earning'i 'paid' isaretlemezsek bir sonraki cron tekrar approve cagiracak;
        // iyzico ikinci cagriya "already approved" donecek ve idempotency catch'imiz iyzicoResult'i
        // basari kabul edip dongu sonunda DB'yi yine guncellemeye calisacaktir.
        // Yine de manual mudahale icin loglayalim.
        console.error('[PAYOUT APPROVAL CRITICAL] iyzico OK ama DB FAIL:', {
            earningId, txId, paymentId,
            errorMessage: dbErr.message,
        });
        return {
            status: 'failed',
            earningId,
            error: `iyzico onayi alindi (paymentId=${paymentId}) ancak DB guncellemesi basarisiz: ${dbErr.message}`,
            paymentId,
        };
    }
}

/**
 * Pending durumdaki ve T+14 gecmis tum hakediseri bulup approveEarning'e surer.
 * Cron tarafindan cagirilir, opsiyonel olarak limit parametresi alir.
 *
 * @param {object} [opts]
 * @param {number} [opts.toleransDay=14]   - iade penceresi gun cinsinden
 * @param {number} [opts.limit=500]        - tek koşumda işlenecek max kayit
 * @param {string} [opts.source='cron']
 * @returns {Promise<{ scanned, approved, alreadyPaid, skipped, failed, details: object[] }>}
 */
async function processDueEarnings({ toleransDay = 14, limit = 500, source = 'cron' } = {}) {
    const { Op } = require('sequelize');

    // T+14: hakedis kaydi olusturulma tarihi NOW() - 14 gun'den eski.
    const esik = new Date(Date.now() - toleransDay * 86400000);

    const adaylar = await InstructorEarning.findAll({
        where: {
            durum: 'pending',
            olusturulma_tarihi: { [Op.lt]: esik },
        },
        attributes: ['id'],
        order: [['olusturulma_tarihi', 'ASC']],
        limit,
    });

    const summary = {
        scanned: adaylar.length,
        approved: 0,
        alreadyPaid: 0,
        skipped: 0,
        failed: 0,
        details: [],
    };

    for (const a of adaylar) {
        const r = await approveEarning({ earningId: a.id, source, dekontPrefix: 'IYZICO-CRON' });
        summary.details.push(r);
        if (r.status === 'approved') summary.approved++;
        else if (r.status === 'already_paid') summary.alreadyPaid++;
        else if (r.status === 'skipped') summary.skipped++;
        else summary.failed++;
    }

    return summary;
}

module.exports = {
    approveEarning,
    processDueEarnings,
};
