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
const { protect, distributor, admin } = require('../middlewares/authMiddleware');

// Public routes
router.get('/', getProducts); // Lấy tất cả sản phẩm
router.get('/search', searchProducts); // Tìm kiếm sản phẩm
router.get('/:id', getProductById); // Lấy chi tiết sản phẩm

// Distributor/Admin routes
router.post('/', protect, distributor, createProduct); // Thêm sản phẩm mới
router.put('/:id', protect, distributor, updateProduct); // Cập nhật sản phẩm
router.delete('/:id', protect, distributor, deleteProduct); // Xóa sản phẩm

module.exports = router;