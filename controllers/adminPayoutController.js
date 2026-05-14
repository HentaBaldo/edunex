/**
 * EduNex Admin - Egitmen Hakedis & Odeme Yonetimi
 *
 * Mimari notlar:
 *  - InstructorEarning kayitlari paymentController tarafindan siparis tamamlanir
 *    tamamlanmaz olusturulur (defaults.durum = 'pending').
 *  - T+14 iade penceresi: pending kayit, kendi olusturulma_tarihi'nden 14 gun sonra
 *    SQL'de 'available' kosuluna girer. Kalici 'available' transition'i icin
 *    `promoteAvailable` helper'i her summary/list cagrisindan once cagrilir.
 *  - 'paid' transition'i sadece bulkApprove endpoint'i tarafindan yapilir.
 *
 * Yetki: routes/adminRoutes.js seviyesinde isFinanceAdmin middleware'i kullanilir.
 */

const { Op, fn, col, literal } = require('sequelize');
const {
    sequelize,
    InstructorEarning,
    Profile,
    InstructorDetail,
    OrderItem,
    Order,
    Course,
} = require('../models');
const payoutApprovalService = require('../services/payoutApprovalService');

// T+14: hakedis kaydi olusturuldugu andan iade penceresinin kapandigi ana kadar gecen sure
const IADE_PENCERESI_GUN = 14;

// "Hemen odenmesi gerekenler" vurgu esigi (TL)
const ACIL_ODEME_ESIGI_TRY = 200;

// ============================================================
// HELPERS
// ============================================================

/**
 * 14 gun gecmis 'pending' kayitlari 'available'a tasir.
 * Idempotent: hicbir kayit yoksa NOOP.
 * Her summary/list cagrisindan once calistirilir; transaction'siz, hafif UPDATE.
 */
async function promoteAvailable() {
    try {
        const [, meta] = await sequelize.query(`
            UPDATE egitmen_hakedisleri
               SET durum = 'available'
             WHERE durum = 'pending'
               AND olusturulma_tarihi < (NOW() - INTERVAL ${IADE_PENCERESI_GUN} DAY)
        `);
        return meta?.affectedRows ?? 0;
    } catch (err) {
        // Kolon yoksa sessiz gec (sync henuz alinmamis olabilir).
        if (err?.original?.code !== 'ER_BAD_FIELD_ERROR') {
            console.warn('[PAYOUT promoteAvailable] hata:', err.message);
        }
        return 0;
    }
}

function toNumber(v, def = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
}

// ============================================================
// 1) FINANSAL OZET API
// ============================================================
/**
 * @route GET /api/admin/payouts/summary
 */
exports.getSummary = async (req, res, next) => {
    try {
        const promoted = await promoteAvailable();

        const ayBaslangici = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

        const [
            availableRow,
            pendingRow,
            processingRow,
            paidThisMonthRow,
            paidAllTimeRow,
            cancelledRow,
            counts,
        ] = await Promise.all([
            // Odeme bekleyen (available) - toplam borc
            InstructorEarning.findOne({
                attributes: [
                    [fn('COALESCE', fn('SUM', col('net_tutar')), 0), 'toplam'],
                    [fn('COUNT', col('id')), 'adet'],
                ],
                where: { durum: 'available' },
                raw: true,
            }),
            // Pending (iade penceresinde) - henuz odenemez
            InstructorEarning.findOne({
                attributes: [
                    [fn('COALESCE', fn('SUM', col('net_tutar')), 0), 'toplam'],
                    [fn('COUNT', col('id')), 'adet'],
                ],
                where: { durum: 'pending' },
                raw: true,
            }),
            // Processing - bankaya gonderildi, paid bekleniyor
            InstructorEarning.findOne({
                attributes: [
                    [fn('COALESCE', fn('SUM', col('net_tutar')), 0), 'toplam'],
                    [fn('COUNT', col('id')), 'adet'],
                ],
                where: { durum: 'processing' },
                raw: true,
            }),
            // Bu ay odenen
            InstructorEarning.findOne({
                attributes: [[fn('COALESCE', fn('SUM', col('net_tutar')), 0), 'toplam']],
                where: {
                    durum: 'paid',
                    odeme_tarihi: { [Op.gte]: ayBaslangici },
                },
                raw: true,
            }),
            // Tum zamanlar odenen
            InstructorEarning.findOne({
                attributes: [[fn('COALESCE', fn('SUM', col('net_tutar')), 0), 'toplam']],
                where: { durum: 'paid' },
                raw: true,
            }),
            // Iptal edilen
            InstructorEarning.findOne({
                attributes: [
                    [fn('COALESCE', fn('SUM', col('net_tutar')), 0), 'toplam'],
                    [fn('COUNT', col('id')), 'adet'],
                ],
                where: { durum: 'cancelled' },
                raw: true,
            }),
            // Hemen odenmesi gereken egitmen sayisi (available + esik ustu)
            sequelize.query(
                `SELECT COUNT(*) AS adet FROM (
                    SELECT egitmen_id, SUM(net_tutar) AS toplam
                      FROM egitmen_hakedisleri
                     WHERE durum = 'available'
                  GROUP BY egitmen_id
                    HAVING toplam >= :esik
                 ) AS x`,
                {
                    replacements: { esik: ACIL_ODEME_ESIGI_TRY },
                    type: sequelize.QueryTypes.SELECT,
                }
            ).catch(() => [{ adet: 0 }]),
        ]);

        return res.json({
            success: true,
            data: {
                toplamBorc: toNumber(availableRow?.toplam),
                toplamBorcAdet: toNumber(availableRow?.adet),
                bekleyen: toNumber(pendingRow?.toplam),
                bekleyenAdet: toNumber(pendingRow?.adet),
                islemde: toNumber(processingRow?.toplam),
                islemdeAdet: toNumber(processingRow?.adet),
                buAyOdenen: toNumber(paidThisMonthRow?.toplam),
                tumZamanlarOdenen: toNumber(paidAllTimeRow?.toplam),
                iptalEdilen: toNumber(cancelledRow?.toplam),
                iptalEdilenAdet: toNumber(cancelledRow?.adet),
                acilOdemeEgitmenSayisi: toNumber(counts?.[0]?.adet),
                acilOdemeEsigi: ACIL_ODEME_ESIGI_TRY,
                iadePenceresiGun: IADE_PENCERESI_GUN,
                paraBirimi: 'TRY',
            },
            meta: {
                promoted_at_request: promoted,
            },
        });
    } catch (error) {
        console.error('[PAYOUT SUMMARY] Hata:', error.message);
        next(error);
    }
};

// ============================================================
// 2) ODEME LISTESI API (egitmen bazli grupli)
// ============================================================
/**
 * Egitmen bazli grupli liste: her egitmen icin available kazanc'larin toplami,
 * IBAN ve son odeme tarihi.
 *
 * Filtreler (query):
 *   ?minTutar=200            (egitmen toplami bu degerin ustunde olanlar)
 *   ?from=2024-01-01         (kazanc tarihi araligi)
 *   ?to=2024-12-31
 *   ?ibanVarMi=true|false    (sadece IBAN olanlar / sadece olmayanlar)
 *   ?durum=available         (default: 'available'; 'pending'/'processing'/'paid'/'cancelled' de geciliebilir)
 *   ?q=arama                 (egitmen ad/soyad/eposta)
 *   ?page=1&limit=20
 *
 * @route GET /api/admin/payouts
 */
exports.listEarnings = async (req, res, next) => {
    try {
        await promoteAvailable();

        const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;

        const durum = (req.query.durum || 'available').trim();
        const validDurum = ['pending', 'available', 'processing', 'paid', 'cancelled'];
        if (!validDurum.includes(durum)) {
            const err = new Error('Gecersiz durum parametresi.');
            err.statusCode = 400;
            throw err;
        }

        const minTutar = parseFloat(req.query.minTutar);
        const from = req.query.from ? new Date(req.query.from) : null;
        const to   = req.query.to   ? new Date(req.query.to)   : null;
        const ibanVarMi = req.query.ibanVarMi;
        const aramaTerm = (req.query.q || '').trim();

        // Egitmen bazli grup: SUM(net_tutar), MIN(olusturulma_tarihi) - en eski
        // kazanc tarihi 'odenebilirlik tarihi' icin baz olur (T+14 hesabi frontend'de).
        // Bind safety: aramaTerm icin LIKE pattern parametre.
        const dateWhere = [];
        const replacements = { durum };
        if (from && !isNaN(from)) { dateWhere.push('ie.olusturulma_tarihi >= :fromDate'); replacements.fromDate = from; }
        if (to && !isNaN(to)) {
            // gun sonu dahil olsun diye 1 gun ileri
            const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
            dateWhere.push('ie.olusturulma_tarihi < :toDate');
            replacements.toDate = toEnd;
        }
        const dateWhereSql = dateWhere.length ? ('AND ' + dateWhere.join(' AND ')) : '';

        const aramaSql = aramaTerm
            ? `AND (p.ad LIKE :arama OR p.soyad LIKE :arama OR p.eposta LIKE :arama OR CONCAT(p.ad,' ',p.soyad) LIKE :arama)`
            : '';
        if (aramaTerm) replacements.arama = `%${aramaTerm}%`;

        const ibanSql = ibanVarMi === 'true'
            ? `AND id_.iban_no IS NOT NULL AND id_.iban_no <> ''`
            : ibanVarMi === 'false'
                ? `AND (id_.iban_no IS NULL OR id_.iban_no = '')`
                : '';

        const havingSql = (!isNaN(minTutar) && minTutar > 0)
            ? `HAVING SUM(ie.net_tutar) >= :minTutar`
            : '';
        if (havingSql) replacements.minTutar = minTutar;

        // Toplam egitmen sayisi (sayfalama icin)
        const countRows = await sequelize.query(
            `SELECT COUNT(*) AS toplam FROM (
                SELECT ie.egitmen_id
                  FROM egitmen_hakedisleri ie
                  LEFT JOIN profiller p ON p.id = ie.egitmen_id
                  LEFT JOIN egitmen_detaylari id_ ON id_.kullanici_id = ie.egitmen_id
                 WHERE ie.durum = :durum
                       ${dateWhereSql}
                       ${aramaSql}
                       ${ibanSql}
                 GROUP BY ie.egitmen_id
                       ${havingSql}
             ) AS x`,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );
        const toplamEgitmen = toNumber(countRows?.[0]?.toplam);

        // Asil veri
        const rows = await sequelize.query(
            `SELECT
                ie.egitmen_id,
                p.ad             AS egitmen_ad,
                p.soyad          AS egitmen_soyad,
                p.eposta         AS egitmen_eposta,
                p.profil_fotografi AS egitmen_avatar,
                id_.iban_no      AS iban_no,
                SUM(ie.brut_tutar)         AS toplam_brut,
                SUM(ie.platform_kesintisi) AS toplam_kesinti,
                SUM(ie.net_tutar)          AS toplam_net,
                COUNT(ie.id)               AS kazanc_adet,
                MIN(ie.olusturulma_tarihi) AS ilk_kazanc,
                MAX(ie.olusturulma_tarihi) AS son_kazanc,
                MAX(ie.komisyon_orani)     AS komisyon_orani
              FROM egitmen_hakedisleri ie
              LEFT JOIN profiller p ON p.id = ie.egitmen_id
              LEFT JOIN egitmen_detaylari id_ ON id_.kullanici_id = ie.egitmen_id
             WHERE ie.durum = :durum
                   ${dateWhereSql}
                   ${aramaSql}
                   ${ibanSql}
             GROUP BY ie.egitmen_id, p.ad, p.soyad, p.eposta, p.profil_fotografi, id_.iban_no
                   ${havingSql}
             ORDER BY toplam_net DESC
             LIMIT :limit OFFSET :offset`,
            {
                replacements: { ...replacements, limit, offset },
                type: sequelize.QueryTypes.SELECT,
            }
        );

        // Normalize
        const data = rows.map(r => {
            const ilk = r.ilk_kazanc ? new Date(r.ilk_kazanc) : null;
            const odenebilirlik = ilk
                ? new Date(ilk.getTime() + IADE_PENCERESI_GUN * 86400000)
                : null;
            const toplamNet = toNumber(r.toplam_net);
            return {
                egitmen_id: r.egitmen_id,
                egitmen: {
                    ad: r.egitmen_ad,
                    soyad: r.egitmen_soyad,
                    eposta: r.egitmen_eposta,
                    profil_fotografi: r.egitmen_avatar,
                },
                iban_no: r.iban_no,
                kazanc_adet: toNumber(r.kazanc_adet),
                toplam_brut: toNumber(r.toplam_brut),
                toplam_kesinti: toNumber(r.toplam_kesinti),
                toplam_net: toplamNet,
                komisyon_orani: toNumber(r.komisyon_orani),
                ilk_kazanc: r.ilk_kazanc,
                son_kazanc: r.son_kazanc,
                odenebilirlik_tarihi: odenebilirlik,
                acil_mi: toplamNet >= ACIL_ODEME_ESIGI_TRY && odenebilirlik && odenebilirlik <= new Date(),
            };
        });

        return res.json({
            success: true,
            data,
            pagination: {
                total: toplamEgitmen,
                page,
                limit,
                total_pages: Math.ceil(toplamEgitmen / limit) || 1,
            },
            meta: { durum, iadePenceresiGun: IADE_PENCERESI_GUN, acilOdemeEsigi: ACIL_ODEME_ESIGI_TRY },
        });
    } catch (error) {
        console.error('[PAYOUT LIST] Hata:', error.message);
        next(error);
    }
};

/**
 * Bir egitmenin hakedis kalemlerini detayli getirir (ID listesi modal'inda gosterim icin).
 *
 * @route GET /api/admin/payouts/:egitmen_id/items
 */
exports.getInstructorItems = async (req, res, next) => {
    try {
        const { egitmen_id } = req.params;
        const durum = (req.query.durum || 'available').trim();

        const items = await InstructorEarning.findAll({
            where: { egitmen_id, durum },
            attributes: [
                'id', 'siparis_kalemi_id', 'brut_tutar', 'komisyon_orani',
                'platform_kesintisi', 'net_tutar', 'olusturulma_tarihi',
                'durum', 'odeme_tarihi', 'islem_dekont_no',
            ],
            include: [{
                model: OrderItem,
                attributes: ['id', 'siparis_id'],
                required: false,
                include: [
                    { model: Course, attributes: ['id', 'baslik'], required: false },
                    { model: Order, attributes: ['id', 'olusturulma_tarihi', 'durum'], required: false },
                ],
            }],
            order: [['olusturulma_tarihi', 'ASC']],
            limit: 500, // makul ust sinir
        });

        return res.json({
            success: true,
            data: items.map(i => ({
                id: i.id,
                durum: i.durum,
                brut_tutar: toNumber(i.brut_tutar),
                komisyon_orani: toNumber(i.komisyon_orani),
                platform_kesintisi: toNumber(i.platform_kesintisi),
                net_tutar: toNumber(i.net_tutar),
                olusturulma_tarihi: i.olusturulma_tarihi,
                odeme_tarihi: i.odeme_tarihi,
                islem_dekont_no: i.islem_dekont_no,
                kurs: i.OrderItem?.Course
                    ? { id: i.OrderItem.Course.id, baslik: i.OrderItem.Course.baslik }
                    : null,
                siparis_id: i.OrderItem?.siparis_id || null,
            })),
        });
    } catch (error) {
        console.error('[PAYOUT INSTRUCTOR ITEMS] Hata:', error.message);
        next(error);
    }
};

// ============================================================
// 3) TOPLU ODEME ONAY API - iyzico Marketplace ile entegre
// ============================================================
/**
 * Toplu hakedis onayi.
 *
 * IKI MOD desteklenir:
 *
 *  MOD A — IYZICO OTOMATIK (default):
 *    Body: { earning_ids?: [uuid...], egitmen_id?: uuid }
 *    Her bir kayit icin payoutApprovalService.approveEarning calistirilir;
 *    iyzico Approval API'ye cagri yapilir, basarili ise DB 'paid'e cekilir.
 *    Dekont alani otomatik 'IYZICO-MANUAL:<paymentId>' olarak yazilir.
 *
 *  MOD B — MANUEL BANKA TRANSFER (legacy / iade edilemez durumlar icin):
 *    Body: { earning_ids? | egitmen_id, islem_dekont_no: 'REF-12345', manual_transfer: true }
 *    iyzico cagrisi YAPILMAZ; sadece DB'ye dekont kaydedilir.
 *    Bu mod yalnizca iyzico'da approval atilamayan eski/legacy kayitlar icin kullanilmali.
 *
 * @route POST /api/admin/payouts/bulk-approve
 */
exports.bulkApprove = async (req, res, next) => {
    try {
        const { earning_ids, egitmen_id, islem_dekont_no, manual_transfer } = req.body || {};
        const isManual = !!manual_transfer;

        // Hangi ID'lerin odenecegini belirle.
        // 'available' VEYA 'pending' kabul ediyoruz; admin elle override edebilir.
        let earningIds = [];
        if (Array.isArray(earning_ids) && earning_ids.length > 0) {
            if (earning_ids.length > 5000) {
                return res.status(400).json({
                    success: false,
                    message: 'Tek bir toplu islemde en fazla 5000 kayit onaylanabilir.',
                });
            }
            const rows = await InstructorEarning.findAll({
                where: {
                    id: { [Op.in]: earning_ids },
                    durum: { [Op.in]: ['pending', 'available'] },
                },
                attributes: ['id'],
            });
            earningIds = rows.map(r => r.id);
        } else if (egitmen_id) {
            const rows = await InstructorEarning.findAll({
                where: {
                    egitmen_id,
                    durum: { [Op.in]: ['pending', 'available'] },
                },
                attributes: ['id'],
            });
            earningIds = rows.map(r => r.id);
        } else {
            return res.status(400).json({
                success: false,
                message: 'earning_ids veya egitmen_id verilmeli.',
            });
        }

        if (earningIds.length === 0) {
            return res.json({
                success: true,
                message: 'Onaylanacak kayit bulunamadi.',
                data: { affectedCount: 0, results: [] },
            });
        }

        // --- MOD B: MANUEL BANKA TRANSFER ---
        if (isManual) {
            const dekontNo = String(islem_dekont_no || '').trim();
            if (!dekontNo) {
                return res.status(400).json({
                    success: false,
                    message: 'Manuel transfer modunda dekont/referans numarasi zorunludur.',
                });
            }
            if (dekontNo.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Dekont numarasi cok uzun (en fazla 100 karakter).',
                });
            }

            const t = await sequelize.transaction();
            try {
                const [affectedCount] = await InstructorEarning.update(
                    {
                        durum: 'paid',
                        odeme_tarihi: new Date(),
                        islem_dekont_no: dekontNo,
                    },
                    {
                        where: { id: { [Op.in]: earningIds } },
                        transaction: t,
                    }
                );
                // OrderItem.hakedis_durumu da senkron tut
                await OrderItem.update(
                    { hakedis_durumu: 'onaylandi' },
                    {
                        where: {
                            id: {
                                [Op.in]: literal(
                                    `(SELECT siparis_kalemi_id FROM egitmen_hakedisleri WHERE id IN (${earningIds.map(() => '?').join(',')}))`
                                ),
                            },
                        },
                        replacements: earningIds,
                        transaction: t,
                    }
                ).catch(() => { /* siparis_kalemi_id null olabilir; sessiz gec */ });
                await t.commit();

                console.log('[PAYOUT MANUAL TRANSFER]', { count: affectedCount, dekontNo, admin_id: req.user?.id });
                return res.json({
                    success: true,
                    message: `${affectedCount} kayit MANUEL transfer olarak 'paid' isaretlendi.`,
                    data: { affectedCount, mode: 'manual', islem_dekont_no: dekontNo },
                });
            } catch (manualErr) {
                try { await t.rollback(); } catch (_) {}
                throw manualErr;
            }
        }

        // --- MOD A: IYZICO OTOMATIK APPROVAL ---
        // Sirayla isle; iyzico SDK paralel cagriya hassas oldugu icin tek seferde.
        const results = [];
        let approved = 0, alreadyPaid = 0, skipped = 0, failed = 0;
        for (const eid of earningIds) {
            const r = await payoutApprovalService.approveEarning({
                earningId: eid,
                source: 'admin-bulk',
                dekontPrefix: 'IYZICO-MANUAL',
            });
            results.push(r);
            if (r.status === 'approved') approved++;
            else if (r.status === 'already_paid') alreadyPaid++;
            else if (r.status === 'skipped') skipped++;
            else failed++;
        }

        console.log('[PAYOUT BULK APPROVE]', {
            admin_id: req.user?.id,
            scanned: earningIds.length,
            approved, alreadyPaid, skipped, failed,
        });

        return res.json({
            success: failed === 0,
            message: `${approved} kayit iyzico'da onaylandi (zaten odenmis: ${alreadyPaid}, atlandi: ${skipped}, hatali: ${failed}).`,
            data: {
                affectedCount: approved,
                scanned: earningIds.length,
                approved, alreadyPaid, skipped, failed,
                mode: 'iyzico-auto',
                results,
            },
        });
    } catch (error) {
        console.error('[PAYOUT BULK APPROVE] Hata:', error.message);
        next(error);
    }
};

/**
 * Tek bir kaydi T+14 beklemeden hemen onayla (admin manuel override).
 * Frontend'deki "Simdi Onayla (Sure Beklemeden)" butonunun ucu.
 *
 * @route POST /api/admin/payouts/:earning_id/approve-now
 */
exports.approveNow = async (req, res, next) => {
    try {
        const { earning_id } = req.params;
        if (!earning_id) {
            return res.status(400).json({ success: false, message: 'earning_id zorunlu.' });
        }

        const r = await payoutApprovalService.approveEarning({
            earningId: earning_id,
            source: 'admin-now',
            dekontPrefix: 'IYZICO-NOW',
        });

        console.log('[PAYOUT APPROVE NOW]', { admin_id: req.user?.id, earning_id, status: r.status });

        if (r.status === 'approved' || r.status === 'already_paid') {
            return res.json({
                success: true,
                message: r.status === 'approved'
                    ? 'Hakedis iyzico tarafinda onaylandi ve egitmene aktarildi.'
                    : 'Bu hakedis zaten odenmis.',
                data: r,
            });
        }

        if (r.status === 'skipped') {
            return res.status(409).json({
                success: false,
                message: r.reason || 'Bu kayit onaylanamaz (iyzico transaction id eksik olabilir).',
                data: r,
            });
        }

        // failed
        return res.status(502).json({
            success: false,
            message: r.error || 'iyzico onay cagrisi basarisiz.',
            data: r,
        });
    } catch (error) {
        console.error('[PAYOUT APPROVE NOW] Hata:', error.message);
        next(error);
    }
};

// ============================================================
// 4) CSV EXPORT API
// ============================================================
/**
 * Genel banka toplu odeme formati (UTF-8 BOM ile Excel uyumlu):
 *   Alici Adi Soyadi,IBAN,Tutar,Aciklama
 *
 * Query: ayni listEarnings filtreleri (durum default 'available').
 *
 * @route GET /api/admin/payouts/export.csv
 */
exports.exportCSV = async (req, res, next) => {
    try {
        await promoteAvailable();

        // listEarnings ile ayni filtreleri uyguluyoruz, ama LIMIT yok.
        const durum = (req.query.durum || 'available').trim();
        const validDurum = ['pending', 'available', 'processing', 'paid', 'cancelled'];
        if (!validDurum.includes(durum)) {
            const err = new Error('Gecersiz durum parametresi.');
            err.statusCode = 400;
            throw err;
        }

        const minTutar = parseFloat(req.query.minTutar);
        const from = req.query.from ? new Date(req.query.from) : null;
        const to   = req.query.to   ? new Date(req.query.to)   : null;
        const ibanVarMi = req.query.ibanVarMi;
        const aramaTerm = (req.query.q || '').trim();

        const dateWhere = [];
        const replacements = { durum };
        if (from && !isNaN(from)) { dateWhere.push('ie.olusturulma_tarihi >= :fromDate'); replacements.fromDate = from; }
        if (to && !isNaN(to)) {
            const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
            dateWhere.push('ie.olusturulma_tarihi < :toDate');
            replacements.toDate = toEnd;
        }
        const dateWhereSql = dateWhere.length ? ('AND ' + dateWhere.join(' AND ')) : '';

        const aramaSql = aramaTerm
            ? `AND (p.ad LIKE :arama OR p.soyad LIKE :arama OR p.eposta LIKE :arama OR CONCAT(p.ad,' ',p.soyad) LIKE :arama)`
            : '';
        if (aramaTerm) replacements.arama = `%${aramaTerm}%`;

        const ibanSql = ibanVarMi === 'true'
            ? `AND id_.iban_no IS NOT NULL AND id_.iban_no <> ''`
            : ibanVarMi === 'false'
                ? `AND (id_.iban_no IS NULL OR id_.iban_no = '')`
                : '';

        const havingSql = (!isNaN(minTutar) && minTutar > 0)
            ? `HAVING SUM(ie.net_tutar) >= :minTutar`
            : '';
        if (havingSql) replacements.minTutar = minTutar;

        const rows = await sequelize.query(
            `SELECT
                p.ad             AS egitmen_ad,
                p.soyad          AS egitmen_soyad,
                id_.iban_no      AS iban_no,
                SUM(ie.net_tutar) AS toplam_net,
                COUNT(ie.id)      AS adet
              FROM egitmen_hakedisleri ie
              LEFT JOIN profiller p ON p.id = ie.egitmen_id
              LEFT JOIN egitmen_detaylari id_ ON id_.kullanici_id = ie.egitmen_id
             WHERE ie.durum = :durum
                   ${dateWhereSql}
                   ${aramaSql}
                   ${ibanSql}
             GROUP BY ie.egitmen_id, p.ad, p.soyad, id_.iban_no
                   ${havingSql}
             ORDER BY toplam_net DESC`,
            { replacements, type: sequelize.QueryTypes.SELECT }
        );

        // CSV escape: RFC 4180 - icinde virgul/cift-tirnak/yenisatir varsa tirnak ic, icteki tirnaklari ""
        const csvEscape = (val) => {
            if (val == null) return '';
            const s = String(val);
            if (/[",\n\r;]/.test(s)) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };

        const lines = [];
        // Header
        lines.push(['Alici Adi Soyadi', 'IBAN', 'Tutar', 'Aciklama'].join(','));

        for (const r of rows) {
            const adSoyad = `${r.egitmen_ad || ''} ${r.egitmen_soyad || ''}`.trim();
            const iban = (r.iban_no || '').replace(/\s/g, ''); // boşluksuz IBAN
            const tutar = toNumber(r.toplam_net).toFixed(2);
            const aciklama = `EduNex hakedis (${r.adet} kalem)`;
            lines.push([
                csvEscape(adSoyad),
                csvEscape(iban),
                csvEscape(tutar),
                csvEscape(aciklama),
            ].join(','));
        }

        const bom = '﻿';
        const csv = bom + lines.join('\r\n');

        const filename = `edunex_odeme_listesi_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(csv);
    } catch (error) {
        console.error('[PAYOUT EXPORT CSV] Hata:', error.message);
        next(error);
    }
};
