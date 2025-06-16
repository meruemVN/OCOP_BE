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

// @desc    Lấy danh sách tất cả sản phẩm (Admin, có phân trang)
// @route   GET /api/admin/products
// @access  Private/Admin
const getAllProductsAdmin = asyncHandler(async (req, res) => {
    const pageSize = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;
    const sortOption = {};

    // Xử lý sắp xếp (ví dụ: sort=-createdAt hoặc sort=name)
    if (req.query.sort) {
        const sortBy = req.query.sort.startsWith('-') ? req.query.sort.substring(1) : req.query.sort;
        sortOption[sortBy] = req.query.sort.startsWith('-') ? -1 : 1;
    } else {
        sortOption.createdAt = -1; // Mặc định sắp xếp mới nhất
    }

    // Thêm filter nếu cần (ví dụ: theo category, status)
    const filter = {};
    if (req.query.category) {
        filter.category = req.query.category;
    }
    // if (req.query.isActive !== undefined) { // Ví dụ lọc theo trạng thái active/inactive của sản phẩm
    //    filter.isActive = req.query.isActive === 'true';
    // }

    const count = await Product.countDocuments(filter);
    const products = await Product.find(filter)
                                .populate('category', 'name') // Populate danh mục nếu có
                                .sort(sortOption)
                                .limit(pageSize)
                                .skip(pageSize * (page - 1));

    res.json({
        products,
        page,
        pages: Math.ceil(count / pageSize),
        count,
        limit: pageSize
    });
});

// @desc    Lấy danh sách tất cả người dùng (Admin, có phân trang và filter)
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsersAdmin = asyncHandler(async (req, res) => {
    const pageSize = Number(req.query.limit) || 10;
    const page = Number(req.query.page) || 1;
    const sortOption = {};

    if (req.query.sort) {
        const sortBy = req.query.sort.startsWith('-') ? req.query.sort.substring(1) : req.query.sort;
        if (sortBy.includes('.')) { // Sắp xếp theo trường của sub-document (ví dụ: distributorInfo.requestDate)
            sortOption[sortBy] = req.query.sort.startsWith('-') ? -1 : 1;
        } else {
            sortOption[sortBy] = req.query.sort.startsWith('-') ? -1 : 1;
        }
    } else {
        sortOption.createdAt = -1;
    }

    const filter = {};
    if (req.query.role) {
        filter.role = req.query.role;
    }
    if (req.query['distributorInfo.status']) { // Lọc theo trường của sub-document
        filter['distributorInfo.status'] = req.query['distributorInfo.status'];
    }
    if (req.query.isActive !== undefined) {
       filter.isActive = req.query.isActive === 'true';
    }
    // Thêm tìm kiếm nếu cần
    // if (req.query.search) {
    //     const keyword = req.query.search;
    //     filter.$or = [
    //         { name: { $regex: keyword, $options: 'i' } },
    //         { email: { $regex: keyword, $options: 'i' } }
    //     ];
    // }

    const count = await User.countDocuments(filter);
    const users = await User.find(filter)
                            // .select('-password') // Loại bỏ password khỏi kết quả
                            .sort(sortOption)
                            .limit(pageSize)
                            .skip(pageSize * (page - 1));

    res.json({
        users, // Hoặc trả về trong trường data nếu frontend của bạn mong đợi: data: users
        page,
        pages: Math.ceil(count / pageSize),
        count,
        limit: pageSize
    });
});

// @desc    Lấy chi tiết một đơn hàng bằng ID (Admin)
// @route   GET /api/admin/orders/:id
// @access  Private/Admin
const getOrderByIdAdmin = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
                             .populate('user', 'name email') // Populate thông tin người dùng
                             .populate('orderItems.product', 'name price'); // Populate thông tin sản phẩm trong orderItems (tùy chọn)

    if (order) {
        res.json(order);
    } else {
        res.status(404);
        throw new Error('Không tìm thấy đơn hàng');
    }
});

// @desc    Cập nhật trạng thái đơn hàng (Admin)
// @route   PUT /api/admin/orders/:id/status  (Hoặc PUT /api/admin/orders/:id)
// @access  Private/Admin
const updateOrderStatusAdmin = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (order) {
        const { status, isPaid, isDelivered } = req.body;

        // Cập nhật có chọn lọc, chỉ những trường được gửi
        if (status !== undefined) {
            order.status = status;
            if (status === 'delivered') {
                order.isDelivered = true; // Luôn đặt isDelivered thành true khi status là 'delivered'
                order.deliveredAt = Date.now();
            } else if (order.status !== 'delivered' && status !== 'delivered') {
                // Nếu không phải là delivered, đảm bảo isDelivered và deliveredAt không bị set nếu không cần thiết
                // (Tùy logic, có thể bạn muốn giữ lại isDelivered cũ nếu status không phải delivered)
            }
        }

        if (isPaid !== undefined) {
            order.isPaid = isPaid;
            if (isPaid) {
                order.paidAt = Date.now();
            } else {
                order.paidAt = null; // Hoặc giữ nguyên tùy logic
            }
        }
        
        // isDelivered được xử lý cùng với status='delivered'
        // Nếu bạn muốn isDelivered có thể được cập nhật độc lập (khi status không phải là delivered) thì thêm logic ở đây
        // Tuy nhiên, isDelivered thường gắn liền với status='delivered'
        if (isDelivered !== undefined && status === 'delivered') {
             order.isDelivered = isDelivered; // Sẽ luôn là true nếu status là 'delivered'
             if(isDelivered) order.deliveredAt = Date.now(); else order.deliveredAt = null;
        } else if (isDelivered !== undefined && status !== 'delivered' && order.isDelivered !== isDelivered) {
            // Xử lý trường hợp isDelivered được gửi nhưng status không phải delivered
            // Có thể là lỗi logic hoặc một trường hợp đặc biệt bạn muốn xử lý
            console.warn(`Attempted to set isDelivered=${isDelivered} while order status is ${status}`);
            // Tùy bạn quyết định có cập nhật isDelivered trong trường hợp này không
            // order.isDelivered = isDelivered;
            // if(isDelivered) order.deliveredAt = Date.now(); else order.deliveredAt = null;
        }


        // Xử lý hoàn kho nếu đơn hàng bị hủy (ví dụ)
        // if (status === 'cancelled' && order.status !== 'cancelled') { // Nếu trạng thái trước đó chưa phải là cancelled
        //     for (const item of order.orderItems) {
        //         const product = await Product.findById(item.product);
        //         if (product) {
        //             product.countInStock += item.quantity;
        //             await product.save();
        //         }
        //     }
        // }

        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Không tìm thấy đơn hàng');
    }
});

// @desc    Admin quản lý trạng thái yêu cầu Nhà Phân Phối (phê duyệt/từ chối)
// @route   PUT /api/admin/users/:userId/distributor-status  (Hoặc một route tương tự)
// @access  Private/Admin
const manageDistributorRequestStatus = asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { status } = req.body; // Mong đợi 'approved' hoặc 'rejected' từ frontend

    if (!userId) {
        res.status(400);
        throw new Error('Thiếu User ID.');
    }

    if (!status || !['approved', 'rejected'].includes(status)) {
        res.status(400);
        throw new Error("Trạng thái không hợp lệ. Chỉ chấp nhận 'approved' hoặc 'rejected'.");
    }

    const user = await User.findById(userId);

    if (!user) {
        res.status(404);
        throw new Error('Không tìm thấy người dùng.');
    }

    // Kiểm tra xem người dùng có thông tin yêu cầu NPP và đang ở trạng thái 'pending' không
    // Giả sử User model của bạn có trường distributorInfo là một object chứa status
    if (!user.distributorInfo || user.distributorInfo.status !== 'pending') {
        res.status(400);
        // Có thể user.distributorInfo không tồn tại, hoặc status không phải là 'pending'
        throw new Error('Người dùng này không có yêu cầu NPP đang chờ xử lý, hoặc yêu cầu đã được xử lý trước đó.');
    }

    // Cập nhật trạng thái yêu cầu
    user.distributorInfo.status = status;
    user.distributorInfo.processedAt = Date.now(); // Thời điểm xử lý yêu cầu

    if (status === 'approved') {
        user.role = 'distributor'; // Cập nhật vai trò của người dùng thành 'distributor'
        user.distributorInfo.approvalDate = Date.now();
        // Bạn có thể thêm các logic khác ở đây, ví dụ: gửi email thông báo
    } else if (status === 'rejected') {
        // Vai trò của người dùng có thể không đổi, hoặc bạn có thể set một trạng thái khác
        user.distributorInfo.rejectionDate = Date.now();
        // Bạn có thể thêm các logic khác ở đây, ví dụ: ghi lại lý do từ chối nếu có
    }

    const updatedUser = await user.save();

    res.json({
        message: `Yêu cầu nhà phân phối cho người dùng '${user.name}' đã được ${status === 'approved' ? 'phê duyệt' : 'từ chối'}.`,
        user: { // Trả về thông tin user đã cập nhật (tùy chọn)
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
            distributorInfo: updatedUser.distributorInfo,
            isActive: updatedUser.isActive
        }
    });
});

module.exports = {
    getAllOrders,
    getDashboardStats,
    getAllProductsAdmin,
    getAllUsersAdmin,
    getOrderByIdAdmin,
    updateOrderStatusAdmin,
    manageDistributorRequestStatus,
    // ...
};