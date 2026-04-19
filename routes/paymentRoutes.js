const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * EduNex Ödeme Rotalari
 *
 * Not: /callback, iyzico'nun sunucudan POST ettigi public endpoint oldugu icin
 * verifyToken kullanmaz. Order, odeme_token ile eslenir.
 */

router.post('/checkout', verifyToken, paymentController.checkout);
router.post('/callback', paymentController.callback);
router.get('/callback', paymentController.callback); // bazi test akislarinda GET gelebilir
router.get('/orders/my', verifyToken, paymentController.myOrders);

module.exports = router;
