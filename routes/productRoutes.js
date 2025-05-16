// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  getMyProducts,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/authMiddleware'); 

// --- Public Routes ---
router.get('/', getProducts); 

// --- Protected Routes (Cụ thể hơn) ---
// Đặt route cụ thể /my-products TRƯỚC route động /:id
router.get('/my-products', protect, authorize(['distributor', 'admin']), getMyProducts); 

// --- Public Route (Động - phải đứng sau các route public/protected cụ thể hơn có cùng tiền tố) ---
// GET /api/products/:id -> Lấy chi tiết sản phẩm
router.get('/:id', getProductById);


// --- Protected Routes (Cho việc tạo, cập nhật, xóa) ---
// POST /api/products (Trùng với GET /, nhưng method khác nhau nên Express xử lý được)
router.post('/', protect, authorize(['distributor', 'admin']), createProduct);

// PUT /api/products/:id 
router.put('/:id', protect, authorize(['distributor', 'admin']), updateProduct);

// DELETE /api/products/:id
router.delete('/:id', protect, authorize(['distributor', 'admin']), deleteProduct);

module.exports = router;