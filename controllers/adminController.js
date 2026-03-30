const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Profile, Course, CourseSection, Lesson, Category } = require('../models');

/**
 * Yönetici Girişi (Admin Login)
 * @route POST /api/admin/login
 */
exports.adminLogin = async (req, res, next) => {
    try {
        const { eposta, sifre } = req.body;

        if (!eposta || !sifre) {
            const error = new Error('E-posta ve şifre zorunludur.');
            error.statusCode = 400;
            throw error;
        }

        // SADECE admin rolüne sahip kullanıcıları arıyoruz
        const adminUser = await Profile.findOne({ 
            where: { 
                eposta: eposta,
                rol: 'admin' 
            } 
        });

        // Güvenlik: Kullanıcı yoksa veya admin değilse aynı hatayı ver (Bilgi sızdırmamak için)
        if (!adminUser) {
            const error = new Error('Yetkisiz giriş. E-posta veya şifre hatalı.');
            error.statusCode = 401;
            throw error;
        }

        // Şifre kontrolü
        const isPasswordMatch = await bcrypt.compare(sifre, adminUser.sifre);
        if (!isPasswordMatch) {
            const error = new Error('Yetkisiz giriş. E-posta veya şifre hatalı.');
            error.statusCode = 401;
            throw error;
        }

        // Token oluşturma
        const token = jwt.sign(
            { id: adminUser.id, rol: adminUser.rol },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        return res.status(200).json({
            success: true,
            message: 'Admin girişi başarılı. Yönlendiriliyorsunuz...',
            token: token,
            user: {
                id: adminUser.id,
                ad: adminUser.ad,
                soyad: adminUser.soyad,
                rol: adminUser.rol
            }
        });

    } catch (error) {
        next(error);
    }
};

/**
 * Admin Panel Özet İstatistikleri
 * @route GET /api/admin/dashboard-stats
 */
exports.getDashboardStats = async (req, res, next) => {
    try {
        // Promise.all ile paralel sorgular çalıştırılarak performans artırılır
        const [totalUsers, activeCourses, pendingCourses] = await Promise.all([
            Profile.count(),
            Course.count({ where: { durum: 'yayinda' } }),
            Course.count({ where: { durum: 'onay_bekliyor' } })
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalUsers,
                activeCourses,
                pendingCourses
            }
        });
    } catch (error) {
        console.error(`[AdminController] Error in getDashboardStats: ${error.message}`);
        error.message = 'İstatistikler alınırken sunucu hatası oluştu.';
        error.statusCode = 500;
        next(error);
    }
};

/**
 * Onay Bekleyen Kursların Listesi
 * @route GET /api/admin/pending-courses
 */
exports.getPendingCourses = async (req, res, next) => {
    try {
        const pendingCourses = await Course.findAll({
            where: { durum: 'onay_bekliyor' },
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad', 'eposta'] 
                },
                {
                    model: Category, 
                    // DÜZELTME 1: as: 'Category' kısmı silindi çünkü models/index.js'de alias verilmemiş
                    attributes: ['ad']
                }
            ],
            // DÜZELTME 2: createdAt yerine veritabanındaki gerçek isim olan olusturulma_tarihi kullanıldı
            order: [['olusturulma_tarihi', 'ASC']] 
        });

        return res.status(200).json({
            success: true,
            data: pendingCourses
        });
    } catch (error) {
        console.error(`[AdminController] Error in getPendingCourses: ${error.message}`);
        error.message = 'Onay bekleyen kurslar listelenirken sunucu hatası oluştu.';
        error.statusCode = 500;
        next(error);
    }
};

/**
 * İncelenecek Kursun Tüm Detayları
 * @route GET /api/admin/courses/:id
 */
exports.getCourseDetail = async (req, res, next) => {
    try {
        const { id } = req.params;

        const course = await Course.findByPk(id, {
            include: [
                { 
                    model: Profile, 
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad', 'eposta']
                },
                { 
                    model: Category 
                    // DÜZELTME 3: Burada da as: 'Category' silindi
                },
                {
                    model: CourseSection,
                    as: 'Sections',
                    include: [{ 
                        model: Lesson, 
                        as: 'Lessons',
                        order: [['sira_numarasi', 'ASC']] // DÜZELTME 4: sira yerine sira_numarasi
                    }],
                    order: [['sira_numarasi', 'ASC']] // DÜZELTME 5: sira yerine sira_numarasi
                }
            ]
        });

        if (!course) {
            const error = new Error('Talep edilen kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            data: course
        });
    } catch (error) {
        console.error(`[AdminController] Error in getCourseDetail: ${error.message}`);
        next(error);
    }
};

/**
 * Kursu Onaylama (Yayına Alma) İşlemi
 * @route PUT /api/admin/courses/:id/approve
 */
exports.approveCourse = async (req, res, next) => {
    try {
        const { id } = req.params;

        const [updatedRows] = await Course.update(
            { 
                durum: 'yayinda', // 'onaylandi' yerine 'yayinda' olması mantıklı
                yayinlandi: true 
            },
            { where: { id, durum: 'onay_bekliyor' } } // Sadece bekleyenleri onayla
        );

        if (updatedRows === 0) {
            const error = new Error('Onaylanacak kurs bulunamadı veya zaten yayında.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            message: 'Kurs başarıyla onaylandı ve yayına alındı.'
        });
    } catch (error) {
        console.error(`[AdminController] Error in approveCourse: ${error.message}`);
        next(error);
    }
};