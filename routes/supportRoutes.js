/**
 * Destek Talebi (Ticket) Rotalari - Kullanici Tarafi
 *
 * Admin tarafi rotalari adminRoutes.js icinde /api/admin/support/... altinda mount edilir.
 * Bu dosyada egitmen veya ogrenci her ikisi de erisebilir (rol ayrimi yapilmaz):
 * sadece geçerli bir oturum yeterli.
 */

const express = require('express');
const router = express.Router();
const supportController = require('../controllers/supportController');
const { verifyToken } = require('../middleware/authMiddleware');

// Tum kullanici uclari oturum gerektirir.
router.use(verifyToken);

// Yeni destek talebi olustur (+ ilk mesaj)
router.post('/tickets', supportController.createTicket);

// Kendi taleplerimi listele
router.get('/tickets', supportController.getMyTickets);

// Tek talep detayi + mesaj gecmisi (sahip-only kontrolü controller içinde)
router.get('/tickets/:id', supportController.getTicketDetails);

// Talebime mesaj ekle (replyTicket; admin'mi/kullanici'mi controller'da algilanir)
router.post('/tickets/:id/messages', supportController.replyTicket);

module.exports = router;
