const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const cors = require('cors'); // Import cors
const path = require('path');
// Sửa lại import middleware cho đúng file (giả sử là middleware/authMiddleware.js)
const { errorHandler, requestLogger } = require('./middlewares/authMiddleware'); // SỬA ĐƯỜNG DẪN NẾU CẦN

// Import Routes
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const orderRoutes = require('./routes/orderRoutes');
const cartRoutes = require('./routes/cartRoutes');
const distributorRoutes = require('./routes/distributorRoutes'); 

dotenv.config();

// Kết nối MongoDB
connectDB();

const app = express();

// --- Cấu hình CORS ---
const corsOptions = {
  // Thay bằng địa chỉ chính xác của frontend của bạn
  // Quan trọng: Không dùng '*' khi credentials là true
  origin: process.env.FRONTEND_URL || 'http://localhost:8080', // Lấy từ .env hoặc mặc định
  credentials: true, // Cho phép gửi cookie và headers xác thực
  optionsSuccessStatus: 200 // Một số trình duyệt cũ cần cái này
};
app.use(cors(corsOptions)); // <<== SỬ DỤNG OPTIONS Ở ĐÂY

// Middleware cơ bản
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(requestLogger); // Middleware ghi log request

// Phục vụ các file tĩnh (nếu có trong thư mục public)
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes API ---
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/distributors', distributorRoutes);

// Route mặc định (nên đặt sau các route API)
app.get('/api', (req, res) => { // Có thể đổi thành /api để rõ ràng hơn
  res.send('API đang chạy...');
});

// --- Error Middleware (Luôn đặt cuối cùng) ---


app.use(errorHandler); // Xử lý tất cả các lỗi khác

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server đang chạy trên cổng ${PORT} ở chế độ ${process.env.NODE_ENV || 'development'}`); // Thêm NODE_ENV cho rõ
});