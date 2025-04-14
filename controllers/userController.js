const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Tạo token JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d', // Token expires in 30 days
  });
};

// Đăng ký người dùng
const registerUser = async (req, res) => {
  try {
    const { name, email, password, phone, address } = req.body;

    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'Email đã được sử dụng' });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone,
      address,
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: 'Dữ liệu người dùng không hợp lệ' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Đăng nhập
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      if (!user.isActive) {
        return res.status(401).json({ message: 'Tài khoản đã bị vô hiệu hóa' });
      }

      // If using httpOnly cookies, set it here:
      res.cookie('token', generateToken(user._id), {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development', // Use secure cookies in production
        sameSite: 'strict', // Prevent CSRF attacks
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id), // Send token in response body as well (common practice)
      });
    } else {
      res.status(401).json({ message: 'Email hoặc mật khẩu không đúng' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Đăng xuất người dùng
const logoutUser = (req, res) => {
  try {
    // Nếu bạn sử dụng cookie để lưu token JWT
    if (req.cookies && req.cookies.jwt) {
      // Xóa cookie bằng cách đặt thời gian hết hạn là quá khứ
      res.cookie('token', '', {
        httpOnly: true,
        expires: new Date(0), // Đặt thời gian hết hạn là quá khứ
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'strict',
      });
    }

    res.status(200).json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Lấy thông tin người dùng
const getUserProfile = async (req, res) => {
  try {
    // req.user is typically populated by authentication middleware (e.g., checking JWT)
    const user = await User.findById(req.user._id).select('-password');

    if (user) {
      res.json(user);
    } else {
      // This case might be less likely if auth middleware works correctly
      res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cập nhật thông tin người dùng
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      // Prevent email update if it already exists for another user
      if (req.body.email && req.body.email !== user.email) {
           const emailExists = await User.findOne({ email: req.body.email });
           if (emailExists) {
               return res.status(400).json({ message: 'Email đã được sử dụng bởi người dùng khác' });
           }
           user.email = req.body.email;
      } else {
          user.email = user.email; // Keep original if not provided or same
      }

      user.phone = req.body.phone || user.phone;

      if (req.body.address) {
        // Ensure address exists before spreading potentially null/undefined values
        user.address = user.address || {};
        user.address = {
          ...user.address,
          ...req.body.address,
        };
      }

      if (req.body.password) {
        // Password will be hashed by the pre-save hook in the User model
        user.password = req.body.password;
      }

      const updatedUser = await user.save();

      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        // Consider if you want to issue a new token on profile update
        // It can be good practice if sensitive info (like role, potentially) changes
        // token: generateToken(updatedUser._id),
      });
    } else {
      res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
  } catch (error) {
     // Handle potential duplicate key error for email more gracefully
     if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
       return res.status(400).json({ message: 'Email đã được sử dụng bởi người dùng khác' });
     }
    res.status(500).json({ message: error.message });
  }
};

// Đăng ký làm nhà phân phối
const registerDistributor = async (req, res) => {
  try {
    const { companyName, taxId, businessLicense, distributionArea } = req.body;

    // Basic validation (can be expanded using libraries like express-validator)
    if (!companyName || !taxId || !businessLicense || !distributionArea) {
        return res.status(400).json({ message: 'Vui lòng cung cấp đầy đủ thông tin nhà phân phối.' });
    }

    const user = await User.findById(req.user._id);

    if (user) {
       // Check if user already requested or is a distributor
       if (user.distributorInfo && user.distributorInfo.companyName) {
            // Allow updates maybe? Or return specific message
            return res.status(400).json({ message: 'Bạn đã gửi yêu cầu hoặc đã là nhà phân phối.' });
       }
       if (user.role === 'distributor') {
           return res.status(400).json({ message: 'Bạn đã là nhà phân phối.' });
       }

      user.distributorInfo = {
        companyName,
        taxId,
        businessLicense, // Store path/URL or identifier if it's an upload
        distributionArea,
        requestDate: Date.now(), // Track when the request was made
        status: 'pending', // Add a status field
      };

      // Do NOT change the role here. Admin approval is needed.

      await user.save();

      res.json({
        message: 'Đã gửi yêu cầu đăng ký làm nhà phân phối. Vui lòng chờ xét duyệt.'
      });
    } else {
      res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ----- Admin Routes -----

// Lấy danh sách người dùng (Admin)
const getUsers = async (req, res) => {
  try {
    // Add pagination later if needed
    const users = await User.find({}).select('-password'); // Exclude passwords
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy người dùng theo ID (Admin)
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
  } catch (error) {
    // Handle CastError if ID format is invalid
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }
    res.status(500).json({ message: error.message });
  }
};

// Cập nhật thông tin người dùng (Admin)
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      user.name = req.body.name || user.name;

      // Admin email update check
      if (req.body.email && req.body.email !== user.email) {
           const emailExists = await User.findOne({ email: req.body.email, _id: { $ne: user._id } }); // Check email not belonging to current user
           if (emailExists) {
               return res.status(400).json({ message: 'Email đã được sử dụng bởi người dùng khác' });
           }
           user.email = req.body.email;
      } else {
          // user.email = user.email; // No need to re-assign if not changing
      }


      user.role = req.body.role || user.role;
      // Ensure isActive is explicitly boolean true/false if provided
      if (req.body.isActive !== undefined && typeof req.body.isActive === 'boolean') {
        user.isActive = req.body.isActive;
      }

      // Admin can update distributor info too if needed
       if (req.body.distributorInfo) {
           user.distributorInfo = {
               ...(user.distributorInfo || {}), // Keep existing fields if not overwritten
               ...req.body.distributorInfo,
           };
       }

       // Admin might change password - Note: This bypasses user confirmation
       if (req.body.password) {
           user.password = req.body.password; // Assuming pre-save hook handles hashing
       }


      const updatedUser = await user.save();

      // Return updated user data (excluding password)
      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        isActive: updatedUser.isActive,
        phone: updatedUser.phone,
        address: updatedUser.address,
        distributorInfo: updatedUser.distributorInfo,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt
      });
    } else {
      res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
  } catch (error) {
     // Handle potential duplicate key error for email
     if (error.code === 11000 && error.keyPattern && error.keyPattern.email) {
       return res.status(400).json({ message: 'Email đã được sử dụng bởi người dùng khác' });
     }
     // Handle CastError if ID format is invalid
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }
    res.status(500).json({ message: error.message });
  }
};

// Xóa người dùng (Admin) - Consider soft delete instead
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      // Prevent deleting the root admin? Add checks if necessary.
      // if (user.role === 'admin' && /* some condition to prevent deletion */) {
      //   return res.status(400).json({ message: 'Không thể xóa tài khoản admin này' });
      // }

      // Instead of remove(), consider soft delete:
      // user.isActive = false;
      // user.deletedAt = new Date();
      // await user.save();
      // res.json({ message: 'Đã vô hiệu hóa người dùng' });

      // Hard delete:
      await User.deleteOne({ _id: req.params.id }); // Use deleteOne for clarity
      res.json({ message: 'Đã xóa người dùng' });
    } else {
      res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
  } catch (error) {
     // Handle CastError if ID format is invalid
    if (error.name === 'CastError') {
        return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }
    res.status(500).json({ message: error.message });
  }
};

// Lấy danh sách người dùng đã đăng ký làm nhà phân phối
const getDistributorRequests = async (req, res) => {
  try {
    // Tìm tất cả người dùng có thông tin nhà phân phối
    const distributorRequests = await User.find({
      'distributorInfo': { $exists: true, $ne: null }
    }).select('-password');

    // Có thể lọc theo trạng thái nếu được cung cấp trong query
    const { status } = req.query;
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      const filteredRequests = distributorRequests.filter(
        user => user.distributorInfo && user.distributorInfo.status === status
      );
      return res.json(filteredRequests);
    }

    res.json(distributorRequests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Phê duyệt / Từ chối yêu cầu nhà phân phối (Admin)
const manageDistributorRequest = async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.params.id;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ. Chỉ chấp nhận "approved" hoặc "rejected".' });
    }

    const user = await User.findById(userId);

    if (user) {
      if (!user.distributorInfo || user.distributorInfo.status !== 'pending') {
        return res.status(400).json({ message: 'Người dùng không có yêu cầu nhà phân phối đang chờ xử lý.' });
      }

      if (status === 'approved') {
        user.role = 'distributor'; // Cập nhật vai trò
        user.distributorInfo.status = 'approved';
        user.distributorInfo.approvalDate = Date.now();
        
        const updatedUser = await user.save();
        
        // Kiểm tra xem vai trò đã được cập nhật chưa
        console.log('Vai trò sau khi cập nhật:', updatedUser.role);
        
        // Phát hành token mới
        const token = generateToken(updatedUser._id);
        
        // TODO: Send notification email/message to user
        res.json({ 
          message: 'Đã phê duyệt yêu cầu nhà phân phối.',
          user: {
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role
          },
          token
        });
      } else {
        user.distributorInfo.status = 'rejected';
        user.distributorInfo.rejectionDate = Date.now();
        await user.save();
        res.json({ message: 'Đã từ chối yêu cầu nhà phân phối.' });
      }
    } else {
      res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }
  } catch (error) {
    console.error('Lỗi khi quản lý yêu cầu nhà phân phối:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'ID người dùng không hợp lệ' });
    }
    res.status(500).json({ message: error.message });
  }
};


module.exports = {
    registerUser,
    loginUser,
    logoutUser, // <-- Added logout function
    getUserProfile,
    updateUserProfile,
    registerDistributor,
    // Admin functions
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    // approveDistributor, // Replaced with manageDistributorRequest for more flexibility
    getDistributorRequests,
    manageDistributorRequest,
};