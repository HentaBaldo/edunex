/**
 * EduNex Admin Routes
 * Yonetici paneli istatistikleri, kurs onay surecleri ve yonetici girisi endpoint'lerini barindirir.
 */

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// ---------------------------------------------------------
// PUBLIC ROUTES (Acik Rotalar)
// ---------------------------------------------------------
// Sadece admin login islemine disaridan (henuz token yokken) erisilebilir.
router.post('/login', adminController.adminLogin);

// ---------------------------------------------------------
// PROTECTED ROUTES (Korumali Rotalar - Sadece Adminler)
// ---------------------------------------------------------
// DİKKAT: `router.use` ile asagiya yazilan TUM rotalara kimlik ve rol denetimi (Middleware) ekliyoruz.
// Eger kullanici giris yapmamissa veya rolu 'admin' degilse, asagidaki hicbir koda erisemez.
router.use(verifyToken, isAdmin);

// --- Dashboard & Statistics ---
router.get('/stats', adminController.getDashboardStats);

// --- Course Management (Pending Approvals) ---
router.get('/pending-courses', adminController.getPendingCourses);

// RESTful API standartlarina uygun hale getirildi (course/:id yerine courses/:id)
router.get('/courses/:id', adminController.getCourseDetail);

// --- Course Actions ---
// RESTful mimaride bir kaydi guncellemek (onaylamak) icin PUT veya PATCH kullanilir.
router.put('/courses/:id/approve', adminController.approveCourse);

module.exports = router;