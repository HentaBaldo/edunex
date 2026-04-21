/**
 * EduNex Admin Routes
 * Yönetici paneli - istatistikler, kurs onay, kullanıcı yönetimi
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminUserController = require('../controllers/adminUserController');
const adminOrderController = require('../controllers/adminOrderController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

/**
 * ===================================
 * PUBLIC ROUTES
 * ===================================
 */

/**
 * POST /api/admin/login
 * Admin girişi
 */
router.post('/login', adminController.adminLogin);

/**
 * ===================================
 * PROTECTED ROUTES
 * ===================================
 */

// Middleware: Tüm route'ları isAdmin ile koru
router.use(verifyToken, isAdmin);

// --- İstatistikler & Dashboard ---

/**
 * GET /api/admin/stats
 */
router.get('/stats', adminController.getDashboardStats);

// --- Kurslar ---

/**
 * GET /api/admin/pending-courses
 */
router.get('/pending-courses', adminController.getPendingCourses);

/**
 * GET /api/admin/courses/pending
 * (Alias) Eski/alternatif path kullanan client'lar için
 * NOT: /courses/:id'ten ÖNCE tanımlanmalı
 */
router.get('/courses/pending', adminController.getPendingCourses);

/**
 * GET /api/admin/courses
 */
router.get('/courses', adminController.getAllCourses);

/**
 * GET /api/admin/courses/:id
 */
router.get('/courses/:id', adminController.getCourseDetail);

// --- KURS ONAY / RED ---

/**
 * PUT /api/admin/approve-course/:courseId
 */
router.put('/approve-course/:courseId', adminController.approveCourse);

/**
 * PUT /api/admin/reject-course/:courseId
 */
router.put('/reject-course/:courseId', adminController.rejectCourse);

// --- Kullanıcı Yönetimi ---

/**
 * GET /api/admin/users
 * Tüm kullanıcıları listele (sayfalı)
 */
router.get('/users', adminUserController.getAllUsers);

/**
 * GET /api/admin/users/:id
 * Kullanıcı detayı
 */
router.get('/users/:id', adminUserController.getUserDetail);

/**
 * PUT /api/admin/users/:id
 * Kullanıcı güncelle
 */
router.put('/users/:id', adminUserController.updateUser);

/**
 * DELETE /api/admin/users/:id
 * Kullanıcı sil
 */
router.delete('/users/:id', adminUserController.deleteUser);

// --- Orders & Payments (Read-only) ---
// Dikkat: /orders/summary rotasi, /orders/:id rotasindan ONCE tanimlanmali.
router.get('/orders/summary', adminOrderController.getOrdersSummary);
router.get('/orders/:id', adminOrderController.getOrderDetail);
router.get('/orders', adminOrderController.listOrders);

module.exports = router;