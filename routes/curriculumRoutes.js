const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// Yeni Bölüm (Section) Oluşturma
router.post('/sections', verifyToken, isInstructor, curriculumController.createSection);

// Yeni Ders (Lesson) Oluşturma
router.post('/lessons', verifyToken, isInstructor, curriculumController.createLesson);

// Mevcut post rotalarının üstüne veya altına ekle
router.get('/:courseId', verifyToken, isInstructor, curriculumController.getFullCurriculum);

router.delete('/sections/:id', verifyToken, isInstructor, curriculumController.deleteSection);

router.delete('/lessons/:id', verifyToken, isInstructor, curriculumController.deleteLesson);

module.exports = router;