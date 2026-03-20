const express = require('express');
const router = express.Router();

// Controller dosyamızı çağırıyoruz
const authController = require('../controllers/authController');

// --- KİMLİK DOĞRULAMA ROTALARI ---

// POST isteği ile '/register' adresine gelinirse, authController'daki kayitOl çalışsın
router.post('/kayit', authController.kayitOl);

// POST isteği ile '/login' adresine gelinirse, authController'daki girisYap çalışsın
router.post('/giris', authController.girisYap);

module.exports = router;