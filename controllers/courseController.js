const { Course, CourseSection, Lesson, Profile, Category } = require('../models');

exports.createCourse = async (req, res, next) => {
    try {
        const { baslik, alt_baslik, kategori_id, dil, seviye, fiyat, gereksinimler, kazanimlar } = req.body;
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
            success: true,
            message: 'Kurs taslak olarak oluşturuldu.',
            data: { id: newCourse.id }
        });
    } catch (error) {
        next(error);
    }
};

exports.getMyCourses = async (req, res, next) => {
    try {
        const egitmen_id = req.user.id;

        const courses = await Course.findAll({
            where: { egitmen_id },
            order: [['olusturulma_tarihi', 'DESC']]
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

exports.updateCourseStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { durum } = req.body;
        const egitmen_id = req.user.id;

        const course = await Course.findOne({ where: { id, egitmen_id } });
        if (!course) {
            const error = new Error('Kurs bulunamadı veya bu işlem için yetkiniz yok.');
            error.statusCode = 404;
            throw error;
        }

        course.durum = durum;
        await course.save();

        return res.status(200).json({
            success: true,
            message: `Kurs durumu '${durum}' olarak güncellendi.`
        });
    } catch (error) {
        next(error);
    }
};

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
            success: true,
            message: 'Yayındaki kurslar başarıyla getirildi.',
            data: courses
        });
    } catch (error) {
        next(error);
    }
};

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
            success: true,
            message: 'Kurs detayları başarıyla getirildi.',
            data: course
        });
    } catch (error) {
        next(error);
    }
};