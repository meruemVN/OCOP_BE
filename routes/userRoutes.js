const express = require('express');
const router = express.Router();
const {
    registerUser,
    loginUser,
    getUserProfile,
    updateUserProfile,
    registerDistributor,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    approveDistributor,
} = require('../controllers/userController');
const { protect, admin } = require('../middlewares/authMiddleware');

// Route công khai
router.post('/register', registerUser); // Đăng ký người dùng
router.post('/login', loginUser); // Đăng nhập

// Route người dùng xác thực
router.get('/profile', protect, getUserProfile); // Lấy thông tin người dùng
router.put('/profile', protect, updateUserProfile); // Cập nhật thông tin người dùng
router.post('/distributor', protect, registerDistributor); // Đăng ký làm nhà phân phối

// Route Admin
router.get('/', protect, admin, getUsers); // Lấy danh sách người dùng
router.get('/:id', protect, admin, getUserById); // Lấy người dùng theo ID
router.put('/:id', protect, admin, updateUser); // Cập nhật thông tin người dùng
router.delete('/:id', protect, admin, deleteUser); // Xóa người dùng
router.put('/:id/approve-distributor', protect, admin, approveDistributor); // Phê duyệt yêu cầu nhà phân phối

// Optional: Error handling middleware to catch errors across routes
// router.use(errorHandler);

module.exports = router;