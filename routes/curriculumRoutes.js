const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');
const { uploadLimiter } = require('../middleware/rateLimitMiddleware');
const { preventConcurrentLesson } = require('../middleware/concurrencyMiddleware');
const upload = require('../middleware/uploadMiddleware');

/**
 * === SECTION (BÖLÜM) ROUTES ===
 */
router.post('/sections', verifyToken, isInstructor, curriculumController.createSection);
router.put('/sections/:id', verifyToken, isInstructor, curriculumController.updateSection);
router.delete('/sections/:id', verifyToken, isInstructor, curriculumController.deleteSection);

/**
 * === LESSON (DERS) ROUTES ===
 */

/**
 * POST /api/curriculum/lessons
 * Video ile ders oluştur (Bunny.net upload)
 * 
 * FormData gönderimi:
 * - video (file) - Video dosyası
 * - bolum_id (string) - Bölüm UUID
 * - baslik (string) - Ders başlığı
 * - icerik_tipi (string) - 'video', 'pdf', 'quiz', 'text'
 * - sure_saniye (number) - Ders süresi
 * - onizleme_mi (boolean) - Ön izleme açık mı?
 * - aciklama (string) - Ders açıklaması
 */
router.post(
    '/lessons',
    verifyToken,
    isInstructor,
    uploadLimiter,           // ✅ Saatte max 10 video
    preventConcurrentLesson, // ✅ Concurrent upload kontrol
    upload.single('video'),  // ✅ VIDEO DOSYASINI AL (Multer middleware)
    curriculumController.createLesson  // ✅ Bunny'e yükle
);

/**
 * PUT /api/curriculum/lessons/:id
 * Ders güncelle
 */
router.put('/lessons/:id', verifyToken, isInstructor, curriculumController.updateLesson);

/**
 * DELETE /api/curriculum/lessons/:id
 * Ders sil
 */
router.delete('/lessons/:id', verifyToken, isInstructor, curriculumController.deleteLesson);

/**
 * === CURRICULUM GET ROUTES ===
 */

/**
 * GET /api/curriculum/:courseId
 * Kursun tüm müfredatını getir (bölümler + dersler)
 */
router.get('/:courseId', verifyToken, isInstructor, curriculumController.getFullCurriculum);

/**
 * GET /api/curriculum/sections/:sectionId/lessons
 * Bölümün tüm derslerini getir
 */
router.get('/sections/:sectionId/lessons', verifyToken, isInstructor, curriculumController.getSectionLessons);

/**
 * GET /api/curriculum/lessons/:lessonId
 * Ders detaylarını getir
 */
router.get('/lessons/:lessonId', verifyToken, isInstructor, curriculumController.getLessonDetail);

module.exports = router;