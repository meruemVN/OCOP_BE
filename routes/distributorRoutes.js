// routes/distributorRoutes.js
const express = require('express');
const router = express.Router();
const { getDistributorStats } = require('../controllers/distributorController'); // Import controller
const { protect, distributor } = require('../middlewares/authMiddleware'); // Import middleware protect và kiểm tra role distributor

// Định nghĩa route lấy thống kê
// Middleware 'distributor' đảm bảo chỉ user có role 'distributor' (hoặc admin) mới truy cập được
router.get('/stats/me', protect, distributor, getDistributorStats);

// Thêm các route khác cho distributor ở đây...
// Ví dụ: router.get('/orders', protect, distributor, getDistributorOrders);
// Ví dụ: router.put('/profile', protect, distributor, updateDistributorProfile);

module.exports = router;