const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Schema địa chỉ người dùng
const addressSchema = mongoose.Schema({
  street: { type: String, required: true },
  ward: { type: String, required: true },
  district: { type: String, required: true },
  city: { type: String, required: true },
  country: { type: String, required: true, default: 'Việt Nam' },
  postalCode: { type: String }
});

// Schema thông tin nhà phân phối
const distributorInfoSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  taxId: { type: String, required: true, unique: true }, // Mã số thuế nên là duy nhất
  businessLicense: { type: String, required: true }, // Lưu URL/path file hoặc ID
  distributionArea: { type: String, required: true }, // Khu vực phân phối
  status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      required: true,
      default: 'pending',
  },
  requestDate: { type: Date, default: Date.now },
  approvalDate: { type: Date },
  rejectionDate: { type: Date },
  // Thêm các trường khác nếu cần: website, contactPerson, etc.
}, { _id: false }); // Không cần _id riêng

// Schema người dùng
const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      unique: true
    },
    password: {
      type: String,
      required: true
    },
    phone: {
      type: String
    },
    address: addressSchema,
    role: {
      type: String,
      enum: ['user', 'distributor', 'admin'], // Removed 'seller'
      default: 'user'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    distributorInfo: distributorInfoSchema,
    // Removed shop reference
  },
  {
    timestamps: true
  }
);

// Mã hóa mật khẩu trước khi lưu
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Phương thức so sánh mật khẩu
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;