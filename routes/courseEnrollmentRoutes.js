const express = require('express');
const router = express.Router();
const courseEnrollmentController = require('../controllers/courseEnrollmentController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * EduNex Course Enrollment Routes
 * Öğrencilerin kurs kayıt işlemlerini yönetir
 */

// --- Protected Endpoints (Sadece Kayıtlı Kullanıcılar) ---

/**
 * POST /api/enrollments
 * Öğrenciyi bir kursa kayıt et
 */
router.post('/', verifyToken, courseEnrollmentController.enrollCourse);

/**
 * GET /api/enrollments/my-courses
 * Öğrencinin kayıt olduğu tüm kursları getir
 */
router.get('/my-courses', verifyToken, courseEnrollmentController.getMyEnrollments);

/**
 * GET /api/enrollments/dashboard
 * Öğrenci paneli için kapsamlı dashboard verisi
 */
router.get('/dashboard', verifyToken, courseEnrollmentController.getStudentDashboardData);

/**
 * GET /api/enrollments/:courseId
 * Belirli kursun kayıt detayını getir
 */
router.get('/:courseId', verifyToken, courseEnrollmentController.getEnrollmentDetail);

/**
 * PUT /api/enrollments/:courseId/progress
 * Kurs ilerleme yüzdesini güncelle
 */
router.put('/:courseId/progress', verifyToken, courseEnrollmentController.updateProgress);

/**
 * DELETE /api/enrollments/:courseId
 * Kurstan ayrıl / Kaydı iptal et
 */
router.delete('/:courseId', verifyToken, courseEnrollmentController.unenrollCourse);

module.exports = router;