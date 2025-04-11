const Cart = require('../models/Cart');
const Product = require('../models/Product');

// Lấy giỏ hàng của người dùng
const getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate({
      path: 'items.product',
      select: 'name price images'
    });
    
    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
        totalPrice: 0
      });
    }
    
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Thêm sản phẩm vào giỏ hàng
const addToCart = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    
    // Kiểm tra sản phẩm
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
    
    // Kiểm tra số lượng
    if (quantity > product.countInStock) {
      return res.status(400).json({ message: 'Sản phẩm không đủ số lượng' });
    }
    
    let cart = await Cart.findOne({ user: req.user._id });
    
    // Nếu chưa có giỏ hàng, tạo mới
    if (!cart) {
      cart = new Cart({
        user: req.user._id,
        items: [{ 
          product: productId, 
          quantity, 
          price: product.price 
        }],
        totalPrice: product.price * quantity
      });
      
      await cart.save();
      return res.status(201).json(cart);
    }
    
    // Kiểm tra xem sản phẩm đã có trong giỏ hàng chưa
    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    
    if (itemIndex > -1) {
      // Cập nhật số lượng nếu sản phẩm đã có
      cart.items[itemIndex].quantity = quantity;
    } else {
      // Thêm sản phẩm mới vào giỏ hàng
      cart.items.push({
        product: productId,
        quantity,
        price: product.price
      });
    }
    
    // Tính lại tổng tiền
    cart.totalPrice = cart.items.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
    
    await cart.save();
    
    res.json(cart);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cập nhật giỏ hàng
const updateCartItem = async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    
    let cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      return res.status(404).json({ message: 'Không tìm thấy giỏ hàng' });
    }
    
    // Kiểm tra sản phẩm
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
    
    // Kiểm tra số lượng
    if (quantity > product.countInStock) {
      return res.status(400).json({ message: 'Sản phẩm không đủ số lượng' });
    }
    
    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    
    if (itemIndex > -1) {
      if (quantity <= 0) {
        // Xóa sản phẩm nếu số lượng = 0
        cart.items.splice(itemIndex, 1);
      } else {
        // Cập nhật số lượng
        cart.items[itemIndex].quantity = quantity;
      }
      
      // Tính lại tổng tiền
      cart.totalPrice = cart.items.reduce((total, item) => {
        return total + (item.price * item.quantity);
      }, 0);
      
      await cart.save();
      return res.json(cart);
    }
    
    res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Xóa sản phẩm khỏi giỏ hàng
const removeFromCart = async (req, res) => {
  try {
    const { productId } = req.params;
    
    let cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      return res.status(404).json({ message: 'Không tìm thấy giỏ hàng' });
    }
    
    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    
    if (itemIndex > -1) {
      cart.items.splice(itemIndex, 1);
      
      // Tính lại tổng tiền
      cart.totalPrice = cart.items.reduce((total, item) => {
        return total + (item.price * item.quantity);
      }, 0);
      
      await cart.save();
      return res.json(cart);
    }
    
    res.status(404).json({ message: 'Không tìm thấy sản phẩm trong giỏ hàng' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Xóa giỏ hàng
const clearCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    
    if (!cart) {
      return res.status(404).json({ message: 'Không tìm thấy giỏ hàng' });
    }
    
    cart.items = [];
    cart.totalPrice = 0;
    
    await cart.save();
    
    res.json({ message: 'Đã xóa giỏ hàng' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};