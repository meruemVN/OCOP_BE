const asyncHandler = require('express-async-handler'); // <-- Import asyncHandler
const Cart = require('../models/Cart');
const Product = require('../models/Product');
// Không cần require Order ở đây nữa

// Helper function to populate cart items with product details
const populateCart = (cart) => {
  // Kiểm tra xem cart có tồn tại và có items không trước khi populate
  if (!cart || !cart.items || cart.items.length === 0) {
      return Promise.resolve(cart); // Trả về cart nguyên trạng nếu rỗng
  }
  return cart.populate({
    path: 'items.product',
    select: 'name price images countInStock _id original_id' // Lấy đủ thông tin cần thiết
  });
};

// @desc    Lấy giỏ hàng của người dùng
// @route   GET /api/cart
// @access  Private
const getCart = asyncHandler(async (req, res) => {
  let cart = await Cart.findOne({ user: req.user._id });

  if (!cart) { /* ... tạo cart mới ... */ } 
  else {
     let populatedCart = await populateCart(cart); // populateCart chỉ làm nhiệm vụ populate

     // Lọc ra các item không hợp lệ (product là null sau khi populate)
     const validItems = populatedCart.items.filter(item => item.product !== null);

     if (validItems.length !== populatedCart.items.length) {
         // Nếu có item bị loại bỏ, cập nhật lại giỏ hàng trong DB
         console.warn(`User ${req.user._id}: Cart contained invalid items that were removed.`);
         populatedCart.items = validItems;
         // totalPrice sẽ được tính lại bởi pre-save hook khi .save() được gọi
         populatedCart = await populatedCart.save(); 
         // Populate lại lần nữa để đảm bảo client nhận được đúng cấu trúc (nếu .save() không tự populate)
         populatedCart = await populateCart(populatedCart);
     }
     res.json(populatedCart);
  }
});

// @desc    Thêm sản phẩm vào giỏ hàng
// @route   POST /api/cart
// @access  Private
const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity } = req.body;
  const userId = req.user._id;

  // Input validation
  if (!productId || !quantity || typeof quantity !== 'number' || quantity < 1) {
      res.status(400);
      throw new Error('Thông tin sản phẩm hoặc số lượng không hợp lệ');
  }

  // 1. Kiểm tra sản phẩm
  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error('Không tìm thấy sản phẩm');
  }

  // 2. Kiểm tra số lượng tồn kho ban đầu
  if (quantity > product.countInStock) {
    res.status(400);
    throw new Error(`Sản phẩm "${product.name}" không đủ số lượng trong kho (chỉ còn ${product.countInStock})`);
  }

  // 3. Tìm hoặc tạo giỏ hàng
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = new Cart({ user: userId, items: [] });
  }

  // 4. Kiểm tra xem sản phẩm đã có trong giỏ hàng chưa
  const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

  if (itemIndex > -1) {
    // Sản phẩm đã có -> Cập nhật số lượng
    const newQuantity = cart.items[itemIndex].quantity + quantity;
    // Kiểm tra lại tồn kho với số lượng mới
    if (newQuantity > product.countInStock) {
        res.status(400);
        // Tính số lượng có thể thêm tối đa
        const canAdd = product.countInStock - cart.items[itemIndex].quantity;
        throw new Error(`Không thể thêm ${quantity} sản phẩm. Chỉ có thể thêm tối đa ${canAdd} sản phẩm "${product.name}" nữa (tổng tồn kho ${product.countInStock}).`);
    }
    cart.items[itemIndex].quantity = newQuantity;
    // Cập nhật giá nếu cần thiết (ví dụ: nếu giá sản phẩm có thể thay đổi)
    // cart.items[itemIndex].price = product.price;
  } else {
    // Sản phẩm chưa có -> Thêm mới item
    cart.items.push({
      product: productId,
      quantity,
      price: product.price // Lưu giá hiện tại của sản phẩm
    });
  }

  // 5. Lưu giỏ hàng (totalPrice sẽ được tính tự động bởi pre-save hook)
  let updatedCart = await cart.save();

  // 6. Populate và trả về giỏ hàng đã cập nhật
  updatedCart = await populateCart(updatedCart);
  res.status(200).json(updatedCart);
});

// @desc    Cập nhật số lượng sản phẩm trong giỏ hàng
// @route   PUT /api/cart
// @access  Private
const updateCartItem = asyncHandler(async (req, res) => {
    const { productId, quantity } = req.body;
    const userId = req.user._id;

    // Input validation
    if (!productId || quantity === undefined || typeof quantity !== 'number' || quantity < 0) {
        res.status(400);
        throw new Error('Thông tin sản phẩm hoặc số lượng không hợp lệ (số lượng phải >= 0)');
    }

    // 1. Tìm giỏ hàng
    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
      res.status(404);
      throw new Error('Không tìm thấy giỏ hàng');
    }

    // 2. Tìm item trong giỏ hàng
    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);
    if (itemIndex === -1) {
        res.status(404);
        throw new Error('Không tìm thấy sản phẩm trong giỏ hàng');
    }

    if (quantity === 0) {
        // Nếu số lượng là 0 -> Xóa sản phẩm khỏi giỏ
        cart.items.splice(itemIndex, 1);
    } else {
        // 3. Kiểm tra sản phẩm và tồn kho trước khi cập nhật (chỉ khi quantity > 0)
        const product = await Product.findById(productId);
        if (!product) {
            // Nếu sản phẩm không còn tồn tại trong DB, xóa nó khỏi giỏ hàng
            cart.items.splice(itemIndex, 1);
            console.warn(`Sản phẩm ID ${productId} không còn tồn tại, đã xóa khỏi giỏ hàng user ${userId}`);
            // Vẫn tiếp tục lưu cart đã thay đổi
        } else if (quantity > product.countInStock) {
            res.status(400);
            throw new Error(`Sản phẩm "${product.name}" chỉ còn ${product.countInStock} trong kho, không thể cập nhật thành ${quantity}`);
        } else {
            // Cập nhật số lượng
            cart.items[itemIndex].quantity = quantity;
            // Cập nhật giá nếu cần
            // cart.items[itemIndex].price = product.price;
        }
    }

    // 4. Lưu giỏ hàng (totalPrice sẽ được tính lại)
    let updatedCart = await cart.save();

    // 5. Populate và trả về
    updatedCart = await populateCart(updatedCart);
    res.json(updatedCart);
});

// @desc    Xóa sản phẩm khỏi giỏ hàng
// @route   DELETE /api/cart/:productId
// @access  Private
const removeFromCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const userId = req.user._id;

  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    // Nếu không có cart thì không có gì để xóa
    res.status(404);
    throw new Error('Không tìm thấy giỏ hàng');
  }

  const initialLength = cart.items.length;
  // Lọc ra các item không phải là productId cần xóa
  cart.items = cart.items.filter(item => item.product.toString() !== productId);

  // Kiểm tra xem có thực sự xóa được item nào không
  if (cart.items.length === initialLength) {
      res.status(404);
      throw new Error('Không tìm thấy sản phẩm trong giỏ hàng để xóa');
  }

  // Lưu giỏ hàng (totalPrice sẽ được tính lại)
  let updatedCart = await cart.save();

  // Populate và trả về (nếu giỏ hàng không rỗng)
  updatedCart = await populateCart(updatedCart);
  res.json(updatedCart);
});

// @desc    Xóa sạch giỏ hàng (làm trống items)
// @route   DELETE /api/cart
// @access  Private
const clearCart = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  let cart = await Cart.findOne({ user: userId });

  if (cart && cart.items.length > 0) {
    cart.items = [];
    // totalPrice sẽ tự cập nhật thành 0 qua pre-save hook khi save
    await cart.save();
    // Trả về giỏ hàng rỗng đã lưu
    res.json(cart);
  } else {
    // Nếu không có giỏ hàng hoặc giỏ hàng đã trống
    // Tạo hoặc trả về giỏ hàng rỗng chuẩn
     if (!cart) {
        cart = await Cart.create({ user: userId, items: [] });
     }
     res.json(cart); // Trả về giỏ hàng rỗng
     // Hoặc có thể trả về message:
     // res.json({ message: 'Giỏ hàng đã trống hoặc không tồn tại' });
  }
});


// KHÔNG CÒN HÀM checkoutCart ở đây

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};