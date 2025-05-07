const mongoose = require('mongoose');

// Schema đánh giá sản phẩm
const reviewSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User'
    },
    name: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Schema sản phẩm
// productSchema đã cập nhật
const productSchema = mongoose.Schema(
  {
    original_id: { // Hoặc csv_product_id, productIdFromCsv,...
      type: Number, // Hoặc String nếu ID trong CSV có thể không phải số
      required: true,
      unique: true, // Quan trọng: Đảm bảo không trùng lặp
      index: true    // Quan trọng: Tạo index để tìm kiếm nhanh
    },
    // ===>>> KẾT THÚC THÊM <<<===
    name: {
      type: String,
      required: [true, 'Vui lòng nhập tên sản phẩm'], // Thêm thông báo lỗi
      trim: true // Loại bỏ khoảng trắng thừa
    },
    description: {
      type: String,
      required: [true, 'Vui lòng nhập mô tả sản phẩm']
    },
    images: [ // Sửa lại để lưu nhiều ảnh nếu cần
      {
        type: String,
        // required: true // Có thể không bắt buộc nếu chỉ có 1 ảnh chính
      }
    ],
    // Thêm các trường khác từ CSV nếu có
    origin: { type: String },
    category: { // Cân nhắc dùng ObjectId nếu có collection Category
      type: String, // Hoặc mongoose.Schema.Types.ObjectId, ref: 'Category'
      required: [true, 'Vui lòng nhập danh mục']
    },
    price: {
      type: Number,
      required: [true, 'Vui lòng nhập giá sản phẩm'],
      default: 0,
      min: [0, 'Giá không thể âm'] // Thêm validation
    },
    countInStock: {
      type: Number,
      required: [true, 'Vui lòng nhập số lượng tồn kho'],
      default: 0,
      min: [0, 'Số lượng tồn kho không thể âm']
    },
    rating: { // Rating tổng hợp từ reviews
      type: Number,
      default: 0
    },
    numReviews: { // Số lượng reviews
      type: Number,
      default: 0
    },
    reviews: [reviewSchema], // Schema reviews giữ nguyên
    // Distributor có thể vẫn dùng ObjectId nếu bạn có collection User/Distributor
    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User' // Hoặc 'Distributor' nếu có model riêng
    },
    sold: { // Số lượng đã bán
      type: Number,
      default: 0,
       min: [0, 'Số lượng bán không thể âm']
    },

  },
  {
    timestamps: true
  }
);

// ===>>> THÊM INDEX KẾT HỢP (Tùy chọn nhưng tốt cho hiệu năng) <<<===
// Ví dụ: index cho tìm kiếm theo tên và danh mục
productSchema.index({ name: 'text', category: 'text' }); // Index dạng text search
productSchema.index({ category: 1, price: 1 }); // Index thường

const Product = mongoose.model('Product', productSchema);

module.exports = Product;