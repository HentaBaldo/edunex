/**
 * EduNex Recommendation Routes
 * Kurs önerileri sistemi API endpoint'leri
 */

const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const { verifyToken } = require('../middleware/authMiddleware');

// --- Protected Routes (Sadece Kayıtlı Kullanıcılar) ---

/**
 * GET /api/recommendations/personalized
 * Öğrenciye kişiselleştirilmiş kurs önerileri
 * - Öğrencinin ilgi alanlarına dayalı
 * - Daha önce kayıt olmadığı kurslar
 * - En yüksek puanlı ve en çok kayıtlı 5 kurs
 */
router.get('/personalized', verifyToken, recommendationController.getPersonalizedRecommendations);

// --- Public Routes (Herkese Açık) ---

/**
 * GET /api/recommendations/trending
 * En çok kayıtlı (trending) kurslar
 */
router.get('/trending', recommendationController.getTrendingCourses);

/**
 * GET /api/recommendations/top-rated
 * En yüksek puanlı kurslar
 */
router.get('/top-rated', recommendationController.getTopRatedCourses);

module.exports = router;