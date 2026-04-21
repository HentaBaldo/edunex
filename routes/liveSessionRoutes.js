const express = require('express');
const router = express.Router();
const liveSessionController = require('../controllers/liveSessionController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// ============================================
// SPESIFIK ROUTE'LAR (ÖNCE - /:id catch'inden önce olmalı)
// ============================================

/**
 * GET /api/live-sessions/upcoming
 * Öğrencinin yaklaşan canlı oturumları
 */
router.get('/upcoming', verifyToken, liveSessionController.getUpcomingForStudent);

/**
 * GET /api/live-sessions/course/:courseId
 * Kursa ait oturumlar (eğitmen + kayıtlı öğrenci erişebilir)
 */
router.get('/course/:courseId', verifyToken, liveSessionController.getSessionsByCourse);

// ============================================
// OTURUM CRUD (EĞİTMEN)
// ============================================

/**
 * POST /api/live-sessions
 * Yeni canlı oturum oluştur (eğitmen)
 */
router.post('/', verifyToken, isInstructor, liveSessionController.createSession);

/**
 * PUT /api/live-sessions/:id
 */
router.put('/:id', verifyToken, isInstructor, liveSessionController.updateSession);

/**
 * DELETE /api/live-sessions/:id
 */
router.delete('/:id', verifyToken, isInstructor, liveSessionController.deleteSession);

// ============================================
// KATILIM / HEARTBEAT / YOKLAMA
// ============================================

/**
 * POST /api/live-sessions/:id/join
 * Katılım için oda adı + kullanıcı bilgisi döner (erişim kontrolü dahil)
 */
router.post('/:id/join', verifyToken, liveSessionController.joinSession);

/**
 * POST /api/live-sessions/:id/heartbeat
 * Katılım devamını onaylayan ping; her çağrı +1 dakika
 */
router.post('/:id/heartbeat', verifyToken, liveSessionController.heartbeat);

/**
 * GET /api/live-sessions/:id/attendance
 * Eğitmen için öğrenci katılım raporu
 */
router.get('/:id/attendance', verifyToken, isInstructor, liveSessionController.getAttendance);

module.exports = router;
