const express = require('express');
const router = express.Router();
const adminUserController = require('../controllers/adminUserController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

router.use(verifyToken, isAdmin);

router.get('/', adminUserController.getAllUsers);
router.get('/:id', adminUserController.getUserById);
router.put('/:id', adminUserController.updateUser);
router.delete('/:id', adminUserController.deleteUser);

module.exports = router;