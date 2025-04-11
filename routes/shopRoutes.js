const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const { protect, seller, admin } = require('../middlewares/authMiddleware')

// Route người dùng xác thực
router.post('/', protect, shopController.createShop); // Tạo cửa hàng mới

// Các route khác cho cửa hàng có thể thêm ở đây

module.exports = router;