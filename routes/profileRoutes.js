const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { verifyToken } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); // YENİ EKLENDİ

// Mevcut rotaların...
router.get('/me', verifyToken, profileController.getProfile);
router.put('/update', verifyToken, profileController.updateProfile);

// YENİ: Profil fotoğrafı yükleme rotası (Frontend'deki 'avatar' ismiyle eşleşmeli)
router.post('/upload-avatar', verifyToken, upload.single('avatar'), profileController.uploadAvatar);

module.exports = router;