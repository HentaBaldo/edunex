const { Lesson, Profile, InstructorDetail, Course, Review, Category, CourseEnrollment, InstructorEarning, LiveSession, InstructorFollower, sequelize } = require('../models');
const { Op } = require('sequelize');
const iyzicoService = require('../services/iyzicoService');
const discountService = require('../services/discountService');

/**
 * Yeni Ders Oluşturma ve Video Yükleme İşlemi
 * @route POST /api/instructor/upload
 * @route POST /api/instructor/lessons/upload
 */
exports.createLessonWithVideo = async (req, res, next) => {
    try {
        const file = req.file;
        const { bolum_id, baslik, sure_saniye, onizleme_mi } = req.body;

        if (!file) {
            const error = new Error('Lütfen bir video dosyası yükleyin.');
            error.statusCode = 400;
            throw error;
        }

        if (!bolum_id || !baslik) {
            const error = new Error('Bölüm bilgisi ve ders başlığı eksik.');
            error.statusCode = 400;
            throw error;
        }

        const maxSira = await Lesson.max('sira_numarasi', { where: { bolum_id } });
        const nextOrder = (maxSira || 0) + 1;

        const newLesson = await Lesson.create({
            bolum_id,
            baslik,
            video_saglayici_id: file.filename,
            sure_saniye: parseInt(sure_saniye) || 0,
            onizleme_mi: onizleme_mi === 'true' || onizleme_mi === true,
            sira_numarasi: nextOrder,
            icerik_tipi: 'video'
        });

        return res.status(201).json({
            success: true,
            message: 'Video başarıyla yüklendi ve ders müfredata eklendi.',
            data: newLesson
        });

    } catch (error) {
        next(error);
    }
};

exports.getInstructorDashboardStats = async (req, res, next) => {
    try {
        const egitmenId = req.user.id;

        // İstatistik/kazanç ekranı kursu yalnızca DEĞER ÜRETMİŞSE listeler:
        //  - durum != 'taslak'  (yayinda / onay_bekliyor / onaylandi / arsiv → her zaman dahil)
        //  - VEYA henüz taslakta olsa bile geçmişte kayıt/satış üretmiş olmalı
        // Böylece hiç yayınlanmamış boş taslaklar listede karmaşa yaratmaz; geçmişi olan
        // (yayindan_kaldirildi → taslak geri çevrilmiş) kurslar eğitmen için görünür kalır.
        // Tek sorguda EXISTS ile filtreleniyor; N+1 yok.
        const courses = await sequelize.query(`
            SELECT id, baslik, durum
            FROM kurslar
            WHERE egitmen_id = :egitmenId
              AND (silindi_mi = false OR silindi_mi IS NULL)
              AND (
                durum <> 'taslak'
                OR EXISTS (SELECT 1 FROM kurs_kayitlari ce WHERE ce.kurs_id = kurslar.id)
                OR EXISTS (SELECT 1 FROM siparis_kalemleri oi WHERE oi.kurs_id = kurslar.id)
              )
        `, { replacements: { egitmenId }, type: sequelize.QueryTypes.SELECT });
        const kursIdleri = courses.map(c => c.id);

        const now = new Date();
        const buAyBaslangic = new Date(now.getFullYear(), now.getMonth(), 1);
        const gecenAyBaslangic = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const gecenAySon = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const altiAyOnce = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        // Takipci sayisi kursdan bagimsizdir; kurs yokken bile dogru deger doner.
        const followerCount = await InstructorFollower.count({ where: { egitmen_id: egitmenId } });

        const emptyKpi = {
            toplam_ogrenci: 0, toplam_net_kazanc: 0, bu_ay_kazanc: 0,
            kazanc_trendi: null, ortalama_puan: 0, toplam_yorum: 0,
            yayinda_kurs: courses.filter(c => c.durum === 'yayinda').length,
            diger_kurs: courses.filter(c => c.durum !== 'yayinda').length,
            followerCount: followerCount,
            toplam_takipci: followerCount
        };

        if (kursIdleri.length === 0) {
            return res.json({ success: true, data: { kpi: emptyKpi, grafik: { aylik_kazanc: [], kurs_dagilimi: [] }, son_yorumlar: [], kurs_performanslari: [] } });
        }

        const [toplamOgrenci, kazancToplam, buAyKazanc, gecenAyKazanc, yorumSonuc, aylikKazanc, aylikKayit, sonYorumlar, kursStats] = await Promise.all([
            CourseEnrollment.count({ where: { kurs_id: { [Op.in]: kursIdleri } }, col: 'ogrenci_id', distinct: true }),
            InstructorEarning.findOne({ where: { egitmen_id: egitmenId }, attributes: [[sequelize.fn('SUM', sequelize.col('net_tutar')), 'v']], raw: true }),
            InstructorEarning.findOne({ where: { egitmen_id: egitmenId, olusturulma_tarihi: { [Op.gte]: buAyBaslangic } }, attributes: [[sequelize.fn('SUM', sequelize.col('net_tutar')), 'v']], raw: true }),
            InstructorEarning.findOne({ where: { egitmen_id: egitmenId, olusturulma_tarihi: { [Op.between]: [gecenAyBaslangic, gecenAySon] } }, attributes: [[sequelize.fn('SUM', sequelize.col('net_tutar')), 'v']], raw: true }),
            Review.findOne({ where: { kurs_id: { [Op.in]: kursIdleri } }, attributes: [[sequelize.fn('AVG', sequelize.col('puan')), 'ort'], [sequelize.fn('COUNT', sequelize.literal('1')), 'sayi']], raw: true }),
            InstructorEarning.findAll({
                where: { egitmen_id: egitmenId, olusturulma_tarihi: { [Op.gte]: altiAyOnce } },
                attributes: [[sequelize.fn('YEAR', sequelize.col('olusturulma_tarihi')), 'yil'], [sequelize.fn('MONTH', sequelize.col('olusturulma_tarihi')), 'ay'], [sequelize.fn('SUM', sequelize.col('net_tutar')), 'toplam']],
                group: [sequelize.fn('YEAR', sequelize.col('olusturulma_tarihi')), sequelize.fn('MONTH', sequelize.col('olusturulma_tarihi'))],
                order: [[sequelize.fn('YEAR', sequelize.col('olusturulma_tarihi')), 'ASC'], [sequelize.fn('MONTH', sequelize.col('olusturulma_tarihi')), 'ASC']],
                raw: true
            }),
            CourseEnrollment.findAll({
                where: { kurs_id: { [Op.in]: kursIdleri }, kayit_tarihi: { [Op.gte]: altiAyOnce } },
                attributes: [[sequelize.fn('YEAR', sequelize.col('kayit_tarihi')), 'yil'], [sequelize.fn('MONTH', sequelize.col('kayit_tarihi')), 'ay'], [sequelize.fn('COUNT', sequelize.col('id')), 'sayi']],
                group: [sequelize.fn('YEAR', sequelize.col('kayit_tarihi')), sequelize.fn('MONTH', sequelize.col('kayit_tarihi'))],
                order: [[sequelize.fn('YEAR', sequelize.col('kayit_tarihi')), 'ASC'], [sequelize.fn('MONTH', sequelize.col('kayit_tarihi')), 'ASC']],
                raw: true
            }),
            Review.findAll({
                where: { kurs_id: { [Op.in]: kursIdleri } },
                attributes: ['kurs_id', 'puan', 'yorum', 'olusturulma_tarihi'],
                include: [{ model: Profile, as: 'Yazar', attributes: ['ad', 'soyad', 'profil_fotografi'] }],
                order: [['olusturulma_tarihi', 'DESC']],
                limit: 5
            }),
            sequelize.query(`
                SELECT
                    c.id AS kurs_id,
                    COALESCE((SELECT SUM(ie.net_tutar) FROM siparis_kalemleri oi JOIN egitmen_hakedisleri ie ON ie.siparis_kalemi_id = oi.id WHERE oi.kurs_id = c.id), 0) AS toplam_kazanc,
                    (SELECT COUNT(DISTINCT ce.ogrenci_id) FROM kurs_kayitlari ce WHERE ce.kurs_id = c.id) AS ogrenci_sayisi,
                    COALESCE((SELECT AVG(r.puan) FROM yorumlar r WHERE r.kurs_id = c.id), 0) AS ortalama_puan,
                    COALESCE((SELECT AVG(ce2.ilerleme_yuzdesi) FROM kurs_kayitlari ce2 WHERE ce2.kurs_id = c.id), 0) AS tamamlanma_orani
                FROM kurslar c
                WHERE c.egitmen_id = :egitmenId
                  AND (c.silindi_mi = false OR c.silindi_mi IS NULL)
                  AND (
                    c.durum <> 'taslak'
                    OR EXISTS (SELECT 1 FROM kurs_kayitlari ce3 WHERE ce3.kurs_id = c.id)
                    OR EXISTS (SELECT 1 FROM siparis_kalemleri oi2 WHERE oi2.kurs_id = c.id)
                  )
            `, { replacements: { egitmenId }, type: sequelize.QueryTypes.SELECT })
        ]);

        const buAyToplam = parseFloat(buAyKazanc?.v || 0);
        const gecenAyToplam = parseFloat(gecenAyKazanc?.v || 0);
        const kazancTrend = gecenAyToplam > 0 ? parseFloat(((buAyToplam - gecenAyToplam) / gecenAyToplam * 100).toFixed(1)) : null;

        const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
        const altıAy = Array.from({ length: 6 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
            return { yil: d.getFullYear(), ay: d.getMonth() + 1 };
        });

        const aylikKazancGrafik = altıAy.map(a => {
            const r = aylikKazanc.find(k => parseInt(k.yil) === a.yil && parseInt(k.ay) === a.ay);
            return { etiket: `${AYLAR[a.ay - 1]} ${a.yil}`, deger: parseFloat(r?.toplam || 0) };
        });

        const aylikKayitGrafik = altıAy.map(a => {
            const r = aylikKayit.find(k => parseInt(k.yil) === a.yil && parseInt(k.ay) === a.ay);
            return { etiket: `${AYLAR[a.ay - 1]} ${a.yil}`, deger: parseInt(r?.sayi || 0) };
        });

        const kursPerformanslari = kursStats.map(stat => {
            const kurs = courses.find(c => c.id === stat.kurs_id);
            return {
                id: stat.kurs_id,
                baslik: kurs?.baslik || '',
                durum: kurs?.durum || '',
                toplam_kazanc: parseFloat(parseFloat(stat.toplam_kazanc || 0).toFixed(2)),
                ogrenci_sayisi: parseInt(stat.ogrenci_sayisi || 0),
                ortalama_puan: parseFloat(parseFloat(stat.ortalama_puan || 0).toFixed(1)),
                tamamlanma_orani: parseFloat(parseFloat(stat.tamamlanma_orani || 0).toFixed(1))
            };
        });

        return res.json({
            success: true,
            data: {
                kpi: {
                    toplam_ogrenci: toplamOgrenci,
                    toplam_net_kazanc: parseFloat(parseFloat(kazancToplam?.v || 0).toFixed(2)),
                    bu_ay_kazanc: buAyToplam,
                    kazanc_trendi: kazancTrend,
                    ortalama_puan: parseFloat(parseFloat(yorumSonuc?.ort || 0).toFixed(1)),
                    toplam_yorum: parseInt(yorumSonuc?.sayi || 0),
                    yayinda_kurs: courses.filter(c => c.durum === 'yayinda').length,
                    diger_kurs: courses.filter(c => c.durum !== 'yayinda').length,
                    followerCount: followerCount,
                    toplam_takipci: followerCount
                },
                grafik: {
                    aylik_kazanc: aylikKazancGrafik,
                    aylik_kayit: aylikKayitGrafik,
                    kurs_dagilimi: kursPerformanslari.map(k => ({ etiket: k.baslik, deger: k.ogrenci_sayisi }))
                },
                son_yorumlar: sonYorumlar.map(y => {
                    const p = y.get({ plain: true });
                    return {
                        ogrenci_ad: `${p.Yazar?.ad || ''} ${p.Yazar?.soyad || ''}`.trim() || 'Anonim',
                        profil_fotografi: p.Yazar?.profil_fotografi || null,
                        puan: p.puan,
                        yorum: p.yorum,
                        tarih: p.olusturulma_tarihi
                    };
                }),
                kurs_performanslari: kursPerformanslari
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Egitmenin iyzico SubMerchant durumunu (read-only) doner.
 * Frontend banner gorunurlugunu localStorage'a degil bu canli endpoint'e baglar;
 * boylece hesap degisiminde (logout/login) durum dogru render edilir.
 *
 * @route GET /api/instructor/payment/submerchant/status
 * @response {
 *   connected: boolean,           // submerchant_key DB'de dolu mu
 *   iban_ok:   boolean,           // InstructorDetail.iban_no var mi
 *   tckn_ok:   boolean,           // Profile.identity_number gercek mi
 *   ready:     boolean,           // connect tetiklenebilir mi (her on kosul tamam)
 *   needs_approval: boolean,      // (Future-proof) admin onayi gerekli mi
 *   missing:   string[]           // eksik on kosullarin etiketleri
 * }
 */
exports.getSubMerchantStatus = async (req, res, next) => {
    try {
        const egitmenId = req.user.id;
        const profile = await Profile.findByPk(egitmenId, {
            attributes: ['id', 'identity_number', 'rol'],
            include: [{ model: InstructorDetail, attributes: ['iban_no', 'submerchant_key'] }],
        });
        if (!profile || profile.rol !== 'egitmen') {
            const err = new Error('Egitmen kaydi bulunamadi.');
            err.statusCode = 404;
            throw err;
        }

        const submerchantKey = profile.InstructorDetail?.submerchant_key || null;
        const ibanOk = !!profile.InstructorDetail?.iban_no;
        // varsayilan deger 11111111111 olarak yaratiliyor; gercek TCKN olarak kabul etmiyoruz.
        const tcknOk = !!profile.identity_number && profile.identity_number !== '11111111111';

        const connected = !!submerchantKey;
        // EduNex'te su an admin onay akisi yok; alani false sabitliyoruz ki frontend
        // ileride backend'i degistirmeden de onay-kapisi UX'ini destekleyebilsin.
        const needsApproval = false;

        const missing = [];
        if (!ibanOk) missing.push('iban');
        if (!tcknOk) missing.push('tckn');

        return res.status(200).json({
            success: true,
            data: {
                connected,
                iban_ok: ibanOk,
                tckn_ok: tcknOk,
                ready: !connected && ibanOk && tcknOk && !needsApproval,
                needs_approval: needsApproval,
                missing,
            },
        });
    } catch (error) {
        console.error('[SUBMERCHANT STATUS]', { message: error.message });
        next(error);
    }
};

/**
 * Egitmenin iyzico Pazaryeri Alt Uye Isyeri (SubMerchant) kaydini olusturur.
 * Idempotent: zaten bir submerchant_key varsa yeniden olusturmaz.
 * Ucret tahsilatinda her basket item bu key uzerinden eslenecek.
 * @route POST /api/instructor/payment/submerchant
 */
exports.registerSubMerchant = async (req, res, next) => {
    const egitmenId = req.user.id;
    try {
        const profile = await Profile.findByPk(egitmenId, {
            attributes: ['id', 'ad', 'soyad', 'eposta', 'phone', 'identity_number', 'sehir', 'rol'],
            include: [{ model: InstructorDetail, attributes: ['iban_no', 'submerchant_key'] }],
        });

        if (!profile || profile.rol !== 'egitmen') {
            const err = new Error('Egitmen kaydi bulunamadi.');
            err.statusCode = 404;
            throw err;
        }
        if (!profile.InstructorDetail) {
            const err = new Error('Egitmen detay kaydi yok. Once profilinizi tamamlayin.');
            err.statusCode = 400;
            throw err;
        }
        if (profile.InstructorDetail.submerchant_key) {
            return res.status(200).json({
                success: true,
                message: 'SubMerchant kaydiniz zaten mevcut.',
                data: { submerchant_key: profile.InstructorDetail.submerchant_key, already_registered: true },
            });
        }
        if (!profile.InstructorDetail.iban_no) {
            const err = new Error('Hakedis transferi icin profilinizde IBAN tanimli olmalidir.');
            err.statusCode = 400;
            throw err;
        }
        if (!profile.identity_number || profile.identity_number === '11111111111') {
            const err = new Error('Gercek T.C. Kimlik Numaranizi profilinize ekleyin (varsayilan deger kabul edilmez).');
            err.statusCode = 400;
            throw err;
        }

        const { subMerchantKey, raw } = await iyzicoService.createSubMerchant({
            id: profile.id,
            ad: profile.ad,
            soyad: profile.soyad,
            eposta: profile.eposta,
            phone: profile.phone,
            identity_number: profile.identity_number,
            iban_no: profile.InstructorDetail.iban_no,
            sehir: profile.sehir,
        });

        await InstructorDetail.update(
            { submerchant_key: subMerchantKey },
            { where: { kullanici_id: profile.id } }
        );

        console.log(`[SUBMERCHANT OK] egitmen=${profile.id} key=${subMerchantKey}`);
        return res.status(201).json({
            success: true,
            message: 'iyzico SubMerchant kaydi olusturuldu. Artik kurs satislariniz dogrudan hesabiniza yansiyacak.',
            data: { submerchant_key: subMerchantKey, raw: process.env.NODE_ENV === 'production' ? undefined : raw },
        });
    } catch (error) {
        // --- Tam hata detayini terminale dok: 500'un kok nedenini gormezse ekibimiz takilir. ---
        console.error('SUBMERCHANT KAYIT HATASI DETAYI:', error);
        console.error('[SUBMERCHANT FATAL]', {
            egitmenId,
            message: error.message,
            statusCode: error.statusCode,
            iyzico: error.iyzicoResult || null,
            stack: error.stack,
        });

        // --- iyzico kaynakli hatalar (IBAN/TCKN/format) frontend'e 400 ile dondurulur ---
        // iyzicoResult dolu ise iyzico'dan failure donmus demektir; mesaji direkt kullaniciya gosteriyoruz.
        // Bu sayede "IBAN hatali", "TCKN gecersiz" gibi spesifik nedenleri kullanici gorebilir.
        if (error.iyzicoResult) {
            return res.status(400).json({
                success: false,
                message: error.iyzicoResult.errorMessage || error.message || 'iyzico SubMerchant kaydi reddedildi.',
                code: error.iyzicoResult.errorCode || null,
                group: error.iyzicoResult.errorGroup || null,
                source: 'iyzico',
            });
        }

        // --- Servis tarafindaki pre-validation hatalari da 400 olarak dondurulur ---
        // createSubMerchant icindeki "SubMerchant veri dogrulamasi basarisiz: ..." gibi mesajlar buraya duser.
        if (error.statusCode === 400 || /SubMerchant veri dogrulamasi basarisiz/i.test(error.message || '')) {
            return res.status(400).json({
                success: false,
                message: error.message,
                source: 'validation',
            });
        }

        // Diger her sey gercekten beklenmeyen sunucu hatasi -> global error handler 500 dondurur.
        next(error);
    }
};

/**
 * Public Egitmen Listesi — Global aramayi besler.
 *
 * KRITIK: Egitmen kursu olmasa bile listede yer ALMALI. Eskiden arama motoru
 * /api/courses/published listesinden Egitmen.id'leri turetiyordu; kursu olmayan
 * yeni egitmenler aramada hic gorunmuyor ve profil sayfalarina ulasilamiyordu.
 *
 * @route GET /api/instructor/list
 * @query  q     - opsiyonel arama terimi (ad/soyad/sehir LIKE)
 * @query  limit - max kayit (varsayilan 500, hard cap 1000)
 *
 * Veri sadece public-safe alanlardir; eposta/telefon vb. sizdirilmaz.
 */
exports.getPublicInstructorList = async (req, res, next) => {
    try {
        const rawLimit = parseInt(req.query.limit, 10);
        const limit = Math.min(1000, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 500));

        // rol filtresi Op.and ile sabitlenir; q gibi opsiyonel kosullar bunu
        // ezemez. Boylece ogrenci rolundeki kayitlar listeye sizmaz.
        const andClauses = [{ rol: 'egitmen' }];

        const q = (req.query.q || '').toString().trim();
        if (q) {
            andClauses.push({
                [Op.or]: [
                    { ad:    { [Op.like]: `%${q}%` } },
                    { soyad: { [Op.like]: `%${q}%` } },
                    { sehir: { [Op.like]: `%${q}%` } },
                ]
            });
        }

        const where = { [Op.and]: andClauses };

        // LEFT JOIN: InstructorDetail opsiyonel (required: false). Detay satiri
        // hic olusturulmamis legacy egitmenler de listeye dahil olur.
        const egitmenler = await Profile.findAll({
            where,
            attributes: ['id', 'ad', 'soyad', 'sehir', 'rol', 'profil_fotografi'],
            include: [{
                model: InstructorDetail,
                attributes: ['unvan', 'baslik'],
                required: false,
            }],
            order: [['ad', 'ASC'], ['soyad', 'ASC']],
            limit,
        });

        const data = egitmenler.map(e => {
            const p = e.get({ plain: true });
            return {
                id: p.id,
                ad: p.ad || '',
                soyad: p.soyad || '',
                tam_ad: `${p.ad || ''} ${p.soyad || ''}`.trim(),
                rol: p.rol,
                sehir: p.sehir || null,
                profil_fotografi: p.profil_fotografi || null,
                unvan: p.InstructorDetail?.unvan || null,
                baslik: p.InstructorDetail?.baslik || null,
            };
        });

        return res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.getPublicProfile = async (req, res, next) => {
    try {
        const { instructorId } = req.params;

        const profil = await Profile.findOne({
            where: { id: instructorId, rol: 'egitmen' },
            attributes: ['id', 'ad', 'soyad', 'sehir', 'website', 'profil_fotografi',
                         'facebook', 'instagram', 'linkedin', 'tiktok', 'x_twitter', 'youtube'],
            include: [{
                model: InstructorDetail,
                attributes: ['unvan', 'baslik', 'biyografi', 'deneyim_yili']
            }]
        });

        if (!profil) {
            return res.status(404).json({ success: false, message: 'Eğitmen bulunamadı.' });
        }

        const kurslar = await Course.findAll({
            where: { egitmen_id: instructorId, durum: 'yayinda', silindi_mi: false },
            attributes: ['id', 'baslik', 'aciklama', 'fiyat', 'kategori_id'],
            include: [
                {
                    model: Category,
                    attributes: ['id', 'ad']
                },
                {
                    model: Review,
                    attributes: ['puan'],
                    required: false
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        // İndirim bilgisini tek sorguda iliştir
        await discountService.attachPricingToCourses(kurslar);

        const kurslarHesapli = kurslar.map(k => {
            const yorumlar = k.Reviews || [];
            const toplamYorum = yorumlar.length;
            const ortalamaPuan = toplamYorum > 0
                ? parseFloat((yorumlar.reduce((t, r) => t + r.puan, 0) / toplamYorum).toFixed(1))
                : 0;

            const plain = k.get({ plain: true });
            delete plain.Reviews;
            return { ...plain, istatistikler: { ortalama_puan: ortalamaPuan, toplam_yorum: toplamYorum } };
        });

        const tumYorumlar = kurslar.flatMap(k => k.Reviews || []);
        const toplamYorum = tumYorumlar.length;
        const ortalamaPuan = toplamYorum > 0
            ? parseFloat((tumYorumlar.reduce((t, r) => t + r.puan, 0) / toplamYorum).toFixed(1))
            : 0;

        const paunDagilimi = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        tumYorumlar.forEach(r => { if (paunDagilimi[r.puan] != null) paunDagilimi[r.puan]++; });

        const kursIdleri = kurslar.map(k => k.id);
        let toplamOgrenci = 0;
        if (kursIdleri.length > 0) {
            toplamOgrenci = await CourseEnrollment.count({
                where: { kurs_id: { [Op.in]: kursIdleri } },
                col: 'ogrenci_id',
                distinct: true
            });
        }

        // Toplam takipci sayisi (public profilde gosterilir).
        const followerCount = await InstructorFollower.count({
            where: { egitmen_id: instructorId }
        });

        const webinarlar = await LiveSession.findAll({
            where: {
                egitmen_id: instructorId,
                durum: 'tamamlandi',
                kayit_alinsin_mi: true,
                yayin_tipi: 'genel',
                kayit_video_url: { [Op.ne]: null }
            },
            attributes: ['id', 'baslik', 'aciklama', 'baslangic_tarihi', 'kayit_video_url'],
            order: [['baslangic_tarihi', 'DESC']]
        });

        return res.json({
            success: true,
            data: {
                profil: {
                    id: profil.id,
                    ad: profil.ad,
                    soyad: profil.soyad,
                    sehir: profil.sehir,
                    website: profil.website,
                    profil_fotografi: profil.profil_fotografi,
                    facebook: profil.facebook,
                    instagram: profil.instagram,
                    linkedin: profil.linkedin,
                    tiktok: profil.tiktok,
                    x_twitter: profil.x_twitter,
                    youtube: profil.youtube,
                },
                detay: profil.InstructorDetail || {},
                kurslar: kurslarHesapli,
                webinarlar: webinarlar,
                istatistikler: {
                    toplam_kurs: kurslarHesapli.length,
                    toplam_ogrenci: toplamOgrenci,
                    toplam_yorum: toplamYorum,
                    ortalama_puan: ortalamaPuan,
                    puan_dagilimi: paunDagilimi,
                    followerCount: followerCount,
                    toplam_takipci: followerCount,
                }
            }
        });

    } catch (error) {
        next(error);
    }
};

// ============================================================
// SATIS GECMISI / HAK EDIS (Egitmen kendi paneli)
// ============================================================
/**
 * GET /api/instructor/earnings/sales-history
 *
 * Eğitmenin kendi satışlarını ve karşılığında oluşmuş hak ediş kayıtlarını listeler.
 * Veri gizliliği: Yalnızca kendi siparis_kalemleri döner.
 *
 * Query: ?page=1&limit=20&durum=available|pending|paid|cancelled (opsiyonel)
 */
exports.getMySalesHistory = async (req, res, next) => {
    try {
        const egitmenId = req.user.id;
        const { OrderItem, Order } = require('../models');

        const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
        const offset = (page - 1) * limit;

        const where = { egitmen_id: egitmenId };
        const validDurum = ['pending', 'available', 'processing', 'paid', 'cancelled'];
        if (req.query.durum && validDurum.includes(req.query.durum)) {
            where.durum = req.query.durum;
        }

        const { rows, count } = await InstructorEarning.findAndCountAll({
            where,
            attributes: [
                'id', 'siparis_kalemi_id', 'brut_tutar', 'komisyon_orani',
                'platform_kesintisi', 'net_tutar', 'durum',
                'olusturulma_tarihi', 'odeme_tarihi',
            ],
            include: [{
                model: OrderItem,
                attributes: ['id', 'siparis_id', 'odenen_fiyat'],
                required: true,
                include: [
                    { model: Course, attributes: ['id', 'baslik'] },
                    {
                        model: Order,
                        attributes: ['id', 'olusturulma_tarihi', 'durum', 'kullanici_id'],
                        include: [{ model: Profile, attributes: ['ad', 'soyad', 'eposta'], required: false }],
                    },
                ],
            }],
            order: [['olusturulma_tarihi', 'DESC']],
            limit,
            offset,
            distinct: true,
        });

        const data = rows.map((r) => {
            const item   = r.OrderItem;
            const order  = item?.Order;
            const cust   = order?.Profile;
            const adSoyad = cust ? `${cust.ad || ''} ${cust.soyad || ''}`.trim() : '—';
            return {
                earning_id: r.id,
                siparis_id: order?.id || null,
                siparis_durumu: order?.durum || null,
                tarih: order?.olusturulma_tarihi || r.olusturulma_tarihi,
                kurs: item?.Course
                    ? { id: item.Course.id, baslik: item.Course.baslik }
                    : { id: null, baslik: 'Silinmiş kurs' },
                ogrenci: {
                    ad_soyad: adSoyad || '—',
                    eposta: cust?.eposta || null,
                },
                finans: {
                    brut: Number(r.brut_tutar || 0),
                    komisyon_orani: Number(r.komisyon_orani || 0),
                    platform_kesintisi: Number(r.platform_kesintisi || 0),
                    net: Number(r.net_tutar || 0),
                    para_birimi: 'TRY',
                },
                durum: r.durum,
                odeme_tarihi: r.odeme_tarihi,
            };
        });

        return res.json({
            success: true,
            data,
            pagination: {
                total: count,
                page,
                limit,
                pages: Math.ceil(count / limit) || 1,
            },
        });
    } catch (error) {
        console.error('[INSTRUCTOR SALES HISTORY] hata:', error.message);
        next(error);
    }
};