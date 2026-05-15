/**
 * EduNex - Sipariş Dekontu Route'ları
 *
 * RBAC kontrolü tek noktada (receiptController._authorize) — burada sadece
 * oturum doğrulaması zorunlu. Rol bazlı kapı, kullanıcının siparişle olan
 * ilişkisine bağlı olduğu için route seviyesinde rol middleware'i eklenmedi.
 */

const express = require('express');
const router = express.Router();

const { verifyToken } = require('../middleware/authMiddleware');
const receiptController = require('../controllers/receiptController');

router.get('/download/:orderId', verifyToken, receiptController.downloadReceipt);

module.exports = router;
