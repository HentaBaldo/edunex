const express = require('express');
const multer = require('multer');
const router = express.Router();
const liveSessionController = require('../controllers/liveSessionController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

const upload = multer({ dest: 'uploads/recordings/' });

// ============================================
// SPESIFIK ROUTE'LAR (ÖNCE - /:id catch'inden önce olmalı)
// ============================================

/**
 * GET /api/live-sessions/upcoming
 * Öğrencinin yaklaşan canlı oturumları
 */
router.get('/upcoming', verifyToken, liveSessionController.getUpcomingForStudent);

/**
 * GET /api/live-sessions/active
 * Öğrencinin kayıtlı olduğu kurslardaki aktif (devam_ediyor + planlandi) oturumlar
 * Response: { devam_edenler, planlananlar }
 */
router.get('/active', verifyToken, liveSessionController.getActiveSessions);

/**
 * GET /api/live-sessions/public
 * Genel (kursa bağımsız) yayınların public listesi - token gerektirmez
 */
router.get('/public', liveSessionController.getPublicLiveSessions);

/**
 * GET /api/live-sessions/my-sessions
 * Eğitmenin tüm canlı yayınları
 */
router.get('/my-sessions', verifyToken, isInstructor, liveSessionController.getMyLiveSessions);

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
 * PUT /api/live-sessions/:id/start
 * Yayını başlat (durum → 'devam_ediyor', UX kısayolu)
 */
router.put('/:id/start', verifyToken, isInstructor, liveSessionController.startSession);

/**
 * PUT /api/live-sessions/:id/status
 * Durum güncelle (daha spesifik, önce tanımlanması gerekir)
 */
router.put('/:id/status', verifyToken, isInstructor, liveSessionController.updateSessionStatus);

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

/**
 * POST /api/live-sessions/:id/upload-recording
 * Canlı ders kaydını Bunny.net'e yükle
 */
router.post('/:id/upload-recording', verifyToken, isInstructor, upload.single('recording'), liveSessionController.uploadSessionRecording);

module.exports = router;
