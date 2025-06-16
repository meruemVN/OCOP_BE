const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  getMyProducts,
  updateProduct,
  deleteProduct,
  autocomplete,
} = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/authMiddleware');

// --- Public Routes ---
// Route này phải được định nghĩa TRƯỚC '/:id' để không bị nhầm 'autocomplete' là một ID.
// GET /api/products/autocomplete?query=...
router.get('/autocomplete', autocomplete);

// GET /api/products?keyword=...&category=...&origin=...&priceMin=...&priceMax=...&rating=...&sort_by=...&page=...&perPage=...
// Đây là route chính để lấy danh sách sản phẩm với các bộ lọc.
router.get('/', getProducts);

// GET /api/products/:id - Lấy thông tin chi tiết một sản phẩm (phải đặt sau các route tĩnh cụ thể hơn)
router.get('/:id', getProductById);


// --- Protected Routes ---
// Route này phải được định nghĩa TRƯỚC '/:id' để không bị nhầm 'my-products' là một ID.
// GET /api/products/my-products - Lấy sản phẩm của distributor/admin
router.get('/my-products', protect, authorize(['distributor', 'admin']), getMyProducts);

// POST /api/products - Tạo sản phẩm mới
router.post('/', protect, authorize(['distributor', 'admin']), createProduct);

// PUT /api/products/:id - Cập nhật sản phẩm
router.put('/:id', protect, authorize(['distributor', 'admin']), updateProduct);

// DELETE /api/products/:id - Xóa sản phẩm
router.delete('/:id', protect, authorize(['distributor', 'admin']), deleteProduct);

module.exports = router;