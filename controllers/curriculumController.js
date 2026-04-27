const { CourseSection, Lesson, Course } = require('../models');
const { uploadVideoToBunny, uploadFileToBunnyStorage } = require('../services/bunnyService');
const path = require('path');
const fs = require('fs');

/**
 * Belge dosyasını Bunny Storage'a yüklemeyi dener; başarısızsa
 * kalıcı yerel klasöre (/uploads/lessons/) taşır. Hangisi başarılı
 * olursa olsun final URL/path'i ve local yedek dosyanın silinip
 * silinmemesi gerektiğini bildirir.
 *
 * @param {object} uploadedFile - multer file objesi
 * @returns {Promise<{publicUrl: string, source: 'bunny'|'local'}>}
 */
const persistLessonDocument = async (uploadedFile) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${uploadedFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const remoteName = `lessons/${safeName}`;

    const result = await uploadFileToBunnyStorage(uploadedFile.path, remoteName);
    if (result.success) {
        // Bunny'e başarıyla yüklendi, temp dosyayı sil
        try {
            if (fs.existsSync(uploadedFile.path)) fs.unlinkSync(uploadedFile.path);
        } catch (e) {
            console.warn(`[LESSON DOC] Temp temizleme uyarısı: ${e.message}`);
        }
        return { publicUrl: result.publicUrl, source: 'bunny' };
    }

    // FALLBACK: Yerel kalıcı klasöre taşı
    const lessonsDir = path.join(__dirname, '..', 'uploads', 'lessons');
    if (!fs.existsSync(lessonsDir)) {
        fs.mkdirSync(lessonsDir, { recursive: true });
    }
    const finalLocalPath = path.join(lessonsDir, safeName);
    fs.renameSync(uploadedFile.path, finalLocalPath);
    console.warn(`[LESSON DOC] Bunny başarısız, yerel diske düştü: /uploads/lessons/${safeName}`);
    return { publicUrl: `/uploads/lessons/${safeName}`, source: 'local' };
};

/**
 * Yeni Bölüm Oluşturma
 * @route POST /api/curriculum/sections
 */
exports.createSection = async (req, res, next) => {
    try {
        const { kurs_id, baslik, aciklama } = req.body;
        const userId = req.user.id;

        if (!kurs_id || !baslik) {
            const error = new Error('Kurs ID ve başlık gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        // YETKİ KONTROLÜ
        const course = await Course.findOne({
            where: { id: kurs_id, egitmen_id: userId },
            attributes: ['id', 'durum'] // DÜZELTME: 'durum' eklendi
        });

        if (!course) {
            const error = new Error('Kurs bulunamadı veya bu kursa bölüm ekleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // KURS DEĞİŞİKLİK KİLİDİ
        if (course.durum !== 'taslak') {
            const error = new Error('Sadece taslak durumundaki kurslara bölüm eklenebilir. Yayında veya onayda olan kurslar değiştirilemez.');
            error.statusCode = 403;
            throw error;
        }

        // SIRA NUMARASI HESAPLA
        const maxSira = await CourseSection.max('sira_numarasi', {
            where: { kurs_id }
        });
        const nextOrder = (maxSira || 0) + 1;

        const section = await CourseSection.create({
            kurs_id,
            baslik,
            aciklama: aciklama || '',
            sira_numarasi: nextOrder
        });

        console.log(`[SECTION CREATE] Bölüm oluşturuldu: ${section.id}`);

        return res.status(201).json({
            status: 'success',
            message: 'Bölüm başarıyla oluşturuldu.',
            data: section
        });
    } catch (error) {
        console.error(`[SECTION CREATE] HATA: ${error.message}`);
        next(error);
    }
};

/**
 * Yeni Ders Oluşturma (Video Upload ile)
 * @route POST /api/curriculum/lessons
 */
exports.createLesson = async (req, res, next) => {
    const uploadedFile = req.file;
    let bunnyVideoGuid = null;
    let tempFilePath = null;
    
    try {
        const { 
            bolum_id, 
            baslik, 
            icerik_tipi, 
            kaynak_url, 
            sure_saniye, 
            onizleme_mi, 
            aciklama 
        } = req.body;
        const userId = req.user.id;

        // === VALIDASYON ===
        if (!bolum_id || !baslik) {
            const error = new Error('Bölüm ID ve başlık gereklidir.');
            error.statusCode = 400;
            throw error;
        }

        // === OWNERSHIP CHECK ===
        const section = await CourseSection.findOne({
            where: { id: bolum_id },
            attributes: ['id', 'kurs_id'],
            include: [{
                model: Course,
                attributes: ['id', 'egitmen_id', 'durum']
            }]
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (section.Course.egitmen_id !== userId) {
            const error = new Error('Bu bölüme ders ekleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // KURS DEĞİŞİKLİK KİLİDİ
        if (section.Course.durum !== 'taslak') {
            const error = new Error('Sadece taslak durumundaki kursların müfredatında değişiklik yapılabilir.');
            error.statusCode = 403;
            throw error;
        }

        // === SIRA NUMARASI HESAPLA ===
        const maxSira = await Lesson.max('sira_numarasi', {
            where: { bolum_id }
        });
        const nextOrder = (maxSira || 0) + 1;

        // === MEDYA VE LİNK İŞLEME MANTIĞI ===
        let finalVideoProvider = null;
        let finalKaynakUrl = null;

        // 1. Harici Link Varsa (YouTube vb.) Doğrula ve Ata
        if (kaynak_url) {
            const allowedDomains = ['youtube.com', 'youtu.be', 'vimeo.com', 'bunnycdn.com', 'cdn.example.com', 'localhost:3000'];
            try {
                const urlObj = new URL(kaynak_url);
                const isAllowed = allowedDomains.some(d => urlObj.hostname === d || urlObj.hostname.endsWith('.' + d));
                if (!isAllowed) throw new Error('Geçersiz domain');
                finalKaynakUrl = kaynak_url; // LİNKİ KENDİ AİT OLDUĞU YERE ALIYORUZ!
            } catch (e) {
                console.warn(`[LESSON CREATE] Link doğrulama hatası: ${e.message}`);
            }
        }

        // 2. Yüklenen Dosya Varsa (Bunny Video veya Belge)
        if (uploadedFile) {
            tempFilePath = uploadedFile.path;
            if (icerik_tipi === 'video') {
                try {
                    const bunnyResult = await uploadVideoToBunny(tempFilePath, baslik);
                    bunnyVideoGuid = bunnyResult.guid;
                    finalVideoProvider = bunnyVideoGuid;
                    // uploadVideoToBunny zaten arka planda temp'i siler, burada işaretliyoruz
                    tempFilePath = null;
                } catch (bunnyError) {
                    finalVideoProvider = null;
                }
            } else {
                // Belge: önce Bunny Storage, başarısızsa /uploads/lessons/ kalıcı yerel
                const stored = await persistLessonDocument(uploadedFile);
                finalVideoProvider = stored.publicUrl;
                // persistLessonDocument başarılıysa temp'i taşıdı/sildi, cleanup gerekmez
                tempFilePath = null;
            }
        }

        // === DERS OLUŞTUR ===
        const newLesson = await Lesson.create({
            bolum_id,
            baslik: String(baslik).trim().substring(0, 255),
            aciklama: aciklama ? String(aciklama).trim().substring(0, 5000) : null,
            video_saglayici_id: finalVideoProvider, // Sadece yüklü dosya ID'si/Yolu
            kaynak_url: finalKaynakUrl,             // Harici Linkler BİZİM YENİ SÜTUNA!
            sure_saniye: parseInt(sure_saniye) || 0,
            onizleme_mi: Boolean(onizleme_mi),
            sira_numarasi: nextOrder,
            icerik_tipi: icerik_tipi || 'video'
        });

        console.log(`[LESSON CREATE] ✅ Ders kaydedildi - ID: ${newLesson.id}, Video: ${newLesson.video_saglayici_id}`);

        return res.status(201).json({
            status: 'success',
            message: 'Ders başarıyla eklendi.',
            data: {
                id: newLesson.id,
                baslik: newLesson.baslik,
                video_saglayici_id: newLesson.video_saglayici_id,
                sira_numarasi: newLesson.sira_numarasi,
                processingNote: bunnyVideoGuid 
                    ? '✓ Video Bunny.net\'te işleniyor (1-30 dakika)' 
                    : 'Video yok'
            }
        });

    } catch (error) {
        console.error(`[LESSON CREATE] HATA: ${error.message}`);
        
        if (uploadedFile && tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (e) {
                console.warn(`[CLEANUP] Geçici dosya silinemedi: ${tempFilePath}`);
            }
        }
        
        next(error);
    }
};
/**
 * Bölüm Güncelleme
 * @route PUT /api/curriculum/sections/:id
 */
exports.updateSection = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { baslik, aciklama } = req.body;
        const userId = req.user.id;

        const section = await CourseSection.findOne({
            where: { id },
            attributes: ['id', 'kurs_id', 'baslik', 'aciklama'],
            include: [{
                model: Course,
                attributes: ['id', 'egitmen_id', 'durum'], // DÜZELTME: 'durum' eklendi
                required: true
            }]
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (section.Course.egitmen_id !== userId) {
            const error = new Error('Bu bölümü güncelleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // KURS DEĞİŞİKLİK KİLİDİ
        if (section.Course.durum !== 'taslak') {
            const error = new Error('Sadece taslak durumundaki kursların bölümleri güncellenebilir.');
            error.statusCode = 403;
            throw error;
        }

        await section.update({
            baslik: baslik || section.baslik,
            aciklama: aciklama || section.aciklama
        });

        console.log(`[SECTION UPDATE] Bölüm güncellendi: ${section.id}`);

        return res.status(200).json({
            status: 'success',
            message: 'Bölüm başarıyla güncellendi.',
            data: section
        });
    } catch (error) {
        console.error(`[SECTION UPDATE] HATA: ${error.message}`);
        next(error);
    }
};

/**
 * Ders Güncelleme
 * @route PUT /api/curriculum/lessons/:id
 */
exports.updateLesson = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { baslik, icerik_tipi, kaynak_url, sure_saniye, onizleme_mi, aciklama } = req.body;
        const userId = req.user.id;

        // === VALIDASYON UTILITIES ===
        const validateVideoUrl = (url) => {
            if (!url) return true;
            
            const allowedDomains = [
                'youtube.com', 'youtu.be', 'vimeo.com',
                'bunnycdn.com', 'cdn.example.com', 'localhost:3000'
            ];

            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname;
                
                const isAllowed = allowedDomains.some(domain => 
                    hostname === domain || hostname.endsWith('.' + domain)
                );
                
                if (!isAllowed) {
                    throw new Error(`Geçersiz video URL. İzin verilen: ${allowedDomains.join(', ')}`);
                }

                if (!['http:', 'https:'].includes(urlObj.protocol)) {
                    throw new Error('Sadece HTTP/HTTPS protokolleri destekleniyor');
                }

                return true;
            } catch (error) {
                throw new Error(`Video URL doğrulanmadı: ${error.message}`);
            }
        };

        const sanitizeLessonData = (data) => {
            const sanitized = {};
            
            if (data.baslik) {
                sanitized.baslik = String(data.baslik).trim().substring(0, 255);
            }
            
            if (data.aciklama) {
                sanitized.aciklama = String(data.aciklama).trim().substring(0, 5000);
            }
            
            if (data.sure_saniye !== undefined) {
                const saniye = parseInt(data.sure_saniye, 10);
                if (isNaN(saniye) || saniye < 0 || saniye > 43200) {
                    throw new Error('Ders süresi 0-43200 saniye arası olmalıdır');
                }
                sanitized.sure_saniye = saniye;
            }
            
            const validTypes = ['video', 'pdf', 'quiz', 'text'];
            if (data.icerik_tipi && !validTypes.includes(data.icerik_tipi)) {
                throw new Error(`Geçersiz içerik tipi. İzin verilenleri: ${validTypes.join(', ')}`);
            }
            if (data.icerik_tipi) {
                sanitized.icerik_tipi = data.icerik_tipi;
            }
            
            if (data.onizleme_mi !== undefined) {
                sanitized.onizleme_mi = Boolean(data.onizleme_mi);
            }
            
            if (data.kaynak_url) {
                validateVideoUrl(data.kaynak_url);
                sanitized.kaynak_url = String(data.kaynak_url).trim();
            }
            
            return sanitized;
        };

        // === MAIN LOGIC ===
        const lesson = await Lesson.findOne({
            where: { id },
            include: [{
                model: CourseSection,
                attributes: ['id', 'kurs_id'],
                include: [{
                    model: Course,
                    attributes: ['id', 'egitmen_id', 'durum'] // DÜZELTME: 'durum' eklendi
                }]
            }]
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (lesson.CourseSection.Course.egitmen_id !== userId) {
            const error = new Error('Bu dersi güncelleme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // KURS DEĞİŞİKLİK KİLİDİ
        if (lesson.CourseSection.Course.durum !== 'taslak') {
            const error = new Error('Sadece taslak durumundaki kursların dersleri güncellenebilir.');
            error.statusCode = 403;
            throw error;
        }

        const sanitizedData = sanitizeLessonData({
            baslik,
            icerik_tipi,
            kaynak_url,
            sure_saniye,
            onizleme_mi,
            aciklama
        });

        await lesson.update(sanitizedData);

        console.log(`[LESSON UPDATE] Ders güncellendi: ${lesson.id}`);

        return res.status(200).json({
            status: 'success',
            message: 'Ders başarıyla güncellendi.',
            data: {
                id: lesson.id,
                baslik: lesson.baslik,
                icerik_tipi: lesson.icerik_tipi,
                onizleme_mi: lesson.onizleme_mi
            }
        });

    } catch (error) {
        console.error(`[LESSON UPDATE] HATA: ${error.message}`);
        next(error);
    }
};

/**
 * Bölüm Silme
 * @route DELETE /api/curriculum/sections/:id
 */
exports.deleteSection = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const section = await CourseSection.findOne({
            where: { id },
            include: [{
                model: Course,
                attributes: ['id', 'egitmen_id', 'durum'] // DÜZELTME: 'durum' eklendi
            }]
        });

        if (!section) {
            const error = new Error('Bölüm bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (section.Course.egitmen_id !== userId) {
            const error = new Error('Bu bölümü silme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // KURS DEĞİŞİKLİK KİLİDİ
        if (section.Course.durum !== 'taslak') {
            const error = new Error('Onaya gönderilmiş veya yayında olan kurslardan içerik silinemez.');
            error.statusCode = 403;
            throw error;
        }

        // CASCADE: Dersleri sil
        await Lesson.destroy({ where: { bolum_id: id } });
        await section.destroy();

        console.log(`[SECTION DELETE] Bölüm silindi: ${id}`);

        return res.status(200).json({
            status: 'success',
            message: 'Bölüm ve ilişkili dersler başarıyla silindi.'
        });
    } catch (error) {
        console.error(`[SECTION DELETE] HATA: ${error.message}`);
        next(error);
    }
};

/**
 * Ders Silme
 * @route DELETE /api/curriculum/lessons/:id
 */
exports.deleteLesson = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const lesson = await Lesson.findOne({
            where: { id },
            include: [{
                model: CourseSection,
                include: [{
                    model: Course,
                    attributes: ['id', 'egitmen_id', 'durum'] // DÜZELTME: 'durum' eklendi
                }]
            }]
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        if (lesson.CourseSection.Course.egitmen_id !== userId) {
            const error = new Error('Bu dersi silme yetkiniz yok.');
            error.statusCode = 403;
            throw error;
        }

        // KURS DEĞİŞİKLİK KİLİDİ
        if (lesson.CourseSection.Course.durum !== 'taslak') {
            const error = new Error('Onaya gönderilmiş veya yayında olan kurslardan içerik silinemez.');
            error.statusCode = 403;
            throw error;
        }

        await lesson.destroy();

        console.log(`[LESSON DELETE] Ders silindi: ${id}`);

        return res.status(200).json({
            status: 'success',
            message: 'Ders başarıyla silindi.'
        });
    } catch (error) {
        console.error(`[LESSON DELETE] HATA: ${error.message}`);
        next(error);
    }
};

/**
 * Müfredatı Getir (Bölümler + Dersler)
 * @route GET /api/curriculum/:courseId
 */
exports.getFullCurriculum = async (req, res, next) => {
    try {
        const { courseId } = req.params;

        const curriculum = await CourseSection.findAll({
            where: { kurs_id: courseId },
            attributes: ['id', 'kurs_id', 'baslik', 'aciklama', 'sira_numarasi'],
            include: [{
                model: Lesson,
                as: 'Lessons',
                attributes: ['id', 'bolum_id', 'baslik', 'icerik_tipi', 'sure_saniye', 'onizleme_mi', 'sira_numarasi', 'kaynak_url', 'aciklama', 'video_saglayici_id'],
                required: false
            }],
            order: [
                ['sira_numarasi', 'ASC'],
                [{ model: Lesson, as: 'Lessons' }, 'sira_numarasi', 'ASC']
            ]
        });

        console.log(`[CURRICULUM GET] Müfredat getirildi: ${courseId} (${curriculum.length} bölüm)`);

        return res.status(200).json({
            status: 'success',
            message: curriculum.length === 0 ? 'Bu kurs için henüz bölüm eklenmemiş.' : 'Müfredat başarıyla alındı.',
            data: curriculum
        });
    } catch (error) {
        console.error(`[CURRICULUM GET] HATA: ${error.message}`);
        next(error);
    }
};

/**
 * Bölümün Derslerini Getir
 * @route GET /api/curriculum/sections/:sectionId/lessons
 */
exports.getSectionLessons = async (req, res, next) => {
    try {
        const { sectionId } = req.params;

        const lessons = await Lesson.findAll({
            where: { bolum_id: sectionId },
            attributes: ['id', 'bolum_id', 'baslik', 'icerik_tipi', 'sure_saniye', 'onizleme_mi', 'sira_numarasi', 'kaynak_url', 'aciklama', 'video_saglayici_id'],
            order: [['sira_numarasi', 'ASC']]
        });

        return res.status(200).json({
            status: 'success',
            message: 'Bölüm dersleri başarıyla alındı.',
            data: lessons
        });
    } catch (error) {
        console.error(`[SECTION LESSONS GET] HATA: ${error.message}`);
        next(error);
    }
};

/**
 * Ders Detaylarını Getir
 * @route GET /api/curriculum/lessons/:lessonId
 */
exports.getLessonDetail = async (req, res, next) => {
    try {
        const { lessonId } = req.params;

        const lesson = await Lesson.findOne({
            where: { id: lessonId },
            include: [{
                model: CourseSection,
                attributes: ['id', 'baslik', 'kurs_id'],
                include: [{
                    model: Course,
                    attributes: ['id', 'baslik'],
                    required: true
                }]
            }]
        });

        if (!lesson) {
            const error = new Error('Ders bulunamadı.');
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            status: 'success',
            message: 'Ders detayları başarıyla alındı.',
            data: lesson
        });
    } catch (error) {
        console.error(`[LESSON DETAIL GET] HATA: ${error.message}`);
        next(error);
    }
};