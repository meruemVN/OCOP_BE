const Product = require('../models/Product');

// Lấy tất cả sản phẩm
const getProducts = async (req, res) => {
  try {
    const products = await Product.find({});
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lấy một sản phẩm theo ID
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Thêm sản phẩm mới
const createProduct = async (req, res) => {
  try {
    const product = new Product(req.body);
    const createdProduct = await product.save();
    res.status(201).json(createdProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Cập nhật sản phẩm
const updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      Object.assign(product, req.body);
      const updatedProduct = await product.save();
      res.json(updatedProduct);
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Xóa sản phẩm
const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (product) {
      await product.remove();
      res.json({ message: 'Đã xóa sản phẩm' });
    } else {
      res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

//Tìm kiếm sản phẩm
const searchProducts = async (req, res) => {
    try {
      const keyword = req.query.keyword
        ? {
            $or: [
              { name: { $regex: req.query.keyword, $options: 'i' } },
              { description: { $regex: req.query.keyword, $options: 'i' } }
            ]
          }
        : {};
        
      const category = req.query.category ? { category: req.query.category } : {};
      const minPrice = req.query.minPrice ? { price: { $gte: Number(req.query.minPrice) } } : {};
      const maxPrice = req.query.maxPrice ? { price: { $lte: Number(req.query.maxPrice) } } : {};
      const rating = req.query.rating ? { rating: { $gte: Number(req.query.rating) } } : {};
      
      const sortOption = {};
      if (req.query.sortBy) {
        if (req.query.sortBy === 'newest') sortOption.createdAt = -1;
        if (req.query.sortBy === 'priceAsc') sortOption.price = 1;
        if (req.query.sortBy === 'priceDesc') sortOption.price = -1;
        if (req.query.sortBy === 'topRated') sortOption.rating = -1;
        if (req.query.sortBy === 'mostSold') sortOption.sold = -1;
      }
      
      const pageSize = Number(req.query.pageSize) || 20;
      const page = Number(req.query.pageNumber) || 1;
      
      const count = await Product.countDocuments({
        ...keyword,
        ...category,
        ...minPrice,
        ...maxPrice,
        ...rating
      });
      
      const products = await Product.find({
        ...keyword,
        ...category,
        ...minPrice,
        ...maxPrice,
        ...rating
      })
        .sort(sortOption)
        .limit(pageSize)
        .skip(pageSize * (page - 1))
        .populate('shop', 'name logo rating');
        
      res.json({
        products,
        page,
        pages: Math.ceil(count / pageSize),
        count
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
};