const express = require('express');
const router = express.Router();
const enrollmentController = require('../controllers/enrollmentController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// Tüm rotalar giriş yapmış kullanıcıya açık
router.post('/', verifyToken, enrollmentController.enrollCourse);
router.get('/my-courses', verifyToken, enrollmentController.getMyEnrollments);
router.get('/check/:kurs_id', verifyToken, enrollmentController.checkEnrollment);

module.exports = router;