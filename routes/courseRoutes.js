const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const curriculumController = require('../controllers/curriculumController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');
const { 
    uploadLimiter, 
    courseCreateLimiter,  // ✅ İMPORT ET
    sectionCreateLimiter  // ✅ İMPORT ET
} = require('../middleware/rateLimitMiddleware');
const { preventConcurrentLesson } = require('../middleware/concurrencyMiddleware');
const upload = require('../middleware/uploadMiddleware');

// ============================================
// PUBLIC ROUTES (Herkes erişebilir)
// ============================================

/**
 * GET /api/courses
 * Tüm kursları sayfalama ile getir
 */
router.get('/', courseController.getAllCourses);

/**
 * GET /api/courses/published
 * Yayında olan tüm kursları getir
 */
router.get('/published', courseController.getAllPublishedCourses);

// ============================================
// INSTRUCTOR ONLY ROUTES (ÖNCE OLMALI!)
// ============================================

/**
 * GET /api/courses/my-courses
 * Eğitmenin kendi kurslarını getir
 * ⚠️ ÖNEMLI: /:id'den ÖNCE tanımlanmalı!
 */
router.get('/my-courses', verifyToken, isInstructor, courseController.getInstructorCourses);

/**
 * POST /api/courses
 * Yeni kurs oluştur (Günde max 5)
 */
router.post(
    '/',
    verifyToken,
    isInstructor,
    courseCreateLimiter,  // ✅ RATE LIMITER EKLE
    courseController.createCourse
);

// ============================================
// PROTECTED ROUTES (Sadece kayıtlı kullanıcılar)
// ============================================

/**
 * GET /api/courses/:courseId/learning
 * Öğrenci için kurs öğrenim verisi
 */
router.get('/:courseId/learning', verifyToken, courseController.getCourseCurriculumForStudent);

/**
 * PUT /api/courses/:courseId/lessons/:lessonId/complete
 * Dersi tamamlandı olarak işaretle
 */
router.put('/:courseId/lessons/:lessonId/complete', verifyToken, courseController.markLessonAsComplete);

// ============================================
// COURSE SECTION (BÖLÜM) ROUTES
// ============================================

/**
 * POST /api/courses/:courseId/sections
 * Yeni bölüm oluştur (Saatte max 20)
 */
router.post(
    '/:courseId/sections',
    verifyToken,
    isInstructor,
    sectionCreateLimiter,  // ✅ RATE LIMITER EKLE
    courseController.createCourseSection
);

router.put('/:courseId/sections/:sectionId', verifyToken, isInstructor, courseController.updateCourseSection);

router.delete('/:courseId/sections/:sectionId', verifyToken, isInstructor, courseController.deleteCourseSection);

// ============================================
// LESSON (DERS) ROUTES
// ============================================

router.post(
    '/:courseId/sections/:sectionId/lessons',
    verifyToken,
    isInstructor,
    uploadLimiter,           // ✅ Saatte max 10 video
    preventConcurrentLesson, // ✅ Concurrent upload kontrol
    upload.single('video'),  // ✅ Video dosyasını al
    curriculumController.createLesson
);

router.put('/:courseId/sections/:sectionId/lessons/:lessonId', verifyToken, isInstructor, courseController.updateLesson);

router.delete('/:courseId/sections/:sectionId/lessons/:lessonId', verifyToken, isInstructor, courseController.deleteLesson);

// ============================================
// PUBLIC - DETAIL ROUTE (SONRA OLMALI!)
// ============================================

/**
 * GET /api/courses/:id
 * Belirli bir kurs detaylarını getir
 * ⚠️ ÖNEMLI: Bu SONDA olmalı, yoksa /my-courses'ı yakalar!
 */
router.get('/:id', courseController.getCourseDetails);

// ============================================
// INSTRUCTOR UPDATE/DELETE ROUTES
// ============================================

router.put('/:id', verifyToken, isInstructor, courseController.updateCourse);

router.put('/:id/status', verifyToken, isInstructor, courseController.updateCourseStatus);

router.delete('/:id', verifyToken, isInstructor, courseController.deleteCourse);

module.exports = router;