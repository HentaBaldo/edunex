const { 
    Course, 
    Profile, 
    CourseEnrollment, 
    Category, 
    CourseSection, 
    Lesson,
    InstructorDetail // <--- EKSİK OLAN VE HATAYA SEBEP OLAN SATIR BURASIYDI
} = require('../models');

/**
 * Yayındaki Kurslar Genel Listesi (Rapor)
 * @route GET /api/admin/published-courses-report
 */
exports.getPublishedCoursesReport = async (req, res, next) => {
    try {
        console.log(`[ADMIN] Yayındaki kurslar raporu istendi`);

        const courses = await Course.findAll({
            where: { durum: 'yayinda' },
            attributes: [
                'id', 'baslik', 'fiyat', 'olusturulma_tarihi',
                'son_duzenleme_tarihi', 'onaydan_sonra_duzenlendi_mi'
            ],
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
                    attributes: ['id']
                }
            ],
            order: [['olusturulma_tarihi', 'DESC']]
        });

        return res.status(200).json({
            success: true,
            data: courses
        });
    } catch (error) {
        console.error(`[ADMIN] Kurs rapor hatası: ${error.message}`);
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
               'son_duzenleme_tarihi', 'onaydan_sonra_duzenlendi_mi' // Düzenleme izleme
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