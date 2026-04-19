const { 
    StudentInterest, 
    Category, 
    Course, 
    CourseEnrollment, 
    Review, 
    Profile 
} = require('../models');
const { Op, fn, col, literal } = require('sequelize');

/**
 * Öğrenciye Kişiselleştirilmiş Kurs Önerileri Getir
 * 
 * Mantık:
 * 1. Öğrencinin ilgi alanlarını (kategori_id) bul
 * 2. Bu kategorilerdeki kursları çek
 * 3. Daha önce kayıt olmaları filtreleyip
 * 4. En yüksek puanlı veya en çok kayıtlı 5 kursu döndür
 * 
 * @route GET /api/recommendations/personalized
 * @access Private (Öğrenci)
 */
exports.getPersonalizedRecommendations = async (req, res, next) => {
    try {
        const studentId = req.user.id;

        console.log(`[RECOMMENDATION] Öğrenci ${studentId} için öneriler hazırlanıyor...`);

        // 1. ADIM: Öğrencinin İlgi Alanlarını Bul
        const studentInterests = await StudentInterest.findAll({
            where: { ogrenci_id: studentId },
            attributes: ['kategori_id'],
            raw: true
        });

        console.log(`[RECOMMENDATION] Öğrenci ${studentId} ilgi alanları:`, studentInterests);

        if (studentInterests.length === 0) {
            console.log(`[RECOMMENDATION] Öğrenci ${studentId} ilgi alanı tanımlanmamış.`);
            return res.status(200).json({
                status: 'success',
                message: 'İlgi alanı tanımlanmadığı için genel öneriler getiriliyor.',
                data: []
            });
        }

        // İlgi alanı ID'lerini dizi haline getir
        const categoryIds = studentInterests.map(interest => interest.kategori_id);
        console.log(`[RECOMMENDATION] Kategori ID'leri: ${categoryIds.join(', ')}`);

        // 2. ADIM: Öğrencinin Zaten Kayıtlı Olduğu Kursları Bul
        const enrolledCourses = await CourseEnrollment.findAll({
            where: { ogrenci_id: studentId },
            attributes: ['kurs_id'],
            raw: true
        });

        const enrolledCourseIds = enrolledCourses.map(enr => enr.kurs_id);
        console.log(`[RECOMMENDATION] Kayıtlı kurslar: ${enrolledCourseIds.join(', ') || 'Hiçbiri'}`);

        // 3. ADIM: İlgi Alanlarındaki Yayında Kursları Çek (Kayıtlı Olmadığı)
        const recommendations = await Course.findAll({
            where: {
                kategori_id: { [Op.in]: categoryIds }, // İlgi alanlarında
                durum: 'yayinda',                      // Yayında olan
                id: { [Op.notIn]: enrolledCourseIds }  // Kayıtlı olmadığı
            },
            attributes: [
                'id',
                'baslik',
                'alt_baslik',
                'aciklama',
                'kategori_id',
                'fiyat',
                'seviye',
                'egitmen_id',
                [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'toplam_ogrenci'],
                [literal('(SELECT AVG(puan) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'ortalama_puan']
            ],
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['id', 'ad', 'soyad', 'profil_fotografi']
                },
                {
                    model: Category,
                    attributes: ['id', 'ad']
                },
                {
                    model: Review,
                    attributes: ['id', 'puan'],
                    required: false
                }
            ],
            order: [
                // ÖNCELİK: Puanı yüksek olanlar
                [literal('(SELECT AVG(puan) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'DESC'],
                // İKİNCİL: Kayıtlı öğrenci sayısı yüksek olanlar
                [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'DESC'],
                // ÜÇÜNCÜL: Oluşturma tarihi
                ['createdAt', 'DESC']
            ],
            limit: 5,
            subQuery: false,
            raw: false
        });

        console.log(`[RECOMMENDATION] ${recommendations.length} kurs önerisi hazırlandı.`);

        // 4. ADIM: Yanıt Formatı Oluştur
        const formattedRecommendations = recommendations.map(course => ({
            id: course.id,
            baslik: course.baslik,
            alt_baslik: course.alt_baslik,
            aciklama: course.aciklama,
            fiyat: course.fiyat,
            seviye: course.seviye,
            egitmen: {
                id: course.Egitmen?.id,
                ad: course.Egitmen?.ad,
                soyad: course.Egitmen?.soyad,
                profil_fotografi: course.Egitmen?.profil_fotografi
            },
            kategori: {
                id: course.Category?.id,
                ad: course.Category?.ad
            },
            istatistikler: {
                toplam_ogrenci: course.dataValues.toplam_ogrenci || 0,
                ortalama_puan: course.dataValues.ortalama_puan 
                    ? parseFloat(course.dataValues.ortalama_puan).toFixed(2) 
                    : null,
                yorum_sayisi: course.Reviews?.length || 0
            }
        }));

        return res.status(200).json({
            status: 'success',
            message: `${studentId} için ${formattedRecommendations.length} kurs önerileri hazırlandı.`,
            data: formattedRecommendations
        });

    } catch (error) {
        console.error('[RECOMMENDATION] Hata:', error.message);
        console.error('[RECOMMENDATION] Stack:', error.stack);
        next(error);
    }
};

/**
 * Trending Kurslar Getir (En Çok Kayıtlı)
 * 
 * @route GET /api/recommendations/trending
 * @access Public
 */
exports.getTrendingCourses = async (req, res, next) => {
    try {
        const trendingCourses = await Course.findAll({
            where: { durum: 'yayinda' },
            attributes: [
                'id',
                'baslik',
                'fiyat',
                'seviye',
                [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'toplam_ogrenci'],
                [literal('(SELECT AVG(puan) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'ortalama_puan']
            ],
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad']
                },
                {
                    model: Category,
                    attributes: ['ad']
                }
            ],
            order: [
                [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'DESC']
            ],
            limit: 10,
            subQuery: false,
            raw: false
        });

        return res.status(200).json({
            status: 'success',
            message: 'Trend olan kurslar başarıyla getirildi.',
            data: trendingCourses
        });

    } catch (error) {
        console.error('[TRENDING] Hata:', error.message);
        next(error);
    }
};

/**
 * En Yüksek Puanlı Kurslar Getir
 * 
 * @route GET /api/recommendations/top-rated
 * @access Public
 */
exports.getTopRatedCourses = async (req, res, next) => {
    try {
        const topRatedCourses = await Course.findAll({
            where: { durum: 'yayinda' },
            attributes: [
                'id',
                'baslik',
                'fiyat',
                [literal('(SELECT AVG(puan) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'ortalama_puan'],
                [literal('(SELECT COUNT(*) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'yorum_sayisi'],
                [literal('(SELECT COUNT(*) FROM kurs_kayitlari WHERE kurs_kayitlari.kurs_id = Course.id)'), 'toplam_ogrenci']
            ],
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad']
                }
            ],
            order: [
                [literal('(SELECT AVG(puan) FROM yorumlar WHERE yorumlar.kurs_id = Course.id)'), 'DESC']
            ],
            limit: 10,
            subQuery: false,
            raw: false
        });

        const filtered = topRatedCourses.filter(course => 
            course.dataValues.ortalama_puan !== null
        );

        return res.status(200).json({
            status: 'success',
            message: 'En yüksek puanlı kurslar başarıyla getirildi.',
            data: filtered
        });

    } catch (error) {
        console.error('[TOP-RATED] Hata:', error.message);
        next(error);
    }
};