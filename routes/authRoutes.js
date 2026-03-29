const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Kullanıcı Kayıt (Register) Rotası
router.post('/register', authController.register);

// Kullanıcı Giriş (Login) Rotası
router.post('/login', authController.login);

module.exports = router;