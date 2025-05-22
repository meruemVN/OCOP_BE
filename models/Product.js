const mongoose = require('mongoose');

// Hàm normalize: loại bỏ dấu và chuyển về lowercase
function removeDiacritics(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

const reviewSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
  },
  { timestamps: true }
);

const productSchema = mongoose.Schema(
  {
    original_id: {
      type: Number,
      unique: true,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Vui lòng nhập tên sản phẩm'],
      trim: true,
    },
    // Field phục vụ tìm kiếm không dấu:
    name_normalized: { type: String, index: true },

    description: {
      type: String,
      required: [true, 'Vui lòng nhập mô tả sản phẩm'],
    },
    description_normalized: String,

    short_description: { type: String },

    images: [{ type: String }],

    brand: { type: String },

    category: {
      type: String,
      required: [true, 'Vui lòng nhập danh mục sản phẩm'],
      index: true,
    },
    category_normalized: { type: String, index: true },

    origin: { type: String, index: true },
    origin_normalized: String,

    producer: { type: String },

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

    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
    reviews: [reviewSchema],

    distributor: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },

    sold: { type: Number, default: 0, min: 0 },
    ocop_rating: { type: Number, min: 0, max: 5 },
    product_url: { type: String },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// --- Text index cho tìm kiếm full-text (nếu cần) ---
productSchema.index(
  {
    name: 'text',
    description: 'text',
    category: 'text',
    brand: 'text',
    producer: 'text',
    origin: 'text',
  },
  {
    weights: {
      name: 10,
      category: 5,
      brand: 5,
      producer: 3,
      description: 2,
      origin: 1,
    },
    name: 'ProductTextIndex',
  }
);

// Các index hỗ trợ filter/sort
productSchema.index({ category: 1, price: 1 });
productSchema.index({ origin: 1, price: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ sold: -1, createdAt: -1 });
productSchema.index({ numReviews: -1, createdAt: -1 });
productSchema.index({ rating: -1, createdAt: -1 });
productSchema.index({ distributor: 1, createdAt: -1 });

// Trước khi save, build các trường normalized
productSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.name_normalized = removeDiacritics(this.name);
  }
  if (this.isModified('description')) {
    this.description_normalized = removeDiacritics(this.description);
  }
  if (this.isModified('category')) {
    this.category_normalized = removeDiacritics(this.category);
  }
  if (this.isModified('origin')) {
    this.origin_normalized = removeDiacritics(this.origin);
  }
  next();
});

// Tự động tính lại rating & numReviews khi reviews thay đổi
productSchema.pre('save', function (next) {
  if (this.isModified('reviews') || this.isNew) {
    if (this.reviews && this.reviews.length > 0) {
      this.numReviews = this.reviews.length;
      this.rating = parseFloat(
        (
          this.reviews.reduce((acc, r) => acc + r.rating, 0) /
          this.reviews.length
        ).toFixed(2)
      );
    } else {
      this.numReviews = 0;
      this.rating = 0;
    }
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);