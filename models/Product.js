// models/Product.js
const mongoose = require('mongoose');

const reviewSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true }, // Tên người review, có thể lấy từ user ref lúc tạo
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
  },
  { timestamps: true }
);

const productSchema = mongoose.Schema(
  {
    original_id: { // ID gốc từ CSV hoặc nguồn dữ liệu khác
      type: Number, // Hoặc String nếu ID có thể không phải là số
      // required: true, // Bỏ required nếu một số sản phẩm mới không có ID này
      unique: true,
      sparse: true, // Cho phép nhiều document có original_id là null/undefined, nhưng nếu có thì phải unique
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Vui lòng nhập tên sản phẩm'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Vui lòng nhập mô tả sản phẩm'],
    },
    short_description: { type: String },
    images: [{ type: String }], // Mảng các URL ảnh
    brand: { type: String },
    category: { // Ví dụ: "Nông sản khô", "Thực phẩm chế biến"
      type: String,
      required: [true, 'Vui lòng nhập danh mục sản phẩm'],
      index: true, // Index nếu thường xuyên lọc theo category
    },
    origin: { // Xuất xứ, ví dụ: "Bắc Giang", "Lâm Đồng" (dùng cho lọc province)
      type: String,
      index: true, // Index nếu thường xuyên lọc theo origin/province
    },
    producer: { type: String }, // Nhà sản xuất/cung cấp
    price: {
      type: Number,
      required: [true, 'Vui lòng nhập giá sản phẩm'],
      default: 0,
      min: [0, 'Giá sản phẩm không thể âm'],
    },
    countInStock: {
      type: Number,
      required: [true, 'Vui lòng nhập số lượng tồn kho'],
      default: 0,
      min: [0, 'Số lượng tồn kho không thể âm'],
    },
    rating: { // Rating trung bình, sẽ được tính từ reviews
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    numReviews: { // Số lượng reviews
      type: Number,
      default: 0,
    },
    reviews: [reviewSchema],
    distributor: { // Tham chiếu đến User model (người đăng bán sản phẩm)
      type: mongoose.Schema.Types.ObjectId,
      required: true, // Sản phẩm phải có người bán
      ref: 'User',
    },
    sold: { // Số lượng đã bán (cập nhật khi có đơn hàng thành công)
      type: Number,
      default: 0,
      min: [0, 'Số lượng bán ra không thể âm'],
    },
    ocop_rating: { type: Number, min:0, max:5 }, // Sao OCOP nếu có
    product_url: { type: String }, // Link tham khảo nếu có
    isActive: { type: Boolean, default: true }, // Sản phẩm có đang được bán/hiển thị không
  },
  {
    timestamps: true, // Tự động thêm createdAt và updatedAt
  }
);

// --- Indexes ---
// 1. Text index cho tìm kiếm theo keyword (nếu getProducts dùng $text search)
// Chọn các trường bạn muốn tìm kiếm text trên đó
productSchema.index(
    { 
        name: 'text', 
        description: 'text', 
        category: 'text', 
        brand: 'text',
        producer: 'text',
        origin: 'text'
        // short_description: 'text' // Thêm nếu cần
    }, 
    { 
        weights: { name: 10, category: 5, brand: 5, producer: 3, description: 2, origin: 1 }, // Điều chỉnh trọng số
        name: "ProductTextIndex" 
    }
);

// 2. Index kết hợp cho các trường lọc và sắp xếp phổ biến khác
productSchema.index({ category: 1, price: 1 }); // Lọc category và sort/filter giá
productSchema.index({ origin: 1, price: 1 });   // Lọc province (origin) và sort/filter giá
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ sold: -1, createdAt: -1 }); // Cho "popular"
productSchema.index({ numReviews: -1, createdAt: -1 }); // Cho "popular"
productSchema.index({ rating: -1, createdAt: -1 });   // Cho "popular"
productSchema.index({ distributor: 1, createdAt: -1 }); // Cho "my-products"

// Middleware để tự động tính rating trung bình khi reviews thay đổi hoặc khi save
productSchema.pre('save', function(next) {
  if (this.isModified('reviews') || this.isNew) { // Chỉ tính lại nếu reviews thay đổi hoặc là document mới
    if (this.reviews && this.reviews.length > 0) {
      this.numReviews = this.reviews.length;
      this.rating = parseFloat(
        (this.reviews.reduce((acc, item) => item.rating + acc, 0) / this.reviews.length).toFixed(2)
      );
    } else {
      this.numReviews = 0;
      this.rating = 0;
    }
  }
  next();
});


const Product = mongoose.model('Product', productSchema);

module.exports = Product;