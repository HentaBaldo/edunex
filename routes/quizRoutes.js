const express = require('express');
const router = express.Router();
const quizController = require('../controllers/quizController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// ─── EĞİTMEN ───────────────────────────────────────────
// GET  /api/quiz/lesson/:lessonId   -> quiz + sorular (dogru_mu dahil)
router.get('/lesson/:lessonId', verifyToken, isInstructor, quizController.getQuizForInstructor);
// POST /api/quiz/lesson/:lessonId   -> oluştur / güncelle
router.post('/lesson/:lessonId', verifyToken, isInstructor, quizController.upsertQuiz);
// DELETE /api/quiz/lesson/:lessonId -> sil
router.delete('/lesson/:lessonId', verifyToken, isInstructor, quizController.deleteQuiz);

// ─── ÖĞRENCİ ───────────────────────────────────────────
// GET  /api/quiz/by-lesson/:lessonId -> quiz id döndürür (kayıt kontrolü)
router.get('/by-lesson/:lessonId', verifyToken, quizController.getQuizIdForStudent);
// GET  /api/quiz/:quizId/take       -> sorular (dogru_mu gizli)
router.get('/:quizId/take', verifyToken, quizController.getQuizForStudent);
// GET  /api/quiz/:quizId/my-result  -> en iyi deneme
router.get('/:quizId/my-result', verifyToken, quizController.getMyBestAttempt);
// POST /api/quiz/:quizId/submit     -> cevap gönder, puanla
router.post('/:quizId/submit', verifyToken, quizController.submitQuiz);

module.exports = router;
