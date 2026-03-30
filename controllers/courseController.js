const db = require('../models');
const { Course, CourseSection, Lesson, Profile, Category } = db;

/**
 * Yeni Kurs Oluşturma (Taslak)
 * @route POST /api/courses
 */
exports.createCourse = async (req, res, next) => {
    try {
        const { baslik, alt_baslik, kategori_id, dil, seviye, fiyat, gereksinimler, kazanimlar } = req.body;
        
        // 🚨 KRİTİK DÜZELTME: req.kullanici yerine req.user.id kullanıldı
        const egitmen_id = req.user.id; 

        const newCourse = await Course.create({
            egitmen_id,
            kategori_id,
            baslik,
            alt_baslik,
            dil,
            seviye,
            fiyat,
            gereksinimler,
            kazanimlar,
            durum: 'taslak',
            olusturulma_tarihi: new Date()
        });

        return res.status(201).json({
            status: 'success',
            message: 'Course created as draft successfully.',
            data: {
                id: newCourse.id
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Eğitmenin Kendi Kurslarını Listelemesi
 * @route GET /api/courses/my-courses
 */
exports.getMyCourses = async (req, res, next) => {
    try {
        const egitmen_id = req.user.id;

        const courses = await Course.findAll({
            where: { egitmen_id },
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
 * Kurs Durumunu Güncelleme (Yayına al/Taslağa çek)
 * @route PATCH /api/courses/:id/status
 */
exports.updateCourseStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { durum } = req.body;
        
        // 🚨 KRİTİK DÜZELTME: req.kullanici yerine req.user.id kullanıldı
        const egitmen_id = req.user.id;

        const course = await Course.findOne({ where: { id, egitmen_id } });

        if (!course) {
            const error = new Error('Course not found or unauthorized.');
            error.statusCode = 404;
            throw error;
        }

        course.durum = durum;
        await course.save();

        return res.status(200).json({
            status: 'success',
            message: `Course status updated to '${durum}' successfully.`
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Tüm Yayınlanmış Kursları Getir (Ana Sayfa İçin)
 * @route GET /api/courses
 */
exports.getAllPublishedCourses = async (req, res, next) => {
    try {
        const courses = await Course.findAll({
            where: { durum: 'yayinda' },
            include: [
                { model: Category, attributes: ['ad'] },
                { model: Profile, as: 'Egitmen', attributes: ['ad', 'soyad'] }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        return res.status(200).json({
            status: 'success',
            message: 'Published courses retrieved successfully.',
            data: courses
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
            const error = new Error('Course not found.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            status: 'success',
            message: 'Course details retrieved successfully.',
            data: course
        });
    } catch (error) {
        next(error);
    }
};