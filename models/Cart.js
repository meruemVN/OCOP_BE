const mongoose = require('mongoose');

// Schema sản phẩm trong giỏ hàng
const cartItemSchema = mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Product'
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: { // Giá sản phẩm tại thời điểm thêm vào giỏ
    type: Number,
    required: true
  }
}, { _id: false }); // Thêm _id: false cho subdocument

// Schema giỏ hàng
const cartSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
      unique: true // Thêm unique để đảm bảo mỗi user chỉ có 1 cart
    },
    items: [cartItemSchema],
    totalPrice: {
      type: Number,
      required: true,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// >>> THÊM HOOK PRE-SAVE VÀO ĐÂY <<<
cartSchema.pre('save', function (next) {
  console.log('[Cart Pre-Save Hook] Running for cart:', this._id); // Thêm ID cart
  let calculatedTotal = 0;
  if (this.items && this.items.length > 0) {
      calculatedTotal = this.items.reduce((acc, item) => {
          // >> KIỂM TRA LOGIC NÀY KỸ <<
          const price = Number(item.price) || 0;
          const quantity = Number(item.quantity) || 0;
          if (isNaN(price) || isNaN(quantity)) { // Thêm kiểm tra NaN
              console.error(`[Cart Pre-Save Hook] Invalid price or quantity found for item:`, item);
          }
          return acc + (price * quantity); // Đảm bảo cộng dồn đúng
      }, 0);
  } else {
  }
  this.totalPrice = calculatedTotal; // Gán giá trị đã tính toán
  next();
});


const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;