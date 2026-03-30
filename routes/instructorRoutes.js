/**
 * EduNex Instructor Routes
 * Egitmen paneline ozel dosya yukleme ve video isleme endpoint'lerini barindirir.
 */

const express = require('express');
const router = express.Router();
const instructorController = require('../controllers/instructorController');
const multer = require('multer');

// --- File Upload Configuration ---
// Gecici video depolama alani
const upload = multer({ dest: 'uploads/temp/' });

// --- Health Check ---
router.get('/test', (req, res) => {
    return res.status(200).json({ 
        success: true, 
        message: 'Instructor API rotasi aktif ve calisiyor.' 
    });
});

// --- Media Upload Endpoints ---
// Bu satır gidip Controller'daki fonksiyonu bulacak
router.post('/upload', upload.single('video'), instructorController.createLessonWithVideo);
router.post('/lessons/upload', upload.single('video'), instructorController.createLessonWithVideo);

module.exports = router;