// import.js
const fs       = require('fs');
const path     = require('path');
const csv      = require('csv-parser');
const bcrypt   = require('bcryptjs');
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/ocop_store';
const CSV_PATH  = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, 'buudien_ocop_products_detailed_v2_rerun.csv');

// ——————————————————————————
// Helper: slugify companyName -> dùng cho email/taxId
function slugify(str) {
  return str.toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

// ——————————————————————————
// 1. Định nghĩa User Schema
const addressSchema = new mongoose.Schema({
  street:     { type: String },
  ward:       { type: String },
  district:   { type: String },
  city:       { type: String },
  country:    { type: String, default: 'Việt Nam' },
  postalCode: { type: String }
}, { _id: false });

const distributorInfoSchema = new mongoose.Schema({
  companyName:     { type: String, required: true },
  taxId:           { type: String, required: true, unique: true },
  businessLicense: { type: String, required: true },
  distributionArea:{ type: String, required: true },
  status: {
    type: String,
    enum: ['pending','approved','rejected'],
    default: 'pending'
  },
  requestDate:   { type: Date, default: Date.now },
  approvalDate:  Date,
  rejectionDate: Date
}, { _id: false });

const userSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  email:           { type: String, required: true, unique: true },
  password:        { type: String, required: true },
  phone:           String,
  address:         addressSchema,
  role:            { type: String, enum: ['user','distributor','admin'], default: 'user' },
  isActive:        { type: Boolean, default: true },
  distributorInfo: distributorInfoSchema
}, { timestamps: true });

// hash password nếu mới hoặc sửa
userSchema.pre('save', async function(next){
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const User = mongoose.model('User', userSchema);

// ——————————————————————————
// 2. Định nghĩa Product Schema
const productSchema = new mongoose.Schema({
  original_id:  { type: Number, unique: true, required: true },
  name:         { type: String, required: true },
  description:  String,
  images:       [String],
  origin:       String,
  category:     String,
  price:        { type: Number, default: 0 },
  countInStock: { type: Number, default: 0 },
  rating:       { type: Number, default: 0 },
  numReviews:   { type: Number, default: 0 },
  reviews:      [mongoose.Schema.Types.Mixed],
  distributor:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sold:         { type: Number, default: 0 },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

// ——————————————————————————
// 3. Main import logic
async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('File CSV không tìm thấy:', CSV_PATH);
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('🌐 Đã kết nối MongoDB');

  let count = 0;
  const stream = fs.createReadStream(CSV_PATH)
    .pipe(csv({ mapHeaders: ({ header }) => header.trim(), mapValues: ({ value }) => {
      const v = value.trim(); return v === '' ? null : v;
    }}));

  for await (const row of stream) {
    const producerName = row.producer?.trim();
    let distributorId = null;

    if (producerName) {
      // 3.1 Find or create distributor user
      const slug    = slugify(producerName);
      const email   = `${slug}@example.com`;
      const plainPw = process.env.NEW_DISTRIBUTOR_PASSWORD || 'ChangeMe123!';

      const userDoc = await User.findOneAndUpdate(
        { 'distributorInfo.companyName': producerName },
        {
          $setOnInsert: {
            name: producerName,
            email,
            password: plainPw,
            role: 'distributor',
            distributorInfo: {
              companyName:      producerName,
              taxId:            slug,
              businessLicense:  'N/A',
              distributionArea: row.origin || 'Chưa rõ'
            }
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      distributorId = userDoc._id;
    }

    // 3.2 Upsert product và map distributor
    const prodDoc = {
      original_id:  Number(row.product_id),
      name:         row.name,
      description:  row.description || row.short_description,
      images:       row.image_url ? [ row.image_url ] : [],
      origin:       row.origin,
      category:     row.category || 'Đặc sản miền Trung',
      price:        row.price ? Number(row.price) : 0,
      countInStock: row.countInStock ? Number(row.countInStock) : 0,
      distributor:  distributorId
    };

    await Product.findOneAndUpdate(
      { original_id: prodDoc.original_id },
      { $set: prodDoc },
      { upsert: true, new: false }
    );

    count++;
  }

  console.log(`✅ Hoàn tất import: ${count} sản phẩm được xử lý.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});