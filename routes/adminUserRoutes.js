const express = require('express');
const router = express.Router();
const adminUserController = require('../controllers/adminUserController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

/**
 * EduNex Admin User Routes
 * Sistem yöneticilerinin kullanıcı yönetimi işlemlerini barindirir
 */

// === PROTECTED: Tüm route'lar admin yetkisi gerekli ===
router.use(verifyToken, isAdmin);

/**
 * GET /api/admin/users
 * Tüm kullanıcıları listele (sayfalı)
 * Query params: page, limit, rol
 */
router.get('/', adminUserController.getAllUsers);

/**
 * GET /api/admin/users/:id
 * Kullanıcı detayları
 */
router.get('/:id', adminUserController.getUserDetail);

/**
 * PUT /api/admin/users/:id
 * Kullanıcı güncelle (ad, soyad, rol)
 */
router.put('/:id', adminUserController.updateUser);

/**
 * DELETE /api/admin/users/:id
 * Kullanıcı sil (Admin silinemez)
 */
router.delete('/:id', adminUserController.deleteUser);

module.exports = router;