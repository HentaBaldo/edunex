const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { verifyToken } = require('../middleware/authMiddleware');

// Herkese Açık: Kursun yorumlarını oku (sayfalama destekli)
router.get('/course/:courseId', reviewController.getCourseReviews);

// Korumalı: Yorum ekle / güncelle
router.post('/', verifyToken, reviewController.addOrUpdateReview);

// Korumalı: Kendi yorumunu sil
router.delete('/:courseId', verifyToken, reviewController.deleteReview);

module.exports = router;
