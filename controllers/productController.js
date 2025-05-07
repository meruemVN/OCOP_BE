const asyncHandler = require('express-async-handler');
const Product = require('../models/Product'); // Đảm bảo đường dẫn đến model là chính xác
// const User = require('../models/User'); // User model có thể không cần thiết ở đây nếu chỉ populate distributor

// @desc    Lấy tất cả sản phẩm (mặc định, có thể bị thay thế bởi searchProducts nếu dùng chung route)
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  const pageSize = 12; // Số sản phẩm mỗi trang
  const page = Math.max(1, parseInt(req.query.pageNumber || req.query.page, 10) || 1);

  const count = await Product.countDocuments({});
  const products = await Product.find({})
    .sort({ createdAt: -1 }) // Mặc định sắp xếp theo mới nhất
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .populate('distributor', 'name distributorInfo.companyName'); // Lấy thông tin nhà phân phối

  res.json({
    products,
    page,
    pages: Math.ceil(count / pageSize),
    count
  });
});

// @desc    Lấy một sản phẩm theo ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
  // Kiểm tra tính hợp lệ của ID trước khi truy vấn (tùy chọn)
  if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400); // Bad Request
      throw new Error('ID sản phẩm không hợp lệ');
  }
  const product = await Product.findById(req.params.id)
    .populate('distributor', 'name distributorInfo.companyName')
    .populate('reviews.user', 'name'); // Populate thêm user của review nếu cần

  if (!product) {
    res.status(404);
    throw new Error('Không tìm thấy sản phẩm');
  }
  res.json(product);
});

// @desc    Thêm sản phẩm mới (cho nhà phân phối hoặc admin)
// @route   POST /api/products
// @access  Private/DistributorOrAdmin
const createProduct = asyncHandler(async (req, res) => {
  if (req.user.role !== 'distributor' && req.user.role !== 'admin') {
    res.status(403); // Forbidden
    throw new Error('Không có quyền tạo sản phẩm');
  }

  const {
    name,
    description,
    images, // Nên là một mảng các URL ảnh
    category, // Nên là ID hoặc tên category đã chuẩn hóa
    price,
    countInStock,
    original_id, // ID gốc từ CSV
    origin,
    producer,
    short_description,
    product_url,
    ocop_rating,
    brand // Thêm các trường khác nếu có trong form
  } = req.body;

  // Kiểm tra các trường bắt buộc
  if (!name || !description || !category || price === undefined || countInStock === undefined || original_id === undefined) {
    res.status(400); // Bad Request
    throw new Error('Vui lòng cung cấp đủ thông tin bắt buộc: name, description, category, price, countInStock, original_id');
  }

  const product = new Product({
    name,
    description,
    images: Array.isArray(images) ? images : (images ? [images] : []), // Đảm bảo images là mảng
    category,
    price: Number(price) || 0,
    countInStock: Number(countInStock) || 0,
    distributor: req.user._id, // Người tạo sản phẩm là nhà phân phối hiện tại
    // user: req.user._id, // Cân nhắc trường này, thường distributor là đủ
    original_id: Number(original_id), // Đảm bảo original_id là số nếu schema yêu cầu
    origin,
    producer,
    short_description,
    product_url,
    ocop_rating: Number(ocop_rating) || null, // Đảm bảo là số hoặc null
    brand
  });

  const createdProduct = await product.save();
  res.status(201).json(createdProduct);
});

// @desc    Lấy sản phẩm của chính distributor hiện tại
// @route   GET /api/products/my-products
// @access  Private/DistributorOrAdmin
const getMyProducts = asyncHandler(async (req, res) => {
  if (req.user.role !== 'distributor' && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Chỉ nhà phân phối hoặc admin mới có quyền truy cập');
  }

  const pageSize = parseInt(req.query.pageSize, 10) || 10;
  const page = parseInt(req.query.page, 10) || 1;

  const filterConditions = { distributor: req.user._id };
  
  // Thêm filter theo keyword nếu có
  const keyword = req.query.keyword;
  if (keyword) {
    const regex = new RegExp(keyword, 'i'); // 'i' for case-insensitive
    filterConditions.$or = [
      { name: regex },
      { description: regex },
      { category: regex }
    ];
  }

  const count = await Product.countDocuments(filterConditions);
  const products = await Product.find(filterConditions)
    .sort({ createdAt: -1 })
    .limit(pageSize)
    .skip(pageSize * (page - 1));
    // .populate('category'); // Populate category nếu category là ObjectId

  res.json({
    products,
    page,
    pages: Math.ceil(count / pageSize),
    count
  });
});


// @desc    Cập nhật sản phẩm
// @route   PUT /api/products/:id
// @access  Private/DistributorOrAdmin
const updateProduct = asyncHandler(async (req, res) => {
  const {
    name, description, images, category, price, countInStock,
    original_id, origin, producer, short_description, product_url, ocop_rating, brand,
    // Thêm các trường khác bạn cho phép cập nhật
  } = req.body;

  if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400);
      throw new Error('ID sản phẩm không hợp lệ');
  }
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Không tìm thấy sản phẩm');
  }

  // Chỉ admin hoặc chủ sở hữu sản phẩm mới được cập nhật
  if (req.user.role !== 'admin' && product.distributor.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Không có quyền cập nhật sản phẩm này');
  }

  // Cập nhật các trường nếu chúng được cung cấp trong request body
  if (name !== undefined) product.name = name;
  if (description !== undefined) product.description = description;
  if (Array.isArray(images)) product.images = images; // Cho phép cập nhật mảng ảnh
  if (category !== undefined) product.category = category;
  if (price !== undefined && !isNaN(Number(price)) && Number(price) >= 0) product.price = Number(price);
  if (countInStock !== undefined && !isNaN(Number(countInStock)) && Number(countInStock) >= 0) product.countInStock = Number(countInStock);
  if (original_id !== undefined && !isNaN(Number(original_id))) product.original_id = Number(original_id);
  if (origin !== undefined) product.origin = origin;
  if (producer !== undefined) product.producer = producer;
  if (short_description !== undefined) product.short_description = short_description;
  if (product_url !== undefined) product.product_url = product_url;
  if (ocop_rating !== undefined) product.ocop_rating = Number(ocop_rating) || null;
  if (brand !== undefined) product.brand = brand;
  // Cập nhật các trường khác tương tự

  const updatedProduct = await product.save();
  res.json(updatedProduct);
});

// @desc    Xóa sản phẩm
// @route   DELETE /api/products/:id
// @access  Private/DistributorOrAdmin
const deleteProduct = asyncHandler(async (req, res) => {
  if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400);
      throw new Error('ID sản phẩm không hợp lệ');
  }
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Không tìm thấy sản phẩm');
  }

  if (req.user.role !== 'admin' && product.distributor.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Không có quyền xóa sản phẩm này');
  }

  await Product.findByIdAndDelete(req.params.id); // Hoặc product.deleteOne() nếu dùng instance method
  res.json({ message: 'Đã xóa sản phẩm' });
});


// @desc    Tìm kiếm & lọc sản phẩm (có phân trang, filter, sort)
// @route   GET /api/products/search  (Hoặc bạn có thể dùng GET /api/products và tích hợp logic này vào getProducts)
// @access  Public
const searchProducts = asyncHandler(async (req, res) => {
  // console.log('[BACKEND] /api/products/search received query:', req.query);

  const page = Math.max(1, parseInt(req.query.pageNumber, 10) || 1);
  const limit = parseInt(req.query.pageSize, 10) || 12; // Lấy pageSize từ query hoặc mặc định 12
  const skip = limit * (page - 1);

  const {
    keyword,
    category,
    province, // Sẽ lọc theo product.origin
    minPrice,
    maxPrice,
    rating,     // Rating từ review của sản phẩm
    sortBy      // popular, newest, priceAsc, priceDesc
  } = req.query;

  // --- Xây dựng filterConditions ---
  const filterConditions = {};

  if (keyword) {
    const regex = new RegExp(keyword, 'i');
    filterConditions.$or = [
      { name: regex },
      { description: regex },
      { category: regex }, // Giả sử category là string, nếu là ID thì cần xử lý khác
      { producer: regex },
      { origin: regex }
    ];
  }

  if (category) {
    filterConditions.category = category; // Giả sử category là string khớp chính xác
  }

  if (province) {
    filterConditions.origin = province; // Lọc theo trường origin của sản phẩm
  }

  const priceFilter = {};
  if (minPrice !== undefined && minPrice !== '' && !isNaN(Number(minPrice))) {
    priceFilter.$gte = Number(minPrice);
  }
  if (maxPrice !== undefined && maxPrice !== '' && !isNaN(Number(maxPrice))) {
    priceFilter.$lte = Number(maxPrice);
  }
  if (Object.keys(priceFilter).length > 0) {
    filterConditions.price = priceFilter;
  }

  if (rating !== undefined && rating !== '' && !isNaN(Number(rating))) {
    filterConditions.rating = { $gte: Number(rating) }; // Lọc sản phẩm có rating >= giá trị truyền vào
  }

  // --- Xây dựng sortOption ---
  const sortOption = {};
  switch (sortBy) {
    case 'priceAsc':
      sortOption.price = 1;
      break;
    case 'priceDesc':
      sortOption.price = -1;
      break;
    case 'newest':
      sortOption.createdAt = -1;
      break;
    case 'popular': // Bạn cần định nghĩa "popular"
      sortOption.sold = -1;         // Ví dụ: Bán chạy nhất
      sortOption.numReviews = -1;   // Nhiều review nhất
      sortOption.rating = -1;       // Rating cao nhất
      break;
    default: // Mặc định là mới nhất nếu sortBy không hợp lệ hoặc không có
      sortOption.createdAt = -1;
  }
  // Luôn thêm _id để đảm bảo thứ tự ổn định khi các giá trị sort chính bằng nhau
  if (Object.keys(sortOption)[0] !== '_id') { // Tránh thêm _id nếu đã sort theo _id
      sortOption._id = 1; // Hoặc -1 tùy bạn muốn
  }


  try {
    const count = await Product.countDocuments(filterConditions);
    const products = await Product.find(filterConditions)
      .sort(sortOption)
      .limit(limit)
      .skip(skip)
      .populate('distributor', 'name distributorInfo.companyName'); // Chỉ populate những trường cần thiết

    res.json({
      products,
      page,
      pages: Math.ceil(count / limit),
      count
    });
  } catch (error) {
    console.error("Error in searchProducts:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi tìm kiếm sản phẩm." });
  }
});

// Export các hàm controllers
module.exports = {
  getProducts,
  getProductById,
  createProduct,
  getMyProducts,
  updateProduct,
  deleteProduct,
  searchProducts 
};