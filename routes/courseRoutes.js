/**
 * EduNex Course Routes
 * Kurs listeleme, olusturma, detay goruntuleme ve durum guncelleme isleyislerini barindirir.
 * Not: Express routing cakismalarini (parametre ezilmelerini) onlemek amaciyla statik rotalar ustte tanimlanmistir.
 */

const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { verifyToken, isInstructor } = require('../middleware/authMiddleware');

// --- Public Endpoints (Herkese Acik) ---
router.get('/published', courseController.getAllPublishedCourses);
router.get('/details/:id', courseController.getCourseDetails);

// --- Protected Endpoints (Sadece Yetkili Egitmenler) ---
router.get('/my-courses', verifyToken, isInstructor, courseController.getMyCourses);
router.post('/', verifyToken, isInstructor, courseController.createCourse);
router.put('/:id/status', verifyToken, isInstructor, courseController.updateCourseStatus);

module.exports = router;