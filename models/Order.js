const mongoose = require('mongoose');

// Schema sản phẩm trong đơn hàng
const orderItemSchema = mongoose.Schema({
  product: { // ObjectId của sản phẩm gốc
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Product'
  },
  original_id: {
     type: Number 
  },
  name: { // Tên sản phẩm tại thời điểm đặt hàng
    type: String,
    required: true
  },
  quantity: { // Số lượng
    type: Number,
    required: true
  },
  price: { // Giá sản phẩm tại thời điểm đặt hàng
    type: Number,
    required: true
  },
  image: { // URL ảnh sản phẩm (không bắt buộc)
    type: String,
    // required: false // Hoặc bỏ hẳn dòng required
  }
}, { _id: false }); // Không cần _id riêng cho subdocument item

// Schema địa chỉ giao hàng
const shippingAddressSchema = mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true }, // Số nhà, tên đường
  ward: { type: String, required: true },    // Phường/Xã
  district: { type: String, required: true }, // Quận/Huyện
  province: { type: String, required: true }, // Tỉnh/Thành phố (Đổi từ city)
  country: { type: String, required: true, default: 'Việt Nam' },
  // postalCode: { type: String } // Bỏ nếu không cần
}, { _id: false }); // Không cần _id riêng

// Schema đơn hàng chính
const orderSchema = mongoose.Schema(
  {
    user: { // Người đặt hàng
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    orderItems: [orderItemSchema], // Danh sách sản phẩm
    shippingAddress: { // Địa chỉ giao hàng (nhúng schema)
       type: shippingAddressSchema,
       required: true
    },
    paymentMethod: { // Phương thức thanh toán
      type: String,
      required: true
    },
    // paymentResult: { // Kết quả thanh toán (cho cổng TT online)
    //   id: { type: String },
    //   status: { type: String },
    //   update_time: { type: String },
    //   email_address: { type: String }
    // },
    itemsPrice: { // Tổng tiền hàng (từ cart.totalPrice)
        type: Number,
        required: true,
        default: 0
    },
    shippingPrice: { // Phí vận chuyển (tính trong controller)
      type: Number,
      required: true,
      default: 0
    },
    // taxPrice: ĐÃ BỎ
    totalPrice: { // Tổng tiền cuối cùng (itemsPrice + shippingPrice)
      type: Number,
      required: true,
      default: 0
    },
    status: { // Trạng thái đơn hàng
      type: String,
      required: true, // Thêm required cho status
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'], // Các trạng thái hợp lệ
      default: 'pending'
    },
    note: { type: String }, // Ghi chú tùy chọn từ khách hàng
    isPaid: { // Đã thanh toán?
      type: Boolean,
      required: true,
      default: false
    },
    paidAt: { // Thời điểm thanh toán
      type: Date
    },
    isDelivered: { // Đã giao hàng?
      type: Boolean,
      required: true,
      default: false
    },
    deliveredAt: { // Thời điểm giao hàng
      type: Date
    },
    // distributor: { // Người xử lý đơn (nếu có)
    //   type: mongoose.Schema.Types.ObjectId,
    //   ref: 'User'
    // }
  },
  {
    timestamps: true // Tự động thêm createdAt và updatedAt
  }
);

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;