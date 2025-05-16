// routes/recommendationRoutes.js
const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');

// GET /api/recommendations/product/:productId?top_n=5
router.get('/recommendations/product/:productId', recommendationController.getRecommendationsForProduct);

// GET /api/recommendations/user/:userId?top_n=5
router.get('/recommendations/user/:userId', recommendationController.getRecommendationsForUser);

// GET /api/products?page=1&per_page=10&category=...&province=...
router.get('/products', recommendationController.listProducts);

// POST /api/admin/refresh-model
router.post('/admin/refresh-model', recommendationController.refreshModel);

module.exports = router;