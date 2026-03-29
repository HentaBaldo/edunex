const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// --- 1. PUBLISHED ROTASI (En Üstte ve Herkese Açık Olmalı) ---
// Not: Bunu en üste aldık çünkü parametreli rotalarla çakışmasını istemiyoruz.
router.get('/published', courseController.getAllPublishedCourses);

// --- 2. EĞİTMEN ÖZEL ROTALARI ---
router.get('/my-courses', verifyToken, isInstructor, courseController.getMyCourses);
router.post('/', verifyToken, isInstructor, courseController.createCourse);

// --- 3. PARAMETRELİ ROTALAR (ID İçerenler Her Zaman En Altta) ---
router.put('/:id/status', verifyToken, isInstructor, courseController.updateCourseStatus);

// routes/courseRoutes.js
router.get('/details/:id', courseController.getCourseDetails);

module.exports = router;