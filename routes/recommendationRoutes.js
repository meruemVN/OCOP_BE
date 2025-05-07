const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');

// GET /api/recommendations/:productId?top_n=5
router.get('/recommendations/:productId', recommendationController.getRecommendationsForProduct);

// GET /api/products?page=1&per_page=10
router.get('/products', recommendationController.listProducts);

// POST /api/admin/refresh-model (Endpoint quản trị, cần bảo vệ)
// Ví dụ: /api/admin/refresh-model?force_crawl=true
router.post('/admin/refresh-model', recommendationController.refreshModel);

module.exports = router;