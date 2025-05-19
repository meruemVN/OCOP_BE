// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Đảm bảo bạn đã import bcryptjs

// Schema địa chỉ người dùng (giữ nguyên như bạn cung cấp nếu có)
const addressSchema = mongoose.Schema({
  street: { type: String }, // Có thể không required nếu user không nhập ngay
  ward: { type: String },
  district: { type: String },
  city: { type: String },     // Hoặc province
  country: { type: String, default: 'Việt Nam' },
  postalCode: { type: String },
  fullName: String, // Tên người nhận cụ thể cho địa chỉ này
  phone: String     // SĐT liên hệ cho địa chỉ này
}, { _id: false }); // Thường không cần _id riêng cho sub-document address nếu nó chỉ là một phần của user

// Schema thông tin nhà phân phối
const distributorInfoSchema = new mongoose.Schema({
  companyName: { type: String },
  taxId: { type: String }, // unique và sparse sẽ được định nghĩa ở userSchema index
  businessLicense: { type: String },
  distributionArea: { type: String },
  status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'none'], // Thêm 'none' làm trạng thái mặc định tốt hơn
      default: 'none',
  },
  requestDate: { type: Date },
  approvalDate: { type: Date },
  rejectionDate: { type: Date },
}, { _id: false });

// Schema người dùng
const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vui lòng nhập tên người dùng.']
    },
    email: {
      type: String,
      required: [true, 'Vui lòng nhập địa chỉ email.'],
      unique: true, // Đảm bảo email là duy nhất
      lowercase: true, // Lưu email dưới dạng chữ thường
      trim: true
    },
    password: {
      type: String,
      required: [true, 'Vui lòng nhập mật khẩu.'],
      select: false // Quan trọng: không trả về password trong query mặc định
    },
    phone: {
      type: String,
      trim: true
      // unique: true, // Cân nhắc nếu SĐT cũng cần là duy nhất
      // sparse: true  // Nếu SĐT là unique và có thể null/rỗng
    },
    // address: addressSchema, // Một địa chỉ chính
    addresses: [addressSchema], // Cho phép nhiều địa chỉ giao hàng
    role: {
      type: String,
      enum: ['user', 'distributor', 'admin'],
      default: 'user'
    },
    isActive: { // Tài khoản có hoạt động không
      type: Boolean,
      default: true
    },
    distributorInfo: distributorInfoSchema, // Có thể không tồn tại với user thường
  },
  {
    timestamps: true // Tự động thêm createdAt và updatedAt
  }
);

// Middleware: Mã hóa mật khẩu trước khi lưu
userSchema.pre('save', async function (next) {
  // Chỉ hash mật khẩu nếu nó được thay đổi (hoặc là mới)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error); // Chuyển lỗi cho middleware xử lý lỗi tiếp theo
  }
});

// Method: So sánh mật khẩu đã nhập với mật khẩu đã hash trong DB
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) { // Kiểm tra nếu password không được select vì lý do nào đó
      console.error("[User Model] matchPassword called but this.password is not available. Ensure password was selected in query.");
      return false; 
  }
  return await bcrypt.compare(enteredPassword, this.password);
};

// --- Định nghĩa Indexes ---
// userSchema.index({ email: 1 }, { unique: true }); // Đã có unique:true ở field email

// Index cho distributorInfo.taxId: unique NẾU NÓ TỒN TẠI và CÓ GIÁ TRỊ (sparse)
userSchema.index({ 'distributorInfo.taxId': 1 }, { unique: true, sparse: true });

// Cân nhắc thêm index cho phone nếu thường xuyên tìm kiếm hoặc muốn nó unique
// userSchema.index({ phone: 1 }, { unique: true, sparse: true });


const User = mongoose.model('User', userSchema);

module.exports = User;