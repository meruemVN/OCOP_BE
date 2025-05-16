// controllers/productController.js
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product'); // Đảm bảo đường dẫn đúng

// @desc    Lấy tất cả sản phẩm VỚI LỌC, SẮP XẾP, PHÂN TRANG
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  // console.log('[API GET /products] Query params:', req.query);

  // --- Phân trang ---
  const page = Math.max(1, parseInt(req.query.pageNumber || req.query.page, 10) || 1);
  const limit = parseInt(req.query.pageSize || req.query.per_page, 10) || 12;
  const skip = limit * (page - 1);

  // --- Lọc và Sắp xếp ---
  // Frontend (Vuex action fetchMainProducts) gửi: category, province, min_price, max_price, sort_by, keyword (nếu có)
  const {
    keyword,    // Cho tìm kiếm text
    category,
    province,   // Sẽ lọc theo trường `origin` của Product model
    rating,     // Lọc theo rating sản phẩm
  } = req.query;
  const minPrice = req.query.min_price; // Nhận từ query string
  const maxPrice = req.query.max_price; // Nhận từ query string
  const sortBy = req.query.sort_by;     // Nhận từ query string

  // --- Xây dựng filterConditions cho MongoDB query ---
  const filterConditions = {};

  // 1. Lọc theo Keyword (Text Search trên các trường đã index text)
  if (keyword) {
    // Sử dụng $text search nếu bạn đã tạo text index (ví dụ: trên name, category, description)
    // productSchema.index({ name: 'text', category: 'text', description: 'text' });
    filterConditions.$text = { $search: keyword };
    // Nếu không dùng $text search, bạn có thể dùng regex trên nhiều trường:
    // const regex = new RegExp(keyword, 'i');
    // filterConditions.$or = [
    //   { name: regex },
    //   { description: regex },
    //   { category: regex }
    // ];
  }

  // 2. Lọc theo Category (khớp chính xác hoặc chuỗi con, tùy bạn muốn)
  if (category) {
    // filterConditions.category = category; // Khớp chính xác (case-sensitive)
    filterConditions.category = new RegExp(category, 'i'); // Khớp chuỗi con, không phân biệt hoa thường
  }

  // 3. Lọc theo Province (dựa trên trường 'origin')
  if (province) {
    filterConditions.origin = new RegExp(province, 'i'); // Khớp chuỗi con, không phân biệt hoa thường
  }

  // 4. Lọc theo Khoảng giá
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

  // 5. Lọc theo Rating (sản phẩm có rating >= giá trị truyền vào)
  if (rating !== undefined && rating !== '' && !isNaN(Number(rating))) {
    filterConditions.rating = { $gte: Number(rating) };
  }
  
  // --- Xây dựng sortOption cho MongoDB query ---
  const sortOption = {};
  switch (sortBy) {
    case 'priceAsc':
      sortOption.price = 1; // Tăng dần
      break;
    case 'priceDesc':
      sortOption.price = -1; // Giảm dần
      break;
    case 'newest':
      sortOption.createdAt = -1; // Mới nhất (dựa trên timestamp `createdAt`)
      break;
    case 'popular':
      // Ưu tiên sắp xếp theo 'sold', sau đó 'numReviews', rồi 'rating'
      if ('sold' in Product.schema.paths) sortOption.sold = -1;
      else if ('numReviews' in Product.schema.paths) sortOption.numReviews = -1;
      else if ('rating' in Product.schema.paths) sortOption.rating = -1;
      else sortOption.createdAt = -1; // Fallback nếu không có trường nào rõ ràng
      break;
    default: // Mặc định sắp xếp theo mới nhất nếu sortBy không hợp lệ hoặc không có
      sortOption.createdAt = -1;
  }
  // Thêm _id để đảm bảo thứ tự sắp xếp ổn định khi các giá trị chính bằng nhau
  // và tránh trường hợp chỉ sort theo createdAt nếu không có sortBy nào khớp
  if (Object.keys(sortOption).length === 0 || (Object.keys(sortOption).length === 1 && sortOption.createdAt)) {
    // Nếu chỉ có createdAt hoặc không có sort gì, thêm _id
    if(Object.keys(sortOption)[0] !== '_id') sortOption._id = 1; // Hoặc -1
  } else if (Object.keys(sortOption)[0] !== '_id' && Object.keys(sortOption).length > 0) {
     sortOption._id = 1; // Thêm vào các trường hợp sort khác
  }


  try {
    // console.log("[BACKEND] getProducts - filterConditions:", JSON.stringify(filterConditions));
    // console.log("[BACKEND] getProducts - sortOption:", JSON.stringify(sortOption));

    const count = await Product.countDocuments(filterConditions);
    const products = await Product.find(filterConditions)
      .sort(sortOption)
      .limit(limit)
      .skip(skip)
      .populate('distributor', 'name'); // Chỉ lấy tên nhà phân phối

    res.json({
      products,
      page,
      pages: Math.ceil(count / limit), // Tổng số trang
      count // Tổng số sản phẩm khớp với điều kiện lọc
    });
  } catch (error) {
    console.error("Error in getProducts (merged logic):", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách sản phẩm." });
  }
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
    .populate('distributor', 'name') // Lấy tên nhà phân phối
    .populate('reviews.user', 'name'); // Lấy tên người review

  if (!product) {
    res.status(404);
    throw new Error('Không tìm thấy sản phẩm');
  }
  res.json(product);
});

// @desc    Thêm sản phẩm mới
// @route   POST /api/products
// @access  Private/Distributor (Hoặc Admin nếu middleware authorize cho phép)
const createProduct = asyncHandler(async (req, res) => {
  // Middleware `protect` đã cung cấp req.user
  // Middleware `distributor` (hoặc `authorize(['distributor', 'admin'])`) đã kiểm tra quyền
  const {
    name, description, images, category, price, countInStock,
    original_id, origin, producer, short_description, product_url, ocop_rating, brand
  } = req.body;

  if (!name || !description || !category || price === undefined || countInStock === undefined || original_id === undefined) {
    res.status(400);
    throw new Error('Vui lòng cung cấp đủ thông tin bắt buộc: name, description, category, price, countInStock, original_id');
  }
  // Kiểm tra original_id đã tồn tại chưa (vì nó là unique)
  const existingProductByOriginalId = await Product.findOne({ original_id: Number(original_id) });
  if (existingProductByOriginalId) {
      res.status(400);
      throw new Error(`Sản phẩm với original_id ${original_id} đã tồn tại.`);
  }

  const product = new Product({
    name, description,
    images: Array.isArray(images) ? images : (images ? [images] : []),
    category,
    price: Number(price),
    countInStock: Number(countInStock),
    distributor: req.user._id, // Người tạo sản phẩm
    original_id: Number(original_id),
    origin, producer, short_description, product_url,
    ocop_rating: ocop_rating ? Number(ocop_rating) : null,
    brand
  });

  const createdProduct = await product.save();
  res.status(201).json(createdProduct);
});

// @desc    Lấy sản phẩm của chính distributor hiện tại
// @route   GET /api/products/my-products
// @access  Private/Distributor (Hoặc Admin nếu middleware authorize cho phép)
const getMyProducts = asyncHandler(async (req, res) => {
  const distributorId = req.user._id;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = parseInt(req.query.pageSize, 10) || 10; // pageSize từ FE
  const skip = limit * (page - 1);

  const filterConditions = { distributor: distributorId };

  try {
    const count = await Product.countDocuments(filterConditions);
    const products = await Product.find(filterConditions)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);
      // Không cần populate distributor nữa vì đã lọc theo distributorId

    res.json({
      products,
      page,
      pages: Math.ceil(count / limit),
      count
    });
  } catch (dbError) {
    console.error("Error during MongoDB query in getMyProducts:", dbError);
    res.status(500).json({ message: "Lỗi truy vấn cơ sở dữ liệu." });
  }
});


// @desc    Cập nhật sản phẩm
// @route   PUT /api/products/:id
// @access  Private/Distributor (Hoặc Admin)
const updateProduct = asyncHandler(async (req, res) => {
  const {
    name, description, images, category, price, countInStock,
    original_id, origin, producer, short_description, product_url, ocop_rating, brand,
  } = req.body;

  if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400); throw new Error('ID sản phẩm không hợp lệ');
  }
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404); throw new Error('Không tìm thấy sản phẩm');
  }

  // Chỉ admin hoặc chủ sở hữu (distributor) sản phẩm mới được cập nhật
  if (req.user.role !== 'admin' && product.distributor.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Không có quyền cập nhật sản phẩm này');
  }

  // Cập nhật các trường
  product.name = name ?? product.name;
  product.description = description ?? product.description;
  if (Array.isArray(images)) product.images = images; // Chỉ cập nhật nếu images là mảng (cho phép xóa hết ảnh nếu gửi mảng rỗng)
  else if (images === null || images === '') product.images = []; // Xóa hết ảnh nếu gửi null hoặc rỗng
  
  product.category = category ?? product.category;
  if (price !== undefined) product.price = Number(price);
  if (countInStock !== undefined) product.countInStock = Number(countInStock);
  
  // Cẩn thận khi cập nhật original_id nếu nó là unique
  if (original_id !== undefined && Number(original_id) !== product.original_id) {
    const existing = await Product.findOne({ original_id: Number(original_id), _id: { $ne: product._id } });
    if (existing) {
        res.status(400); throw new Error(`original_id ${original_id} đã được sử dụng bởi sản phẩm khác.`);
    }
    product.original_id = Number(original_id);
  }

  product.origin = origin ?? product.origin;
  product.producer = producer ?? product.producer;
  product.short_description = short_description ?? product.short_description;
  product.product_url = product_url ?? product.product_url;
  if (ocop_rating !== undefined) product.ocop_rating = Number(ocop_rating) || null;
  product.brand = brand ?? product.brand;

  const updatedProduct = await product.save();
  res.json(updatedProduct);
});

// @desc    Xóa sản phẩm
// @route   DELETE /api/products/:id
// @access  Private/Distributor (Hoặc Admin)
const deleteProduct = asyncHandler(async (req, res) => {
  if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      res.status(400); throw new Error('ID sản phẩm không hợp lệ');
  }
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404); throw new Error('Không tìm thấy sản phẩm');
  }

  if (req.user.role !== 'admin' && product.distributor.toString() !== req.user._id.toString()) {
    res.status(403); throw new Error('Không có quyền xóa sản phẩm này');
  }

  await Product.deleteOne({ _id: product._id }); // Sử dụng deleteOne trên model
  res.json({ message: 'Đã xóa sản phẩm' });
});

// Hàm searchProducts có thể được loại bỏ nếu getProducts đã bao gồm tìm kiếm keyword
// Hoặc bạn có thể giữ nó cho một loại tìm kiếm phức tạp hơn (ví dụ: full-text search mạnh mẽ hơn)
// Hiện tại, tôi sẽ comment nó ra vì getProducts đã có lọc theo keyword (nếu bạn dùng $text index).
/*
const searchProducts = asyncHandler(async (req, res) => {
  // ... (Logic cũ của bạn cho /api/products/search nếu muốn giữ)
  // Nếu giữ, đảm bảo nó khác với getProducts, ví dụ chỉ tập trung vào text search
  // và có thể không cần tất cả các filter/sort khác.
  res.status(501).json({ message: "Search endpoint not fully implemented, use GET /api/products with query params."})
});
*/

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  getMyProducts,
  updateProduct,
  deleteProduct,
  // searchProducts, // Bỏ comment nếu bạn vẫn muốn dùng route /api/products/search riêng
};