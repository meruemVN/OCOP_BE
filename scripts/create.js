const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
// const bcrypt = require('bcryptjs'); // Không cần bcrypt ở đây vì User model đã tự hash password
const mongoose = require('mongoose');
const User = require('../models/User'); // Import User model từ file User.js
const Product = require('../models/Product'); // Giả sử bạn cũng có Product model

const MONGO_URI = 'mongodb://localhost:27017/ocop_store';
const CSV_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, 'buudien_ocop_products_normalized.csv');

// Điều chỉnh đường dẫn đến thư mục data/lookups của Rasa project
const RASA_PROJECT_ROOT = path.resolve(__dirname, '..', 'MyRasaOCOPBot'); // Ví dụ: project Rasa nằm ở thư mục cha
const LOOKUP_DIR = path.join(RASA_PROJECT_ROOT, 'data', 'lookups');
const LOOKUP_TABLE_PATH = path.join(LOOKUP_DIR, 'ocop_products.txt');

function slugify(str) {
  if (!str) return '';
  return str.toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error('File CSV không tìm thấy:', CSV_PATH);
    process.exit(1);
  }
  console.log(`Đang sử dụng file CSV: ${CSV_PATH}`);

  console.log('Đang kết nối tới MongoDB...');
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Đã kết nối MongoDB');

  if (!fs.existsSync(LOOKUP_DIR)) {
    console.log(`Tạo thư mục lookup tại: ${LOOKUP_DIR}`);
    fs.mkdirSync(LOOKUP_DIR, { recursive: true });
  }
  console.log(`Chuẩn bị ghi vào file lookup: ${LOOKUP_TABLE_PATH}`);
  fs.writeFileSync(LOOKUP_TABLE_PATH, '', { encoding: 'utf8' });

  let processedCount = 0;
  let importedProductsCount = 0;
  let skippedProductsDueToNoDistributor = 0; // Đếm số sản phẩm bị bỏ qua
  let createdOrUpdatedDistributorsCount = 0;
  const productNamesForLookup = new Set();

  const stream = fs.createReadStream(CSV_PATH, { encoding: 'utf8' })
    .pipe(csv({
      mapHeaders: ({ header }) => header.trim(),
      mapValues: ({ value }) => {
        const v = value ? value.trim() : null;
        return v === '' ? null : v;
      }
    }));

  console.log('Bắt đầu đọc file CSV và xử lý...');
  for await (const row of stream) {
    processedCount++;
    if (processedCount % 100 === 0) {
      console.log(`Đã xử lý ${processedCount} dòng từ CSV...`);
    }

    if (!row.product_id || !row.name) {
      console.warn(`Cảnh báo: Bỏ qua dòng ${processedCount} do thiếu product_id hoặc name.`);
      continue;
    }

    const producerName = row.producer ? row.producer.trim() : null;
    let distributorUser = null; 

    if (producerName) {
      const slug = slugify(producerName);
      const distributorEmail = `${slug || `unknown-producer-${Date.now()}`}@example.com`;
      const distributorTaxId = slug || `taxid-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      const plainPw = process.env.NEW_DISTRIBUTOR_PASSWORD || 'ChangeMe123!';

      try {
        distributorUser = await User.findOne({ email: distributorEmail });

        if (distributorUser) {
          if (distributorUser.role !== 'distributor' || 
              !distributorUser.distributorInfo || 
              distributorUser.distributorInfo.companyName !== producerName) {
            
            distributorUser.role = 'distributor';
            if (distributorUser.distributorInfo && distributorUser.distributorInfo.taxId && distributorUser.distributorInfo.taxId !== distributorTaxId) {
                console.warn(`Cảnh báo: Distributor "${producerName}" (email: ${distributorEmail}) đã có taxId "${distributorUser.distributorInfo.taxId}", không cập nhật thành "${distributorTaxId}".`);
            }
            distributorUser.distributorInfo = {
              companyName: producerName,
              taxId: distributorUser.distributorInfo?.taxId || distributorTaxId, 
              businessLicense: row.business_license_image_url || distributorUser.distributorInfo?.businessLicense || 'N/A',
              distributionArea: row.origin || distributorUser.distributorInfo?.distributionArea || 'Chưa rõ',
              status: distributorUser.distributorInfo?.status || 'approved', 
            };
            await distributorUser.save();
            createdOrUpdatedDistributorsCount++;
          }
        } else {
          distributorUser = new User({
            name: producerName,
            email: distributorEmail,
            password: plainPw, 
            role: 'distributor',
            isActive: true,
            distributorInfo: {
              companyName: producerName,
              taxId: distributorTaxId,
              businessLicense: row.business_license_image_url || 'N/A',
              distributionArea: row.origin || 'Chưa rõ',
              status: 'approved' 
            }
          });
          await distributorUser.save();
          createdOrUpdatedDistributorsCount++;
        }
      } catch (userError) {
        if (userError.code === 11000) { 
            if (userError.message.includes('email')) {
                 console.error(`Lỗi: Email "${distributorEmail}" cho distributor "${producerName}" đã tồn tại cho một user khác.`);
            } else if (userError.message.includes('distributorInfo.taxId')) {
                 console.error(`Lỗi: Tax ID "${distributorTaxId}" cho distributor "${producerName}" đã tồn tại.`);
            } else {
                 console.error(`Lỗi duplicate key không xác định khi xử lý distributor "${producerName}":`, userError.message);
            }
        } else {
            console.error(`Lỗi khác khi xử lý distributor "${producerName}":`, userError.message, userError.stack);
        }
        distributorUser = null; 
      }
    } // Kết thúc khối if (producerName)

    // *** THAY ĐỔI CHÍNH Ở ĐÂY ***
    // Chỉ xử lý và import sản phẩm NẾU có thông tin nhà phân phối hợp lệ (distributorUser không phải là null)
    if (distributorUser) {
        const productNameFromCSV = row.name ? row.name.trim().normalize('NFC') : null;
        if (productNameFromCSV) {
          productNamesForLookup.add(productNameFromCSV);
        }

        const prodDoc = {
          original_id: Number(row.product_id),
          name: productNameFromCSV,
          description: row.description ? row.description.trim().normalize('NFC') : (row.short_description ? row.short_description.trim().normalize('NFC') : null),
          images: row.image_url ? [row.image_url.trim()] : [],
          origin: row.origin ? row.origin.trim().normalize('NFC') : null,
          category: row.category ? row.category.trim().normalize('NFC') : 'Đặc sản địa phương',
          price: row.price ? Number(String(row.price).replace(/[^0-9.]+/g, "")) : 0,
          countInStock: (row.countInStock !== null && !isNaN(parseFloat(row.countInStock)))
            ? Number(row.countInStock)
            : 10,
          distributor: distributorUser._id // Gán _id của user distributor
        };

        try {
          await Product.findOneAndUpdate(
            { original_id: prodDoc.original_id },
            { $set: prodDoc },
            { upsert: true, runValidators: true } 
          );
          importedProductsCount++;
        } catch (productError) {
          console.error(`Lỗi khi upsert sản phẩm ID ${prodDoc.original_id} ("${prodDoc.name}"):`, productError.message);
        }
    } else {
        // Nếu không có distributorUser (do producerName rỗng hoặc lỗi khi tạo/tìm user)
        // thì bỏ qua việc import sản phẩm này.
        skippedProductsDueToNoDistributor++;
        console.warn(`Cảnh báo: Bỏ qua sản phẩm "${row.name}" (ID: ${row.product_id}) do không có thông tin nhà phân phối hợp lệ (producer rỗng hoặc lỗi tạo user).`);
    }
  } // Kết thúc vòng lặp for await (const row of stream)

  if (productNamesForLookup.size > 0) {
    fs.appendFileSync(LOOKUP_TABLE_PATH, Array.from(productNamesForLookup).join('\n') + '\n', { encoding: 'utf8' });
    console.log(`Đã ghi ${productNamesForLookup.size} tên sản phẩm (duy nhất) vào lookup table: ${LOOKUP_TABLE_PATH}`);
  }

  console.log(`Hoàn tất xử lý CSV: ${processedCount} dòng đã được đọc.`);
  console.log(`Distributors đã được tạo/cập nhật: ${createdOrUpdatedDistributorsCount}.`);
  console.log(`Sản phẩm đã được import/cập nhật vào MongoDB: ${importedProductsCount}.`);
  console.log(`Sản phẩm đã bị bỏ qua do không có nhà phân phối: ${skippedProductsDueToNoDistributor}.`); // Thông báo mới
  
  await mongoose.disconnect();
  console.log('Đã ngắt kết nối MongoDB.');
  process.exit(0);
}

main().catch(err => {
  console.error("Lỗi không mong muốn trong hàm main:", err.message, err.stack);
  mongoose.connection.readyState === 1 && mongoose.disconnect(); 
  process.exit(1);
});