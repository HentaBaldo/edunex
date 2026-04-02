const { sequelize, CourseEnrollment, Course, StudentDetail, Order, OrderItem, Profile } = require('../models');

exports.enrollCourse = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { kurs_id } = req.body;
        const kullanici_id = req.user.id;

        const course = await Course.findOne({
            where: { id: kurs_id, durum: 'yayinda' }
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı veya yayında değil.');
            error.statusCode = 404;
            throw error;
        }

        const studentDetail = await StudentDetail.findOne({ where: { kullanici_id } });
        if (!studentDetail) {
            const error = new Error('Öğrenci profili bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        const existingEnrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id: studentDetail.kullanici_id, kurs_id }
        });

        if (existingEnrollment) {
            const error = new Error('Bu kursa zaten kayıtlısınız.');
            error.statusCode = 409;
            throw error;
        }

        // Ücretsiz kurs — direkt kayıt
        if (!course.fiyat || course.fiyat === 0) {
            const enrollment = await CourseEnrollment.create({
                ogrenci_id: studentDetail.kullanici_id,
                kurs_id
            }, { transaction: t });

            await t.commit();

            return res.status(201).json({
                success: true,
                message: 'Kursa başarıyla kayıt oldunuz.',
                data: { enrollment_id: enrollment.id }
            });
        }

        // Ücretli kurs — sipariş oluştur
        const order = await Order.create({
            kullanici_id,
            toplam_tutar: course.fiyat,
            durum: 'tamamlandi'
        }, { transaction: t });

        const orderItem = await OrderItem.create({
            siparis_id: order.id,
            kurs_id,
            odenen_fiyat: course.fiyat  // veritabanındaki gerçek kolon adı
        }, { transaction: t });

        const enrollment = await CourseEnrollment.create({
            ogrenci_id: studentDetail.kullanici_id,
            kurs_id,
            siparis_kalemi_id: orderItem.id
        }, { transaction: t });

        await t.commit();

        return res.status(201).json({
            success: true,
            message: 'Kursa başarıyla kayıt oldunuz.',
            data: { enrollment_id: enrollment.id, order_id: order.id }
        });

    } catch (error) {
        await t.rollback();
        next(error);
    }
};

exports.getMyEnrollments = async (req, res, next) => {
    try {
        const kullanici_id = req.user.id;

        const studentDetail = await StudentDetail.findOne({ where: { kullanici_id } });
        if (!studentDetail) {
            const error = new Error('Öğrenci profili bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        const enrollments = await CourseEnrollment.findAll({
            where: { ogrenci_id: studentDetail.kullanici_id },
            include: [{
                model: Course,
                attributes: ['id', 'baslik', 'alt_baslik', 'seviye', 'dil'],
                include: [{
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad']
                }]
            }],
            order: [['kayit_tarihi', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            message: 'Kayıtlı kurslarınız getirildi.',
            data: enrollments
        });
    } catch (error) {
        next(error);
    }
};

exports.checkEnrollment = async (req, res, next) => {
    try {
        const { kurs_id } = req.params;
        const kullanici_id = req.user.id;

        const studentDetail = await StudentDetail.findOne({ where: { kullanici_id } });
        if (!studentDetail) {
            return res.status(200).json({
                success: true,
                data: { kayitli: false }
            });
        }

        const enrollment = await CourseEnrollment.findOne({
            where: { ogrenci_id: studentDetail.kullanici_id, kurs_id }
        });

        return res.status(200).json({
            success: true,
            data: { kayitli: !!enrollment }
        });
    } catch (error) {
        next(error);
    }
};