// controllers/productController.js

const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');

// @desc    Lấy tất cả sản phẩm VỚI LỌC, SẮP XẾP, PHÂN TRANG (tiếng Việt, không phân biệt dấu)
const getProducts = asyncHandler(async (req, res) => {
  try { // Bọc trong try...catch để debug lỗi 500 dễ hơn
    const {
      keyword,
      category,
      origin,
      priceMin,
      priceMax,
      rating,
      sort_by,
      page,    // Biến 'page' từ req.query (nên là string số, ví dụ '1', '2')
      per_page // Biến 'per_page' từ req.query (nên là string số, ví dụ '12')
    } = req.query;

    // Sử dụng biến 'localPerPage' để rõ ràng hơn sau khi lấy từ query.
    // Nếu frontend gửi 'perPage' (camelCase), bạn cần destruct 'perPage' thay vì 'per_page'.
    const localPerPage = per_page;

    console.log("Backend received req.query:", req.query);
    console.log("Backend keyword:", keyword);
    console.log("Backend page from query:", page, "(type:", typeof page, ")");
    console.log("Backend localPerPage from query (per_page):", localPerPage, "(type:", typeof localPerPage, ")");

    // --- Build filterConditions ---
    const filterConditions = {};
    if (keyword && keyword.trim() !== '') {
      const regex = new RegExp(keyword, 'i'); // 'i' for case-insensitive
      filterConditions.$or = [
        { name: regex },
        { description: regex },
        { category: regex } // Có thể bạn muốn tìm cả trong category nữa
      ];
    }
    if (category) {
      filterConditions.category = new RegExp(category, 'i');
    }
    if (origin) {
      filterConditions.origin = new RegExp(origin, 'i');
    }
    const priceFilter = {};
    if (priceMin !== undefined && !isNaN(Number(priceMin)) && Number(priceMin) >= 0) {
      priceFilter.$gte = Number(priceMin);
    }
    if (priceMax !== undefined && !isNaN(Number(priceMax)) && Number(priceMax) >= 0) {
      if (priceFilter.$gte === undefined || Number(priceMax) >= priceFilter.$gte) {
        priceFilter.$lte = Number(priceMax);
      } else {
        console.warn("priceMax is less than priceMin, ignoring priceMax.");
      }
    }
    if (Object.keys(priceFilter).length > 0) {
      filterConditions.price = priceFilter;
    }
    if (rating !== undefined && !isNaN(Number(rating))) {
      filterConditions.rating = { $gte: Number(rating) };
    }
    console.log("Backend filterConditions:", JSON.stringify(filterConditions));

    // --- Build sortOption ---
    const sortMap = {
      priceAsc:  { price: 1, _id: 1 },        // Sắp xếp phụ theo _id để ổn định
      priceDesc: { price: -1, _id: 1 },       // Sắp xếp phụ theo _id
      newest:    { createdAt: -1, _id: 1 },   // Sắp xếp phụ theo _id
      popular:   { sold: -1, numReviews: -1, rating: -1, _id: 1 } // Sắp xếp phụ theo _id
    };
    // Mặc định sắp xếp theo newest nếu sort_by không hợp lệ hoặc không được cung cấp
    const sortOption = sortMap[sort_by] || { createdAt: -1, _id: 1 };
    console.log("Backend sortOption:", JSON.stringify(sortOption));

    // --- Query DB ---
    console.log("Backend: Counting documents...");
    const count = await Product.countDocuments(filterConditions);
    console.log("Backend: Counted documents:", count);

    let productsQuery = Product.find(filterConditions)
      .collation({ locale: 'vi', strength: 1 }) // Hỗ trợ tiếng Việt không dấu, không phân biệt hoa thường
      .sort(sortOption);

    let isPagingEnabled = false;
    let pageNumValueForQuery = 1; // Giá trị mặc định cho số trang sẽ sử dụng trong query

    // Phân trang chỉ được kích hoạt nếu cả 'page' và 'localPerPage' (tức 'per_page') được cung cấp
    if (localPerPage !== undefined && page !== undefined) {
      isPagingEnabled = true;
      // Chuyển đổi page từ query (string) sang số
      const parsedPage = parseInt(page, 10);
      if (isNaN(parsedPage) || parsedPage < 1) {
        console.warn(`Invalid page value received: '${page}'. Defaulting to page 1.`);
        pageNumValueForQuery = 1;
      } else {
        pageNumValueForQuery = parsedPage;
      }
    }
    console.log("Backend isPagingEnabled:", isPagingEnabled, "Using pageNumForQuery:", pageNumValueForQuery);

    if (isPagingEnabled) {
      const parsedLimit = parseInt(localPerPage, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        console.error(`!!!! Invalid localPerPage value received: '${localPerPage}'. Cannot perform pagination. !!!!`);
        // Có thể throw lỗi ở đây hoặc trả về lỗi 400 Bad Request
        // throw new Error("Giá trị 'per_page' không hợp lệ.");
        // Hoặc, nếu muốn an toàn hơn, không phân trang và trả về lỗi
        isPagingEnabled = false; // Tắt phân trang nếu limit không hợp lệ
        console.log("Backend: Pagination disabled due to invalid per_page. Fetching all matching query (if any).");
      } else {
        const limitValue = Math.max(1, parsedLimit); // Đảm bảo limit ít nhất là 1
        const skipValue = (pageNumValueForQuery - 1) * limitValue;
        productsQuery = productsQuery.skip(skipValue).limit(limitValue);
        console.log(`Backend Paging: skip=${skipValue}, limit=${limitValue} for pageNumValueForQuery: ${pageNumValueForQuery}`);
      }
    } else {
      console.log("Backend NOT Paging (either no page/per_page params, or due to keyword search from FE logic)");
    }

    console.log("Backend: Finding products...");
    const products = await productsQuery.populate('distributor', 'name'); // Populate thông tin nhà phân phối
    console.log("Backend products found:", products.length);

    // --- Chuẩn bị dữ liệu trả về ---
    let responsePages = 1; // Mặc định là 1 trang nếu không phân trang
    let responsePageNum = 1; // Mặc định là trang 1

    if (isPagingEnabled) {
      const limitForCalc = Math.max(1, parseInt(localPerPage, 10)); // Đảm bảo đã parse và hợp lệ
      if (!isNaN(limitForCalc) && limitForCalc > 0) { // Chỉ tính toán nếu limit hợp lệ
        responsePages = Math.ceil(count / limitForCalc);
      } else {
        responsePages = 1; // Nếu limit không hợp lệ, coi như 1 trang
      }
      responsePageNum = pageNumValueForQuery; // Số trang trả về là số trang đã dùng để query
    } else {
      // Nếu không phân trang (ví dụ: tìm theo keyword), thì chỉ có 1 trang kết quả
      responsePages = 1;
      responsePageNum = 1;
    }
    // Đảm bảo responsePageNum không lớn hơn responsePages (trường hợp page query lớn hơn tổng số trang)
    if (responsePageNum > responsePages && responsePages > 0) {
        responsePageNum = responsePages;
    }
    // Đảm bảo responsePageNum ít nhất là 1
    if (responsePages === 0 && count > 0) { // Nếu có sản phẩm nhưng responsePages = 0 (do lỗi tính toán)
        responsePages = 1; // Ít nhất là 1 trang
    }
     if (responsePages === 0 && count === 0) { // Không có sản phẩm nào
        responsePageNum = 1; // Vẫn là trang 1
    }


    const responseJson = {
      products,
      page: responsePageNum,
      pages: responsePages,
      count
    };
    console.log("Backend final responseJson.page:", responseJson.page, "responseJson.pages:", responseJson.pages, "responseJson.count:", responseJson.count);
    res.json(responseJson);

  } catch (error) {
    console.error("!!!! FATAL ERROR IN getProducts !!!!:", error);
    console.error("Error stack trace:", error.stack);
    // Trả về lỗi 500 nếu có bất kỳ lỗi nào không mong muốn xảy ra
    res.status(500).json({ message: "Lỗi máy chủ nội bộ khi lấy danh sách sản phẩm.", errorDetails: error.message });
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