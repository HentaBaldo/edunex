/**
 * Indirim Rotalari
 *
 * Public:
 *   GET    /api/discounts/course/:dersId        - kursun aktif indirim ozeti
 *
 * Authenticated (egitmen veya admin):
 *   POST   /api/discounts                       - yeni indirim olustur
 *   PATCH  /api/discounts/:id                   - indirim guncelle
 *   DELETE /api/discounts/:id                   - indirim sil
 *   GET    /api/discounts/my                    - kendi olusturdugum indirimler
 *   GET    /api/discounts/instructor/:courseId  - kursun tum indirimleri (yetki kontrollu)
 *
 * Admin only:
 *   GET    /api/discounts/admin/all             - tum indirimler (filter)
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/discountController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Public: kursun fiyat ozeti (indirim varsa)
router.get('/course/:dersId', ctrl.getDiscountForCourse);

// Authenticated routes
router.use(verifyToken);

router.post('/', ctrl.createDiscount);
router.patch('/:id', ctrl.updateDiscount);
router.delete('/:id', ctrl.deleteDiscount);
router.get('/my', ctrl.getMyDiscounts);
router.get('/instructor/:courseId', ctrl.getDiscountsByCourse);

// Admin
router.get('/admin/all', isAdmin, ctrl.adminGetAll);

module.exports = router;
