const express = require('express');
const router = express.Router();
const { getMyCertificates } = require('../controllers/certificateController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/my', verifyToken, getMyCertificates);

module.exports = router;
