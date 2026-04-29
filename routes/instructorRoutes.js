const express = require('express');
const router = express.Router();
const instructorController = require('../controllers/instructorController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware'); // Merkezi multer yapılandırması

router.get('/test', (req, res) => {
    return res.status(200).json({
        success: true,
        message: 'Instructor API rotasi aktif ve calisiyor.'
    });
});

router.get('/:instructorId/profile', instructorController.getPublicProfile);

router.post('/upload', verifyToken, isInstructor, upload.single('video'), instructorController.createLessonWithVideo);
router.post('/lessons/upload', verifyToken, isInstructor, upload.single('video'), instructorController.createLessonWithVideo);

module.exports = router;
