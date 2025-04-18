// Ví dụ: controllers/adminController.js
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');


// @desc    Lấy danh sách tất cả đơn hàng (Admin, có phân trang)
// @route   GET /api/admin/orders
// @access  Private/Admin
const getAllOrders = asyncHandler(async (req, res) => {
    const pageSize = Number(req.query.limit) || 10; // Lấy limit từ query hoặc mặc định
    const page = Number(req.query.page) || 1; // Lấy page từ query hoặc mặc định

    const filter = {}; // Thêm filter nếu cần (ví dụ: theo status, date range)
    // Ví dụ filter theo status:
    // if (req.query.status) {
    //    filter.status = req.query.status;
    // }

    const count = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
                            .populate('user', 'id name email') // Populate người dùng
                            .sort({ createdAt: -1 }) // Sắp xếp mới nhất
                            .limit(pageSize)
                            .skip(pageSize * (page - 1));

    res.json({
        orders,
        page,
        pages: Math.ceil(count / pageSize),
        count
    });
});

// @desc    Lấy thống kê tổng quan cho Admin Dashboard
// @route   GET /api/admin/stats
// @access  Private/Admin
const getDashboardStats = asyncHandler(async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments({});
        const totalUsers = await User.countDocuments({}); // Đếm tất cả user
        const totalProducts = await Product.countDocuments({}); // Đếm tất cả sản phẩm

        // Tính tổng doanh thu (ví dụ: từ các đơn đã giao)
        const deliveredOrders = await Order.find({ status: 'delivered' });
        const totalRevenue = deliveredOrders.reduce((acc, order) => acc + order.totalPrice, 0);

        res.json({
            totalOrders,
            totalUsers,
            totalProducts,
            totalRevenue
        });
    } catch (error) {
         console.error("Lỗi lấy thống kê dashboard:", error);
         res.status(500);
         throw new Error("Không thể lấy dữ liệu thống kê.");
    }
});

module.exports = { getAllOrders, getDashboardStats, /* các hàm admin khác */ };