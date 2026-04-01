const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// --- Statik rotalar önce gelir ---
router.post('/sections', verifyToken, isInstructor, curriculumController.createSection);
router.delete('/sections/:id', verifyToken, isInstructor, curriculumController.deleteSection);

router.post('/lessons', verifyToken, isInstructor, curriculumController.createLesson);
router.delete('/lessons/:id', verifyToken, isInstructor, curriculumController.deleteLesson);

// --- Dinamik rota en sona gelir ---
router.get('/:courseId', verifyToken, isInstructor, curriculumController.getFullCurriculum);

module.exports = router;