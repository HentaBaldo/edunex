const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * EduNex Sepet Rotalari
 * Tum endpoint'ler oturum acmis kullanici gerektirir.
 */

router.get('/', verifyToken, cartController.getCart);
router.post('/items', verifyToken, cartController.addItem);
router.delete('/items/:kurs_id', verifyToken, cartController.removeItem);
router.delete('/', verifyToken, cartController.clearCart);

module.exports = router;
