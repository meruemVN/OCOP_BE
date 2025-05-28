const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/ocop_store';
const LOOKUP_TABLE_PATH = path.resolve(__dirname, 'data', 'lookups', 'ocop_products.txt');

// Định nghĩa lại Product Schema (chỉ cần trường 'name' là đủ cho script này)
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
}, { collection: 'products' }); // Quan trọng: chỉ định đúng tên collection

const Product = mongoose.model('ProductExporter', productSchema); // Dùng tên model khác để tránh xung đột nếu chạy chung thư mục

async function exportNames() {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Đã kết nối MongoDB để xuất tên sản phẩm.');

    // Lấy tất cả tên sản phẩm, chỉ chọn trường 'name', và loại bỏ trùng lặp (distinct)
    const products = await Product.find().select('name').lean(); // .lean() để lấy object thuần JS, nhanh hơn

    if (!products || products.length === 0) {
      console.log('Không tìm thấy sản phẩm nào trong CSDL.');
      return;
    }

    // Tạo thư mục data/lookups nếu nó chưa tồn tại
    const lookupDir = path.dirname(LOOKUP_TABLE_PATH);
    if (!fs.existsSync(lookupDir)) {
      fs.mkdirSync(lookupDir, { recursive: true });
    }
    
    // Lấy danh sách tênユニーク, loại bỏ giá trị null hoặc rỗng và trim
    const productNames = [...new Set(products.map(p => p.name?.trim()).filter(name => name))];


    fs.writeFileSync(LOOKUP_TABLE_PATH, productNames.join('\n'), 'utf8');

    console.log(`Đã xuất ${productNames.length} tên sản phẩm vào file: ${LOOKUP_TABLE_PATH}`);

  } catch (error) {
    console.error('Lỗi khi xuất tên sản phẩm:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Đã ngắt kết nối MongoDB.');
  }
}

exportNames();