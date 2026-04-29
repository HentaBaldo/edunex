/**
 * EduNex Category Routes
 * Sistemdeki egitim kategorilerinin listelenmesi ve yonetimi ile ilgili endpoint'leri barindirir.
 */

const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

// --- Category Endpoints ---
router.get('/', categoryController.getAllCategories);
router.get('/:categoryId/details', categoryController.getCategoryWithCourses);

module.exports = router;