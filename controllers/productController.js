// controllers/productController.js

const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');

// @desc    Lấy tất cả sản phẩm VỚI LỌC, SẮP XẾP, PHÂN TRANG (tiếng Việt, không phân biệt dấu)
const getProducts = asyncHandler(async (req, res) => {
  const {
    keyword,
    category,
    province,
    min_price,
    max_price,
    rating,
    sort_by,
    page = 1,
    pageSize,
    perPage
  } = req.query;

  const limit   = Math.max(1, parseInt(pageSize ?? perPage ?? 12, 10));
  const pageNum = Math.max(1, parseInt(page, 10));
  const skip    = (pageNum - 1) * limit;

  // --- Build filterConditions ---
  const filterConditions = {};

  // 1) Search keyword trên name, description, category
  if (keyword) {
    const regex = new RegExp(keyword, 'i');
    filterConditions.$or = [
      { name:        regex },
      { description: regex },
      { category:    regex }
    ];
  }

  // 2) Category
  if (category) {
    filterConditions.category = new RegExp(category, 'i');
  }

  // 3) Province (origin)
  if (province) {
    filterConditions.origin = new RegExp(province, 'i');
  }

  // 4) Price range
  const priceFilter = {};
  if (!isNaN(Number(min_price))) priceFilter.$gte = Number(min_price);
  if (!isNaN(Number(max_price))) priceFilter.$lte = Number(max_price);
  if (Object.keys(priceFilter).length) filterConditions.price = priceFilter;

  // 5) Rating
  if (!isNaN(Number(rating))) {
    filterConditions.rating = { $gte: Number(rating) };
  }

  // --- Build sortOption ---
  const sortMap = {
    priceAsc:  { price: 1 },
    priceDesc: { price: -1 },
    newest:    { createdAt: -1 },
    popular:   { sold: -1, numReviews: -1, rating: -1 }
  };
  const sortOption = sortMap[sort_by] || { createdAt: -1 };

  // --- Query DB with Vietnamese collation (strength:1 ignores accents + case) ---
  const [count, products] = await Promise.all([
    Product.countDocuments(filterConditions),
    Product.find(filterConditions)
      .collation({ locale: 'vi', strength: 1 })
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('distributor', 'name')
  ]);

  res.json({
    products,
    page:  pageNum,
    pages: Math.ceil(count / limit),
    count
  });
});

// @desc    Lấy một sản phẩm theo ID
// @route   GET /api/products/:id
// @access  Public
const getProductById = asyncHandler(async (req, res) => {
  if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
    res.status(400);
    throw new Error('ID sản phẩm không hợp lệ');
  }
  const product = await Product.findById(req.params.id)
    .populate('distributor', 'name')
    .populate('reviews.user', 'name');

  if (!product) {
    res.status(404);
    throw new Error('Không tìm thấy sản phẩm');
  }
  res.json(product);
});

// @desc    Thêm sản phẩm mới
// @route   POST /api/products
// @access  Private/Distributor (Hoặc Admin)
const createProduct = asyncHandler(async (req, res) => {
  const {
    name, description, images, category, price, countInStock,
    original_id, origin, producer, short_description,
    product_url, ocop_rating, brand
  } = req.body;

  if (!name || !description || !category
    || price === undefined
    || countInStock === undefined
    || original_id === undefined) {
    res.status(400);
    throw new Error('Vui lòng cung cấp đủ thông tin bắt buộc');
  }

  const exists = await Product.findOne({ original_id: Number(original_id) });
  if (exists) {
    res.status(400);
    throw new Error(`Sản phẩm với original_id ${original_id} đã tồn tại.`);
  }

  const product = new Product({
    name,
    description,
    images: Array.isArray(images) ? images : (images ? [images] : []),
    category,
    price: Number(price),
    countInStock: Number(countInStock),
    distributor: req.user._id,
    original_id: Number(original_id),
    origin,
    producer,
    short_description,
    product_url,
    ocop_rating: ocop_rating ? Number(ocop_rating) : null,
    brand
  });

  const created = await product.save();
  res.status(201).json(created);
});

// @desc    Lấy sản phẩm của distributor hiện tại
// @route   GET /api/products/my-products
// @access  Private/Distributor (Hoặc Admin)
const getMyProducts = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = parseInt(req.query.pageSize, 10) || 10;
  const skip  = limit * (page - 1);

  const filter = { distributor: distributorId };

  const [count, products] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
  ]);

  res.json({
    products,
    page,
    pages: Math.ceil(count / limit),
    count
  });
});

// @desc    Cập nhật sản phẩm
// @route   PUT /api/products/:id
// @access  Private/Distributor (Hoặc Admin)
const updateProduct = asyncHandler(async (req, res) => {
  const {
    name, description, images, category, price, countInStock,
    original_id, origin, producer, short_description,
    product_url, ocop_rating, brand
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

  if (req.user.role !== 'admin'
    && product.distributor.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Không có quyền cập nhật sản phẩm này');
  }

  // Cập nhật các trường nếu có
  product.name              = name              ?? product.name;
  product.description       = description       ?? product.description;
  if (Array.isArray(images)) product.images   = images;
  else if (images === null || images === '')  product.images   = [];
  product.category          = category          ?? product.category;
  if (price !== undefined)       product.price       = Number(price);
  if (countInStock !== undefined) product.countInStock = Number(countInStock);

  if (original_id !== undefined
    && Number(original_id) !== product.original_id) {
    const exists = await Product.findOne({
      original_id: Number(original_id),
      _id: { $ne: product._id }
    });
    if (exists) {
      res.status(400);
      throw new Error(`original_id ${original_id} đã được sử dụng.`);
    }
    product.original_id = Number(original_id);
  }

  product.origin            = origin            ?? product.origin;
  product.producer          = producer          ?? product.producer;
  product.short_description = short_description ?? product.short_description;
  product.product_url       = product_url       ?? product.product_url;
  if (ocop_rating !== undefined) product.ocop_rating = Number(ocop_rating) || null;
  product.brand             = brand             ?? product.brand;

  const updated = await product.save();
  res.json(updated);
});

// @desc    Xóa sản phẩm
// @route   DELETE /api/products/:id
// @access  Private/Distributor (Hoặc Admin)
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
  if (req.user.role !== 'admin'
    && product.distributor.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Không có quyền xóa');
  }
  await Product.deleteOne({ _id: product._id });
  res.json({ message: 'Đã xóa sản phẩm' });
});

// @desc    Autocomplete tên sản phẩm (bắt đầu bằng) 
// @route   GET /api/products/autocomplete?query=…
// @access  Public
const autocomplete = asyncHandler(async (req, res) => {
  const { query } = req.query;
  if (!query) return res.json([]);

  const regex = new RegExp('^' + query, 'i');
  const suggestions = await Product.find(
    { name: regex },
    { name: 1 }
  )
    .collation({ locale: 'vi', strength: 1 })
    .limit(10)
    .lean();

  res.json(suggestions.map(s => s.name));
});

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  getMyProducts,
  updateProduct,
  deleteProduct,
  autocomplete
};