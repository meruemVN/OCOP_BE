const express = require('express');
const router = express.Router();
const {
    getCart,
    addToCart,
    updateCartItem,
    removeFromCart,
    checkoutCart,
    clearCart,
} = require('../controllers/cartController');
const { protect } = require('../middlewares/authMiddleware');

// Route người dùng xác thực
router.get('/', protect, getCart); // Lấy giỏ hàng của người dùng
router.post('/', protect, addToCart); // Thêm sản phẩm vào giỏ hàng
router.put('/', protect, updateCartItem); // Cập nhật giỏ hàng
router.post('/checkout', protect, checkoutCart); // Thanh toán giỏ hàng
router.delete('/:productId', protect, removeFromCart); // Xóa sản phẩm khỏi giỏ hàng
router.delete('/', protect, clearCart); // Xóa giỏ hàng

module.exports = router;