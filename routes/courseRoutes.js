const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const curriculumController = require('../controllers/curriculumController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');
const {
    uploadLimiter,
    courseCreateLimiter,
    sectionCreateLimiter,
} = require('../middleware/rateLimitMiddleware');
const { preventConcurrentLesson } = require('../middleware/concurrencyMiddleware');
const upload = require('../middleware/uploadMiddleware');

// ============================================
// PUBLIC ROUTES
// ============================================

router.get('/', courseController.getAllCourses);
router.get('/public-showcase', courseController.getPublicCourses);
router.get('/published', courseController.getAllPublishedCourses);

// ============================================
// INSTRUCTOR ONLY ROUTES (/:id'den ÖNCE)
// ============================================

router.get('/my-courses', verifyToken, isInstructor, courseController.getInstructorCourses);

router.post('/', verifyToken, isInstructor, courseCreateLimiter, courseController.createCourse);

// ============================================
// COURSE DETAIL & UPDATE/DELETE
// ============================================

router.get('/:id', courseController.getCourseDetails);
router.put('/:id', verifyToken, isInstructor, courseController.updateCourse);
router.put('/:id/status', verifyToken, isInstructor, courseController.updateCourseStatus);
router.delete('/:id', verifyToken, isInstructor, courseController.deleteCourse);

// ============================================
// PROTECTED STUDENT ROUTES
// ============================================

router.get('/:courseId/learning', verifyToken, courseController.getCourseCurriculumForStudent);
router.put('/:courseId/lessons/:lessonId/complete', verifyToken, courseController.markLessonAsComplete);

// ============================================
// SECTION (BÖLÜM) ROUTES — curriculumController
// ============================================

router.post(
    '/:courseId/sections',
    verifyToken,
    isInstructor,
    sectionCreateLimiter,
    curriculumController.createSection
);
router.put('/:courseId/sections/:sectionId', verifyToken, isInstructor, curriculumController.updateSection);
router.delete('/:courseId/sections/:sectionId', verifyToken, isInstructor, curriculumController.deleteSection);

// ============================================
// LESSON (DERS) ROUTES — curriculumController
// ============================================

router.post(
    '/:courseId/sections/:sectionId/lessons',
    verifyToken,
    isInstructor,
    uploadLimiter,
    preventConcurrentLesson,
    upload.single('video'),
    curriculumController.createLesson
);
router.put(
    '/:courseId/sections/:sectionId/lessons/:lessonId',
    verifyToken,
    isInstructor,
    curriculumController.updateLesson
);
router.delete(
    '/:courseId/sections/:sectionId/lessons/:lessonId',
    verifyToken,
    isInstructor,
    curriculumController.deleteLesson
);

module.exports = router;
