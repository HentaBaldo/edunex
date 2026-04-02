const { Course, Profile, CourseSection, Lesson } = require('../models');

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
            where: { durum: 'yayinda' },
            include: [
                { 
                    model: Profile, 
                    as: 'Egitmen', 
                    attributes: ['ad', 'soyad'] 
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
            where: { egitmen_id: instructorId },
            include: [
                { 
                    model: Profile, 
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad'] 
                },
                {
                    model: CourseSection,
                    as: 'Sections',
                    attributes: ['id', 'baslik']
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        return res.status(200).json({
            status: 'success',
            message: 'Instructor courses retrieved successfully.',
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
        const { baslik, aciklama, kategori_id, fiyat, zorluk_seviyesi } = req.body;
        const egitmen_id = req.user.id;

        // Validasyon
        if (!baslik || !aciklama || !kategori_id) {
            const error = new Error('Başlık, açıklama ve kategori gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        const course = await Course.create({
            baslik,
            aciklama,
            kategori_id,
            egitmen_id,
            fiyat: fiyat || 0,
            zorluk_seviyesi: zorluk_seviyesi || 'orta',
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
 * Tek Bir Kursun Tüm Detaylarını ve Müfredatını Getir
 * @route GET /api/courses/details/:id
 */
exports.getCourseDetails = async (req, res, next) => {
    try {
        const { id } = req.params;

        const course = await Course.findOne({
            where: { id, durum: 'yayinda' },
            include: [
                { 
                    model: CourseSection, 
                    as: 'Sections',
                    include: [{ model: Lesson, as: 'Lessons' }] 
                },
                { 
                    model: Profile, 
                    as: 'Egitmen', 
                    attributes: ['ad', 'soyad'] 
                }
            ],
            order: [
                [{ model: CourseSection, as: 'Sections' }, 'sira_numarasi', 'ASC']
            ]
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            status: 'success',
            message: 'Kurs detayları başarıyla alındı.',
            data: course
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Kurs Bilgilerini Güncelle
 * @route PUT /api/courses/:id
 * YETKİ KONTROLÜ EKLENDI
 */
exports.updateCourse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { baslik, aciklama, kategori_id, fiyat, zorluk_seviyesi, durum, resim } = req.body;

        // Kursun sahibini kontrol et
        const course = await Course.findOne({
            where: { id },
            attributes: ['id', 'egitmen_id', 'baslik', 'aciklama', 'kategori_id', 'fiyat', 'zorluk_seviyesi', 'durum', 'resim']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // YETKİ KONTROLÜ: Kursun sahibi mi kontrol et
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
        if (zorluk_seviyesi !== undefined) updateData.zorluk_seviyesi = zorluk_seviyesi;
        if (durum !== undefined) updateData.durum = durum;
        if (resim !== undefined) updateData.resim = resim;

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
 * Kurs Durumunu Değiştir (Taslak -> Onay Bekliyor -> Onaylandı -> Yayında -> Arşiv)
 * @route PUT /api/courses/:id/status
 * ✅ YETKİ KONTROLÜ + GÜNCELLENEN VALIDASYON
 */
exports.updateCourseStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { durum } = req.body;

        // ✅ GÜNCELLENEN: Model'deki ENUM'a uygun olarak tüm durumlar
        const validStatuses = ['taslak', 'onay_bekliyor', 'onaylandi', 'yayinda', 'arsiv'];
        
        if (!validStatuses.includes(durum)) {
            const error = new Error(`Geçersiz kurs durumu. İzin verilen durumlar: ${validStatuses.join(', ')}`);
            error.statusCode = 400;
            throw error;
        }

        // Kursun sahibini kontrol et
        const course = await Course.findOne({
            where: { id },
            attributes: ['id', 'egitmen_id', 'durum', 'baslik']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // ✅ YETKİ KONTROLÜ: Kursun sahibi mi kontrol et
        if (course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // ✅ DURUM DEĞİŞİM KURALLARI: Geçerli durum geçişlerini kontrol et
        const validTransitions = {
            'taslak': ['onay_bekliyor', 'arsiv'],
            'onay_bekliyor': ['taslak', 'onaylandi', 'arsiv'],
            'onaylandi': ['yayinda', 'arsiv', 'taslak'],
            'yayinda': ['arsiv'],
            'arsiv': ['taslak']
        };

        if (validTransitions[course.durum] && !validTransitions[course.durum].includes(durum)) {
            const error = new Error(
                `"${course.durum}" durumundan "${durum}" durumuna geçiş yapılamaz. ` +
                `İzin verilen geçişler: ${validTransitions[course.durum].join(', ')}`
            );
            error.statusCode = 400;
            throw error;
        }

        // Güncelle
        await course.update({ durum });

        return res.status(200).json({
            status: 'success',
            message: `Kurs durumu "${durum}" olarak güncellendi.`,
            data: { 
                id: course.id, 
                baslik: course.baslik,
                durum: course.durum 
            }
        });
    } catch (error) {
        next(error);
    }
};
/**
 * Yayında olan Tüm Kursları Getir (Sayfalama ile)
 * @route GET /api/courses/published
 */
exports.getAllPublishedCourses = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const offset = (page - 1) * limit;

        const { count, rows } = await Course.findAndCountAll({
            where: { durum: 'yayinda' },  // Sadece yayında olanlar
            include: [
                { 
                    model: Profile, 
                    as: 'Egitmen', 
                    attributes: ['ad', 'soyad'] 
                }
            ],
            limit,
            offset,
            order: [['olusturulma_tarihi', 'DESC']]
        });

        const totalPages = Math.ceil(count / limit);

        return res.status(200).json({
            status: 'success',
            message: 'Published courses retrieved successfully.',
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
 * Kurs Sil
 * @route DELETE /api/courses/:id
 * YETKİ KONTROLÜ EKLENDI
 */
exports.deleteCourse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Kursun sahibini kontrol et
        const course = await Course.findOne({
            where: { id },
            attributes: ['id', 'egitmen_id', 'baslik']
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        // YETKİ KONTROLÜ: Kursun sahibi mi kontrol et
        if (course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // Kursun bölümlerini sil (cascade silme)
        await CourseSection.destroy({
            where: { kurs_id: id }
        });

        // Kursu sil
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
 * Kurs İstatistiklerini Getir (Öğrenci Sayısı, Derecelendirme vb.)
 * @route GET /api/courses/:id/stats
 * YETKİ KONTROLÜ EKLENDI
 */
exports.getCourseStats = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

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

        // YETKİ KONTROLÜ: Kursun sahibi mi kontrol et
        if (course.egitmen_id !== userId) {
            const error = new Error('Bu kurs üzerinde işlem yapma yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // İstatistik verilerini topla (Model ve veri yapınıza göre uyarla)
        const stats = {
            toplam_ogrenci: 0, // Enrollment sayısı
            ortalama_puan: 0,
            toplam_dersin_sayisi: 0
        };

        return res.status(200).json({
            status: 'success',
            message: 'Kurs istatistikleri başarıyla alındı.',
            data: stats
        });
    } catch (error) {
        next(error);
    }
};