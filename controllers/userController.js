const User = require('../models/User');
const jwt = require('jsonwebtoken');
const asyncHandler = require('express-async-handler'); // Sử dụng asyncHandler

// Helper function tạo token JWT
const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    console.error("Lỗi nghiêm trọng: JWT_SECRET chưa được cấu hình!");
    // Trong môi trường production, nên throw lỗi hoặc có cơ chế báo động
    // return null; // Tránh trả về token không hợp lệ
    throw new Error("Lỗi cấu hình máy chủ.");
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d', // Token hết hạn sau 30 ngày
  });
};

// @desc    Đăng ký người dùng mới
// @route   POST /api/users/register (Hoặc /api/users)
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone, address } = req.body;

  // Validation cơ bản (nên dùng express-validator cho đầy đủ hơn)
  if (!name || !email || !password) {
    res.status(400);
    throw new Error('Vui lòng cung cấp tên, email và mật khẩu.');
  }

  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error('Email đã được sử dụng');
  }

  const user = await User.create({
    name,
    email,
    password, // Password sẽ được hash bởi pre-save hook
    phone,
    address,
    // role mặc định là 'user', isActive mặc định là true (theo schema)
  });

  if (user) {
    const token = generateToken(user._id);
    // Thiết lập cookie nếu cần (giống login)
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      address: user.address,
      token: token, // Trả token trong body
    });
  } else {
    res.status(400);
    throw new Error('Dữ liệu người dùng không hợp lệ');
  }
});

// @desc    Đăng nhập người dùng
// @route   POST /api/users/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
      res.status(400);
      throw new Error('Vui lòng cung cấp email và mật khẩu.');
  }

  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    // Kiểm tra tài khoản có hoạt động không
    if (!user.isActive) {
      res.status(401); // Unauthorized or Forbidden (403) có thể hợp lý hơn
      throw new Error('Tài khoản đã bị vô hiệu hóa');
    }

    const token = generateToken(user._id);

    // Thiết lập httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Trả về thông tin user và token trong body
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      address: user.address,
      distributorInfo: user.distributorInfo, // Trả về cả thông tin distributor nếu có
      token: token,
    });
  } else {
    res.status(401); // Unauthorized
    throw new Error('Email hoặc mật khẩu không đúng');
  }
});

// @desc    Đăng xuất người dùng
// @route   POST /api/users/logout
// @access  Private (Thường yêu cầu đã đăng nhập để logout)
const logoutUser = asyncHandler(async (req, res) => {
  // Xóa httpOnly cookie bằng cách ghi đè với thời gian hết hạn trong quá khứ
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0),
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'strict',
  });

  res.status(200).json({ message: 'Đăng xuất thành công' });
});


// @desc    Lấy thông tin profile của người dùng đang đăng nhập
// @route   GET /api/users/profile
// @access  Private (Yêu cầu middleware protect)
const getUserProfile = asyncHandler(async (req, res) => {
  // req.user được cung cấp bởi middleware protect
  // Trả về thông tin user (đã loại bỏ password trong protect)
  res.json(req.user);
});

// @desc    Cập nhật thông tin profile của người dùng đang đăng nhập
// @route   PUT /api/users/profile
// @access  Private (Yêu cầu middleware protect)
const updateUserProfile = asyncHandler(async (req, res) => {
  // req.user đã là user document từ middleware protect
  const user = req.user;

  user.name = req.body.name || user.name;
  user.phone = req.body.phone || user.phone;
  // Thêm các trường khác có thể cập nhật: birthdate, gender,...
  user.birthdate = req.body.birthdate || user.birthdate;
  user.gender = req.body.gender || user.gender;


  // Cập nhật địa chỉ một cách an toàn
  if (req.body.address && typeof req.body.address === 'object') {
    user.address = {
      ...(user.address || {}), // Giữ lại các trường cũ nếu không được cung cấp
      ...req.body.address,
    };
     // Đảm bảo chỉ các trường hợp lệ được lưu (nếu cần validation sâu hơn)
     // Ví dụ: chỉ cho phép các key: fullName, phone, address, ward, district, province, country
     const allowedAddressKeys = ['fullName', 'phone', 'address', 'ward', 'district', 'province', 'country'];
     Object.keys(user.address).forEach(key => {
         if (!allowedAddressKeys.includes(key)) {
             delete user.address[key];
         }
     });
  }

  // Cập nhật email (kiểm tra trùng lặp)
  if (req.body.email && req.body.email !== user.email) {
       const emailExists = await User.findOne({ email: req.body.email, _id: { $ne: user._id } });
       if (emailExists) {
           res.status(400);
           throw new Error('Email đã được sử dụng');
       }
       user.email = req.body.email;
  }

  // Cập nhật mật khẩu nếu được cung cấp
  if (req.body.password) {
    if (req.body.password.length < 6) {
        res.status(400);
        throw new Error('Mật khẩu phải có ít nhất 6 ký tự');
    }
    // Cần mật khẩu cũ để xác thực? (Thêm logic nếu cần)
    // const { currentPassword } = req.body;
    // if (!currentPassword || !(await user.matchPassword(currentPassword))) {
    //    res.status(401);
    //    throw new Error('Mật khẩu hiện tại không đúng');
    // }
    user.password = req.body.password; // Hook pre-save sẽ hash mật khẩu mới
  }

  const updatedUser = await user.save();

  // Trả về thông tin user đã cập nhật (không bao gồm password)
  res.json({
    _id: updatedUser._id,
    name: updatedUser.name,
    email: updatedUser.email,
    role: updatedUser.role,
    phone: updatedUser.phone,
    address: updatedUser.address,
    birthdate: updatedUser.birthdate,
    gender: updatedUser.gender,
    distributorInfo: updatedUser.distributorInfo,
    // Không trả về token ở đây trừ khi bạn muốn cấp token mới sau mỗi lần update profile
  });
});

// @desc    User đăng ký làm nhà phân phối
// @route   POST /api/users/distributor
// @access  Private
const registerDistributor = asyncHandler(async (req, res) => {
  const { companyName, taxId, businessLicense, distributionArea } = req.body;
  const user = req.user; // Lấy từ middleware protect

  // Validation
  if (!companyName || !taxId || !businessLicense || !distributionArea) {
      res.status(400);
      throw new Error('Vui lòng cung cấp đầy đủ thông tin nhà phân phối.');
  }

  // Kiểm tra trạng thái hiện tại
  if (user.role === 'distributor') {
      res.status(400);
      throw new Error('Bạn đã là nhà phân phối.');
  }
  if (user.distributorInfo && user.distributorInfo.status === 'pending') {
      res.status(400);
      throw new Error('Yêu cầu của bạn đang chờ xét duyệt.');
  }
   if (user.distributorInfo && user.distributorInfo.status === 'approved') {
        // Trường hợp lạ, role chưa được cập nhật? Hoặc đã bị reject và đăng ký lại?
        // Có thể cho phép đăng ký lại nếu đã bị reject
        console.warn(`User ${user._id} đăng ký lại distributor dù status là ${user.distributorInfo.status}`);
   }

   // Kiểm tra xem Tax ID đã được đăng ký bởi user khác chưa (nếu taxId là unique)
   const existingDistributor = await User.findOne({ 'distributorInfo.taxId': taxId, _id: { $ne: user._id } });
   if (existingDistributor) {
       res.status(400);
       throw new Error('Mã số thuế này đã được đăng ký.');
   }


  user.distributorInfo = {
    companyName,
    taxId,
    businessLicense,
    distributionArea,
    requestDate: Date.now(),
    status: 'pending', // Luôn bắt đầu là pending
  };

  await user.save();

  res.status(201).json({
    message: 'Đã gửi yêu cầu đăng ký làm nhà phân phối. Vui lòng chờ xét duyệt.'
    // Không cần trả về user ở đây
  });
});

// @desc    User tự hủy yêu cầu làm nhà phân phối
// @route   DELETE /api/users/distributor
// @access  Private
const deleteDistributorRequest = asyncHandler(async (req, res) => {
  const user = req.user;

  if (user.distributorInfo && user.distributorInfo.status === 'pending') {
    user.distributorInfo = undefined; // Xóa field
    await user.save();
    res.json({ message: 'Đã hủy yêu cầu đăng ký nhà phân phối.' });
  } else if (user.distributorInfo) {
    res.status(400).json({ message: `Không thể hủy yêu cầu đã được ${user.distributorInfo.status === 'approved' ? 'phê duyệt' : 'từ chối'}.` });
  } else {
    res.status(404).json({ message: 'Bạn chưa gửi yêu cầu làm nhà phân phối.' });
  }
});


// ==============================================
// ----- ADMIN CONTROLLERS -----
// ==============================================

// @desc    Lấy danh sách tất cả người dùng (Admin)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  // Thêm phân trang và tìm kiếm/lọc nếu cần
  const users = await User.find({}).select('-password'); // Luôn loại bỏ password
  res.json(users);
});

// @desc    Lấy thông tin chi tiết người dùng theo ID (Admin)
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error('Không tìm thấy người dùng');
  }
});

// @desc    Cập nhật thông tin người dùng bởi Admin
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('Không tìm thấy người dùng');
  }

  user.name = req.body.name || user.name;
  user.role = req.body.role || user.role; // Admin có thể đổi role
   // Admin có thể (de)activate user
  if (req.body.isActive !== undefined && typeof req.body.isActive === 'boolean') {
       // Có thể thêm kiểm tra không cho deactivate chính admin root
       // if (user._id.toString() === ROOT_ADMIN_ID && req.body.isActive === false) ...
    user.isActive = req.body.isActive;
  }
  user.phone = req.body.phone || user.phone; // Admin cập nhật phone

   // Admin cập nhật địa chỉ
   if (req.body.address && typeof req.body.address === 'object') {
     user.address = { ...(user.address || {}), ...req.body.address };
     // Validation tương tự updateUserProfile nếu cần
   }

   // Admin cập nhật email (kiểm tra trùng)
   if (req.body.email && req.body.email !== user.email) {
       const emailExists = await User.findOne({ email: req.body.email, _id: { $ne: user._id } });
       if (emailExists) {
           res.status(400);
           throw new Error('Email đã được sử dụng');
       }
       user.email = req.body.email;
   }

   // Admin cập nhật thông tin distributor nếu cần (ít phổ biến, thường qua manage request)
   if (req.body.distributorInfo && typeof req.body.distributorInfo === 'object') {
       user.distributorInfo = { ...(user.distributorInfo || {}), ...req.body.distributorInfo };
   }

   // Admin có thể đặt lại mật khẩu mà không cần mật khẩu cũ
   if (req.body.password) {
       if (req.body.password.length < 6) {
           res.status(400);
           throw new Error('Mật khẩu phải có ít nhất 6 ký tự');
       }
       user.password = req.body.password; // Hook pre-save sẽ hash
   }


  const updatedUser = await user.save();

  // Trả về user đã cập nhật (loại bỏ password)
   const userToReturn = await User.findById(updatedUser._id).select('-password');
  res.json(userToReturn);
});

// @desc    Xóa người dùng bởi Admin
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    res.status(404);
    throw new Error('Không tìm thấy người dùng');
  }

  // Thêm kiểm tra: Không cho phép admin tự xóa mình hoặc xóa admin khác?
  // if (user.role === 'admin') {
  //   res.status(400);
  //   throw new Error('Không thể xóa tài khoản Admin');
  // }
  // if (req.user._id.toString() === user._id.toString()) {
  //    res.status(400);
  //    throw new Error('Bạn không thể tự xóa tài khoản của mình');
  // }


  // Cân nhắc soft delete thay vì xóa cứng
  // user.isActive = false;
  // await user.save();
  // res.json({ message: 'Đã vô hiệu hóa người dùng' });

  // Xóa cứng
  await User.deleteOne({ _id: req.params.id });
  res.json({ message: 'Đã xóa người dùng thành công' });
});

// @desc    Lấy danh sách yêu cầu làm nhà phân phối (Admin)
// @route   GET /api/users/distributor-requests (Đề xuất đổi tên route)
// @access  Private/Admin
const getDistributorRequests = asyncHandler(async (req, res) => {
  const { status } = req.query; // Lọc theo status: pending, approved, rejected
  const query = {
    'distributorInfo': { $exists: true, $ne: null } // Chỉ lấy user có distributorInfo
  };

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query['distributorInfo.status'] = status;
  }

  // Thêm phân trang nếu cần
  const usersWithRequests = await User.find(query).select('-password');
  res.json(usersWithRequests);
});

// @desc    Admin phê duyệt hoặc từ chối yêu cầu nhà phân phối
// @route   PUT /api/users/:id/manage-distributor (Đề xuất đổi tên route)
// @access  Private/Admin
const manageDistributorRequest = asyncHandler(async (req, res) => {
  const { status } = req.body; // Chỉ cần 'approved' hoặc 'rejected'
  const userId = req.params.id;

  if (!['approved', 'rejected'].includes(status)) {
    res.status(400);
    throw new Error('Trạng thái không hợp lệ. Chỉ chấp nhận "approved" hoặc "rejected".');
  }

  const user = await User.findById(userId);

  if (!user) {
    res.status(404);
    throw new Error('Không tìm thấy người dùng');
  }

  if (!user.distributorInfo) {
      res.status(400);
      throw new Error('Người dùng này chưa gửi yêu cầu làm nhà phân phối.');
  }

   // Chỉ xử lý yêu cầu đang chờ ('pending')
  if (user.distributorInfo.status !== 'pending') {
    res.status(400);
    throw new Error(`Yêu cầu này đã được ${user.distributorInfo.status === 'approved' ? 'phê duyệt' : 'từ chối'} trước đó.`);
  }

  if (status === 'approved') {
    user.role = 'distributor'; // <<< CẬP NHẬT ROLE
    user.distributorInfo.status = 'approved';
    user.distributorInfo.approvalDate = Date.now();
    // Xóa ngày từ chối nếu có
    user.distributorInfo.rejectionDate = undefined;
  } else { // status === 'rejected'
     // Không đổi role
    user.distributorInfo.status = 'rejected';
    user.distributorInfo.rejectionDate = Date.now();
     // Xóa ngày phê duyệt nếu có
    user.distributorInfo.approvalDate = undefined;
  }

  const updatedUser = await user.save();

  // Lấy lại thông tin user không kèm password để trả về
  const userToReturn = await User.findById(updatedUser._id).select('-password');

  res.json({
    message: status === 'approved' ? 'Đã phê duyệt yêu cầu nhà phân phối.' : 'Đã từ chối yêu cầu nhà phân phối.',
    user: userToReturn // Trả về thông tin user đã cập nhật
  });
});


module.exports = {
    registerUser,
    loginUser,
    logoutUser,
    getUserProfile,
    updateUserProfile,
    registerDistributor,
    deleteDistributorRequest,
    // Admin functions
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    getDistributorRequests, // Đổi tên route khi dùng
    manageDistributorRequest, // Đổi tên route khi dùng
};