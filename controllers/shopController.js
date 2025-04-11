const User = require('../models/User'); 
const Shop = require('../models/Shop'); 

const createShop = async (req, res) => {
    try {
      const { shopName, description, logo, banners } = req.body;
  
      // Kiểm tra xem người dùng tồn tại hay không
      const user = await User.findById(req.user._id);
      if (!user) {
        return res.status(404).json({ message: 'Người dùng không tồn tại' });
      }
  
      // Kiểm tra xem người dùng đã có cửa hàng hay chưa
      if (user.shop) {
        return res.status(400).json({ message: 'Bạn đã có cửa hàng' });
      }
  
      // Tạo cửa hàng mới
      const shop = new Shop({
        owner: req.user._id,
        name: shopName,
        description: description || '', // Đảm bảo giá trị không bị undefined
        logo: logo || '', // Gán giá trị rỗng nếu logo không được cung cấp
        banners: banners || [] // Gán mảng rỗng nếu không có banners
      });
  
      const createdShop = await shop.save();
  
      // Cập nhật thông tin người dùng
      user.role = 'seller';
      user.shop = createdShop._id;
      await user.save();
  
      // Trả về thông tin cửa hàng vừa tạo
      res.status(201).json({
        message: 'Tạo cửa hàng thành công',
        shop: createdShop
      });
    } catch (error) {
      console.error(error); // Để hỗ trợ debug
      res.status(500).json({ message: 'Đã xảy ra lỗi, vui lòng thử lại sau' });
    }
  };
  
  module.exports = { createShop };