const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RequestLog = require('../models/RequestLog.js');

// Middleware kiểm tra người dùng đã đăng nhập
const protect = async (req, res, next) => {
  let token;

  // Kiểm tra token từ Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } 
  // Kiểm tra token từ cookie nếu không có trong header
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    res.status(401);
    throw new Error('Không được phép, không có token');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Cập nhật: Lấy thông tin người dùng mới nhất từ database
    const freshUser = await User.findById(decoded.id).select('-password');
    
    if (!freshUser) {
      res.status(401);
      throw new Error('Không tìm thấy người dùng');
    }

    if (!freshUser.isActive) {
      res.status(401);
      throw new Error('Tài khoản đã bị vô hiệu hóa');
    }

    // Sử dụng thông tin người dùng mới nhất
    req.user = freshUser;
    
    console.log('Vai trò hiện tại của người dùng:', req.user.role);
    
    next();
  } catch (error) {
    console.error(error);
    res.status(401);
    throw new Error('Không được phép, token không hợp lệ');
  }
};

const authorize = (...roles) => { // roles là một mảng hoặc danh sách các đối số vai trò
  return (req, res, next) => {
    if (!req.user) {
      res.status(401); // Unauthorized
      // console.log('Authorize: User not authenticated');
      throw new Error('Không được phép, vui lòng đăng nhập lại');
    }
    
    // Đảm bảo roles luôn là một mảng để xử lý nhất quán
    const allowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403); // Forbidden
      // console.log(`Authorize: Role '${req.user.role}' not in allowed roles [${allowedRoles.join(', ')}]`);
      throw new Error(`Truy cập bị từ chối. Vai trò '${req.user.role}' không có quyền.`);
    }
    
    // console.log(`Authorize: Role '${req.user.role}' is allowed.`);
    next();
  };
};

// const checkShopOwner = async (req, res, next) => {
//   try {
//     const shopId = req.params.shopId || req.body.shopId;
    
//     if (!shopId) {
//       return res.status(400).json({ message: 'Thiếu thông tin shopId' });
//     }
    
//     const shop = await Shop.findById(shopId);
    
//     if (!shop) {
//       return res.status(404).json({ message: 'Không tìm thấy cửa hàng' });
//     }
    
//     if (
//       req.user.role !== 'admin' &&
//       shop.owner.toString() !== req.user._id.toString()
//     ) {
//       return res.status(403).json({ message: 'Không có quyền truy cập' });
//     }
    
//     next();
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// };

// Middleware kiểm tra quyền admin
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ message: 'Chỉ admin mới có quyền truy cập' });
  }
};

// Middleware kiểm tra quyền nhà phân phối
const distributor = (req, res, next) => {
  if (req.user && (req.user.role === 'distributor' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403).json({ message: 'Chỉ nhà phân phối hoặc admin mới có quyền truy cập' });
  }
};


// Middleware xử lý lỗi
const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

// Middleware ghi log request
const requestLogger = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(body) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Status: ${res.statusCode}`);
    originalSend.call(this, body);
  };
  
  next();
};


module.exports = { protect, authorize, admin, distributor, errorHandler, requestLogger };