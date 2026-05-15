const express = require('express');
const router = express.Router();
const instructorController = require('../controllers/instructorController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); // Merkezi multer yapılandırması

router.get('/dashboard/stats', verifyToken, isInstructor, instructorController.getInstructorDashboardStats);

// --- Satis Gecmisi / Hak Edis (egitmen kendi paneli) ---
router.get('/earnings/sales-history', verifyToken, isInstructor, instructorController.getMySalesHistory);

// --- iyzico Pazaryeri (Marketplace) Alt Uye Isyeri Kaydi ---
// Egitmenin satislardan dogrudan tahsilat alabilmesi icin gerekli tek seferlik kayit.
// Status: dashboard banner gorunurlugu BU endpoint'e bagli, localStorage'a degil.
router.get('/payment/submerchant/status', verifyToken, isInstructor, instructorController.getSubMerchantStatus);
router.post('/payment/submerchant', verifyToken, isInstructor, instructorController.registerSubMerchant);

router.get('/test', (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Instructor API rotasi aktif ve calisiyor.'
    });
});

router.get('/:instructorId/profile', instructorController.getPublicProfile);

router.post('/upload', verifyToken, isInstructor, upload.single('video'), instructorController.createLessonWithVideo);
router.post('/lessons/upload', verifyToken, isInstructor, upload.single('video'), instructorController.createLessonWithVideo);

module.exports = router;
