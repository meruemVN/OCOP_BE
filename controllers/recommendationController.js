const recommenderService = require('../services/recommender.service');
const asyncHandler = require('express-async-handler'); 
const Order = require('../models/Order');

// --- Helper Function để lấy lịch sử tương tác (VÍ DỤ - BẠN CẦN THAY THẾ LOGIC THỰC) ---
async function getUserInteractionHistory(userId) {
    try {
        const orders = await Order.find({ user: userId }).select('orderItems.original_id').lean();
        if (!orders || orders.length === 0) return [];
        const interactedOriginalProductIds = new Set();
        orders.forEach(order => {
            order.orderItems?.forEach(item => {
                if (item.original_id !== undefined && item.original_id !== null) {
                    interactedOriginalProductIds.add(String(item.original_id));
                }
            });
        });
        return Array.from(interactedOriginalProductIds);

    } catch (error) {
        console.error(`[RecController] Error fetching interaction history for ${userId}:`, error);
        return []; 
    }
}
// --- Kết thúc Helper Function ---

exports.getRecommendationsForProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const topN = req.query.top_n ? parseInt(req.query.top_n, 10) : 10;

        if (!productId) return res.status(400).json({ error: 'Product ID parameter is required.' });
        if (isNaN(topN) || topN <= 0 || topN > 50) return res.status(400).json({ error: 'Invalid top_n parameter (1-50).' });
        
        const result = await recommenderService.getRecommendations(productId, topN);

        if (result.error) {
            console.warn(`[Controller] ProductRec Error for ${productId}:`, result.error, result.trace || '');
            const errorMsg = String(result.error).toLowerCase();
            if (errorMsg.includes("not found")) return res.status(404).json({ error: result.error });
            return res.status(400).json({ error: result.error }); // Lỗi từ Python
        }
        // Python trả về: { product_id_input: ..., recommendations: [...] }
        res.status(200).json({ recommendations: result.recommendations || [] });
    } catch (e) { // Lỗi từ service hoặc lỗi không bắt được từ Python
        console.error("[Controller] Uncaught ProductRec Error:", e.error || e.message, e.trace || '');
        res.status(500).json({ error: e.error || 'Internal server error processing product recommendations.' });
    }
};

exports.getRecommendationsForUser = asyncHandler(async (req, res) => {
    // const userId = req.user._id; // Nếu bạn muốn gợi ý cho người dùng đang đăng nhập
    const { userId } = req.params; // Nếu bạn muốn admin hoặc người khác có thể gọi cho một user cụ thể
                                 // Trong trường hợp này, cần kiểm tra quyền nếu userId !== req.user._id
    const topN = req.query.top_n ? parseInt(req.query.top_n, 10) : 10;

    if (!userId) {
        res.status(400); // Bad Request
        throw new Error('User ID is required to get recommendations.');
    }
    if (isNaN(topN) || topN <= 0 || topN > 50) { // Giới hạn topN
        res.status(400);
        throw new Error('Invalid top_n parameter. Must be a positive integer (1-50).');
    }

    // Lấy lịch sử tương tác (mua hàng) của người dùng
    const interactedPids = await getUserInteractionHistory(userId);
    // interactedPids là mảng các product_id (dạng chuỗi)

    const result = await recommenderService.getUserRecommendations(userId.toString(), topN, interactedPids);

    if (result.error) {
        console.warn(`[RecController] UserRec Error from service for ${userId}:`, result.error, result.trace || '');
        if (result.message && (result.recommendations && result.recommendations.length === 0)) {
             return res.status(200).json({ recommendations: [], message: result.message });
        }
        // Dựa vào nội dung lỗi từ Python để quyết định status code phù hợp hơn
        const errorMsg = String(result.error).toLowerCase();
        if (errorMsg.includes("not found") || errorMsg.includes("no interaction history")) return res.status(404).json({ error: result.error, recommendations: [] }); // Not found
        return res.status(400).json({ error: result.error }); // Bad request (e.g. invalid input to Python)
    }
    
    res.status(200).json({ recommendations: result.recommendations || [] });
});

exports.listProducts = async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page, 10) : 1;
        const perPage = req.query.per_page ? parseInt(req.query.per_page, 10) : 20; // Nhận per_page từ FE
        
        const { category, province, sort_by } = req.query;
        const minPrice = req.query.min_price ? parseFloat(req.query.min_price) : undefined;
        const maxPrice = req.query.max_price ? parseFloat(req.query.max_price) : undefined;

        if (isNaN(page) || page <= 0) return res.status(400).json({ error: 'Invalid page parameter.' });
        if (isNaN(perPage) || perPage <= 0 || perPage > 100) return res.status(400).json({ error: 'Invalid per_page parameter (1-100).' });
        if (minPrice !== undefined && isNaN(minPrice)) return res.status(400).json({ error: 'Invalid min_price.' });
        if (maxPrice !== undefined && isNaN(maxPrice)) return res.status(400).json({ error: 'Invalid max_price.' });


        const options = { page, perPage }; // Service dùng perPage
        if (category) options.category = category;
        if (province) options.province = province;
        if (minPrice !== undefined) options.minPrice = minPrice; // Service dùng minPrice
        if (maxPrice !== undefined) options.maxPrice = maxPrice; // Service dùng maxPrice
        if (sort_by) options.sortBy = sort_by;                   // Service dùng sortBy
        
        const result = await recommenderService.getProducts(options);

        if (result.error) {
            console.warn(`[Controller] ListProducts Error:`, result.error, result.trace || '');
            return res.status(500).json({ error: result.error }); // Lỗi từ Python
        }
        // Python trả về: { products: [...], count: ..., page: ..., pages: ...}
        // Đảm bảo frontend nhận được cấu trúc nó mong muốn
        res.status(200).json({
            products: result.products || [],
            page: result.page || 1,
            pages: result.pages || 0, // Python trả về total_pages, map sang pages
            count: result.count || 0  // Python trả về total_products, map sang count
        });
    } catch (e) {
        console.error("[Controller] Uncaught ListProducts Error:", e.error || e.message, e.trace || '');
        res.status(500).json({ error: e.error || 'Internal server error fetching products.' });
    }
};

exports.refreshModel = async (req, res) => { // Giữ nguyên, không dùng nếu model precomputed
    res.status(501).json({ message: "Model refresh via API is not implemented as models are pre-computed/generated externally." });
};