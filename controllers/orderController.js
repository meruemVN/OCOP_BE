const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// Tạo đơn hàng mới
const createOrder = asyncHandler(async (req, res) => {
  // 1. Lấy thông tin cần thiết từ request body và user
  const { shippingAddress, paymentMethod, note } = req.body; // Thêm note nếu có
  const userId = req.user._id;

  // Kiểm tra thông tin bắt buộc từ body
  if (!shippingAddress || !paymentMethod) {
    res.status(400);
    throw new Error('Thiếu thông tin địa chỉ giao hàng hoặc phương thức thanh toán');
  }
  if (typeof shippingAddress !== 'object' || Object.keys(shippingAddress).length === 0) {
       res.status(400);
       throw new Error('Thông tin địa chỉ giao hàng không hợp lệ');
  }
   // Thêm kiểm tra chi tiết cho các trường bắt buộc trong shippingAddress
   const requiredAddressFields = ['fullName', 'phone', 'province', 'district', 'ward', 'address'];
   for (const field of requiredAddressFields) {
       if (!shippingAddress[field] || String(shippingAddress[field]).trim() === '') { // Kiểm tra cả rỗng
           res.status(400);
           throw new Error(`Địa chỉ giao hàng thiếu hoặc trống trường: ${field}`);
       }
   }

  // 2. Lấy giỏ hàng của người dùng
  const cart = await Cart.findOne({ user: userId }).populate({
    path: 'items.product',
    select: 'name price images countInStock' // Lấy đủ thông tin cần thiết
  });

  // Kiểm tra giỏ hàng
  if (!cart || !cart.items || cart.items.length === 0) {
    res.status(400);
    throw new Error('Giỏ hàng trống, không thể đặt hàng');
  }

  // 3. Kiểm tra tồn kho cho từng sản phẩm trong giỏ hàng
  for (const item of cart.items) {
    if (!item.product) {
         console.error(`Lỗi: Sản phẩm với ID ${item.product} trong giỏ hàng không tồn tại hoặc không được populate.`);
         res.status(404);
         throw new Error(`Sản phẩm ID ${item.product} không tìm thấy trong hệ thống.`);
    }
    if (item.quantity > item.product.countInStock) {
      res.status(400);
      throw new Error(`Sản phẩm "${item.product.name}" không đủ số lượng (chỉ còn ${item.product.countInStock})`);
    }
  }

  // 4. Lấy tổng tiền hàng từ giỏ hàng
  const itemsPrice = cart.totalPrice; // totalPrice đã được tính toán chính xác trong Cart model

  // 5. Tính phí vận chuyển
  const shippingPrice = itemsPrice > 500000 ? 0 : 30000;

  // 6. Tính tổng tiền cuối cùng (Không có thuế)
  const totalPrice = itemsPrice + shippingPrice;

  // 7. Tạo mảng orderItems từ cart items
  const orderItems = cart.items.map(item => ({
    product: item.product._id,
    name: item.product.name,
    quantity: item.quantity,
    price: item.product.price, // Lấy giá mới nhất từ product
    image: (item.product.images && item.product.images.length > 0) ? item.product.images[0] : '',
  }));

  // 8. Tạo đối tượng đơn hàng mới
  const order = new Order({
    user: userId,
    orderItems,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    shippingPrice,
    totalPrice,
    note: note || '',
    // status mặc định là 'pending'
  });

  // 9. Lưu đơn hàng vào database
  const createdOrder = await order.save();

  // 10. Cập nhật số lượng tồn kho sản phẩm
  for (const item of cart.items) {
    try {
         // item.product đã được populate, không cần tìm lại
         const productToUpdate = item.product;
         productToUpdate.countInStock -= item.quantity;
         await productToUpdate.save();
    } catch(stockError){
         console.error(`Lỗi cập nhật tồn kho cho SP ${item.product._id} sau khi tạo đơn ${createdOrder._id}:`, stockError);
         // Nên có cơ chế xử lý lỗi này (rollback đơn hàng hoặc đánh dấu cần xử lý)
         // Tạm thời throw lỗi để dừng quá trình và báo lỗi 500
         throw new Error('Lỗi khi cập nhật tồn kho sản phẩm.');
    }
  }

  // 11. Xóa các sản phẩm trong giỏ hàng sau khi đặt hàng thành công
   try {
       cart.items = [];
       // cart.totalPrice sẽ tự về 0 khi save
       await cart.save();
       console.log(`Giỏ hàng của user ${userId} đã được xóa sau khi tạo đơn ${createdOrder._id}.`);
   } catch(clearCartError) {
       console.error(`Lỗi xóa giỏ hàng cho user ${userId} sau khi tạo đơn ${createdOrder._id}:`, clearCartError);
       // Log lỗi nhưng không nên làm crash quá trình
   }

  // 12. Trả về đơn hàng đã tạo
  res.status(201).json(createdOrder);
});


// @desc    Lấy đơn hàng theo ID
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email') // Populate thông tin user
      // Không cần populate product trong orderItems vì đã lưu thông tin cơ bản
      // .populate('orderItems.product', 'name images'); // Bỏ nếu không cần

    if (order) {
      // Kiểm tra quyền truy cập: Admin hoặc chủ đơn hàng
      if (
        req.user.role === 'admin' ||
        order.user._id.toString() === req.user._id.toString()
      ) {
        res.json(order);
      } else {
        res.status(403); // Forbidden
        throw new Error('Không có quyền xem đơn hàng này');
      }
    } else {
      res.status(404);
      throw new Error('Không tìm thấy đơn hàng');
    }
});

// @desc    Lấy danh sách đơn hàng của người dùng đang đăng nhập
// @route   GET /api/orders/myorders
// @access  Private
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }); // Sắp xếp mới nhất lên đầu
  res.json(orders);
});


// Cập nhật trạng thái đã thanh toán
const updateOrderToPaid = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (order) {
      order.isPaid = true;
      order.paidAt = Date.now();
      order.paymentResult = {
        id: req.body.id,
        status: req.body.status,
        update_time: req.body.update_time,
        email_address: req.body.payer.email_address,
      };

      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ----- Admin/Distributor Routes -----

// Lấy tất cả đơn hàng (Admin/Distributor)
const getOrders = async (req, res) => {
  try {
    let orders;
    
    if (req.user.role === 'admin') {
      // Admin có thể xem tất cả đơn hàng
      orders = await Order.find({})
        .populate('user', 'id name')
        .populate('distributor', 'id name');
    } else if (req.user.role === 'distributor') {
      // Distributor chỉ xem đơn hàng được gán cho mình
      orders = await Order.find({ distributor: req.user._id })
        .populate('user', 'id name');
    }
    
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cập nhật trạng thái đã giao hàng
const updateOrderToDelivered = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (order) {
      // Kiểm tra quyền truy cập
      if (req.user.role === 'admin' || 
         (req.user.role === 'distributor' && order.distributor.toString() === req.user._id.toString())) {
        
        order.isDelivered = true;
        order.deliveredAt = Date.now();
        order.status = 'delivered';

        const updatedOrder = await order.save();
        res.json(updatedOrder);
      } else {
        res.status(403).json({ message: 'Không có quyền cập nhật đơn hàng này' });
      }
    } else {
      res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Gán đơn hàng cho nhà phân phối (Admin)
const assignOrderToDistributor = async (req, res) => {
  try {
    const { distributorId } = req.body;
    const order = await Order.findById(req.params.id);

    if (order) {
      order.distributor = distributorId;
      order.status = 'processing';

      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cập nhật trạng thái đơn hàng
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (order) {
      // Kiểm tra quyền truy cập
      if (req.user.role === 'admin' || 
         (req.user.role === 'distributor' && order.distributor.toString() === req.user._id.toString())) {
        
        order.status = status;
        
        if (status === 'delivered') {
          order.isDelivered = true;
          order.deliveredAt = Date.now();
        }

        const updatedOrder = await order.save();
        res.json(updatedOrder);
      } else {
        res.status(403).json({ message: 'Không có quyền cập nhật đơn hàng này' });
      }
    } else {
      res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createOrder,
  getOrderById,
  getMyOrders,
  updateOrderToPaid,
  getOrders,
  updateOrderToDelivered,
  assignOrderToDistributor,
  updateOrderStatus,
};