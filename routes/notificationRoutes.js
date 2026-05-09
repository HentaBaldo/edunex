const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * EduNex Bildirim Rotalari
 * Tum endpoint'ler oturum acmis kullanici gerektirir.
 */

router.get('/unread', verifyToken, notificationController.getUnreadNotifications);
router.patch('/:id/read', verifyToken, notificationController.markAsRead);

module.exports = router;
