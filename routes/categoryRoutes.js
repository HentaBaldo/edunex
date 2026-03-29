const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

// GET /api/categories istegi geldiginde calisacak
router.get('/', categoryController.getAllCategories);

module.exports = router;