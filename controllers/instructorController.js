const { Lesson, Profile, InstructorDetail, Course, Review, Category, CourseEnrollment, InstructorEarning, sequelize } = require('../models');
const { Op } = require('sequelize');

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

        const courses = await Course.findAll({
            where: { egitmen_id: egitmenId, silindi_mi: false },
            attributes: ['id', 'baslik', 'durum'],
            raw: true
        });
        const kursIdleri = courses.map(c => c.id);

        const now = new Date();
        const buAyBaslangic = new Date(now.getFullYear(), now.getMonth(), 1);
        const gecenAyBaslangic = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const gecenAySon = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const altiAyOnce = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const emptyKpi = {
            toplam_ogrenci: 0, toplam_net_kazanc: 0, bu_ay_kazanc: 0,
            kazanc_trendi: null, ortalama_puan: 0, toplam_yorum: 0,
            yayinda_kurs: courses.filter(c => c.durum === 'yayinda').length,
            diger_kurs: courses.filter(c => c.durum !== 'yayinda').length
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
                WHERE c.egitmen_id = :egitmenId AND (c.silindi_mi = false OR c.silindi_mi IS NULL)
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
                    diger_kurs: courses.filter(c => c.durum !== 'yayinda').length
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
                istatistikler: {
                    toplam_kurs: kurslarHesapli.length,
                    toplam_ogrenci: toplamOgrenci,
                    toplam_yorum: toplamYorum,
                    ortalama_puan: ortalamaPuan,
                    puan_dagilimi: paunDagilimi,
                }
            }
        });

    } catch (error) {
        next(error);
    }
};