const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
} = require('../controllers/productController');
const { protect, checkRole, admin } = require('../middlewares/authMiddleware');

// Public routes
router.get('/', getProducts); // Lấy tất cả sản phẩm
router.get('/search', searchProducts); // Tìm kiếm sản phẩm
router.get('/:id', getProductById); // Lấy chi tiết sản phẩm

// Seller/Admin routes
router.post('/', protect, checkRole('seller', 'admin'), createProduct); // Thêm sản phẩm mới
router.put('/:id', protect, checkRole('seller', 'admin'), updateProduct); // Cập nhật sản phẩm
router.delete('/:id', protect, checkRole('seller', 'admin'), deleteProduct); // Xóa sản phẩm

module.exports = router;