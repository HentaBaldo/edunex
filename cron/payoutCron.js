/**
 * EduNex - Hakedis Otomatik Onay Cron Job (Payout Approval)
 *
 * AMAC: iyzico Pazaryeri (Marketplace) modelinde tahsilat sonrasi para
 * havuzda bekler. Iade penceresi kapanan veya ogrencinin iade hakkini kaybettigi
 * (kursta %20+ ilerleme) kalemlerin parasini iyzico Approval API ile egitmenin
 * SubMerchant hesabina aktariyoruz.
 *
 * KURALLAR (BIRI YETERLI - OR mantigi):
 *   1) Siparis tarihinden 14 gun GECMIS olmali, VEYA
 *   2) Ogrencinin kurs ilerlemesi > %20 olmali.
 *
 * GUVENLIK:
 *   - hakedis_durumu='beklemede' filtresi tek kaynak: iade edilmis veya
 *     onceden onaylanmis kalemlere tekrar dokunulmaz (idempotency).
 *   - iyzico_item_transaction_id bos kalemler atlanir (cron orada cuvallamaz).
 *   - Her kalem icin ayri try/catch: bir kalemin hatasi digerlerini bozmaz.
 *   - Iyzico cagrisindan sonra kucuk bir transaction ile DB durumu guncellenir.
 *
 * PROGRAM:
 *   - PAYOUT_CRON_EXPRESSION env ile override edilir.
 *   - Default: production'da gunde bir (saat 03:00 TR), digerinde her 15 dk.
 */

const cron = require('node-cron');
const { Op } = require('sequelize');
const {
    sequelize,
    Order,
    OrderItem,
    Course,
    CourseEnrollment,
    InstructorDetail,
    InstructorEarning,
    PaymentTransaction,
} = require('../models');
const iyzicoService = require('../services/iyzicoService');

const IADE_PENCERESI_GUN = 14;
const MIN_ILERLEME_ICIN_KILITLENME = 20; // > %20 ise iade hakki dusmus sayilir
const PLATFORM_KOMISYON_ORANI = Number(process.env.PLATFORM_KOMISYON_ORANI || 30);

const toKurus = (v) => Math.round(Number(v) * 100);
const fromKurus = (k) => (k / 100).toFixed(2);

/**
 * Onaylanmaya hazir OrderItem'lari getirir.
 * Kosullar:
 *   - hakedis_durumu = 'beklemede'
 *   - iyzico_item_transaction_id IS NOT NULL (iyzico cagrisi yapabilelim)
 *   - Order.durum = 'tamamlandi'
 *   - (Order 14 gun yasli) VEYA (kursa ilerleme > 20)
 */
async function findOnaylanacakKalemler() {
    const onDortGunOnce = new Date(Date.now() - IADE_PENCERESI_GUN * 24 * 60 * 60 * 1000);

    // Tek raw SQL ile OR mantigini efektif tariyoruz (iki ayri Sequelize sorgu yerine).
    // EXISTS subquery: yuksek ilerlemeli kayit var mi diye eslestirir.
    const sql = `
        SELECT oi.id
        FROM siparis_kalemleri AS oi
        INNER JOIN siparisler   AS o  ON o.id = oi.siparis_id
        WHERE oi.hakedis_durumu = 'beklemede'
          AND oi.iyzico_item_transaction_id IS NOT NULL
          AND o.durum = 'tamamlandi'
          AND (
                o.olusturulma_tarihi <= :onDortGunOnce
             OR EXISTS (
                  SELECT 1 FROM kurs_kayitlari ce
                  WHERE ce.kurs_id = oi.kurs_id
                    AND ce.ogrenci_id = o.kullanici_id
                    AND ce.ilerleme_yuzdesi > :minIlerleme
             )
          )
        ORDER BY o.olusturulma_tarihi ASC
        LIMIT 200
    `;

    const rows = await sequelize.query(sql, {
        replacements: { onDortGunOnce, minIlerleme: MIN_ILERLEME_ICIN_KILITLENME },
        type: sequelize.QueryTypes.SELECT,
    });

    if (rows.length === 0) return [];

    const ids = rows.map(r => r.id);
    return OrderItem.findAll({
        where: { id: ids },
        include: [
            {
                model: Order,
                attributes: ['id', 'kullanici_id', 'olusturulma_tarihi', 'conversation_id'],
                required: true,
            },
            {
                model: Course,
                attributes: ['id', 'baslik', 'egitmen_id'],
                include: [{ model: InstructorDetail, attributes: ['kullanici_id', 'submerchant_key'] }],
                required: true,
            },
        ],
    });
}

/**
 * Tek bir kalemin iyzico approval cagrisini yapar ve DB'yi gunceller.
 * Idempotent: hata durumunda kalem 'beklemede' kalir, bir sonraki cron'da yeniden denenir.
 */
async function approveTekKalem(oi) {
    // Defansif kontrol (idempotency): cron baslarken cekildi diye baska bir cron run'unda
    // durumu degismis olabilir. Bu yuzden son kez DB'den taze hali aliyoruz.
    const taze = await OrderItem.findByPk(oi.id);
    if (!taze || taze.hakedis_durumu !== 'beklemede') {
        return { id: oi.id, status: 'skipped_status_changed' };
    }

    // iyzico Approval API
    const approveResult = await iyzicoService.approveItem({
        paymentTransactionId: oi.iyzico_item_transaction_id,
        conversationId: `payout-${oi.id}`,
    });

    // DB transaction: durum + InstructorEarning idempotent ensure + log
    await sequelize.transaction(async (t) => {
        await OrderItem.update(
            { hakedis_durumu: 'onaylandi' },
            { where: { id: oi.id, hakedis_durumu: 'beklemede' }, transaction: t }
        );

        // InstructorEarning normalde callback'te olusturulmustu; defansif findOrCreate
        // ile veri butunlugunu garantiliyoruz (eski siparislerde eksik olabilir).
        const brutKurus = toKurus(oi.odenen_fiyat);
        const kesintiKurus = Math.round(brutKurus * PLATFORM_KOMISYON_ORANI / 100);
        const netKurus = brutKurus - kesintiKurus;
        await InstructorEarning.findOrCreate({
            where: { siparis_kalemi_id: oi.id },
            defaults: {
                egitmen_id: oi.Course?.egitmen_id || null,
                siparis_kalemi_id: oi.id,
                brut_tutar: fromKurus(brutKurus),
                komisyon_orani: PLATFORM_KOMISYON_ORANI,
                platform_kesintisi: fromKurus(kesintiKurus),
                net_tutar: fromKurus(netKurus),
                para_birimi: 'TRY',
            },
            transaction: t,
        });

        await PaymentTransaction.create({
            siparis_id: oi.Order.id,
            saglayici: 'iyzico',
            islem_tipi: 'callback', // approval payment_transaction enum'una eklenmedi; en yakin tip
            conversation_id: `payout-${oi.id}`,
            payment_id: approveResult?.paymentTransactionId || null,
            durum: 'success',
            ham_yanit: approveResult || null,
        }, { transaction: t });
    });

    return { id: oi.id, status: 'approved' };
}

/**
 * Tek bir cron tick'i: tarama + sirayla onay.
 * Module disindan da elle cagrilabilir (test icin).
 */
async function runOnce() {
    const baslangic = Date.now();
    let kalemler;
    try {
        kalemler = await findOnaylanacakKalemler();
    } catch (queryErr) {
        console.error('[PAYOUT CRON QUERY ERROR]', queryErr.message);
        return { ok: false, count: 0, reason: 'query_failed' };
    }

    if (kalemler.length === 0) {
        return { ok: true, count: 0 };
    }

    console.log(`[PAYOUT CRON] ${kalemler.length} bekleyen kalem bulundu, onay surecine giriliyor.`);

    let basariliCount = 0;
    let basarisizCount = 0;
    for (const oi of kalemler) {
        try {
            const r = await approveTekKalem(oi);
            if (r.status === 'approved') basariliCount++;
        } catch (itemErr) {
            basarisizCount++;
            console.error('[PAYOUT CRON ITEM ERROR]', {
                order_item_id: oi.id,
                iyzico_tx: oi.iyzico_item_transaction_id,
                message: itemErr.message,
                iyzico: itemErr.iyzicoResult || null,
            });
        }
    }

    const sureMs = Date.now() - baslangic;
    console.log(`[PAYOUT CRON] Tamamlandi. Onaylanan=${basariliCount} Hatali=${basarisizCount} Sure=${sureMs}ms`);
    return { ok: true, count: basariliCount, errors: basarisizCount };
}

/**
 * Cron job'u baslatir. server.js bu fonksiyonu uygulama acilir acilmaz cagirir.
 */
function start() {
    // Production: gunde bir (TR saat 03:00). Aksi: her 15 dakika (test).
    const defaultExpr = process.env.NODE_ENV === 'production' ? '0 3 * * *' : '*/15 * * * *';
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

    console.log(`[PAYOUT CRON] Aktif. Schedule="${cronExpr}" TZ="${process.env.TZ || 'Europe/Istanbul'}"`);
    return task;
}

module.exports = { start, runOnce };
