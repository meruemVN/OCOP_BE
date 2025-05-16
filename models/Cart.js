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
cartSchema.pre('save', async function(next) { // Nên dùng async nếu có populate bên trong
    let calculatedTotalPrice = 0;
    if (this.items && this.items.length > 0) {
        // Nếu bạn muốn đảm bảo giá là mới nhất, bạn cần populate ở đây,
        // nhưng điều này có thể làm chậm save và gây ra vấn đề nếu product bị xóa giữa chừng.
        // Tốt hơn là dựa vào item.price đã lưu, và chỉ tính tổng cho item có product.
        
        // Lọc ra các item có product không null trước khi tính tổng
        // Hoặc, nếu bạn đã xóa item lỗi ở controller, thì không cần lọc ở đây nữa.
        // Nhưng để an toàn, có thể thêm kiểm tra:
        for (const item of this.items) {
            // Chỉ tính tổng nếu item có price và quantity hợp lệ
            // và lý tưởng nhất là item.product không phải null (nếu bạn không xóa item lỗi ở controller)
            if (item.product && item.price && typeof item.price === 'number' && item.quantity && typeof item.quantity === 'number' && item.quantity > 0) {
                // Optional: Lấy giá mới nhất từ Product nếu bạn muốn (có thể làm chậm)
                // const product = await mongoose.model('Product').findById(item.product);
                // if (product) {
                //    item.price = product.price; // Cập nhật giá trong item của giỏ hàng
                //    calculatedTotalPrice += product.price * item.quantity;
                // } else {
                //    // Sản phẩm không còn tồn tại, không tính vào tổng giá
                //    // Cân nhắc xóa item này khỏi this.items
                // }
                calculatedTotalPrice += item.price * item.quantity;
            } else if (!item.product && item.price && item.quantity) {
                // Nếu item.product là null nhưng vẫn có price và quantity (dữ liệu cũ/lỗi)
                // Bỏ qua item này hoặc xử lý theo logic của bạn (ví dụ: ghi log)
                console.warn(`Cart item for user ${this.user} has product=null but price=${item.price}. Item ignored in total.`);
            }
        }
    }
    this.totalPrice = calculatedTotalPrice;
    next();
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;