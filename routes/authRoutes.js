/**
 * EduNex Authentication Routes
 * Kullanici kimlik dogrulama (kayit ve giris) islemlerini barindirir.
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter, passwordResetLimiter } = require('../middleware/rateLimitMiddleware');

// --- Authentication Endpoints ---
// Botlarin sinirsiz hesap acip SMTP kotasini bitirmesini engellemek icin
// register endpoint'i de loginLimiter (15dk / 5 deneme) ile korunuyor.
router.post('/register', loginLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.get('/verify', authController.verifyEmail);
router.post('/resend-verification', loginLimiter, authController.resendVerification);

// --- Şifre Sıfırlama (token tabanlı, oturum gerektirmez) ---
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, authController.resetPassword);

module.exports = router;