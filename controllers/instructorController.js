const { Lesson, Profile, InstructorDetail, Course, Review, Category, CourseEnrollment, sequelize } = require('../models');
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