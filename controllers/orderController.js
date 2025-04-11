const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// Tạo đơn hàng mới
const createOrder = async (req, res) => {
  try {
    const { 
      orderItems, 
      shippingAddress, 
      paymentMethod,
    } = req.body;

    if (orderItems && orderItems.length === 0) {
      return res.status(400).json({ message: 'Không có sản phẩm trong đơn hàng' });
    }

    // Tính tổng tiền
    let itemsPrice = 0;
    for (const item of orderItems) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ message: `Không tìm thấy sản phẩm: ${item.name}` });
      }
      itemsPrice += product.price * item.quantity;
      
      // Kiểm tra số lượng tồn kho
      if (product.countInStock < item.quantity) {
        return res.status(400).json({ 
          message: `Sản phẩm ${product.name} chỉ còn ${product.countInStock} sản phẩm` 
        });
      }
    }

    // Tính phí vận chuyển và thuế
    const shippingPrice = itemsPrice > 1000000 ? 0 : 30000;
    const taxPrice = Math.round(0.1 * itemsPrice);
    const totalPrice = itemsPrice + shippingPrice + taxPrice;

    const order = new Order({
      user: req.user._id,
      orderItems,
      shippingAddress,
      paymentMethod,
      taxPrice,
      shippingPrice,
      totalPrice,
    });

    const createdOrder = await order.save();

    // Cập nhật số lượng tồn kho
    for (const item of orderItems) {
      const product = await Product.findById(item.product);
      product.countInStock -= item.quantity;
      await product.save();
    }

    // Xóa giỏ hàng sau khi đặt hàng (nếu cần)
    // await Cart.findOneAndDelete({ user: req.user._id });

    res.status(201).json(createdOrder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy đơn hàng theo ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email')
      .populate('orderItems.product');

    if (order) {
      // Kiểm tra quyền truy cập
      if (
        req.user.role === 'admin' || 
        req.user.role === 'distributor' ||
        order.user._id.toString() === req.user._id.toString()
      ) {
        res.json(order);
      } else {
        res.status(403).json({ message: 'Không có quyền xem đơn hàng này' });
      }
    } else {
      res.status(404).json({ message: 'Không tìm thấy đơn hàng' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy danh sách đơn hàng của người dùng
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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