const asyncHandler = require('express-async-handler'); // Import asyncHandler
const Product = require('../models/Product');
const User = require('../models/User'); // Import User model để tìm distributor

// @desc    Lấy tất cả sản phẩm (có thể dùng cho trang sản phẩm chung hoặc API gốc)
// @route   GET /api/products
// @access  Public
const getProducts = asyncHandler(async (req, res) => {
  // Có thể thêm logic phân trang/sắp xếp đơn giản ở đây nếu cần endpoint riêng
  // Ví dụ lấy 12 sản phẩm mới nhất
  const pageSize = 12;
  const page = Number(req.query.pageNumber) || 1;

  const count = await Product.countDocuments({});
  const products = await Product.find({})
    .sort({ createdAt: -1 }) // Sắp xếp mới nhất
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .populate('distributor', 'name distributorInfo.companyName'); // Lấy tên NPP

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
  const product = await Product.findById(req.params.id)
                              .populate('distributor', 'name distributorInfo.companyName'); // Lấy tên NPP

  if (product) {
    res.json(product);
  } else {
    res.status(404);
    throw new Error('Không tìm thấy sản phẩm');
  }
});

// @desc    Thêm sản phẩm mới (cho nhà phân phối)
// @route   POST /api/products
// @access  Private/Distributor (Hoặc Admin)
const createProduct = asyncHandler(async (req, res) => {
   // Chỉ distributor hoặc admin mới được tạo sản phẩm
   if (req.user.role !== 'distributor' && req.user.role !== 'admin') {
       res.status(403);
       throw new Error('Không có quyền tạo sản phẩm');
   }

  // Lấy dữ liệu từ body, đảm bảo chỉ lấy các trường cho phép
   const {
       name,
       description,
       images, // Nên là mảng URLs
       category,
       price,
       countInStock,
       // Thêm các trường khác nếu có: brand, specifications, etc.
   } = req.body;

   // Validation cơ bản
   if (!name || !description || !category || price === undefined || countInStock === undefined) {
       res.status(400);
       throw new Error('Vui lòng cung cấp đủ thông tin bắt buộc: tên, mô tả, danh mục, giá, tồn kho.');
   }

  const product = new Product({
    name,
    description,
    images: Array.isArray(images) ? images : [], // Đảm bảo images là mảng
    category,
    price: Number(price) || 0,
    countInStock: Number(countInStock) || 0,
    distributor: req.user._id, // Gán distributor là user đang tạo
    user: req.user._id, // Có thể lưu cả user tạo (nếu admin tạo thay NPP)
    // Các trường khác sẽ lấy giá trị default từ schema
  });

  const createdProduct = await product.save();
  res.status(201).json(createdProduct);
});

// @desc    Lấy tất cả sản phẩm của distributor hiện tại
// @route   GET /api/products/my-products
// @access  Private/Distributor (Hoặc Admin)
const getMyProducts = asyncHandler(async (req, res) => {
   // Chỉ distributor hoặc admin mới xem được (admin xem của chính mình?)
   // Nếu admin xem của người khác thì cần route /api/users/:userId/products
   if (req.user.role !== 'distributor' && req.user.role !== 'admin') {
       res.status(403);
       throw new Error('Chỉ nhà phân phối hoặc admin mới xem được sản phẩm này');
   }

    // Lấy sản phẩm của distributor đang đăng nhập
   const products = await Product.find({ distributor: req.user._id }).sort({ createdAt: -1 });
   res.json(products); // API này có cần phân trang không? Hiện tại đang trả về tất cả.
});

// @desc    Cập nhật sản phẩm
// @route   PUT /api/products/:id
// @access  Private/Distributor (Hoặc Admin)
const updateProduct = asyncHandler(async (req, res) => {
  const { name, description, images, category, price, countInStock, ...otherData } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Không tìm thấy sản phẩm');
  }

  // Kiểm tra quyền: Chỉ admin hoặc chủ sở hữu sản phẩm mới được sửa
  if (req.user.role !== 'admin' && product.distributor.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Không có quyền cập nhật sản phẩm này');
  }

  // Cập nhật các trường
  product.name = name || product.name;
  product.description = description || product.description;
  product.category = category || product.category;
  // Chỉ cập nhật nếu giá trị được cung cấp và hợp lệ
  if (price !== undefined && !isNaN(Number(price)) && Number(price) >= 0) {
     product.price = Number(price);
  }
  if (countInStock !== undefined && !isNaN(Number(countInStock)) && Number(countInStock) >= 0) {
      product.countInStock = Number(countInStock);
  }
  if (Array.isArray(images)) { // Cập nhật mảng ảnh
      product.images = images;
  }
   // Cập nhật các trường khác nếu có trong otherData và được phép

  const updatedProduct = await product.save();
  res.json(updatedProduct);
});

// @desc    Xóa sản phẩm
// @route   DELETE /api/products/:id
// @access  Private/Distributor (Hoặc Admin)
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    res.status(404);
    throw new Error('Không tìm thấy sản phẩm');
  }

   // Kiểm tra quyền: Chỉ admin hoặc chủ sở hữu sản phẩm mới được xóa
  if (req.user.role !== 'admin' && product.distributor.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Không có quyền xóa sản phẩm này');
  }

  // Thực hiện xóa
  await Product.deleteOne({ _id: req.params.id });
  res.json({ message: 'Đã xóa sản phẩm' });
});

// @desc    Tìm kiếm và lọc sản phẩm (Nâng cao)
// @route   GET /api/products/search (Hoặc gộp vào GET /api/products)
// @access  Public
const searchProducts = asyncHandler(async (req, res) => {
    const {
        keyword,
        category,
        province, // Tham số lọc theo tỉnh
        minPrice,
        maxPrice,
        rating,
        sortBy,
        pageNumber,
        pageSize
    } = req.query;

    const limit = Number(pageSize) || 12; // Số sản phẩm/trang
    const page = Number(pageNumber) || 1;
    if (page < 1) page = 1; // Đảm bảo trang >= 1
    if (limit < 1) limit = 12; // Đảm bảo giới hạn hợp lệ

    // --- Xây dựng Query ---
    const filterConditions = {};
    let distributorIds = null;

    // 1. Lọc theo Tỉnh/Thành phố (liên kết với Distributor)
    if (province) {
        try {
            const distributors = await User.find({
                role: 'distributor',
                isActive: true,
                'distributorInfo.status': 'approved',
                $or: [
                    // **QUAN TRỌNG**: Điều chỉnh logic này theo cách lưu 'distributionArea'
                    { 'distributorInfo.distributionArea': province }, // Nếu lưu là chuỗi
                    { 'distributorInfo.distributionArea': 'Toàn quốc' },
                    // { 'distributorInfo.distributionArea': { $in: [province, 'Toàn quốc'] } } // Nếu lưu là mảng
                ]
            }).select('_id');

            distributorIds = distributors.map(d => d._id);

            if (distributorIds.length === 0) {
               console.log(`Không tìm thấy NPP hoạt động/duyệt nào phục vụ tỉnh: ${province}`);
               return res.json({ products: [], page: 1, pages: 0, count: 0 });
            }
            // Thêm điều kiện lọc theo distributor
            filterConditions.distributor = { $in: distributorIds };

        } catch (distributorError) {
            console.error("Lỗi tìm nhà phân phối theo tỉnh:", distributorError);
            res.status(500);
            throw new Error("Lỗi máy chủ khi tìm nhà phân phối.");
        }
    }

    // 2. Lọc theo Keyword (tìm trong tên, mô tả, danh mục)
    if (keyword) {
        const keywordRegex = { $regex: keyword, $options: 'i' };
        filterConditions.$or = [
          { name: keywordRegex },
          { description: keywordRegex },
          { category: keywordRegex } // Tìm cả trong category
        ];
    }

    // 3. Lọc theo Category (chính xác)
    if (category) {
        filterConditions.category = category;
    }

    // 4. Lọc theo Giá
    const priceFilter = {};
    const numMinPrice = Number(minPrice);
    const numMaxPrice = Number(maxPrice);
    if (!isNaN(numMinPrice) && numMinPrice >= 0) {
        priceFilter.$gte = numMinPrice;
    }
    if (!isNaN(numMaxPrice) && numMaxPrice >= 0 && (numMinPrice === undefined || numMaxPrice >= numMinPrice)) {
        priceFilter.$lte = numMaxPrice;
    }
    if (Object.keys(priceFilter).length > 0) {
        filterConditions.price = priceFilter;
    }

    // 5. Lọc theo Rating (nếu cần)
    const numRating = Number(rating);
    if (!isNaN(numRating) && numRating >= 0 && numRating <= 5) {
        filterConditions.rating = { $gte: numRating };
    }

    // --- Sắp xếp ---
    const sortOption = {};
    switch (sortBy) {
        case 'newest':
            sortOption.createdAt = -1;
            break;
        case 'priceAsc':
            sortOption.price = 1;
            break;
        case 'priceDesc':
            sortOption.price = -1;
            break;
        case 'topRated':
            sortOption.rating = -1;
            break;
        case 'mostSold': // Phổ biến có thể dựa vào số lượng bán
            sortOption.sold = -1;
            break;
        case 'popular': // Có thể dùng mostSold làm popular hoặc kết hợp nhiều yếu tố
             sortOption.sold = -1; // Ví dụ: popular = mostSold
             break;
        default:
            sortOption.createdAt = -1; // Mặc định mới nhất
    }

    // --- Thực hiện Truy vấn & Phân trang ---
    try {
        const count = await Product.countDocuments(filterConditions);
        const products = await Product.find(filterConditions)
                                     .sort(sortOption)
                                     .limit(limit)
                                     .skip(limit * (page - 1))
                                     .populate('distributor', 'name distributorInfo.companyName'); // Populate NPP

        res.json({
            products,
            page,
            pages: Math.ceil(count / limit),
            count
        });
    } catch (queryError) {
         console.error("Lỗi truy vấn sản phẩm:", queryError);
         res.status(500);
         throw new Error("Lỗi máy chủ khi truy vấn sản phẩm.");
    }
});


module.exports = {
  getProducts,
  getProductById,
  createProduct,
  getMyProducts,
  updateProduct,
  deleteProduct,
  searchProducts, 
};