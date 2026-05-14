/**
 * EduNex Authentication Routes
 * Kullanici kimlik dogrulama (kayit ve giris) islemlerini barindirir.
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimitMiddleware');

// --- Authentication Endpoints ---
router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);
router.get('/verify', authController.verifyEmail);
router.post('/resend-verification', loginLimiter, authController.resendVerification);

module.exports = router;