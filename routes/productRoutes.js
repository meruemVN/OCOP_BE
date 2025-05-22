const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductById,
  createProduct,
  getMyProducts,
  updateProduct,
  deleteProduct,
  autocomplete,            // <-- thêm autocomplete
} = require('../controllers/productController');
const { protect, authorize } = require('../middlewares/authMiddleware'); 

// --- Public Routes ---
router.get('/', getProducts); 
router.get('/autocomplete', autocomplete);   // <-- endpoint autocomplete

// --- Protected Routes (Cụ thể hơn) ---
router.get(
  '/my-products',
  protect,
  authorize(['distributor', 'admin']),
  getMyProducts
);

// --- Public Dynamic Route ---
router.get('/:id', getProductById);

// --- Protected Routes (Tạo, Cập nhật, Xóa) ---
router.post(
  '/',
  protect,
  authorize(['distributor', 'admin']),
  createProduct
);
router.put(
  '/:id',
  protect,
  authorize(['distributor', 'admin']),
  updateProduct
);
router.delete(
  '/:id',
  protect,
  authorize(['distributor', 'admin']),
  deleteProduct
);

module.exports = router;