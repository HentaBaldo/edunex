/**
 * EduNex Admin Routes
 * Yonetici paneli istatistikleri ve kurs onay surecleri gibi yonetimsel endpoint'leri barindirir.
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// --- Dashboard & Statistics ---
router.get('/stats', adminController.getDashboardStats);

// --- Course Management (Pending Approvals) ---
router.get('/pending-courses', adminController.getPendingCourses);
router.get('/course/:id', adminController.getCourseDetail);

// --- Course Actions ---
// Not: Durum guncellemeleri icin genellikle PUT/PATCH kullanilir ancak 
// dogrudan bir islem tetikledigi icin POST methodu kullanilmistir.
router.post('/approve/:id', adminController.approveCourse);

module.exports = router;