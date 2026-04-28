const {
    Course,
    Profile,
    CourseEnrollment,
    Category,
    CourseSection,
    Lesson,
    InstructorDetail,
    OrderItem
} = require('../models');
const { Op } = require('sequelize');

/**
 * Filter -> Sequelize where mapping (admin courses-tracking).
 * - yayinda: durum=yayinda, silindi_mi=false
 * - iade: durum=taslak, admin_tarafindan_iade_edildi=true, silindi_mi=false
 * - arsiv: durum=arsiv, silindi_mi=false
 * - silinmis: silindi_mi=true (her durum)
 * - duzenlenmis: silindi_mi=false, onaydan_sonra_duzenlendi_mi=true
 *   (yayinda/onay_bekliyor/onaylandi - egitmen onaydan sonra duzenleme yapmis tum kurslar)
 */
const buildTrackingWhere = (filter) => {
    switch (filter) {
        case 'iade':
            return { silindi_mi: false, durum: 'taslak', admin_tarafindan_iade_edildi: true };
        case 'arsiv':
            return { silindi_mi: false, durum: 'arsiv' };
        case 'silinmis':
            return { silindi_mi: true };
        case 'duzenlenmis':
            return { silindi_mi: false, onaydan_sonra_duzenlendi_mi: true };
        case 'yayinda':
        default:
            return { silindi_mi: false, durum: 'yayinda' };
    }
};

/**
 * Yayındaki Kurslar Genel Listesi (Rapor) - Eski endpoint, geriye uyumlu.
 * Yeni endpoint: GET /api/admin/courses-tracking?filter=yayinda
 * @route GET /api/admin/published-courses-report
 */
exports.getPublishedCoursesReport = async (req, res, next) => {
    try {
        console.log(`[ADMIN] Yayındaki kurslar raporu istendi (legacy)`);

        const courses = await Course.findAll({
            where: { durum: 'yayinda', silindi_mi: false },
            attributes: [
                'id', 'baslik', 'fiyat', 'olusturulma_tarihi',
                'son_duzenleme_tarihi', 'onaydan_sonra_duzenlendi_mi'
            ],
            include: [
                { model: Profile, as: 'Egitmen', attributes: ['ad', 'soyad'] },
                { model: Category, attributes: ['ad'] },
                { model: CourseEnrollment, as: 'CourseEnrollments', attributes: ['id'] }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        return res.status(200).json({ success: true, data: courses });
    } catch (error) {
        console.error(`[ADMIN] Kurs rapor hatası: ${error.message}`);
        next(error);
    }
};

/**
 * Admin Kurs Takibi - Filtreli Liste (yayinda/iade/arsiv/silinmis)
 * Sayfa basinda 4 sekme icin sayilari da dondurur.
 * @route GET /api/admin/courses-tracking?filter=...&search=...
 */
exports.getCoursesTracking = async (req, res, next) => {
    try {
        const filter = (req.query.filter || 'yayinda').toString();
        const search = (req.query.search || '').toString().trim();

        const where = buildTrackingWhere(filter);
        if (search) {
            where.baslik = { [Op.like]: `%${search}%` };
        }

        const courses = await Course.findAll({
            where,
            attributes: [
                'id', 'baslik', 'fiyat', 'durum', 'olusturulma_tarihi',
                'son_duzenleme_tarihi', 'onaydan_sonra_duzenlendi_mi',
                'silindi_mi', 'silinme_tarihi', 'silme_sebebi',
                'admin_tarafindan_iade_edildi', 'iade_tarihi', 'iade_sebebi'
            ],
            include: [
                { model: Profile, as: 'Egitmen', attributes: ['id', 'ad', 'soyad'] },
                { model: Category, attributes: ['ad'] },
                { model: CourseEnrollment, as: 'CourseEnrollments', attributes: ['id'] }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        // Sekme rozetleri icin sayim (search uygulamadan).
        const [yayinda, iade, arsiv, silinmis, duzenlenmis] = await Promise.all([
            Course.count({ where: buildTrackingWhere('yayinda') }),
            Course.count({ where: buildTrackingWhere('iade') }),
            Course.count({ where: buildTrackingWhere('arsiv') }),
            Course.count({ where: buildTrackingWhere('silinmis') }),
            Course.count({ where: buildTrackingWhere('duzenlenmis') }),
        ]);

        return res.status(200).json({
            success: true,
            filter,
            data: courses,
            counts: { yayinda, iade, arsiv, silinmis, duzenlenmis }
        });
    } catch (error) {
        console.error(`[ADMIN] courses-tracking hatasi: ${error.message}`);
        next(error);
    }
};

/**
 * Admin: Yayindan Kaldir (yayinda -> taslak + iade flag).
 * Egitmen kursu duzenleyip tekrar onaya gonderebilir; ogrenciler artik kursu goremez.
 * @route PUT /api/admin/courses/:id/unpublish   body: { sebep }
 */
exports.unpublishCourse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const adminId = req.user?.id || null;
        const sebep = (req.body?.sebep || '').toString().trim();

        if (sebep.length < 10) {
            return res.status(400).json({ success: false, message: 'Iade sebebi en az 10 karakter olmali.' });
        }

        const course = await Course.findByPk(id);
        if (!course) return res.status(404).json({ success: false, message: 'Kurs bulunamadi.' });
        if (course.silindi_mi) return res.status(410).json({ success: false, message: 'Kurs silinmis durumda.' });
        if (course.durum !== 'yayinda') {
            return res.status(409).json({ success: false, message: `Sadece yayindaki kurslar iade edilebilir. Mevcut durum: ${course.durum}` });
        }

        await course.update({
            durum: 'taslak',
            admin_tarafindan_iade_edildi: true,
            iade_tarihi: new Date(),
            iade_eden_admin_id: adminId,
            iade_sebebi: sebep,
            onaydan_sonra_duzenlendi_mi: false
        });

        console.log(`[ADMIN] Kurs iade edildi (taslaga dondu): ${id}, admin=${adminId}`);
        return res.status(200).json({ success: true, message: 'Kurs taslaga iade edildi.', data: { id, durum: 'taslak' } });
    } catch (error) {
        console.error(`[ADMIN] unpublishCourse hatasi: ${error.message}`);
        next(error);
    }
};

/**
 * Admin: Yayina Al (iade taslak veya arsiv -> yayinda).
 * Egitmen onayini bypass eder (admin yetkisi).
 * @route PUT /api/admin/courses/:id/republish
 */
exports.republishCourse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const course = await Course.findByPk(id);
        if (!course) return res.status(404).json({ success: false, message: 'Kurs bulunamadi.' });
        if (course.silindi_mi) return res.status(410).json({ success: false, message: 'Kurs silinmis durumda.' });

        const allowedFrom = ['taslak', 'arsiv', 'onaylandi', 'onay_bekliyor'];
        if (!allowedFrom.includes(course.durum)) {
            return res.status(409).json({ success: false, message: `Bu durumdan yayina alinamaz: ${course.durum}` });
        }

        await course.update({
            durum: 'yayinda',
            admin_tarafindan_iade_edildi: false,
            iade_tarihi: null,
            iade_eden_admin_id: null,
            iade_sebebi: null
        });

        console.log(`[ADMIN] Kurs yayina alindi: ${id}`);
        return res.status(200).json({ success: true, message: 'Kurs yayina alindi.', data: { id, durum: 'yayinda' } });
    } catch (error) {
        console.error(`[ADMIN] republishCourse hatasi: ${error.message}`);
        next(error);
    }
};

/**
 * Admin: Hibrit Sil. 0 enrollment + 0 OrderItem ise gercek silme; aksi halde soft delete.
 * @route DELETE /api/admin/courses/:id   body: { sebep }
 */
exports.deleteCourseAsAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;
        const adminId = req.user?.id || null;
        const sebep = (req.body?.sebep || '').toString().trim();

        if (sebep.length < 10) {
            return res.status(400).json({ success: false, message: 'Silme sebebi en az 10 karakter olmali.' });
        }

        const course = await Course.findByPk(id);
        if (!course) return res.status(404).json({ success: false, message: 'Kurs bulunamadi.' });
        if (course.silindi_mi) return res.status(409).json({ success: false, message: 'Kurs zaten silinmis.' });

        const [enrollmentCount, orderItemCount] = await Promise.all([
            CourseEnrollment.count({ where: { kurs_id: id } }),
            OrderItem.count({ where: { kurs_id: id } })
        ]);

        const canHardDelete = enrollmentCount === 0 && orderItemCount === 0;

        if (canHardDelete) {
            // Cascade: CourseSection, Lesson, Review, CartItem, LiveSession vb. tum cocuklar silinir.
            await course.destroy();
            console.log(`[ADMIN] Kurs HARD-DELETE: ${id}, admin=${adminId}, sebep="${sebep}"`);
            return res.status(200).json({
                success: true,
                mode: 'hard',
                message: 'Kurs kalici olarak silindi.',
                enrollment_count: 0,
                order_count: 0
            });
        }

        await course.update({
            silindi_mi: true,
            silinme_tarihi: new Date(),
            silen_admin_id: adminId,
            silme_sebebi: sebep
        });

        console.log(`[ADMIN] Kurs SOFT-DELETE: ${id}, enrollment=${enrollmentCount}, orders=${orderItemCount}, admin=${adminId}`);
        return res.status(200).json({
            success: true,
            mode: 'soft',
            message: 'Kurs gizlendi (soft delete). Geri yuklenebilir.',
            enrollment_count: enrollmentCount,
            order_count: orderItemCount
        });
    } catch (error) {
        console.error(`[ADMIN] deleteCourseAsAdmin hatasi: ${error.message}`);
        next(error);
    }
};

/**
 * Admin: Soft-deleted kursu geri yukle.
 * @route POST /api/admin/courses/:id/restore
 */
exports.restoreDeletedCourse = async (req, res, next) => {
    try {
        const { id } = req.params;
        const course = await Course.findByPk(id);
        if (!course) return res.status(404).json({ success: false, message: 'Kurs bulunamadi.' });
        if (!course.silindi_mi) {
            return res.status(409).json({ success: false, message: 'Kurs zaten silinmemis.' });
        }

        await course.update({
            silindi_mi: false,
            silinme_tarihi: null,
            silen_admin_id: null,
            silme_sebebi: null
        });

        console.log(`[ADMIN] Soft-deleted kurs geri yuklendi: ${id}`);
        return res.status(200).json({ success: true, message: 'Kurs geri yuklendi.', data: { id, durum: course.durum } });
    } catch (error) {
        console.error(`[ADMIN] restoreDeletedCourse hatasi: ${error.message}`);
        next(error);
    }
};

/**
* Kurs İçeriği İnceleme (Tanrı Modu - Müfredat & Medya)
* @route GET /api/admin/courses/:id/full-content
*/
exports.getCourseFullContent = async (req, res, next) => {
   try {
       const { id } = req.params;
       const course = await Course.findByPk(id, {
           attributes: [
               'id', 'baslik', 'alt_baslik', 'dil', 'seviye',
               'fiyat', 'durum', 'kazanimlar', 'gereksinimler', // Kurs detayları eklendi
               'son_duzenleme_tarihi', 'onaydan_sonra_duzenlendi_mi', // Düzenleme izleme
               'silindi_mi', 'silinme_tarihi', 'silme_sebebi',
               'admin_tarafindan_iade_edildi', 'iade_tarihi', 'iade_sebebi'
           ],
           include: [
               {
                   model: Profile,
                   as: 'Egitmen',
                   attributes: ['ad', 'soyad'],
                   include: [{ model: InstructorDetail, attributes: ['unvan', 'biyografi'] }]
               },
               { model: Category, attributes: ['ad'] },
               {
                   model: CourseSection,
                   as: 'Sections',
                   attributes: [
                       'id', 'baslik', 'aciklama', 'sira_numarasi',
                       'gizli_mi', 'gizlenme_tarihi' // Soft-delete izleme
                   ],
                   include: [{
                       model: Lesson,
                       as: 'Lessons',
                       attributes: [
                           'id', 'baslik', 'icerik_tipi', 'video_saglayici_id',
                           'kaynak_url', 'sira_numarasi', 'aciklama',
                           'gizli_mi', 'gizlenme_tarihi' // Soft-delete izleme
                       ]
                   }]
               }
           ],
           order: [
               [{ model: CourseSection, as: 'Sections' }, 'sira_numarasi', 'ASC'],
               [{ model: CourseSection, as: 'Sections' }, { model: Lesson, as: 'Lessons' }, 'sira_numarasi', 'ASC']
           ]
       });

       if (!course) return res.status(404).json({ success: false, message: 'Kurs bulunamadı.' });

       return res.status(200).json({
           success: true,
           data: course,
           bunnyLibraryId: process.env.BUNNY_LIBRARY_ID 
       });
   } catch (error) {
       next(error);
   }
};

/**
 * Kurs Katılımcı Detayları (Öğrenci Bazlı İlerleme)
 * @route GET /api/admin/courses/:id/participants
 */
exports.getCourseParticipants = async (req, res, next) => {
    try {
        const { id } = req.params;
        console.log(`[ADMIN] Kurs katılımcıları listeleniyor: ${id}`);

        const participants = await CourseEnrollment.findAll({
            where: { kurs_id: id },
            include: [
                {
                    model: Profile,
                    as: 'Ogrenci',
                    attributes: ['id', 'ad', 'soyad', 'eposta']
                }
            ],
            order: [['kayit_tarihi', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            data: participants
        });
    } catch (error) {
        console.error(`[ADMIN] Katılımcı rapor hatası: ${error.message}`);
        next(error);
    }
};