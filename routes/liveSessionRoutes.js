const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const liveSessionController = require('../controllers/liveSessionController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// Kayıt dosyaları için mutlak yol — process.cwd() bağımsız, her zaman proje kökü.
const recordingsDir = path.join(__dirname, '..', 'uploads', 'recordings');
if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
}

const recordingStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, recordingsDir),
    filename: (req, file, cb) => {
        const safe = path.basename(file.originalname || 'recording')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(0, 80);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${safe}`);
    },
});

// Jitsi yerel kaydı .webm uretiyor; Jitsi Cloud kaydi .mp4 oluyor.
// Bunny Stream HER IKI formati da kabul ediyor, bu yuzden sunucu tarafinda
// dönüşüm (FFmpeg) yapmıyoruz — ham haliyle Bunny'ye stream'liyoruz.
// GUVENLIK: MIME *VE* extension her ikisi de eslesmek zorunda (AND).
const recordingFileFilter = (req, file, cb) => {
    const validMimes = ['video/mp4', 'video/webm', 'application/octet-stream'];
    const validExt = /\.(mp4|webm)$/i;
    if (validMimes.includes(file.mimetype) && validExt.test(file.originalname || '')) {
        return cb(null, true);
    }
    return cb(new Error('Geçersiz format. Sadece MP4 veya WEBM yayın kaydı yükleyebilirsiniz.'), false);
};

const upload = multer({
    storage: recordingStorage,
    fileFilter: recordingFileFilter,
    limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4 GB
});

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
