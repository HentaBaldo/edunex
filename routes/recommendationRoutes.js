/**
 * EduNex Recommendation Routes
 * Kurs öneri motoru API endpoint'leri
 */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/recommendationController');
const { verifyToken } = require('../middleware/authMiddleware');

// ── Ana sayfa: 5 modülü tek istekte döndürür ────────────────
// GET /api/recommendations/anasayfa?kurs_id=X&kategori_id=Y
router.get('/anasayfa', ctrl.getRecommendations);

// ── Modül 1: En Popüler Kurslar (kayıt sayısına göre) ───────
// GET /api/recommendations/populer-kurslar?sinir=8
router.get('/populer-kurslar', ctrl.getEnPopulerKurslar);

// ── Modül 2: Popüler Kategoriler (satış hacmine göre) ───────
// GET /api/recommendations/populer-kategoriler?sinir=6
router.get('/populer-kategoriler', ctrl.getPopulerKategoriler);

// ── Modül 3: Bunu Alanlar Şunu da Aldı (kurs bazlı) ────────
// GET /api/recommendations/birlikte-alinan?kurs_id=UUID&sinir=8
router.get('/birlikte-alinan', ctrl.getBirlikteAlinan);

// ── Modül 4: Bu Kategoriden Alanlar Şuradan da Aldı ─────────
// GET /api/recommendations/kategori-carpraz?kategori_id=UUID&sinir=5
router.get('/kategori-carpraz', ctrl.getKategoriCarpraz);

// ── Modül 5: En Çok Beğenilenler (min yorum şartıyla) ───────
// GET /api/recommendations/en-cok-begenilen?sinir=8&min_yorum=5
router.get('/en-cok-begenilen', ctrl.getEnCokBegenilen);

// ── Geriye dönük uyumluluk ──────────────────────────────────
router.get('/personalized', verifyToken, ctrl.getPersonalizedRecommendations);
router.get('/trending',                  ctrl.getTrendingCourses);
router.get('/top-rated',                 ctrl.getTopRatedCourses);

module.exports = router;
