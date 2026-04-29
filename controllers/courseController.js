const {
    Course,
    Profile,
    CourseSection,
    Lesson,
    LessonProgress,
    CourseEnrollment,
    Category,
    InstructorDetail,
    Review
} = require('../models');
const path = require('path');
const fs = require('fs');
const { fn, col, Op } = require('sequelize');
const { recalculateCourseProgress } = require('../services/progressService');
const { uploadFileToBunnyStorage, deleteFileFromBunnyStorage } = require('../services/bunnyService');

/**
 * Tüm Kursları Getir (Sayfalama ile)
 * @route GET /api/courses
 */
exports.getAllCourses = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        const { count, rows } = await Course.findAndCountAll({
            where: { durum: 'yayinda', silindi_mi: false },
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad']
                },
                {
                    model: Category,
                    attributes: ['id', 'ad']
                }
            ],
            limit,
            offset,
            order: [['olusturulma_tarihi', 'DESC']]
        });

        const totalPages = Math.ceil(count / limit);

        return res.status(200).json({
            status: 'success',
            message: 'Courses retrieved successfully.',
            data: rows,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalCourses: count,
                coursesPerPage: limit
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Eğitmen Tarafından Oluşturulan Kursları Getir
 * @route GET /api/courses/my-courses
 */
exports.getInstructorCourses = async (req, res, next) => {
    try {
        const instructorId = req.user.id;

        const courses = await Course.findAll({
            // Egitmen kendi kurslarini her durumda gorur, ama admin tarafindan soft-deleted edilen kurslari gormemeli.
            where: { egitmen_id: instructorId, silindi_mi: false },
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad']
                },
                {
                    model: CourseSection,
                    as: 'Sections',
                    attributes: ['id', 'baslik', 'sira_numarasi'],
                    where: { gizli_mi: false },
                    required: false,
                    include: [{
                        model: Lesson,
                        as: 'Lessons',
                        attributes: ['id', 'baslik', 'sira_numarasi'],
                        where: { gizli_mi: false },
                        required: false,
                        order: [['sira_numarasi', 'ASC']]
                    }],
                    order: [['sira_numarasi', 'ASC']]
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']],
            subQuery: false
        });

        return res.status(200).json({
            success: true,
            message: 'Kurslarınız başarıyla getirildi.',
            data: courses
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Yeni Kurs Oluştur
 * @route POST /api/courses
 */
exports.createCourse = async (req, res, next) => {
    try {
        const { baslik, alt_baslik, aciklama, kategori_id, fiyat, dil, seviye, gereksinimler, kazanimlar } = req.body;
        const egitmen_id = req.user.id;

        // Validasyon
        if (!baslik || !aciklama || !kategori_id) {
            const error = new Error('Başlık, açıklama ve kategori gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        const course = await Course.create({
            baslik,
            alt_baslik: alt_baslik || '',
            aciklama,
            kategori_id,
            egitmen_id,
            fiyat: fiyat || 0,
            dil: dil || 'Turkce',
            seviye: seviye || 'Baslangic',
            gereksinimler: gereksinimler || '',
            kazanimlar: kazanimlar || '',
            durum: 'taslak'
        });

        return res.status(201).json({
            status: 'success',
            message: 'Kurs başarıyla oluşturuldu.',
            data: course
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Kurs Detaylarını Getir
 * @route GET /api/courses/:id
 */
exports.getCourseDetails = async (req, res, next) => {
    try {
        const { id } = req.params;

        const course = await Course.findOne({
            where: { id, silindi_mi: false },
            include: [
                {
                    // 1. Profil tablosundan temel ad ve soyad bilgilerini çekiyoruz
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['id', 'ad', 'soyad', 'profil_fotografi']
                },
                {
                    // 2. Eğitmen detayları tablosundan unvan ve biyografiyi çekiyoruz
                    model: InstructorDetail,
                    attributes: ['unvan', 'biyografi']
                },
                {
                    // 3. Müfredatı ve altındaki dersleri çekiyoruz (gizli olanlar haric)
                    model: CourseSection,
                    as: 'Sections',
                    where: { gizli_mi: false },
                    required: false,
                    include: [
                        {
                            model: Lesson,
                            as: 'Lessons',
                            attributes: [
                                'id', 'baslik', 'icerik_tipi', 'sure_saniye',
                                'onizleme_mi', 'sira_numarasi',
                                'video_saglayici_id', 'kaynak_url'
                            ],
                            where: { gizli_mi: false },
                            required: false
                        }
                    ]
                }
            ],
            order: [
                [{ model: CourseSection, as: 'Sections' }, 'sira_numarasi', 'ASC'],
                [{ model: CourseSection, as: 'Sections' }, { model: Lesson, as: 'Lessons' }, 'sira_numarasi', 'ASC']
            ]
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // Iade taslak veya yayinda olmayan kurslar magazada gorunmemeli (admin/instructor disi).
        // Kurs detay sayfasi public; sadece yayinda olan veya kullanicinin satin aldigi (arsiv) kurslara izin verilir.
        // Burada sadece silindi/iade-taslak'i 404 gibi gosteriyoruz; yayinda kontrolu zaten ust seviyede mevcut.
        if (course.silindi_mi || (course.durum === 'taslak' && course.admin_tarafindan_iade_edildi)) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // Yorum istatistikleri tek aggregate sorguda hesaplanir (tum puan satirlari yerine).
        const ratingStats = await Review.findOne({
            where: { kurs_id: id },
            attributes: [
                [fn('AVG', col('puan')), 'ortalama_puan'],
                [fn('COUNT', col('puan')), 'toplam_yorum']
            ],
            raw: true
        });

        const ortalama_puan = ratingStats?.ortalama_puan
            ? parseFloat(parseFloat(ratingStats.ortalama_puan).toFixed(1))
            : null;
        const toplam_yorum = parseInt(ratingStats?.toplam_yorum, 10) || 0;

        // Yalnizca onizleme_mi=true olan derslerin video kaynaklari disa acilir.
        const courseJson = course.toJSON();
        if (Array.isArray(courseJson.Sections)) {
            courseJson.Sections = courseJson.Sections.map(section => ({
                ...section,
                Lessons: (section.Lessons || []).map(lesson => {
                    if (lesson.onizleme_mi === true) return lesson;
                    return {
                        ...lesson,
                        video_saglayici_id: null,
                        kaynak_url: null
                    };
                })
            }));
        }

        courseJson.istatistikler = { ortalama_puan, toplam_yorum };
        courseJson.bunny_library_id = process.env.BUNNY_LIBRARY_ID || null;


        return res.status(200).json({
            success: true,
            data: courseJson
        });

    } catch (error) {
        console.error(`[COURSE DETAIL] Hata: ${error.message}`);
        next(error);
    }
};

/**
 * Kurs Bilgilerini Güncelle
 * @route PUT /api/courses/:id
 */
exports.updateCourse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { baslik, aciklama, kategori_id, fiyat, seviye, gereksinimler, kazanimlar } = req.body;

        // Kursun sahibini kontrol et
        const course = await Course.findOne({
            where: { id },
            attributes: ['id', 'egitmen_id']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // Yetki kontrolü
        if (course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Güncellenecek alanları hazırla
        const updateData = {};
        if (baslik !== undefined) updateData.baslik = baslik;
        if (aciklama !== undefined) updateData.aciklama = aciklama;
        if (kategori_id !== undefined) updateData.kategori_id = kategori_id;
        if (fiyat !== undefined) updateData.fiyat = fiyat;
        if (seviye !== undefined) updateData.seviye = seviye;
        if (gereksinimler !== undefined) updateData.gereksinimler = gereksinimler;
        if (kazanimlar !== undefined) updateData.kazanimlar = kazanimlar;

        await course.update(updateData);

        return res.status(200).json({
            status: 'success',
            message: 'Kurs başarıyla güncellendi.',
            data: course
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Kurs Durumunu Değiştir
 * @route PUT /api/courses/:id/status
 */
exports.updateCourseStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { durum } = req.body;

        const validStatuses = ['taslak', 'onay_bekliyor', 'onaylandi', 'yayinda', 'arsiv'];
        
        if (!validStatuses.includes(durum)) {
            const error = new Error(`Geçersiz kurs durumu. İzin verilen durumlar: ${validStatuses.join(', ')}`);
            error.statusCode = 400;
            throw error;
        }

        // Kursun sahibini kontrol et
        const course = await Course.findOne({
            where: { id },
            attributes: ['id', 'egitmen_id', 'durum']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // Yetki kontrolü
        if (course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Durum değişim kuralları
        const validTransitions = {
            'taslak': ['onay_bekliyor', 'arsiv'],
            'onay_bekliyor': ['taslak', 'onaylandi', 'arsiv'],
            'onaylandi': ['yayinda', 'arsiv', 'taslak'],
            'yayinda': ['arsiv'],
            'arsiv': ['taslak']
        };

        if (validTransitions[course.durum] && !validTransitions[course.durum].includes(durum)) {
            const error = new Error(
                `"${course.durum}" durumundan "${durum}" durumuna geçiş yapılamaz.`
            );
            error.statusCode = 400;
            throw error;
        }

        // Eğitmen iade taslağı (admin_tarafindan_iade_edildi=true) yeniden onaya/yayına
        // gönderiyorsa iade bayrağı ve sebebi temizlenmelidir; aksi halde kırmızı banner
        // kurs yeniden yayında olsa bile eğitmen UI'ında inatla görünmeye devam eder.
        const updates = { durum };
        if (durum !== 'taslak') {
            updates.admin_tarafindan_iade_edildi = false;
            updates.iade_tarihi = null;
            updates.iade_eden_admin_id = null;
            updates.iade_sebebi = null;
        }

        await course.update(updates);

        return res.status(200).json({
            status: 'success',
            message: `Kurs durumu "${durum}" olarak güncellendi.`,
            data: { 
                id: course.id, 
                durum: course.durum 
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Kurs Sil
 * @route DELETE /api/courses/:id
 */
exports.deleteCourse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const course = await Course.findOne({
            where: { id },
            attributes: ['id', 'egitmen_id']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        const enrolledCount = await CourseEnrollment.count({ where: { kurs_id: id } });
        if (enrolledCount > 0) {
            const error = new Error(`Bu kursa kayıtlı ${enrolledCount} öğrenci olduğu için silinemez.`);
            error.statusCode = 400;
            throw error;
        }

        await course.destroy();

        return res.status(200).json({
            status: 'success',
            message: 'Kurs başarıyla silindi.',
            data: { id: course.id }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Yayında olan Tüm Kursları Getir
 * @route GET /api/courses/published
 */
exports.getAllPublishedCourses = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        const { count, rows } = await Course.findAndCountAll({
            where: { durum: 'yayinda', silindi_mi: false },
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['id', 'ad', 'soyad']
                },
                {
                    model: Category,
                    attributes: ['id', 'ad']
                },
                {
                    // Puanları hesaplamak için Yorumlar tablosunu dahil ediyoruz
                    model: Review,
                    attributes: ['puan']
                }
            ],
            limit,
            offset,
            order: [['olusturulma_tarihi', 'DESC']],
            distinct: true // findAndCountAll kullanırken include varsa sayım hatasını önler
        });

        const totalPages = Math.ceil(count / limit);

        // Her kurs için ortalama puanı ve toplam yorum sayısını hesapla
        const coursesWithStats = rows.map(course => {
            const courseJson = course.toJSON();
            const reviews = courseJson.Reviews || [];
            const toplam_yorum = reviews.length;
            let ortalama_puan = null;

            if (toplam_yorum > 0) {
                const toplamPuan = reviews.reduce((toplam, r) => toplam + r.puan, 0);
                ortalama_puan = parseFloat((toplamPuan / toplam_yorum).toFixed(1));
            }

            // API yanıtını şişirmemek için ham yorum dizisini siliyoruz
            delete courseJson.Reviews;

            return {
                ...courseJson,
                istatistikler: {
                    ortalama_puan: ortalama_puan,
                    toplam_yorum: toplam_yorum
                }
            };
        });

        return res.status(200).json({
            status: 'success',
            message: 'Published courses retrieved successfully.',
            data: coursesWithStats,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalCourses: count,
                coursesPerPage: limit
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Öğrenci için Kurs Öğrenim Verisi Getir
 * @route GET /api/courses/:courseId/learning
 * @access Private (Sadece kayıtlı öğrenciler)
 * 
 * MANTIK:
 * 1. Öğrencinin kursa kayıtlı olduğunu kontrol et (CourseEnrollment)
 * 2. Kursun bölümlerini (Sections) sira_numarasi sırasında getir
 * 3. Her bölümün dersleri (Lessons) sira_numarasi sırasında getir
 * 4. Öğrencinin hangi dersleri tamamladığını LessonProgress'ten getir
 * 5. Eager Loading kullanarak N+1 sorununu önle
 */
exports.getCourseCurriculumForStudent = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const studentId = req.user.id;

        console.log(`[LEARNING] Öğrenci ${studentId} kurs ${courseId} için öğrenim verisi istedi`);

        // === ADIM 1: Öğrencinin kursa kayıtlı olduğunu kontrol et ===
        const enrollment = await CourseEnrollment.findOne({
            where: {
                ogrenci_id: studentId,
                kurs_id: courseId
            },
            attributes: ['id', 'ilerleme_yuzdesi', 'kayit_tarihi']
        });

        if (!enrollment) {
            const error = new Error('Bu kursa kayıt bulunmamaktadır. Erişim yetkisi yok.');
            error.statusCode = 403;
            console.warn(`[LEARNING] Yetkisiz erişim: ${studentId} → ${courseId}`);
            throw error;
        }

        console.log(`[LEARNING] Kayıt doğrulandı. İlerleme: ${enrollment.ilerleme_yuzdesi}%`);

        // === ADIM 2: Kurs bilgilerini ve bölümleri getir ===
        // Politika: Yayinda VEYA arsivdeki kursa kayitli ogrenci erisimi korur.
        // Taslak (admin iade etti), onay_bekliyor, onaylandi, silindi -> erisim engellenir.
        const course = await Course.findOne({
            where: {
                id: courseId,
                durum: { [Op.in]: ['yayinda', 'arsiv'] },
                silindi_mi: false
            },
            attributes: [
                'id',
                'baslik',
                'alt_baslik',
                'seviye',
                'dil'
            ],
            include: [
                {
                    // Kursun bölümleri (gizli olanlar haric)
                    model: CourseSection,
                    as: 'Sections',
                    attributes: ['id', 'baslik', 'aciklama', 'sira_numarasi'],
                    where: { gizli_mi: false },
                    required: false,
                    include: [
                        {
                            // Her bölümün dersleri (gizli olanlar haric)
                            model: Lesson,
                            as: 'Lessons',
                            attributes: [
                                'id',
                                'baslik',
                                'aciklama',
                                'video_saglayici_id',
                                'sure_saniye',
                                'onizleme_mi',
                                'sira_numarasi',
                                'icerik_tipi',
                                'kaynak_url'
                            ],
                            where: { gizli_mi: false },
                            required: false,
                            include: [
                                {
                                    // Her dersin öğrenci ilerlemesi
                                    model: LessonProgress,
                                    attributes: [
                                        'tamamlandi_mi',
                                        'tamamlanma_tarihi'
                                    ],
                                    where: { ogrenci_id: studentId },
                                    required: false  // Boşsa da ders gelsin
                                }
                            ]
                        }
                    ]
                },
                {
                    // Eğitmen bilgileri
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['id', 'ad', 'soyad', 'profil_fotografi']
                }
            ],
            order: [
                // Bölümleri sıra numarasına göre sırala
                [{ model: CourseSection, as: 'Sections' }, 'sira_numarasi', 'ASC'],
                // Dersleri sıra numarasına göre sırala
                [
                    { model: CourseSection, as: 'Sections' },
                    { model: Lesson, as: 'Lessons' },
                    'sira_numarasi',
                    'ASC'
                ]
            ],
            subQuery: false  // N+1 sorununu önlemek kritik
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı veya yayında değildir.');
            error.statusCode = 404;
            throw error;
        }

        console.log(`[LEARNING] Kurs bulundu: "${course.baslik}" (${course.Sections.length} bölüm)`);

        // === ADIM 3: İlk dersi belirle (yoksa NULL) ===
        let firstLesson = null;
        if (course.Sections && course.Sections.length > 0) {
            const firstSection = course.Sections[0];
            if (firstSection.Lessons && firstSection.Lessons.length > 0) {
                firstLesson = firstSection.Lessons[0];
            }
        }

        console.log(`[LEARNING] İlk ders: ${firstLesson ? firstLesson.baslik : 'Yok'}`);

        // === ADIM 4: Öğrenci tercihi varsa onun dersi yükle ===
        const requestedLessonId = req.query.lesson_id;
        let currentLesson = firstLesson;

        if (requestedLessonId) {
            // Tüm dersler içinde aranıyor
            for (const section of course.Sections || []) {
                const found = section.Lessons?.find(l => l.id === requestedLessonId);
                if (found) {
                    currentLesson = found;
                    break;
                }
            }
        }

        // === ADIM 5: Başarılı yanıt ===
        return res.status(200).json({
            status: 'success',
            message: 'Kurs öğrenim verisi başarıyla alındı.',
            data: {
                course: {
                    id: course.id,
                    baslik: course.baslik,
                    aciklama: course.aciklama,
                    seviye: course.seviye,
                    dil: course.dil,
                    egitmen: course.Egitmen ? {
                        id: course.Egitmen.id,
                        ad: course.Egitmen.ad,
                        soyad: course.Egitmen.soyad,
                        profil_fotografi: course.Egitmen.profil_fotografi
                    } : null
                },
                bunny_library_id: process.env.BUNNY_LIBRARY_ID,
                curriculum: course.Sections.map(section => ({
                    id: section.id,
                    baslik: section.baslik,
                    aciklama: section.aciklama,
                    sira_numarasi: section.sira_numarasi,
                    lessons: (section.Lessons || []).map(lesson => ({
                        id: lesson.id,
                        baslik: lesson.baslik,
                        aciklama: lesson.aciklama,
                        video_saglayici_id: lesson.video_saglayici_id,
                        sure_saniye: lesson.sure_saniye,
                        onizleme_mi: lesson.onizleme_mi,
                        sira_numarasi: lesson.sira_numarasi,
                        icerik_tipi: lesson.icerik_tipi,
                        kaynak_url: lesson.kaynak_url,
                        tamamlandi_mi: lesson.LessonProgresses?.[0]?.tamamlandi_mi || false,
                        tamamlanma_tarihi: lesson.LessonProgresses?.[0]?.tamamlanma_tarihi || null
                    }))
                })),
                currentLesson: currentLesson ? {
                    id: currentLesson.id,
                    baslik: currentLesson.baslik,
                    aciklama: currentLesson.aciklama,
                    video_saglayici_id: currentLesson.video_saglayici_id,
                    sure_saniye: currentLesson.sure_saniye,
                    icerik_tipi: currentLesson.icerik_tipi,
                    kaynak_url: currentLesson.kaynak_url
                } : null,
                enrollment: {
                    ilerleme_yuzdesi: enrollment.ilerleme_yuzdesi,
                    kayit_tarihi: enrollment.kayit_tarihi
                }
            }
        });

    } catch (error) {
        console.error(`[LEARNING] Hata: ${error.message}`);
        next(error);
    }
};

/**
 * Dersi Tamamlama İşareti
 * @route PUT /api/courses/:courseId/lessons/:lessonId/complete
 * @access Private
 */
exports.markLessonAsComplete = async (req, res, next) => {
    try {
        const { courseId, lessonId } = req.params;
        const studentId = req.user.id;

        console.log(`[LEARNING] Ders tamamlanıyor: ${studentId} → ${lessonId}`);

        // === Ders bul (gizli olanlar tamamlanamaz) ===
        const lesson = await Lesson.findOne({
            where: { id: lessonId, gizli_mi: false },
            include: [{
                model: CourseSection,
                attributes: ['kurs_id', 'gizli_mi']
            }],
            attributes: ['id', 'sure_saniye', 'gizli_mi']
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // Bolum gizliyse de ilerleme yazma
        if (lesson.CourseSection?.gizli_mi) {
            const error = new Error('Bu ders artik mevcut degil.');
            error.statusCode = 410;
            throw error;
        }

        // Kurs ve ders uyumunu kontrol et
        if (lesson.CourseSection.kurs_id !== courseId) {
            const error = new Error('Bu ders bu kursa ait değildir.');
            error.statusCode = 400;
            throw error;
        }

        // Öğrenci kursa kayıtlı mı?
        const enrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id: studentId, kurs_id: courseId }
        });

        if (!enrollment) {
            const error = new Error('Bu kursa kayıtlı değilsiniz.');
            error.statusCode = 403;
            throw error;
        }

        // === LessonProgress oluştur veya güncelle ===
        const [progress, created] = await LessonProgress.findOrCreate({
            where: {
                ogrenci_id: studentId,
                ders_id: lessonId
            },
            defaults: {
                tamamlandi_mi: true,
                tamamlanma_tarihi: new Date()
            }
        });

        if (!created) {
            await progress.update({
                tamamlandi_mi: true,
                tamamlanma_tarihi: new Date()
            });
        }

        console.log(`[LEARNING] Ders tamamlandı işareti kondu`);

        // === Kurs ilerleme yuzdesini bolum-tabanli olarak yeniden hesapla ===
        // Gizli (gizli_mi=true) dersler bu hesaba dahil edilmez.
        let yeniIlerleme = null;
        try {
            yeniIlerleme = await recalculateCourseProgress(studentId, courseId);
            console.log(`[PROGRESS] Yeni ilerleme: %${yeniIlerleme}`);
        } catch (recalcErr) {
            // Hesaplama hatasi tamamlama isaretini geri alma sebebi degil; sadece logla.
            console.error(`[PROGRESS] Hesaplama hatasi: ${recalcErr.message}`);
        }

        return res.status(200).json({
            status: 'success',
            message: 'Ders tamamlandı olarak işaretlendi.',
            data: {
                lesson_id: lessonId,
                tamamlandi_mi: progress.tamamlandi_mi,
                tamamlanma_tarihi: progress.tamamlanma_tarihi,
                ilerleme_yuzdesi: yeniIlerleme
            }
        });

    } catch (error) {
        console.error(`[LEARNING] Hata: ${error.message}`);
        next(error);
    }
};

/**
 * Kurs Bölümü (Section) Oluştur
 * @route POST /api/courses/:courseId/sections
 */
exports.createCourseSection = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { baslik, aciklama, sira_numarasi } = req.body;
        const userId = req.user.id;

        // Kursu bul ve yetki kontrol et
        const course = await Course.findOne({
            where: { id: courseId },
            attributes: ['id', 'egitmen_id']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Validasyon
        if (!baslik) {
            const error = new Error('Bölüm başlığı gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        // Bölüm oluştur - ✅ TÜRKÇE SÜTUN ADLARI DOĞRU
        const section = await CourseSection.create({
            kurs_id: courseId,
            baslik,
            aciklama: aciklama || '',
            sira_numarasi: sira_numarasi || 1
        });

        return res.status(201).json({
            status: 'success',
            message: 'Bölüm başarıyla oluşturuldu.',
            data: section
        });

    } catch (error) {
        console.error('[SECTION CREATE]', error.message);
        next(error);
    }
};

/**
 * Ders (Lesson) Oluştur
 * @route POST /api/courses/:courseId/sections/:sectionId/lessons
 */
exports.createLesson = async (req, res, next) => {
    try {
        const { courseId, sectionId } = req.params;
        const { 
            baslik, 
            aciklama, 
            video_saglayici_id, 
            sure_saniye, 
            onizleme_mi, 
            sira_numarasi, 
            icerik_tipi,
            kaynak_url 
        } = req.body;
        const userId = req.user.id;

        // Kursu bul ve yetki kontrol et
        const course = await Course.findOne({
            where: { id: courseId },
            attributes: ['id', 'egitmen_id']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Bölümü bul ve kursa ait olduğunu kontrol et
        const section = await CourseSection.findOne({
            where: { id: sectionId, kurs_id: courseId },
            attributes: ['id', 'kurs_id']
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı veya bu kursa ait değildir.');
            error.statusCode = 404;
            throw error;
        }

        // Validasyon
        if (!baslik) {
            const error = new Error('Ders başlığı gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        // Ders oluştur - ✅ TÜRKÇE SÜTUN ADLARI DOĞRU
        const lesson = await Lesson.create({
            bolum_id: sectionId,  // ✅ DOĞRU SÜTUN ADI
            baslik,
            aciklama: aciklama || '',
            video_saglayici_id: video_saglayici_id || null,
            sure_saniye: sure_saniye || 0,
            onizleme_mi: onizleme_mi || false,
            sira_numarasi: sira_numarasi || 1,
            icerik_tipi: icerik_tipi || 'video',
            kaynak_url: kaynak_url || null
        });

        return res.status(201).json({
            status: 'success',
            message: 'Ders başarıyla oluşturuldu.',
            data: lesson
        });

    } catch (error) {
        console.error('[LESSON CREATE]', error.message);
        next(error);
    }
};

/**
 * Bölümü Güncelle
 * @route PUT /api/courses/:courseId/sections/:sectionId
 */
exports.updateCourseSection = async (req, res, next) => {
    try {
        const { courseId, sectionId } = req.params;
        const { baslik, aciklama, sira_numarasi } = req.body;
        const userId = req.user.id;

        // Yetki kontrol et
        const course = await Course.findOne({
            where: { id: courseId },
            attributes: ['id', 'egitmen_id']
        });

        if (!course || course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Bölümü bul ve güncelle
        const section = await CourseSection.findOne({
            where: { id: sectionId, kurs_id: courseId }
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        const updateData = {};
        if (baslik !== undefined) updateData.baslik = baslik;
        if (aciklama !== undefined) updateData.aciklama = aciklama;
        if (sira_numarasi !== undefined) updateData.sira_numarasi = sira_numarasi;

        await section.update(updateData);

        return res.status(200).json({
            status: 'success',
            message: 'Bölüm başarıyla güncellendi.',
            data: section
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Dersi Güncelle
 * @route PUT /api/courses/:courseId/sections/:sectionId/lessons/:lessonId
 */
exports.updateLesson = async (req, res, next) => {
    try {
        const { courseId, sectionId, lessonId } = req.params;
        const { 
            baslik, 
            aciklama, 
            video_saglayici_id, 
            sure_saniye, 
            onizleme_mi, 
            sira_numarasi,
            icerik_tipi,
            kaynak_url
        } = req.body;
        const userId = req.user.id;

        // Yetki kontrol et
        const course = await Course.findOne({
            where: { id: courseId },
            attributes: ['id', 'egitmen_id']
        });

        if (!course || course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Dersi bul
        const lesson = await Lesson.findOne({
            where: { id: lessonId, bolum_id: sectionId }
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // Güncelle
        const updateData = {};
        if (baslik !== undefined) updateData.baslik = baslik;
        if (aciklama !== undefined) updateData.aciklama = aciklama;
        if (video_saglayici_id !== undefined) updateData.video_saglayici_id = video_saglayici_id;
        if (sure_saniye !== undefined) updateData.sure_saniye = sure_saniye;
        if (onizleme_mi !== undefined) updateData.onizleme_mi = onizleme_mi;
        if (sira_numarasi !== undefined) updateData.sira_numarasi = sira_numarasi;
        if (icerik_tipi !== undefined) updateData.icerik_tipi = icerik_tipi;
        if (kaynak_url !== undefined) updateData.kaynak_url = kaynak_url;

        await lesson.update(updateData);

        return res.status(200).json({
            status: 'success',
            message: 'Ders başarıyla güncellendi.',
            data: lesson
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Bölümü Sil
 * @route DELETE /api/courses/:courseId/sections/:sectionId
 */
exports.deleteCourseSection = async (req, res, next) => {
    try {
        const { courseId, sectionId } = req.params;
        const userId = req.user.id;

        // Yetki kontrol et
        const course = await Course.findOne({
            where: { id: courseId },
            attributes: ['id', 'egitmen_id']
        });

        if (!course || course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Bölümü sil (cascade silme dersleri otomatik siler)
        const section = await CourseSection.findOne({
            where: { id: sectionId, kurs_id: courseId }
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        await section.destroy();

        return res.status(200).json({
            status: 'success',
            message: 'Bölüm ve içindeki tüm dersler başarıyla silindi.'
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Dersi Sil
 * @route DELETE /api/courses/:courseId/sections/:sectionId/lessons/:lessonId
 */
exports.deleteLesson = async (req, res, next) => {
    try {
        const { courseId, sectionId, lessonId } = req.params;
        const userId = req.user.id;

        // Yetki kontrol et
        const course = await Course.findOne({
            where: { id: courseId },
            attributes: ['id', 'egitmen_id']
        });

        if (!course || course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Dersi sil
        const lesson = await Lesson.findOne({
            where: { id: lessonId, bolum_id: sectionId }
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        await lesson.destroy();

        return res.status(200).json({
            status: 'success',
            message: 'Ders başarıyla silindi.'
        });

    } catch (error) {
        next(error);
    }
};



exports.getPublicCourses = async (req, res) => {
    try {
        const tumKurslar = await Course.findAll({
            where: { durum: 'yayinda' },
            include: [{ model: Review, attributes: ['puan'] }]
        });

        if (!tumKurslar || tumKurslar.length === 0) {
            return res.status(200).json({
                success: true,
                data: { enPopuler: [], enCokBegenilen: [], tumKurslar: [] }
            });
        }

        const kurslarIsilenmis = tumKurslar.map(kurs => {
            const kursData = kurs.toJSON();
            const yorumlar = kursData.Reviews || [];
            
            // BURASI ÖNEMLİ: Puan hesaplamasını ekledik
            let hesaplananPuan = 0;
            if (yorumlar.length > 0) {
                const toplamPuan = yorumlar.reduce((toplam, r) => toplam + r.puan, 0);
                hesaplananPuan = (toplamPuan / yorumlar.length).toFixed(1);
            }

            return {
                id: kursData.id,
                baslik: kursData.baslik,
                alt_baslik: kursData.alt_baslik,
                aciklama: kursData.aciklama,
                fiyat: kursData.fiyat,
                kapak_fotografi: kursData.kapak_fotografi || null,
                ogrenciSayisi: kursData.ogrenciSayisi || 0, // Modelde yoksa 0 döner
                ortalamaPuan: parseFloat(hesaplananPuan)
            };
        });

        // Verileri kategorize edip gönderiyoruz
        const enPopuler = [...kurslarIsilenmis].sort((a, b) => b.ogrenciSayisi - a.ogrenciSayisi).slice(0, 4);
        const enCokBegenilen = [...kurslarIsilenmis].sort((a, b) => b.ortalamaPuan - a.ortalamaPuan).slice(0, 4);

        res.status(200).json({
            success: true,
            data: { enPopuler, enCokBegenilen, tumKurslar: kurslarIsilenmis }
        });

    } catch (error) {
        console.error("Public kurslar hatası:", error.message);
        res.status(500).json({ success: false, message: 'Kurslar yüklenirken bir hata oluştu.' });
    }
};

/**
 * Kurs Ayarlarını Güncelle (İş Mantığı Korumalı)
 * @route PUT /api/courses/:id/settings
 */
exports.updateCourseSettings = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { baslik, alt_baslik, aciklama, kategori_id, seviye, fiyat, dil, gereksinimler, kazanimlar } = req.body;

        const course = await Course.findOne({
            where: { id, silindi_mi: false },
            attributes: ['id', 'egitmen_id', 'durum']
        });

        if (!course) {
            const err = new Error('Kurs bulunamadı.'); err.statusCode = 404; throw err;
        }
        if (course.egitmen_id !== userId) {
            const err = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.'); err.statusCode = 403; throw err;
        }

        let criticalFieldWarning = false;
        if (course.durum === 'yayinda' && (kategori_id !== undefined || fiyat !== undefined)) {
            const enrolledCount = await CourseEnrollment.count({ where: { kurs_id: id } });
            if (enrolledCount > 0) criticalFieldWarning = true;
        }

        const updateData = {};
        if (baslik !== undefined) updateData.baslik = baslik;
        if (alt_baslik !== undefined) updateData.alt_baslik = alt_baslik;
        if (aciklama !== undefined) updateData.aciklama = aciklama;
        if (seviye !== undefined) updateData.seviye = seviye;
        if (dil !== undefined) updateData.dil = dil;
        if (gereksinimler !== undefined) updateData.gereksinimler = gereksinimler;
        if (kazanimlar !== undefined) updateData.kazanimlar = kazanimlar;
        if (!criticalFieldWarning) {
            if (kategori_id !== undefined) updateData.kategori_id = kategori_id;
            if (fiyat !== undefined) updateData.fiyat = parseFloat(fiyat);
        }

        await course.update(updateData);
        return res.status(200).json({
            success: true,
            message: criticalFieldWarning
                ? 'Ayarlar güncellendi. Yayında ve kayıtlı öğrencisi olan kursun kategori/fiyatı değiştirilemez.'
                : 'Kurs ayarları güncellendi.',
            criticalFieldWarning,
            data: course
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Kurs Kapak Fotoğrafı Yükle
 * @route POST /api/courses/:id/thumbnail
 */
exports.uploadCourseThumbnail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const course = await Course.findOne({
            where: { id, egitmen_id: userId, silindi_mi: false },
            attributes: ['id', 'egitmen_id', 'kapak_fotografi']
        });

        if (!course) {
            const err = new Error('Kurs bulunamadı veya yetki yok.'); err.statusCode = 404; throw err;
        }
        if (!req.file) {
            const err = new Error('Dosya yüklenmedi.'); err.statusCode = 400; throw err;
        }

        const oldUrl = course.kapak_fotografi;
        const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const remoteName = `thumbnails/${safeName}`;
        const bunnyResult = await uploadFileToBunnyStorage(req.file.path, remoteName);

        let kapak_fotografi;
        if (bunnyResult.success) {
            try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}
            kapak_fotografi = bunnyResult.publicUrl;
        } else {
            const thumbDir = path.join(__dirname, '..', 'uploads', 'thumbnails');
            if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
            fs.renameSync(req.file.path, path.join(thumbDir, safeName));
            kapak_fotografi = `/uploads/thumbnails/${safeName}`;
        }

        await course.update({ kapak_fotografi });

        if (oldUrl) {
            (async () => {
                try {
                    if (/^https?:\/\//i.test(oldUrl)) {
                        await deleteFileFromBunnyStorage(oldUrl);
                    } else if (oldUrl.startsWith('/uploads/thumbnails/')) {
                        const localPath = path.join(__dirname, '..', oldUrl);
                        if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                    }
                } catch (e) { console.warn(`[THUMBNAIL CLEANUP] ${e.message}`); }
            })();
        }

        return res.status(200).json({
            success: true,
            message: 'Kapak fotoğrafı güncellendi.',
            data: { kapak_fotografi }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Kurs Durumunu Eğitmen Tarafından Değiştir
 * @route POST /api/courses/:id/toggle-status
 * - Yayında → Arşiv
 * - Diğer → Onay Bekliyor (en az 1 bölüm + 1 ders şartı)
 */
exports.toggleCourseStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const course = await Course.findOne({
            where: { id, silindi_mi: false },
            attributes: ['id', 'egitmen_id', 'durum']
        });

        if (!course) {
            const err = new Error('Kurs bulunamadı.'); err.statusCode = 404; throw err;
        }
        if (course.egitmen_id !== userId) {
            const err = new Error('Yetki yok.'); err.statusCode = 403; throw err;
        }

        if (course.durum === 'yayinda') {
            await course.update({ durum: 'arsiv' });
            return res.status(200).json({
                success: true,
                message: 'Kurs yayından kaldırıldı ve arşive alındı.',
                data: { durum: 'arsiv' }
            });
        }

        const sections = await CourseSection.findAll({
            where: { kurs_id: id, gizli_mi: false },
            attributes: ['id'],
            include: [{ model: Lesson, as: 'Lessons', attributes: ['id'], where: { gizli_mi: false }, required: false }]
        });
        const totalLessons = sections.reduce((sum, s) => sum + (s.Lessons?.length || 0), 0);

        if (sections.length < 1 || totalLessons < 1) {
            const err = new Error('Kursu onaya göndermek için en az 1 bölüm ve 1 ders eklemeniz gerekiyor.');
            err.statusCode = 400;
            throw err;
        }

        await course.update({
            durum: 'onay_bekliyor',
            admin_tarafindan_iade_edildi: false,
            iade_tarihi: null,
            iade_eden_admin_id: null,
            iade_sebebi: null
        });

        return res.status(200).json({
            success: true,
            message: 'Kurs onaya gönderildi. Admin onayından sonra yayına alınacak.',
            data: { durum: 'onay_bekliyor' }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Eğitmen İçin Kurs Detay (Düzenleme Sayfası)
 * @route GET /api/courses/:id/for-edit
 */
exports.getInstructorCourseForEdit = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const course = await Course.findOne({
            where: { id, egitmen_id: userId, silindi_mi: false },
            include: [{ model: Category, attributes: ['id', 'ad'] }]
        });

        if (!course) {
            const err = new Error('Kurs bulunamadı veya erişim yetkiniz yok.'); err.statusCode = 404; throw err;
        }

        const kayitli_ogrenci_sayisi = await CourseEnrollment.count({ where: { kurs_id: id } });

        return res.status(200).json({
            success: true,
            data: { ...course.toJSON(), kayitli_ogrenci_sayisi }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Eğitmen Kurs Yorumları
 * @route GET /api/courses/:id/instructor-reviews
 */
exports.getInstructorCourseReviews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const course = await Course.findOne({
            where: { id, egitmen_id: userId, silindi_mi: false },
            attributes: ['id']
        });
        if (!course) {
            const err = new Error('Kurs bulunamadı.'); err.statusCode = 404; throw err;
        }

        const reviews = await Review.findAll({
            where: { kurs_id: id },
            include: [{ model: Profile, as: 'Yazar', attributes: ['ad', 'soyad'] }],
            order: [['olusturulma_tarihi', 'DESC']],
            limit: 100
        });

        return res.status(200).json({ success: true, data: reviews });
    } catch (error) {
        next(error);
    }
};

// === MODULE EXPORTS ===
// ✅ Tüm fonksiyonları export et
module.exports = {
    getAllCourses: exports.getAllCourses,
    getInstructorCourses: exports.getInstructorCourses,
    createCourse: exports.createCourse,
    getCourseDetails: exports.getCourseDetails,
    updateCourse: exports.updateCourse,
    updateCourseStatus: exports.updateCourseStatus,
    deleteCourse: exports.deleteCourse,
    getAllPublishedCourses: exports.getAllPublishedCourses,
    getCourseCurriculumForStudent: exports.getCourseCurriculumForStudent,
    markLessonAsComplete: exports.markLessonAsComplete,
    createCourseSection: exports.createCourseSection,
    createLesson: exports.createLesson,
    updateCourseSection: exports.updateCourseSection,
    updateLesson: exports.updateLesson,
    deleteCourseSection: exports.deleteCourseSection,
    deleteLesson: exports.deleteLesson,
    getPublicCourses: exports.getPublicCourses,
    updateCourseSettings: exports.updateCourseSettings,
    uploadCourseThumbnail: exports.uploadCourseThumbnail,
    toggleCourseStatus: exports.toggleCourseStatus,
    getInstructorCourseForEdit: exports.getInstructorCourseForEdit,
    getInstructorCourseReviews: exports.getInstructorCourseReviews
};