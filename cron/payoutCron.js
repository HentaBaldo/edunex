/**
 * EduNex - Otomatik Hakedis Onay (Payout Approval) Cron Job
 *
 * AMAC:
 *   iyzico Marketplace modelinde para ogrenciden tahsil edildiginde
 *   iyzico havuzunda 'on-tahsilat' olarak durur. Iade penceresi (T+14) gectiginde
 *   her bir basket item icin 'approval' API'si cagrilarak para egitmenin
 *   SubMerchant hesabina aktarilir. Bu cron bu adimi otomatize eder.
 *
 * KURAL:
 *   - InstructorEarning.durum = 'pending'
 *   - olusturulma_tarihi < NOW() - INTERVAL <PAYOUT_TOLERANS_GUN> DAY (default 14)
 *   - Iliskili siparis_kalemleri.iyzico_item_transaction_id DOLU
 *   -> iyzicoService.approvePayment cagrilir
 *   -> InstructorEarning.durum = 'paid', odeme_tarihi=NOW, dekont='IYZICO-CRON:<paymentId>'
 *   -> siparis_kalemleri.hakedis_durumu = 'onaylandi'
 *
 * TASARIM:
 *   Tum approval is mantigi services/payoutApprovalService.js icinde tek noktada
 *   toplandi. Cron ve admin manuel "Simdi Onayla" akisi AYNI fonksiyonu cagirir;
 *   boylece tutarli idempotency garantisi, ortak audit logu, ortak hata yonetimi.
 *
 * GUVENLIK:
 *   - Idempotent: 'paid' veya 'cancelled' kayitlar atlanir.
 *   - iyzico "already approved" basari kabul edilir (catch'te tutulur).
 *   - Atomik: kayit basina Sequelize transaction.
 *   - PAYOUT_CRON_DISABLED=true  -> cron hic baslatilmaz (test).
 *   - PAYOUT_CRON_DRY_RUN=true   -> hicbir cagri yapilmaz, log atilir.
 *
 * PROGRAM:
 *   - Default: her gece 03:00 (TZ: Europe/Istanbul).
 *   - PAYOUT_CRON_EXPRESSION env ile override edilebilir.
 *   - Cron hatasi server'i etkilemez (server.js icinde try ile sariliyor).
 */

const cron = require('node-cron');
const payoutApprovalService = require('../services/payoutApprovalService');

const TOLERANS_GUN = Number(process.env.PAYOUT_TOLERANS_GUN || 14);
const BATCH_LIMIT = Number(process.env.PAYOUT_CRON_BATCH_LIMIT || 500);

/**
 * Tek bir tarama: tum 'pending' + T+14 gecmis hakedis kayitlarini iyzico'da onaylar.
 * Geri donus: islem ozeti (scanned/approved/skipped/failed).
 */
async function runOnce() {
    const t0 = Date.now();
    try {
        if (process.env.PAYOUT_CRON_DRY_RUN === 'true') {
            console.log('[PAYOUT CRON] DRY_RUN modunda, hicbir cagri yapilmayacak.');
            return { ok: true, dryRun: true };
        }

        const summary = await payoutApprovalService.processDueEarnings({
            toleransDay: TOLERANS_GUN,
            limit: BATCH_LIMIT,
            source: 'cron',
        });

        const ms = Date.now() - t0;
        console.log('[PAYOUT CRON SUMMARY]', {
            scanned: summary.scanned,
            approved: summary.approved,
            already_paid: summary.alreadyPaid,
            skipped: summary.skipped,
            failed: summary.failed,
            tolerans_gun: TOLERANS_GUN,
            duration_ms: ms,
            ts: new Date().toISOString(),
        });

        if (summary.failed > 0) {
            console.warn('[PAYOUT CRON] Basarisiz kalemler var, manuel inceleme gerekebilir.');
            summary.details
                .filter(d => d.status === 'failed')
                .slice(0, 20)
                .forEach(d => console.warn('   - FAIL:', d));
        }

        return { ok: true, ...summary, durationMs: ms };
    } catch (error) {
        console.error('[PAYOUT CRON ERROR]', error.message, error.stack);
        return { ok: false, error: error.message };
    }
}

/**
 * Cron'u baslatir. server.js / app.js boot esnasinda cagrir.
 * @returns {object|null} node-cron task instance veya null (devre disi).
 */
function start() {
    if (process.env.PAYOUT_CRON_DISABLED === 'true') {
        console.log('[PAYOUT CRON] PAYOUT_CRON_DISABLED=true, cron baslatilmadi.');
        return null;
    }

    const defaultExpr = '0 3 * * *'; // Her gece 03:00
    const cronExpr = process.env.PAYOUT_CRON_EXPRESSION || defaultExpr;

    if (!cron.validate(cronExpr)) {
        console.error(`[PAYOUT CRON] Gecersiz cron ifadesi: "${cronExpr}". Cron baslatilmadi.`);
        return null;
    }

    const task = cron.schedule(cronExpr, async () => {
        console.log(`[PAYOUT CRON] Tetiklendi (${new Date().toISOString()})`);
        try {
            await runOnce();
        } catch (err) {
            console.error('[PAYOUT CRON FATAL]', err.message);
        }
    }, {
        timezone: process.env.TZ || 'Europe/Istanbul',
    });

    console.log(
        `[PAYOUT CRON] Aktif. Schedule="${cronExpr}" TZ="${process.env.TZ || 'Europe/Istanbul'}" ` +
        `tolerans=${TOLERANS_GUN}gun batch=${BATCH_LIMIT}`
    );
    return task;
}

module.exports = { start, runOnce };
