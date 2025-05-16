const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

const createOrder = asyncHandler(async (req, res) => {
  const { shippingAddress, paymentMethod, note } = req.body;
  const userId = req.user._id;

  if (!shippingAddress || !paymentMethod) {
    res.status(400);
    throw new Error('Thiếu thông tin địa chỉ giao hàng hoặc phương thức thanh toán');
  }
  if (typeof shippingAddress !== 'object' || Object.keys(shippingAddress).length === 0) {
       res.status(400);
       throw new Error('Thông tin địa chỉ giao hàng không hợp lệ');
  }
   const requiredAddressFields = ['fullName', 'phone', 'province', 'district', 'ward', 'address'];
   for (const field of requiredAddressFields) {
       if (!shippingAddress[field] || String(shippingAddress[field]).trim() === '') {
           res.status(400);
           throw new Error(`Địa chỉ giao hàng thiếu hoặc trống trường: ${field}`);
       }
   }

  const cart = await Cart.findOne({ user: userId }).populate({
    path: 'items.product',
    select: 'name price images countInStock _id'
  });

  if (!cart || !cart.items || cart.items.length === 0) {
    res.status(400);
    throw new Error('Giỏ hàng trống, không thể đặt hàng');
  }

  for (const item of cart.items) {
    if (!item.product || !item.product._id) {
         res.status(404);
         throw new Error(`Một sản phẩm trong giỏ hàng (ID: ${item.productId || 'Không xác định'}) không tìm thấy.`);
    }
    if (item.quantity > item.product.countInStock) {
      res.status(400);
      throw new Error(`Sản phẩm "${item.product.name}" không đủ số lượng (còn ${item.product.countInStock})`);
    }
  }

  const itemsPrice = cart.totalPrice;
  
  let shippingPrice = 0;
  if (req.body.shippingMethod === 'fast') {
      shippingPrice = 50000;
  } else { 
      shippingPrice = itemsPrice > 500000 ? 0 : 30000;
  }

  const totalPrice = itemsPrice + shippingPrice;

  const orderItems = cart.items.map(item => {
    if (!item.product) throw new Error('Lỗi xử lý item trong giỏ hàng.');
    return {
        product: item.product._id,
        original_id: item.product.original_id,
        name: item.product.name,
        quantity: item.quantity,
        price: item.product.price,
        image: (item.product.images && item.product.images.length > 0) ? item.product.images[0] : '/images/placeholder.png',
    };
  });

  const order = new Order({
    user: userId,
    orderItems,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    shippingPrice,
    totalPrice,
    note: note || '',
    status: 'pending',
  });

  const createdOrder = await order.save();

  for (const item of cart.items) {
    const productToUpdate = item.product; 
    if (productToUpdate) {
        productToUpdate.countInStock -= item.quantity;
        if ('sold' in productToUpdate.schema.paths) {
            productToUpdate.sold = (productToUpdate.sold || 0) + item.quantity;
        }
        await productToUpdate.save();
    }
  }

  cart.items = [];
  await cart.save();

  res.status(201).json(createdOrder);
});


const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (order) {
      if (req.user.role === 'admin' || order.user._id.toString() === req.user._id.toString()) {
        res.json(order);
      } else {
        res.status(403); throw new Error('Không có quyền xem đơn hàng này');
      }
    } else {
      res.status(404); throw new Error('Không tìm thấy đơn hàng');
    }
});

const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
});

const updateOrderToPaid = asyncHandler(async (req, res) => {
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
    res.status(404); throw new Error('Không tìm thấy đơn hàng');
  }
});

const getOrders = asyncHandler(async (req, res) => {
  let query = {};
  if (req.user.role === 'distributor') {
    query.distributor = req.user._id; // Giả định đơn hàng có trường distributor
  }
  // Admin có thể xem tất cả (query rỗng) hoặc thêm filter từ req.query nếu cần
  const orders = await Order.find(query).populate('user', 'id name').populate('distributor', 'name');
  res.json(orders);
});

const updateOrderToDelivered = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (order) {
    if (req.user.role === 'admin' || (order.distributor && order.distributor.toString() === req.user._id.toString())) {
      order.isDelivered = true;
      order.deliveredAt = Date.now();
      order.status = 'delivered';
      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(403); throw new Error('Không có quyền cập nhật đơn hàng này');
    }
  } else {
    res.status(404); throw new Error('Không tìm thấy đơn hàng');
  }
});

const assignOrderToDistributor = asyncHandler(async (req, res) => {
  const { distributorId } = req.body;
  const order = await Order.findById(req.params.id);
  if (order) {
    order.distributor = distributorId;
    order.status = 'processing';
    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } else {
    res.status(404); throw new Error('Không tìm thấy đơn hàng');
  }
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const order = await Order.findById(req.params.id);
  if (order) {
    if (req.user.role === 'admin' || (order.distributor && order.distributor.toString() === req.user._id.toString())) {
      order.status = status;
      if (status === 'delivered') {
        order.isDelivered = true;
        order.deliveredAt = Date.now();
      } else if (status === 'cancelled') {
        // Thêm logic hoàn kho nếu đơn hàng bị hủy và đã trừ kho
        // for (const item of order.orderItems) {
        //   await Product.findByIdAndUpdate(item.product, { $inc: { countInStock: item.quantity } });
        // }
      }
      const updatedOrder = await order.save();
      res.json(updatedOrder);
    } else {
      res.status(403); throw new Error('Không có quyền cập nhật đơn hàng này');
    }
  } else {
    res.status(404); throw new Error('Không tìm thấy đơn hàng');
  }
});

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