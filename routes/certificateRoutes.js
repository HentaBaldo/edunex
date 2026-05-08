const express = require('express');
const router = express.Router();
const { getMyCertificates, downloadCertificatePdf } = require('../controllers/certificateController');
const { verifyToken } = require('../middleware/authMiddleware');

router.get('/my', verifyToken, getMyCertificates);
// PDF stream — UUID kodu sayesinde public erisim guvenli (tahmin edilemez).
router.get('/:kod/pdf', downloadCertificatePdf);

module.exports = router;
