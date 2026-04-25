const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { verifyToken } = require('../middleware/authMiddleware');

// Herkese Açık: Kursun yorumlarını oku
router.get('/course/:courseId', reviewController.getCourseReviews);

// Korumalı: Sadece giriş yapanlar (ve kursu alanlar) yorum yapabilir
router.post('/', verifyToken, reviewController.addOrUpdateReview);

module.exports = router;