/**
 * EduNex - Canli Oturum Otomatik Kapanma Cron Job
 *
 * AMAC: Egitmenler dersi manuel olarak "tamamlandi" statusune cekmediginde
 * istatistikler kirleniyor, ogrencilere kaydedilmis ders olarak gorunmuyor,
 * "aktif dersler" listesi sislemis kaliyor. Bu cron araliksiz duzenleyici.
 *
 * KURAL:
 *   - durum IN ('planlandi', 'devam_ediyor')
 *   - baslangic_tarihi + sure_dakika + 30 dakika tolerans GECMIS
 *   -> durum = 'tamamlandi'
 *
 * GUVENLIK:
 *   - 30 dakikalik tolerans, dersin biraz uzamasi durumunda erken kapatmayi onler.
 *   - Bulk UPDATE: tek SQL ile yapilir, transaction'a gerek yok (atomik).
 *   - Cron hatasi server'i etkilemez (server.js icinde try ile sariliyor).
 *
 * PROGRAM:
 *   - Default: her 10 dakikada bir. LIVE_SESSION_CRON_EXPRESSION env'i ile override edilebilir.
 *   - LIVE_SESSION_CRON_DISABLED=true ile devre disi birakilabilir (test ortami icin).
 */

const cron = require('node-cron');
const { Op } = require('sequelize');
const { LiveSession, sequelize } = require('../models');

const TOLERANS_DAKIKA = Number(process.env.LIVE_SESSION_TOLERANS_DAKIKA || 30);

/**
 * Tek bir tarama: tolerans suresi gecmis ve hala acik olan oturumlari
 * 'tamamlandi' statusune ceker. Geri donus: kapatilan oturum sayisi.
 *
 * NOT: MySQL DATE_ADD ile dogrudan satir-bazli karsilastirma yapiyoruz.
 * Bu yaklasim ZAMAN DILIMI farklarinda da dogru cunku sequelize cagrisi
 * UTC NOW() ile karsilastirma yapacak; baslangic_tarihi de UTC saklanir.
 */
async function runOnce() {
    try {
        // baslangic_tarihi + (sure_dakika + tolerans) * 60 saniye <= NOW()
        // Sequelize ile portable yapmak icin literal'e dusuyoruz.
        const [results] = await sequelize.query(`
            UPDATE canli_oturumlar
            SET durum = 'tamamlandi'
            WHERE durum IN ('planlandi', 'devam_ediyor')
              AND DATE_ADD(baslangic_tarihi, INTERVAL (sure_dakika + :tolerans) MINUTE) <= NOW()
        `, {
            replacements: { tolerans: TOLERANS_DAKIKA },
        });

        // Sequelize UPDATE sonucu surucuye gore degisir; affectedRows'i her zaman gormeyebiliriz.
        // Bu yuzden takip log'u icin etkilenen kayitlari ayrica COUNT etmiyoruz (gereksiz yuk).
        const affected = (results && (results.affectedRows ?? results.rowCount ?? results.changedRows)) ?? 0;
        if (affected > 0) {
            console.log(`[LIVE SESSION CRON] ${affected} oturum otomatik kapatildi (tolerans=${TOLERANS_DAKIKA}dk).`);
        }
        return { ok: true, affected };
    } catch (error) {
        console.error('[LIVE SESSION CRON ERROR]', error.message);
        return { ok: false, error: error.message };
    }
}

/**
 * Cron'u baslatir. server.js boot esnasinda cagirir.
 */
function start() {
    const defaultExpr = '*/10 * * * *'; // Her 10 dakikada bir
    const cronExpr = process.env.LIVE_SESSION_CRON_EXPRESSION || defaultExpr;

    if (!cron.validate(cronExpr)) {
        console.error(`[LIVE SESSION CRON] Gecersiz cron ifadesi: "${cronExpr}". Cron baslatilmadi.`);
        return null;
    }

    const task = cron.schedule(cronExpr, async () => {
        try {
            await runOnce();
        } catch (err) {
            console.error('[LIVE SESSION CRON FATAL]', err.message);
        }
    }, {
        timezone: process.env.TZ || 'Europe/Istanbul',
    });

    console.log(`[LIVE SESSION CRON] Aktif. Schedule="${cronExpr}" TZ="${process.env.TZ || 'Europe/Istanbul'}" Tolerans=${TOLERANS_DAKIKA}dk`);
    return task;
}

module.exports = { start, runOnce };
