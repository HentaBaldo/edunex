const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// --- Public Endpoints (Herkese Açık) ---
router.get('/published', courseController.getAllPublishedCourses);  // ✅ YAYINDA OLANLAR
router.get('/details/:id', courseController.getCourseDetails);
router.get('/', courseController.getAllCourses);  // Tüm kurslar (admin için)

// --- Protected Endpoints (Sadece Eğitmenler) ---
router.get('/my-courses', verifyToken, isInstructor, courseController.getInstructorCourses);
router.post('/', verifyToken, isInstructor, courseController.createCourse);
router.put('/:id/status', verifyToken, isInstructor, courseController.updateCourseStatus);
router.put('/:id', verifyToken, isInstructor, courseController.updateCourse);
router.delete('/:id', verifyToken, isInstructor, courseController.deleteCourse);
router.get('/stats/:id', verifyToken, isInstructor, courseController.getCourseStats);

module.exports = router;