/**
 * EduNex - Onaysiz Hesap Temizleme Cron Job
 *
 * AMAC: Kayit olup e-posta adresini 24 saat icinde dogrulamayan kullanicilarin
 * veritabaninda 'cop veri' olarak birikmesini onler.
 *
 * KURAL:
 *   - eposta_onayli_mi = false
 *   - onay_token_gecerlilik < NOW()   (suresi dolmus)
 *   -> destroy() ile kalici silinir
 *
 * PROGRAM:
 *   - Default: her gece 04:00. UNVERIFIED_CRON_EXPRESSION env'i ile override edilebilir.
 *   - UNVERIFIED_CRON_DISABLED=true ile devre disi birakilabilir.
 */

const cron = require('node-cron');
const { Op } = require('sequelize');
const { Profile } = require('../models');

async function runOnce() {
    try {
        const deleted = await Profile.destroy({
            where: {
                eposta_onayli_mi: false,
                onay_token_gecerlilik: { [Op.lt]: new Date() },
            },
        });

        console.log(`[CLEANUP CRON] Süresi dolan ${deleted} adet onaysız hesap temizlendi.`);
        return { ok: true, deleted };
    } catch (error) {
        console.error('[CLEANUP CRON ERROR]', error.message);
        return { ok: false, error: error.message };
    }
}

function start() {
    const defaultExpr = '0 4 * * *'; // Her gece 04:00
    const cronExpr = process.env.UNVERIFIED_CRON_EXPRESSION || defaultExpr;

    if (!cron.validate(cronExpr)) {
        console.error(`[CLEANUP CRON] Gecersiz cron ifadesi: "${cronExpr}". Cron baslatilmadi.`);
        return null;
    }

    const task = cron.schedule(cronExpr, async () => {
        try {
            await runOnce();
        } catch (err) {
            console.error('[CLEANUP CRON FATAL]', err.message);
        }
    }, {
        timezone: process.env.TZ || 'Europe/Istanbul',
    });

    console.log(`[CLEANUP CRON] Aktif. Schedule="${cronExpr}" TZ="${process.env.TZ || 'Europe/Istanbul'}"`);
    return task;
}

module.exports = { start, runOnce };
