/**
 * EduNex Curriculum Routes
 * Kurs mufredati (bolumler ve dersler) uzerindeki CRUD (Olusturma, Okuma, Silme) islemlerini barindirir.
 * Tum rotalar 'verifyToken' ve 'isInstructor' middleware'leri ile korunmaktadir.
 */

const express = require('express');
const router = express.Router();
const curriculumController = require('../controllers/curriculumController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// --- Curriculum Fetching ---
router.get('/:courseId', verifyToken, isInstructor, curriculumController.getFullCurriculum);

// --- Section (Bolum) Management ---
router.post('/sections', verifyToken, isInstructor, curriculumController.createSection);
router.delete('/sections/:id', verifyToken, isInstructor, curriculumController.deleteSection);

// --- Lesson (Ders) Management ---
router.post('/lessons', verifyToken, isInstructor, curriculumController.createLesson);
router.delete('/lessons/:id', verifyToken, isInstructor, curriculumController.deleteLesson);

module.exports = router;