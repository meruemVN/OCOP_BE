const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware kiểm tra người dùng đã đăng nhập
const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        res.status(401);
        throw new Error('Không tìm thấy người dùng');
      }

      if (!req.user.isActive) {
        res.status(401);
        throw new Error('Tài khoản đã bị vô hiệu hóa');
      }

      next();
    } catch (error) {
      console.error(error);
      res.status(401);
      throw new Error('Không được phép, token không hợp lệ');
    }
  }

  if (!token) {
    res.status(401);
    throw new Error('Không được phép, không có token');
  }
};

const checkRole = (...roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ message: 'Chưa đăng nhập' });
      }
      
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Không có quyền truy cập' });
      }
      
      next();
    };
  };
  
  const checkShopOwner = async (req, res, next) => {
    try {
      const shopId = req.params.shopId || req.body.shopId;
      
      if (!shopId) {
        return res.status(400).json({ message: 'Thiếu thông tin shopId' });
      }
      
      const shop = await Shop.findById(shopId);
      
      if (!shop) {
        return res.status(404).json({ message: 'Không tìm thấy cửa hàng' });
      }
      
      if (
        req.user.role !== 'admin' &&
        shop.owner.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ message: 'Không có quyền truy cập' });
      }
      
      next();
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

// Middleware kiểm tra quyền admin
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403);
    throw new Error('Không được phép, yêu cầu quyền admin');
  }
};

// Middleware kiểm tra quyền nhà phân phối
const distributor = (req, res, next) => {
  if (req.user && (req.user.role === 'distributor' || req.user.role === 'admin')) {
    next();
  } else {
    res.status(403);
    throw new Error('Không được phép, yêu cầu quyền nhà phân phối');
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

module.exports = { protect, checkRole, checkShopOwner, admin, distributor, errorHandler };
