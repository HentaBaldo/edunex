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

        // === VALIDASYON ===
        if (!eposta || !sifre) {
            const error = new Error('E-posta ve şifre zorunludur.');
            error.statusCode = 400;
            throw error;
        }

        console.log(`[ADMIN] Giriş denemesi: ${eposta}`);

        // === SADECE ADMIN ROLÜNE SAHİP KULLANICILAR GIREBILIR ===
        const adminUser = await Profile.findOne({ 
            where: { 
                eposta: eposta,
                rol: 'admin' 
            },
            attributes: ['id', 'ad', 'soyad', 'eposta', 'rol', 'sifre']
        });

        // Güvenlik: Kullanıcı yoksa veya admin değilse aynı hatayı ver (Bilgi sızdırmamak için)
        if (!adminUser) {
            console.warn(`[ADMIN] Yetkisiz giriş denemesi: ${eposta}`);
            const error = new Error('Yetkisiz giriş. E-posta veya şifre hatalı.');
            error.statusCode = 401;
            throw error;
        }

        // === ŞİFRE KONTROLÜ ===
        const isPasswordMatch = await bcrypt.compare(sifre, adminUser.sifre);
        if (!isPasswordMatch) {
            console.warn(`[ADMIN] Yanlış şifre: ${eposta}`);
            const error = new Error('Yetkisiz giriş. E-posta veya şifre hatalı.');
            error.statusCode = 401;
            throw error;
        }

        // === TOKEN OLUŞTURMA ===
        const token = jwt.sign(
            { id: adminUser.id, rol: adminUser.rol },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
        );

        console.log(`[ADMIN] Başarılı giriş: ${adminUser.id}`);

        // === BAŞARILI YANIT ===
        return res.status(200).json({
            success: true,
            message: 'Admin girişi başarılı. Yönlendiriliyorsunuz...',
            token: token,
            user: {
                id: adminUser.id,
                ad: adminUser.ad,
                soyad: adminUser.soyad,
                eposta: adminUser.eposta,
                rol: adminUser.rol
            }
        });

    } catch (error) {
        console.error(`[ADMIN] Giriş hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Admin Panel Özet İstatistikleri
 * @route GET /api/admin/stats
 */
exports.getDashboardStats = async (req, res, next) => {
    try {
        console.log(`[ADMIN] Dashboard istatistikleri istendi`);

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
        console.error(`[ADMIN] Dashboard istatistikleri hatası: ${error.message}`);
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
        console.log('[ADMIN] Bekleyen kurslar istendi');
        
        const pendingCourses = await Course.findAll({
            where: { durum: 'onay_bekliyor' },
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    // İŞTE DÜZELTME BURADA: 'fotograf' sütununu sildik!
                    attributes: ['id', 'ad', 'soyad', 'eposta']
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']],
            attributes: ['id', 'baslik', 'alt_baslik', 'durum', 'olusturulma_tarihi', 'egitmen_id', 'fiyat', 'kategori_id']
        });
        
        return res.status(200).json({
            success: true,
            message: 'Bekleyen kurslar başarıyla listelendi',
            courses: pendingCourses
        });
        
    } catch (error) {
        console.error(`[ADMIN PENDING COURSES DB ERROR]: ${error.message}`);
        
        const err = new Error('Onay bekleyen kurslar listelenirken sunucu hatası oluştu.');
        err.statusCode = 500;
        next(err);
    }
};

/**
 * İncelenecek Kursun Tüm Detayları
 * @route GET /api/admin/courses/:id
 */
exports.getCourseDetail = async (req, res, next) => {
    try {
        const { id } = req.params;

        console.log(`[ADMIN] Kurs detayı istendi: ${id}`);

        const course = await Course.findByPk(id, {
            include: [
                { 
                    model: Profile, 
                    as: 'Egitmen',
                    attributes: ['id', 'ad', 'soyad', 'eposta']
                },
                {
                    model: CourseSection,
                    as: 'Sections',
                    attributes: ['id', 'baslik', 'aciklama', 'sira_numarasi'],
                    include: [{ 
                        model: Lesson, 
                        as: 'Lessons',
                        attributes: ['id', 'baslik', 'video_saglayici_id', 'sure_saniye', 'sira_numarasi'],
                        order: [['sira_numarasi', 'ASC']]
                    }],
                    order: [['sira_numarasi', 'ASC']]
                }
            ]
        });

        if (!course) {
            const error = new Error('Talep edilen kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        console.log(`[ADMIN] Kurs detayı getirildi: ${course.baslik}`);

        return res.status(200).json({
            success: true,
            data: course
        });
    } catch (error) {
        console.error(`[ADMIN] Kurs detay hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Kursu Onaylama (Yayına Alma) İşlemi
 * @route PUT /api/admin/courses/:id/approve
 */
exports.approveCourse = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        
        const course = await Course.findByPk(courseId, {
            include: [{ model: Profile, as: 'Egitmen' }]
        });
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Kurs bulunamadı'
            });
        }
        
        await course.update({ durum: 'yayinda' });
        
        console.log(`[ADMIN] Kurs ${courseId} onaylandı`);
        
        return res.status(200).json({
            success: true,
            message: 'Kurs onaylandı',
            course
        });
        
    } catch (error) {
        console.error('[ADMIN APPROVE COURSE] Hata:', error.message);
        const err = new Error('Kurs onaylanırken hata oluştu');
        err.statusCode = 500;
        next(err);
    }
};

/**
 * Kursu Reddetme İşlemi
 * @route PUT /api/admin/courses/:id/reject
 */
exports.rejectCourse = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        
        const course = await Course.findByPk(courseId);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Kurs bulunamadı'
            });
        }
        
        await course.update({ durum: 'taslak' });
        
        console.log(`[ADMIN] Kurs ${courseId} reddedildi`);
        
        return res.status(200).json({
            success: true,
            message: 'Kurs reddedildi',
            course
        });
        
    } catch (error) {
        console.error('[ADMIN REJECT COURSE] Hata:', error.message);
        const err = new Error('Kurs reddedilirken hata oluştu');
        err.statusCode = 500;
        next(err);
    }
};
/**
 * Tüm Kursları Listele (Admin Paneli İçin)
 * @route GET /api/admin/courses
 */
exports.getAllCourses = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        console.log(`[ADMIN] Kurslar istendi - Sayfa: ${page}`);

        const { count, rows } = await Course.findAndCountAll({
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad']
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']],
            limit,
            offset
        });

        const totalPages = Math.ceil(count / limit);

        return res.status(200).json({
            success: true,
            data: rows,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: count,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error(`[ADMIN] Kursları listeme hatası: ${error.message}`);
        next(error);
    }
};

// ============================================
// MODULE EXPORTS
// ============================================
module.exports = {
    adminLogin: exports.adminLogin,
    getDashboardStats: exports.getDashboardStats,
    getPendingCourses: exports.getPendingCourses,
    getCourseDetail: exports.getCourseDetail,
    approveCourse: exports.approveCourse,
    rejectCourse: exports.rejectCourse,
    getAllCourses: exports.getAllCourses
};