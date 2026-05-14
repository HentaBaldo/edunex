/**
 * EduNex Admin Routes - Tüm Modüller Bir Arada
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const adminUserController = require('../controllers/adminUserController');
const adminOrderController = require('../controllers/adminOrderController');
const adminCourseController = require('../controllers/adminCourseController');
const adminReviewController = require('../controllers/adminReviewController');
const adminPayoutController = require('../controllers/adminPayoutController');
const supportController = require('../controllers/supportController');
const { verifyToken, isAdmin, isFinanceAdmin } = require('../middleware/authMiddleware');
const { loginLimiter } = require('../middleware/rateLimitMiddleware');

/**
 * PUBLIC ROUTES
 */
router.post('/login', loginLimiter, adminController.adminLogin);

/**
 * PROTECTED ROUTES
 */
router.use(verifyToken, isAdmin);

// --- İstatistikler & Komuta Merkezi ---
router.get('/stats', adminController.getDashboardStats);
router.get('/activity-feed', adminController.getActivityFeed);
router.get('/sales-trend', adminController.getSalesTrend);

// --- Siparişler (Orders) ---
// Not: /summary her zaman /:id'den önce gelmeli
router.get('/orders/summary', adminOrderController.getOrdersSummary);
router.get('/orders/:id', adminOrderController.getOrderDetail);
router.get('/orders', adminOrderController.listOrders);

// --- Kurs Takibi ve Raporlama (YENİ EKLEDİĞİMİZ GOD MODE) ---
router.get('/published-courses-report', adminCourseController.getPublishedCoursesReport); // legacy
router.get('/courses-tracking', adminCourseController.getCoursesTracking); // yeni filtreli endpoint
router.get('/courses/:id/full-content', adminCourseController.getCourseFullContent);
router.get('/courses/:id/participants', adminCourseController.getCourseParticipants);

// --- Admin Kurs Yonetim Aksiyonlari (Yayindan Kaldir / Yayina Al / Sil / Geri Yukle) ---
router.put('/courses/:id/unpublish', adminCourseController.unpublishCourse);
router.put('/courses/:id/republish', adminCourseController.republishCourse);
router.delete('/courses/:id', adminCourseController.deleteCourseAsAdmin);
router.post('/courses/:id/restore', adminCourseController.restoreDeletedCourse);

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

// --- Yorum Moderasyonu (yeni controller) ---
router.get('/reviews', adminReviewController.listReviews);
router.delete('/reviews/:kurs_id/:ogrenci_id', adminReviewController.deleteReview);

// --- Hakedis & Odeme Yonetimi (ek yetki: isFinanceAdmin) ---
// Bu route'lar sadece rol='admin' VE profil.finans_yetkili=true olan yoneticilerce erisilir.
// CSV export'u en spesifik path oldugu icin parametreli route'lardan once gelmeli.
router.get('/payouts/summary', isFinanceAdmin, adminPayoutController.getSummary);
router.get('/payouts/export.csv', isFinanceAdmin, adminPayoutController.exportCSV);
router.get('/payouts/:egitmen_id/items', isFinanceAdmin, adminPayoutController.getInstructorItems);
router.get('/payouts', isFinanceAdmin, adminPayoutController.listEarnings);
router.post('/payouts/bulk-approve', isFinanceAdmin, adminPayoutController.bulkApprove);
// Tek bir kaydi T+14 beklemeden iyzico'da onayla (admin manuel override).
router.post('/payouts/:earning_id/approve-now', isFinanceAdmin, adminPayoutController.approveNow);

// --- Destek Talebi (Ticket) Yonetimi ---
// Listeleme + filtre + sayfalama (sekme rozet sayilari da donulur).
router.get('/support/tickets', supportController.adminGetAllTickets);
// Detay (mesaj gecmisi dahil). Kullanici tarafi ile ayni controller; rol kontrolu icerde.
router.get('/support/tickets/:id', supportController.getTicketDetails);
// Admin cevabi: durum 'cevaplandi' yapilir, talep sahibine 'destek' bildirim gider.
router.post('/support/tickets/:id/messages', supportController.replyTicket);
// Durum guncelle (cogunlukla 'kapali').
router.patch('/support/tickets/:id/status', supportController.adminUpdateStatus);

module.exports = router;