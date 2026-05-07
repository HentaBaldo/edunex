/**
 * EduNex Category Routes
 * Sistemdeki egitim kategorilerinin listelenmesi ve admin yonetimi.
 */

const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// --- PUBLIC ENDPOINTS ---
router.get('/', categoryController.getAllCategories);
router.get('/:categoryId/details', categoryController.getCategoryWithCourses);

// --- ADMIN ENDPOINTS ---
router.get('/admin/list', verifyToken, isAdmin, categoryController.getAllCategoriesAdmin);

router.post(
    '/admin',
    verifyToken,
    isAdmin,
    upload.single('kapak_fotografi'),
    categoryController.createCategory
);

router.put(
    '/admin/:id',
    verifyToken,
    isAdmin,
    upload.single('kapak_fotografi'),
    categoryController.updateCategory
);

router.delete('/admin/:id', verifyToken, isAdmin, categoryController.deleteCategory);

module.exports = router;
