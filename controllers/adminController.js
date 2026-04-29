const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Profile, Course, InstructorDetail, CourseSection, Lesson, Category } = require('../models');

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
            process.env.JWT_SECRET,
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
            Course.count({ where: { durum: 'yayinda', silindi_mi: false } }),
            Course.count({ where: { durum: 'onay_bekliyor', silindi_mi: false } })
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
        const courses = await Course.findAll({
            where: { durum: 'onay_bekliyor', silindi_mi: false },
            include: [
                { model: Profile, as: 'Egitmen', attributes: ['ad', 'soyad'] },
                { model: Category, attributes: ['ad'] }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });
        
        return res.status(200).json({
            success: true,
            courses: courses
        });
    } catch (error) {
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

        console.log(`[ADMIN] Kurs detayı istendi: ${id}`);

        // controllers/adminController.js
const course = await Course.findByPk(id, {
    attributes: [
      'id',
      'egitmen_id',
      'kategori_id',
      'baslik',
      'alt_baslik',
      'dil',
      'seviye',
      'gereksinimler',
      'fiyat',
      'durum',
      'olusturulma_tarihi',
      'kazanimlar',
      'son_duzenleme_tarihi',
      'onaydan_sonra_duzenlendi_mi',
    ],
    include: [
      {
        model: Profile,
        as: 'Egitmen',
        attributes: ['id', 'ad', 'soyad'],
        include: [
          {
            model: InstructorDetail,
            attributes: ['unvan'],
            required: false,
          },
        ],
        required: false,
      },
      {
        model: Category,
        attributes: ['id', 'ad', 'slug'],
        required: false,
      },
      {
        model: CourseSection,
        as: 'Sections',
        // Admin gizli icerigi de gormeli (rozetli olarak)
        attributes: ['id', 'baslik', 'aciklama', 'sira_numarasi', 'gizli_mi', 'gizlenme_tarihi'],
        include: [
            {
                model: Lesson,
                as: 'Lessons',
                attributes: [
                  'id',
                  'baslik',
                  'icerik_tipi',
                  'sure_saniye',
                  'sira_numarasi',
                  'video_saglayici_id',
                  'kaynak_url',
                  'aciklama',
                  'onizleme_mi',
                  'gizli_mi',
                  'gizlenme_tarihi'
                ],
                required: false,
              },
        ],
        required: false,
      },
    ],
    order: [
      [{ model: CourseSection, as: 'Sections' }, 'sira_numarasi', 'ASC'],
      [{ model: CourseSection, as: 'Sections' }, { model: Lesson, as: 'Lessons' }, 'sira_numarasi', 'ASC'],
    ],
  });

        if (!course) {
            const error = new Error('Talep edilen kurs bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        console.log(`[ADMIN] Kurs detayı getirildi: ${course.baslik}`);

        return res.status(200).json({
            success: true,
            data: course,
            bunnyLibraryId: process.env.BUNNY_LIBRARY_ID
        });
    } catch (error) {
        console.error(`[ADMIN] Kurs detay hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Kursu Onaylama (Yayına Alma) İşlemi
 * @route PUT /api/admin/approve-course/:courseId
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
 * @route PUT /api/admin/reject-course/:courseId
 */
exports.rejectCourse = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const { sebep } = req.body;
        
        const course = await Course.findByPk(courseId);
        
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Kurs bulunamadı'
            });
        }
        
        // Kursu taslak haline geri al
        await course.update({ durum: 'taslak' });
        
        console.log(`[ADMIN] Kurs ${courseId} reddedildi. Sebep: ${sebep || 'Belirtilmedi'}`);
        
        return res.status(200).json({
            success: true,
            message: 'Kurs reddedildi ve eğitmene geri gönderildi',
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
            // Soft-deleted kurslari admin'in genel listesinden de gizle (yalnizca courses-tracking?filter=silinmis listesinde gorunsun)
            where: { silindi_mi: false },
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

/**
 * Yayındaki Kurslar ve Öğrenci İlerleme Raporu (Admin Paneli)
 * @route GET /api/admin/published-courses-report
 */
exports.getPublishedCoursesReport = async (req, res, next) => {
    try {
        const { Course, Profile, CourseEnrollment, Category } = require('../models');
        
        console.log(`[ADMIN] Yayındaki kurslar raporu istendi`);

        // Sadece "yayinda" olan kursları ve onlara kayıtlı öğrencileri getir
        const courses = await Course.findAll({
            where: { durum: 'yayinda' },
            attributes: ['id', 'baslik', 'fiyat', 'olusturulma_tarihi'],
            include: [
                {
                    model: Profile,
                    as: 'Egitmen',
                    attributes: ['ad', 'soyad']
                },
                {
                    model: Category,
                    attributes: ['ad']
                },
                {
                    model: CourseEnrollment,
                    as: 'CourseEnrollments',
                    attributes: ['ilerleme_yuzdesi', 'kayit_tarihi'],
                    include: [{
                        model: Profile,
                        as: 'Ogrenci',
                        attributes: ['id', 'ad', 'soyad', 'eposta']
                    }]
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            data: courses
        });
    } catch (error) {
        console.error(`[ADMIN] Yayındaki kurslar rapor hatası: ${error.message}`);
        next(error);
    }
};
/**
 * Kullanıcı Detaylarını Getir (İnceleme Ekranı)
 * @route GET /api/admin/users/:id
 */
exports.getUserDetail = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { Profile, StudentDetail, InstructorDetail } = require('../models');

        console.log(`[ADMIN] Kullanıcı detayı isteniyor: ${id}`);

        const user = await Profile.findOne({
            where: { id },
            attributes: { exclude: ['sifre'] }, // Güvenlik için şifreyi çekmiyoruz
            include: [
                { model: StudentDetail },
                { model: InstructorDetail }
            ]
        });

        if (!user) {
            const error = new Error('Kullanıcı bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error(`[ADMIN] Kullanıcı detay hatası: ${error.message}`);
        next(error);
    }
};

// Modül export listesinde getUserDetail'in olduğundan emin ol:
// 
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
    getAllCourses: exports.getAllCourses,
    getPublishedCoursesReport: exports.getPublishedCoursesReport,
    getUserDetail : exports.getUserDetail
};