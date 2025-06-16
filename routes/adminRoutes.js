const express = require('express');
const router = express.Router();

const {
    getAllOrders,
    getDashboardStats,
    getAllProductsAdmin, 
    getAllUsersAdmin,
    getOrderByIdAdmin,
    updateOrderStatusAdmin,
    manageDistributorRequestStatus,
} = require('../controllers/adminController'); // Đảm bảo đường dẫn đến controller là đúng

const { protect, admin } = require('../middlewares/authMiddleware');

// --- CÁC ROUTE ---
router.route('/orders').get(protect, admin, getAllOrders);
router.route('/orders/:id').get(protect, admin, getOrderByIdAdmin);
router.route('/orders/:id/status').put(protect, admin, updateOrderStatusAdmin);
router.route('/stats').get(protect, admin, getDashboardStats);

// Route cho products (sử dụng hàm đã import)
router.route('/products').get(protect, admin, getAllProductsAdmin);

// Route cho users (sử dụng hàm đã import)
router.route('/users').get(protect, admin, getAllUsersAdmin); 
router.route('/users/:userId/distributor-status').put(protect, admin, manageDistributorRequestStatus);

module.exports = router;