const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op, fn, col, literal } = require('sequelize');
const sequelize = require('../config/database');
const {
    Profile,
    Course,
    InstructorDetail,
    CourseSection,
    Lesson,
    Category,
    Order,
    OrderItem,
    CourseEnrollment,
    Review,
    Certificate,
    LiveSession,
    SupportTicket,
    SupportMessage,
} = require('../models');
const { sendNotification } = require('../services/notificationService');

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
 * Admin Panel Ozet Istatistikleri (Komuta Merkezi)
 *
 * Geriye uyumlu: eski alanlar (totalUsers/activeCourses/pendingCourses) korunur.
 * Yeni alanlar: finansal + ogrenci/egitmen ayrimi + sertifika/canli ders sayilari.
 *
 * @route GET /api/admin/stats
 */
exports.getDashboardStats = async (req, res, next) => {
    try {
        console.log(`[ADMIN] Dashboard istatistikleri istendi`);

        // Bu ayin baslangici (yerel saat). Order.olusturulma_tarihi DATE tipinde.
        const now = new Date();
        const ayBaslangici = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const son24Saat = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const son15Dakika = new Date(now.getTime() - 15 * 60 * 1000);

        const [
            totalUsers,
            totalStudents,
            totalInstructors,
            activeCourses,
            pendingCourses,
            totalEnrollments,
            totalCertificates,
            upcomingLiveSessions,
            revenueRow,
            monthlyRevenueRow,
            yeniKayitlar24h,
            onlineKullanicilar,
        ] = await Promise.all([
            Profile.count(),
            Profile.count({ where: { rol: 'ogrenci' } }),
            Profile.count({ where: { rol: 'egitmen' } }),
            Course.count({ where: { durum: 'yayinda', silindi_mi: false } }),
            Course.count({ where: { durum: 'onay_bekliyor', silindi_mi: false } }),
            CourseEnrollment.count(),
            Certificate.count(),
            LiveSession.count({
                where: {
                    durum: { [Op.in]: ['planlandi', 'devam_ediyor'] },
                    baslangic_tarihi: { [Op.gte]: now },
                },
            }),
            // Toplam ciro (tum zamanlar)
            Order.findOne({
                attributes: [[fn('COALESCE', fn('SUM', col('toplam_tutar')), 0), 'toplam']],
                where: { durum: 'tamamlandi' },
                raw: true,
            }),
            // Bu ayki ciro
            Order.findOne({
                attributes: [[fn('COALESCE', fn('SUM', col('toplam_tutar')), 0), 'toplam']],
                where: {
                    durum: 'tamamlandi',
                    olusturulma_tarihi: { [Op.gte]: ayBaslangici },
                },
                raw: true,
            }),
            // Son 24 saatte kayit olan kullanici sayisi (yeni feature - Profile.olusturulma_tarihi)
            // Kolon henuz sync ile eklenmemisse hata firlatabilir; catch icinde guvenliyiz.
            Profile.count({
                where: { olusturulma_tarihi: { [Op.gte]: son24Saat } },
            }).catch(() => 0),
            // Son 15 dakikada aktif olan kullanici (Online sayci - Profile.son_aktivite_tarihi)
            Profile.count({
                where: { son_aktivite_tarihi: { [Op.gte]: son15Dakika } },
            }).catch(() => 0),
        ]);

        const toplamCiro = Number(revenueRow?.toplam || 0);
        const aylikCiro = Number(monthlyRevenueRow?.toplam || 0);

        return res.status(200).json({
            success: true,
            data: {
                // --- Geriye uyumlu (eski alanlar) ---
                totalUsers,
                activeCourses,
                pendingCourses,

                // --- Yeni: kullanici dagilimi ---
                totalStudents,
                totalInstructors,

                // --- Yeni: kurs/etkinlik sayimlari ---
                totalEnrollments,
                totalCertificates,
                upcomingLiveSessions,

                // --- Yeni: finansal ---
                toplamCiro,
                aylikCiro,
                paraBirimi: 'TRY',

                // --- Yeni: yeni kayit & online takip ---
                yeniKayitlar24h,
                onlineKullanicilar,
            },
        });
    } catch (error) {
        console.error(`[ADMIN] Dashboard istatistikleri hatasi: ${error.message}`);
        error.message = 'Istatistikler alinirken sunucu hatasi olustu.';
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
 * Kursu Reddetme İşlemi.
 *
 * Akis:
 *   1) red_sebebi zorunlu (min 10 char) - egitmen bu mesaji bilet uzerinden okuyacak.
 *   2) Course.durum -> 'taslak', kurslar.red_sebebi alani doldurulur.
 *   3) Egitmene 'destek' tipinde Notification gonderilir.
 *   4) Otomatik SupportTicket (kategori='kurs_onay') acilir + ilk mesaj olarak red_sebebi
 *      yazilir. gonderen_id = admin (req.user.id) — egitmen ticket'i acan degil, sahip.
 *      kullanici_id = egitmen (Course.egitmen_id) - bilet sahibi.
 *   Boylece egitmen ticket detay sayfasindan admin'e dogrudan yanit yazabilir.
 *
 * Tasarim notu:
 *   - Ticket olusturma + ilk mesaj + Course update tek transaction'da. Bildirim
 *     non-blocking (sendNotification kendi try/catch'i icinde).
 *   - Bildirim hatasi kursu reddetme islemini geri almaz (asil is degisik islemler
 *     icin atomik kalmali, bildirim son adim).
 *
 * @route PUT /api/admin/reject-course/:courseId
 * Body: { sebep: string }  (eski API ile uyumlu; red_sebebi alias'i da kabul edilir.)
 */
exports.rejectCourse = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { courseId } = req.params;
        const adminId = req.user?.id || null;
        // Eski ve yeni alan adlarinin ikisini de kabul et (UI'da iki isim de gecmis olabilir).
        const rawSebep = req.body?.red_sebebi ?? req.body?.sebep ?? '';
        const sebep = String(rawSebep).trim();

        if (sebep.length < 10) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: 'Red sebebi en az 10 karakter olmali. Egitmen bu mesaji bilet uzerinden okuyacak.',
            });
        }

        const course = await Course.findByPk(courseId, { transaction: t });
        if (!course) {
            await t.rollback();
            return res.status(404).json({ success: false, message: 'Kurs bulunamadı' });
        }
        if (course.silindi_mi) {
            await t.rollback();
            return res.status(410).json({ success: false, message: 'Kurs silinmis durumda.' });
        }
        if (course.durum !== 'onay_bekliyor') {
            await t.rollback();
            return res.status(409).json({
                success: false,
                message: `Sadece onay bekleyen kurslar reddedilebilir. Mevcut durum: ${course.durum}`,
            });
        }

        // 1) Kursu reddet: durum=taslak + red_sebebi saklanir.
        await course.update({
            durum: 'taslak',
            red_sebebi: sebep,
        }, { transaction: t });

        // 2) Otomatik destek talebi: kategori='kurs_onay'. Sahip = egitmen.
        const konuMetni = `Kurs Reddi: ${String(course.baslik || 'Adsiz kurs').slice(0, 200)}`;
        const ticket = await SupportTicket.create({
            kullanici_id: course.egitmen_id,
            konu: konuMetni,
            kategori: 'kurs_onay',
            durum: 'cevaplandi', // Admin son mesaji yazdi (red_sebebi) -> egitmenin cevabi bekleniyor.
        }, { transaction: t });

        // 3) Ilk mesaj: admin'in red gerekcesi.
        await SupportMessage.create({
            talep_id: ticket.id,
            gonderen_id: adminId,
            mesaj: sebep,
            okundu_mu: false,
        }, { transaction: t });

        await t.commit();

        // 4) Bildirim (non-blocking). sendNotification kendi try/catch'inde — fail olsa bile akis dogru.
        try {
            await sendNotification({
                kullanici_id: course.egitmen_id,
                baslik: 'Kursunuz reddedildi',
                mesaj: `"${course.baslik}" adli kursunuz reddedildi. Sebep: ${sebep.slice(0, 180)}${sebep.length > 180 ? '…' : ''}`,
                tip: 'destek',
                baglanti_linki: `/main/contact.html?ticket=${ticket.id}`,
                kaynak_id: ticket.id,
            });
        } catch (notifyErr) {
            console.warn('[ADMIN REJECT COURSE] Bildirim atlandi:', notifyErr.message);
        }

        console.log(`[ADMIN] Kurs ${courseId} reddedildi. ticket=${ticket.id}, admin=${adminId}, sebep_len=${sebep.length}`);

        return res.status(200).json({
            success: true,
            message: 'Kurs reddedildi; egitmene destek bileti ile bildirildi.',
            data: {
                course_id: course.id,
                durum: course.durum,
                ticket_id: ticket.id,
            },
        });
    } catch (error) {
        await t.rollback().catch(() => {});
        console.error('[ADMIN REJECT COURSE] Hata:', error.message);
        const err = new Error('Kurs reddedilirken hata olustu');
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

/**
 * Komuta Merkezi - Birlesik Aktivite Akisi (Live Activity Feed)
 *
 * 6 farkli kaynaktan paralel olarak en son N kaydi cekip, JS tarafinda
 * tarih sirasiyla birlestirir. Cikti normalize edilmis tek bir listedir.
 *
 * Kaynaklar:
 *  - satin_alim          : Order (durum=tamamlandi) + OrderItem -> Course
 *  - kursa_kayit         : CourseEnrollment
 *  - yeni_yorum          : Review
 *  - kurs_onay_talebi    : Course (durum=onay_bekliyor)
 *  - sertifika_tamamlama : Certificate (kurs tamamlama = sertifika verişi)
 *  - canli_ders          : LiveSession
 *
 * Query: ?limit=20 (default 20, max 100)
 *
 * @route GET /api/admin/activity-feed
 */
exports.getActivityFeed = async (req, res, next) => {
    try {
        const limitRaw = parseInt(req.query.limit, 10) || 20;
        const limit = Math.min(Math.max(limitRaw, 1), 100);
        // Her kaynaktan limit kadar cek; birlestirip tekrar limit kadar slice ederiz.
        const perSource = limit;

        // Son 24 saat penceresi - yeni kullanici kayitlari icin
        const son24Saat = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [
            recentOrders,
            recentEnrollments,
            recentReviews,
            recentPendingCourses,
            recentCertificates,
            recentLiveSessions,
            recentNewUsers,
        ] = await Promise.all([
            // 1) Basarili siparisler -> her OrderItem ayri bir 'satin_alim' kaydi
            Order.findAll({
                where: { durum: 'tamamlandi' },
                attributes: ['id', 'kullanici_id', 'toplam_tutar', 'olusturulma_tarihi'],
                include: [
                    {
                        model: Profile,
                        attributes: ['id', 'ad', 'soyad', 'eposta'],
                        required: false,
                    },
                    {
                        model: OrderItem,
                        attributes: ['id', 'kurs_id', 'odenen_fiyat'],
                        required: false,
                        include: [
                            {
                                model: Course,
                                attributes: ['id', 'baslik'],
                                required: false,
                            },
                        ],
                    },
                ],
                order: [['olusturulma_tarihi', 'DESC']],
                limit: perSource,
            }),

            // 2) Kursa kayit
            CourseEnrollment.findAll({
                attributes: ['id', 'ogrenci_id', 'kurs_id', 'kayit_tarihi', 'ilerleme_yuzdesi'],
                include: [
                    {
                        model: Profile,
                        as: 'Ogrenci',
                        attributes: ['id', 'ad', 'soyad'],
                        required: false,
                    },
                    {
                        model: Course,
                        attributes: ['id', 'baslik'],
                        required: false,
                    },
                ],
                order: [['kayit_tarihi', 'DESC']],
                limit: perSource,
            }),

            // 3) Yeni yorumlar (Review'in id'si yok, composite PK)
            Review.findAll({
                attributes: ['kurs_id', 'ogrenci_id', 'puan', 'yorum', 'olusturulma_tarihi'],
                include: [
                    {
                        model: Profile,
                        as: 'Yazar',
                        attributes: ['id', 'ad', 'soyad'],
                        required: false,
                    },
                    {
                        model: Course,
                        attributes: ['id', 'baslik'],
                        required: false,
                    },
                ],
                order: [['olusturulma_tarihi', 'DESC']],
                limit: perSource,
            }),

            // 4) Onay bekleyen kurslar
            Course.findAll({
                where: { durum: 'onay_bekliyor', silindi_mi: false },
                attributes: ['id', 'baslik', 'fiyat', 'olusturulma_tarihi', 'egitmen_id'],
                include: [
                    {
                        model: Profile,
                        as: 'Egitmen',
                        attributes: ['id', 'ad', 'soyad'],
                        required: false,
                    },
                ],
                order: [['olusturulma_tarihi', 'DESC']],
                limit: perSource,
            }),

            // 5) Sertifika (kurs tamamlama olayi ile esdeger)
            Certificate.findAll({
                attributes: ['id', 'kayit_id', 'sertifika_kodu', 'verilis_tarihi'],
                include: [
                    {
                        model: CourseEnrollment,
                        attributes: ['ogrenci_id', 'kurs_id'],
                        required: false,
                        include: [
                            {
                                model: Profile,
                                as: 'Ogrenci',
                                attributes: ['id', 'ad', 'soyad'],
                                required: false,
                            },
                            {
                                model: Course,
                                attributes: ['id', 'baslik'],
                                required: false,
                            },
                        ],
                    },
                ],
                order: [['verilis_tarihi', 'DESC']],
                limit: perSource,
            }),

            // 6) Canli ders oluşturuldu - iptal edilenleri feed'den cikar
            LiveSession.findAll({
                where: { durum: { [Op.ne]: 'iptal' } },
                attributes: ['id', 'baslik', 'baslangic_tarihi', 'durum', 'olusturulma_tarihi', 'egitmen_id', 'kurs_id'],
                include: [
                    {
                        model: Profile,
                        as: 'Egitmen',
                        attributes: ['id', 'ad', 'soyad'],
                        required: false,
                    },
                    {
                        model: Course,
                        attributes: ['id', 'baslik'],
                        required: false,
                    },
                ],
                order: [['olusturulma_tarihi', 'DESC']],
                limit: perSource,
            }),

            // 7) Son 24 saatte sisteme kayit olan kullanicilar
            // Profile.olusturulma_tarihi kolonu yeni eklendi (sync ile auto-migrate).
            // Eski kayitlarda NULL olabilir; bunlar 24-saat filtresine takilmadigi icin doğal olarak gosterilmez.
            Profile.findAll({
                where: { olusturulma_tarihi: { [Op.gte]: son24Saat } },
                attributes: ['id', 'ad', 'soyad', 'rol', 'olusturulma_tarihi'],
                order: [['olusturulma_tarihi', 'DESC']],
                limit: perSource,
            }).catch(() => []), // Kolon sync edilmemisse sessizce bos liste
        ]);

        // --- Normalize: her kaydi { id, type, tarih, baslik, aciklama, ... } formatina cevir ---
        const events = [];

        for (const o of recentOrders) {
            const items = o.OrderItems || [];
            const kurslar = items.map(i => i.Course?.baslik).filter(Boolean);
            const kursOzet = kurslar.length
                ? (kurslar.length === 1 ? kurslar[0] : `${kurslar[0]} (+${kurslar.length - 1} kurs)`)
                : 'Kurs paketi';
            const alici = o.Profile
                ? `${o.Profile.ad || ''} ${o.Profile.soyad || ''}`.trim()
                : 'Misafir kullanici';
            events.push({
                id: `order:${o.id}`,
                type: 'satin_alim',
                tarih: o.olusturulma_tarihi,
                baslik: kursOzet,
                aciklama: `${alici} satin aldi`,
                kullanici: alici,
                tutar: Number(o.toplam_tutar || 0),
                kurs_id: items[0]?.kurs_id || null,
                link: { page: '/admin/orders.html', focus: o.id },
            });
        }

        for (const e of recentEnrollments) {
            const ogrenci = e.Ogrenci
                ? `${e.Ogrenci.ad || ''} ${e.Ogrenci.soyad || ''}`.trim()
                : 'Bilinmeyen ogrenci';
            events.push({
                id: `enroll:${e.id}`,
                type: 'kursa_kayit',
                tarih: e.kayit_tarihi,
                baslik: e.Course?.baslik || 'Bilinmeyen kurs',
                aciklama: `${ogrenci} kursa kaydoldu`,
                kullanici: ogrenci,
                kurs_id: e.kurs_id,
                link: { page: '/admin/users.html', focus: e.ogrenci_id },
            });
        }

        for (const r of recentReviews) {
            const yazar = r.Yazar
                ? `${r.Yazar.ad || ''} ${r.Yazar.soyad || ''}`.trim()
                : 'Bilinmeyen kullanici';
            const yorumKisa = (r.yorum || '').slice(0, 80);
            events.push({
                id: `review:${r.kurs_id}:${r.ogrenci_id}`,
                type: 'yeni_yorum',
                tarih: r.olusturulma_tarihi,
                baslik: r.Course?.baslik || 'Bilinmeyen kurs',
                aciklama: `${yazar} ${r.puan}/5 puan verdi${yorumKisa ? `: "${yorumKisa}${(r.yorum || '').length > 80 ? '...' : ''}"` : ''}`,
                kullanici: yazar,
                puan: r.puan,
                kurs_id: r.kurs_id,
                link: { page: '/admin/reviews.html', focus: `${r.kurs_id}:${r.ogrenci_id}` },
            });
        }

        for (const c of recentPendingCourses) {
            const egitmen = c.Egitmen
                ? `${c.Egitmen.ad || ''} ${c.Egitmen.soyad || ''}`.trim()
                : 'Bilinmeyen egitmen';
            events.push({
                id: `pending:${c.id}`,
                type: 'kurs_onay_talebi',
                tarih: c.olusturulma_tarihi,
                baslik: c.baslik,
                aciklama: `${egitmen} kurs onayi bekliyor`,
                kullanici: egitmen,
                kurs_id: c.id,
                link: { page: '/admin/courses.html', focus: c.id },
            });
        }

        for (const cert of recentCertificates) {
            const enr = cert.CourseEnrollment;
            const ogrenci = enr?.Ogrenci
                ? `${enr.Ogrenci.ad || ''} ${enr.Ogrenci.soyad || ''}`.trim()
                : 'Bilinmeyen ogrenci';
            events.push({
                id: `cert:${cert.id}`,
                type: 'sertifika_tamamlama',
                tarih: cert.verilis_tarihi,
                baslik: enr?.Course?.baslik || 'Kurs tamamlandi',
                aciklama: `${ogrenci} sertifika aldi (#${cert.sertifika_kodu})`,
                kullanici: ogrenci,
                kurs_id: enr?.kurs_id || null,
                link: enr?.ogrenci_id
                    ? { page: '/admin/users.html', focus: enr.ogrenci_id }
                    : null,
            });
        }

        for (const ls of recentLiveSessions) {
            const egitmen = ls.Egitmen
                ? `${ls.Egitmen.ad || ''} ${ls.Egitmen.soyad || ''}`.trim()
                : 'Bilinmeyen egitmen';
            events.push({
                id: `live:${ls.id}`,
                type: 'canli_ders',
                tarih: ls.olusturulma_tarihi,
                baslik: ls.baslik,
                aciklama: `${egitmen} canli ders oluşturdu (${ls.durum})`,
                kullanici: egitmen,
                kurs_id: ls.kurs_id,
                baslangic_tarihi: ls.baslangic_tarihi,
                link: ls.kurs_id
                    ? { page: '/admin/published-courses.html', focus: ls.kurs_id }
                    : null,
            });
        }

        for (const u of recentNewUsers) {
            const adSoyad = `${u.ad || ''} ${u.soyad || ''}`.trim() || 'Yeni kullanici';
            const rolEtiketi = u.rol === 'egitmen'
                ? 'Egitmen olarak'
                : (u.rol === 'admin' ? 'Yonetici olarak' : 'Ogrenci olarak');
            events.push({
                id: `user:${u.id}`,
                type: 'yeni_kullanici',
                tarih: u.olusturulma_tarihi,
                baslik: adSoyad,
                aciklama: `${rolEtiketi} sisteme kayit oldu`,
                kullanici: adSoyad,
                rol: u.rol,
                link: { page: '/admin/users.html', focus: u.id },
            });
        }

        // Tarih DESC sirala ve limit kadar slice et
        events.sort((a, b) => {
            const ta = a.tarih ? new Date(a.tarih).getTime() : 0;
            const tb = b.tarih ? new Date(b.tarih).getTime() : 0;
            return tb - ta;
        });

        return res.status(200).json({
            success: true,
            data: events.slice(0, limit),
            meta: {
                limit,
                toplam_event: events.length,
                kaynak_sayisi: 7,
            },
        });
    } catch (error) {
        console.error(`[ADMIN] Activity feed hatasi: ${error.message}`);
        error.message = 'Aktivite akisi alinirken sunucu hatasi olustu.';
        error.statusCode = 500;
        next(error);
    }
};

/**
 * Son N gunluk satis trendi (Chart.js icin).
 * Query: ?days=7 (default 7, max 30)
 *
 * @route GET /api/admin/sales-trend
 */
exports.getSalesTrend = async (req, res, next) => {
    try {
        const daysRaw = parseInt(req.query.days, 10) || 7;
        const days = Math.min(Math.max(daysRaw, 1), 30);

        // Baslangic: bugunden 'days-1' gun once, gun başlangici
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 0, 0, 0, 0);

        // GROUP BY DATE(olusturulma_tarihi)
        // Not: ONLY_FULL_GROUP_BY uyumlu olmasi icin GROUP BY ifadesini alias degil,
        // dogrudan DATE() fonksiyonuyla veriyoruz.
        const dateExpr = fn('DATE', col('olusturulma_tarihi'));
        const rows = await Order.findAll({
            attributes: [
                [dateExpr, 'gun'],
                [fn('COALESCE', fn('SUM', col('toplam_tutar')), 0), 'toplam'],
                [fn('COUNT', col('id')), 'siparis_sayisi'],
            ],
            where: {
                durum: 'tamamlandi',
                olusturulma_tarihi: { [Op.gte]: start },
            },
            group: [fn('DATE', col('olusturulma_tarihi'))],
            order: [[fn('DATE', col('olusturulma_tarihi')), 'ASC']],
            raw: true,
        });

        // Eksik gunleri 0 ile doldur (Chart.js'in tam serisi olsun)
        const map = new Map();
        for (const r of rows) {
            // r.gun MySQL'den 'YYYY-MM-DD' string olarak gelir
            const key = typeof r.gun === 'string' ? r.gun : new Date(r.gun).toISOString().slice(0, 10);
            map.set(key, {
                toplam: Number(r.toplam || 0),
                siparis_sayisi: Number(r.siparis_sayisi || 0),
            });
        }

        // Turkce kisa gun isimleri (getDay: 0=Pazar)
        const GUN_KISA = ['Paz', 'Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt'];

        const seri = [];
        for (let i = 0; i < days; i++) {
            const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
            const key = d.toISOString().slice(0, 10);
            const v = map.get(key) || { toplam: 0, siparis_sayisi: 0 };
            seri.push({
                gun: key,
                gunIsmi: GUN_KISA[d.getDay()],
                gunTam: d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
                toplam: v.toplam,
                siparis_sayisi: v.siparis_sayisi,
            });
        }

        return res.status(200).json({
            success: true,
            data: seri,
            meta: { days, paraBirimi: 'TRY' },
        });
    } catch (error) {
        console.error(`[ADMIN] Sales trend hatasi: ${error.message}`);
        error.message = 'Satis trendi alinirken sunucu hatasi olustu.';
        error.statusCode = 500;
        next(error);
    }
};

// ============================================
// MODULE EXPORTS
// ============================================
module.exports = {
    adminLogin: exports.adminLogin,
    getDashboardStats: exports.getDashboardStats,
    getActivityFeed: exports.getActivityFeed,
    getSalesTrend: exports.getSalesTrend,
    getPendingCourses: exports.getPendingCourses,
    getCourseDetail: exports.getCourseDetail,
    approveCourse: exports.approveCourse,
    rejectCourse: exports.rejectCourse,
    getAllCourses: exports.getAllCourses,
    getPublishedCoursesReport: exports.getPublishedCoursesReport,
    getUserDetail: exports.getUserDetail,
};