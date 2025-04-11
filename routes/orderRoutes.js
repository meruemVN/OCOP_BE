const express = require('express');
const router = express.Router();
const {
    createOrder,
    getOrderById,
    getMyOrders,
    updateOrderToPaid,
    getOrders,
    updateOrderToDelivered,
    assignOrderToDistributor,
    updateOrderStatus,
  } = require('../controllers/orderController');
const { protect, admin, distributor } = require('../middlewares/authMiddleware');

// Route người dùng xác thực
router.post('/', protect, createOrder); // Tạo đơn hàng mới
router.get('/myorders', protect, getMyOrders); // Lấy danh sách đơn hàng của người dùng
router.get('/:id', protect, getOrderById); // Lấy đơn hàng theo ID
router.put('/:id/pay', protect, updateOrderToPaid); // Cập nhật trạng thái đã thanh toán

// Route Admin/Distributor
router.get('/', protect, admin, getOrders); // Lấy tất cả đơn hàng
router.put('/:id/deliver', protect, distributor, updateOrderToDelivered); // Cập nhật trạng thái đã giao hàng
router.put('/:id/status', protect, distributor, updateOrderStatus); // Cập nhật trạng thái đơn hàng

// Route Admin
router.put('/:id/assign', protect, admin, assignOrderToDistributor); // Gán đơn hàng cho nhà phân phối

module.exports = router;