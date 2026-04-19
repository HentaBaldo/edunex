const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// ============================================
// PUBLIC ROUTES (Herkes erişebilir)
// ============================================

/**
 * GET /api/courses
 * Tüm yayında kursları sayfalama ile getir
 */
router.get('/', courseController.getAllCourses);

/**
 * GET /api/courses/published
 * Yayında olan tüm kursları getir
 * Not: Bu route diğer :id route'lardan ÖNCE olmalı!
 */
router.get('/published', courseController.getAllPublishedCourses);

/**
 * GET /api/courses/:id
 * Belirli bir kurs detaylarını getir
 */
router.get('/:id', courseController.getCourseDetails);

// ============================================
// PROTECTED ROUTES (Sadece kayıtlı kullanıcılar)
// ============================================

/**
 * GET /api/courses/:courseId/learning
 * Öğrenci için kurs öğrenim verisi (müfredat + dersler + ilerleme)
 * ✅ ÖNEMLİ: Bu route private ve courseId parametresi kullanıyor
 */
router.get('/:courseId/learning', verifyToken, courseController.getCourseCurriculumForStudent);

// ============================================
// INSTRUCTOR ONLY ROUTES (Sadece eğitmenler)
// ============================================

/**
 * GET /api/courses/my-courses
 * Eğitmenin kendi kurslarını getir
 */
router.get('/my-courses', verifyToken, isInstructor, courseController.getInstructorCourses);

/**
 * POST /api/courses
 * Yeni kurs oluştur
 */
router.post('/', verifyToken, isInstructor, courseController.createCourse);

/**
 * PUT /api/courses/:id
 * Kurs bilgilerini güncelle
 */
router.put('/:id', verifyToken, isInstructor, courseController.updateCourse);

/**
 * PUT /api/courses/:id/status
 * Kurs durumunu değiştir (taslak → onay_bekliyor → yayinda vb.)
 */
router.put('/:id/status', verifyToken, isInstructor, courseController.updateCourseStatus);

/**
 * DELETE /api/courses/:id
 * Kurs sil
 */
router.delete('/:id', verifyToken, isInstructor, courseController.deleteCourse);

// ============================================
// COURSE SECTION (BÖLÜM) ROUTES
// ============================================

/**
 * POST /api/courses/:courseId/sections
 * Kursa yeni bölüm ekle
 */
router.post('/:courseId/sections', verifyToken, isInstructor, courseController.createCourseSection);

/**
 * PUT /api/courses/:courseId/sections/:sectionId
 * Bölümü güncelle
 */
router.put('/:courseId/sections/:sectionId', verifyToken, isInstructor, courseController.updateCourseSection);

/**
 * DELETE /api/courses/:courseId/sections/:sectionId
 * Bölümü sil
 */
router.delete('/:courseId/sections/:sectionId', verifyToken, isInstructor, courseController.deleteCourseSection);

// ============================================
// LESSON (DERS) ROUTES
// ============================================

/**
 * POST /api/courses/:courseId/sections/:sectionId/lessons
 * Bölüme yeni ders ekle
 */
router.post('/:courseId/sections/:sectionId/lessons', verifyToken, isInstructor, courseController.createLesson);

/**
 * PUT /api/courses/:courseId/sections/:sectionId/lessons/:lessonId
 * Dersi güncelle
 */
router.put('/:courseId/sections/:sectionId/lessons/:lessonId', verifyToken, isInstructor, courseController.updateLesson);

/**
 * DELETE /api/courses/:courseId/sections/:sectionId/lessons/:lessonId
 * Dersi sil
 */
router.delete('/:courseId/sections/:sectionId/lessons/:lessonId', verifyToken, isInstructor, courseController.deleteLesson);

/**
 * PUT /api/courses/:courseId/lessons/:lessonId/complete
 * Dersi tamamlandı olarak işaretle (Öğrenci)
 */
router.put('/:courseId/lessons/:lessonId/complete', verifyToken, courseController.markLessonAsComplete);

module.exports = router;