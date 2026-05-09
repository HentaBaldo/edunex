const express = require('express');
const router = express.Router();
const followController = require('../controllers/followController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * EduNex Takip Rotalari
 * Tum endpoint'ler oturum acmis kullanici gerektirir.
 */

// Ogrencinin kendi takip ettigi egitmenler
router.get('/my-instructors', verifyToken, followController.getMyInstructors);

// Egitmenin kendi takipcileri
router.get('/my-followers', verifyToken, followController.getMyFollowers);

// Takip et / takipten cik (toggle)
router.post('/:egitmen_id', verifyToken, followController.toggleFollow);

module.exports = router;
