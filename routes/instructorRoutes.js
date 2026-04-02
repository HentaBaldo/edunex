const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const instructorController = require('../controllers/instructorController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/temp/');
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp4|mkv|mov|avi|webm/;
        const extValid = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimeValid = allowedTypes.test(file.mimetype);
        if (extValid && mimeValid) {
            cb(null, true);
        } else {
            cb(new Error('Sadece video dosyaları kabul edilmektedir (mp4, mkv, mov, avi, webm).'));
        }
    }
});

router.get('/test', (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Instructor API rotasi aktif ve calisiyor.'
    });
});

router.post('/upload', verifyToken, isInstructor, upload.single('video'), instructorController.createLessonWithVideo);
router.post('/lessons/upload', verifyToken, isInstructor, upload.single('video'), instructorController.createLessonWithVideo);

module.exports = router;