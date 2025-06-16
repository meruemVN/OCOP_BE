// E:\OCOPstoreBE\scripts\createadmin.js

const mongoose = require('mongoose');
// Đường dẫn này('../models/User') giả định rằng 'scripts' và 'models' là các thư mục ngang hàng trong 'OCOPstoreBE'
const User = require('../models/User'); // Đảm bảo đường dẫn này chính xác!
const bcrypt = require('bcryptjs'); // User model sử dụng bcrypt, nên cần có ở đây để đảm bảo nó được cài đặt

// --- HÀM TẠO ADMIN (Tương tự như đã cung cấp trước đó, tích hợp vào đây cho dễ theo dõi) ---
/**
 * Tạo một người dùng quản trị mới.
 *
 * @param {object} adminData Dữ liệu của admin.
 * @param {string} adminData.name Tên của admin.
 * @param {string} adminData.email Email của admin (phải là duy nhất).
 * @param {string} adminData.password Mật khẩu của admin.
 * @param {string} [adminData.phone] Số điện thoại của admin (tùy chọn).
 * @returns {Promise<User|null>} Đối tượng người dùng admin đã tạo hoặc null nếu có lỗi.
 */
async function createAdminUser({ name, email, password, phone }) {
  console.log(`[AdminCreation] Bắt đầu quá trình tạo admin cho email: ${email}`);
  try {
    // 1. Kiểm tra xem email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.error(`[AdminCreation] Lỗi: Email "${email}" đã được sử dụng bởi người dùng ID: ${existingUser._id}.`);
      return null;
    }
    console.log(`[AdminCreation] Email "${email}" chưa tồn tại, có thể tạo mới.`);

    // 2. Tạo đối tượng người dùng admin mới
    // Mật khẩu sẽ được hash tự động bởi middleware 'pre-save' trong User model
    const admin = new User({
      name,
      email,
      password, // Mật khẩu gốc, sẽ được hash trước khi lưu
      phone: phone || undefined,
      role: 'admin',
      isActive: true,
    });

    // 3. Lưu người dùng admin vào cơ sở dữ liệu
    console.log(`[AdminCreation] Đang lưu admin "${name}" vào cơ sở dữ liệu...`);
    const savedAdmin = await admin.save(); // Middleware hash password sẽ chạy ở đây

    console.log(`[AdminCreation] Người dùng admin "${savedAdmin.name}" đã được tạo thành công với ID: ${savedAdmin._id}`);
    return savedAdmin;

  } catch (error) {
    if (error.name === 'ValidationError') {
      console.error('[AdminCreation] Lỗi xác thực dữ liệu khi tạo admin:', error.message);
      for (const field in error.errors) {
        console.error(`  - Trường '${field}': ${error.errors[field].message}`);
      }
    } else if (error.code === 11000) { // Lỗi duplicate key của MongoDB
      console.error(`[AdminCreation] Lỗi: Dữ liệu trùng lặp. Khả năng cao là email hoặc một trường unique khác. Chi tiết:`, error.keyValue);
    } else {
      console.error('[AdminCreation] Lỗi không xác định khi tạo admin:', error);
    }
    return null;
  }
}

// --- HÀM KẾT NỐI DATABASE ---
async function connectDB() {
  console.log("[DBConnection] Đang cố gắng kết nối tới MongoDB...");
  const dbURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ocop_store'; // Sử dụng biến môi trường hoặc một DB mặc định
  console.log(`[DBConnection] URI kết nối: ${dbURI}`);

  if (!mongoose.connection.readyState) { // Chỉ kết nối nếu chưa có kết nối
    try {
      await mongoose.connect(dbURI, {
        // Các tùy chọn này không còn cần thiết hoặc đã mặc định trong Mongoose 6+
        // useNewUrlParser: true,
        // useUnifiedTopology: true,
        // useCreateIndex: true, // nếu bạn dùng Mongoose < 6 và có index trong model
      });
      console.log('[DBConnection] Kết nối MongoDB thành công!');
    } catch (err) {
      console.error('[DBConnection] LỖI KẾT NỐI MONGODB:', err.message);
      // Bạn có thể muốn thoát tiến trình nếu không kết nối được DB
      process.exit(1);
    }
  } else {
    console.log('[DBConnection] Đã có kết nối MongoDB.');
  }
}

// --- HÀM CHÍNH ĐỂ CHẠY SCRIPT ---
async function run() {
  console.log("--- BẮT ĐẦU SCRIPT TẠO ADMIN ---");

  await connectDB();

  // Kiểm tra kết nối trước khi tiếp tục
  if (mongoose.connection.readyState !== 1) { // 1 nghĩa là 'connected'
      console.error("Không thể tiếp tục do chưa kết nối được với MongoDB. Vui lòng kiểm tra lỗi kết nối ở trên.");
      console.log("--- KẾT THÚC SCRIPT TẠO ADMIN (LỖI) ---");
      return;
  }

  const adminAccount = {
    name: 'Admin',
    email: 'admin@admin.com', // Thay đổi nếu email này đã tồn tại
    password: 'admin123', // **THAY BẰNG MẬT KHẨU MẠNH VÀ AN TOÀN HƠN**
    phone: '0909123456'
  };

  console.log(`[MainScript] Chuẩn bị tạo admin với thông tin: Name: ${adminAccount.name}, Email: ${adminAccount.email}`);
  const newAdmin = await createAdminUser(adminAccount);

  if (newAdmin) {
    console.log(`[MainScript] TẠO ADMIN THÀNH CÔNG!`);
    console.log(`  ID: ${newAdmin._id}`);
    console.log(`  Name: ${newAdmin.name}`);
    console.log(`  Email: ${newAdmin.email}`);
    console.log(`  Role: ${newAdmin.role}`);
    // Lưu ý: newAdmin.password sẽ là chuỗi đã hash và nếu query lại, nó sẽ không xuất hiện do 'select: false'
  } else {
    console.log(`[MainScript] TẠO ADMIN THẤT BẠI. Xem chi tiết lỗi ở các log phía trên.`);
  }

  console.log("[MainScript] Đang ngắt kết nối MongoDB...");
  try {
    await mongoose.disconnect();
    console.log("[MainScript] Đã ngắt kết nối MongoDB.");
  } catch (error) {
    console.error("[MainScript] Lỗi khi ngắt kết nối MongoDB:", error);
  }
  
  console.log("--- KẾT THÚC SCRIPT TẠO ADMIN ---");
}

// --- CHẠY HÀM CHÍNH VÀ XỬ LÝ LỖI ---
run().catch(error => {
  console.error("LỖI KHÔNG MONG MUỐN XẢY RA TRONG QUÁ TRÌNH CHẠY SCRIPT:", error);
  // Đảm bảo ngắt kết nối mongoose nếu có lỗi xảy ra trước khi disconnect được gọi tự nhiên
  if (mongoose.connection.readyState === 1) {
    mongoose.disconnect().finally(() => process.exit(1));
  } else {
    process.exit(1);
  }
});