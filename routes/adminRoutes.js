// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const { getAllOrders, getDashboardStats } = require('../controllers/adminController'); // Import controller
const { protect, admin } = require('../middlewares/authMiddleware');

// Định nghĩa route cho thống kê dashboard
router.get('/stats', protect, admin, getDashboardStats);

// Thêm các route admin khác ở đây...
router.get('/orders', protect, admin, getAllOrders);
// router.get('/products', protect, admin, getAllProductsAdmin);

module.exports = router;