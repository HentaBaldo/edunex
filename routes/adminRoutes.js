/**
 * EduNex Admin Routes - Tüm Modüller Bir Arada
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminUserController = require('../controllers/adminUserController');
const adminOrderController = require('../controllers/adminOrderController');
const adminCourseController = require('../controllers/adminCourseController'); // Yeni eklediğimiz!
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

/**
 * PUBLIC ROUTES
 */
router.post('/login', adminController.adminLogin);

/**
 * PROTECTED ROUTES
 */
router.use(verifyToken, isAdmin);

// --- İstatistikler ---
router.get('/stats', adminController.getDashboardStats);

// --- Siparişler (Orders) ---
// Not: /summary her zaman /:id'den önce gelmeli
router.get('/orders/summary', adminOrderController.getOrdersSummary);
router.get('/orders/:id', adminOrderController.getOrderDetail);
router.get('/orders', adminOrderController.listOrders);

// --- Kurs Takibi ve Raporlama (YENİ EKLEDİĞİMİZ GOD MODE) ---
router.get('/published-courses-report', adminCourseController.getPublishedCoursesReport);
router.get('/courses/:id/full-content', adminCourseController.getCourseFullContent);
router.get('/courses/:id/participants', adminCourseController.getCourseParticipants);

// --- Kurs Onay İşlemleri ---
router.get('/pending-courses', adminController.getPendingCourses);
router.get('/courses/pending', adminController.getPendingCourses);
router.get('/courses', adminController.getAllCourses);
router.get('/courses/:id', adminController.getCourseDetail);
router.put('/approve-course/:courseId', adminController.approveCourse);
router.put('/reject-course/:courseId', adminController.rejectCourse);

// --- Kullanıcı Yönetimi ---
router.get('/users', adminUserController.getAllUsers);
router.get('/users/:id', adminUserController.getUserDetail);
router.put('/users/:id', adminUserController.updateUser);
router.delete('/users/:id', adminUserController.deleteUser);

module.exports = router;