const recommenderService = require('../services/recommender.service');
const asyncHandler = require('express-async-handler'); 
const Order = require('../models/Order');
const Product = require('../models/Product');

// --- Helper Function để lấy lịch sử tương tác (VÍ DỤ - BẠN CẦN THAY THẾ LOGIC THỰC) ---
async function getUserInteractionHistory(userId) {
    try {
        const orders = await Order.find({ user: userId }).select('orderItems.product').lean();

        if (!orders || orders.length === 0) return [];

        const productObjectIds = new Set();
        orders.forEach(order => {
            order.orderItems?.forEach(item => {
                if (item.product) productObjectIds.add(item.product); // Giữ lại ObjectId
            });
        });

        if (productObjectIds.size === 0) return [];

        // Truy vấn Product collection để lấy original_id tương ứng
        const productsWithOriginalId = await Product.find({ 
            '_id': { $in: Array.from(productObjectIds) } 
        }).select('original_id').lean();

        const interactedOriginalIds = new Set();
        productsWithOriginalId.forEach(p => {
            if (p.original_id !== null && p.original_id !== undefined) {
                interactedOriginalIds.add(String(p.original_id)); // Chuyển original_id sang string
            }
        });
        
        const uniqueOriginalPids = Array.from(interactedOriginalIds);
        console.log(`[RecController getUserInteractionHistory] Returning original_ids for ${userId}:`, uniqueOriginalPids);
        return uniqueOriginalPids;

    } catch (error) {
        console.error(`[RecController] Error fetching interaction history (original_ids) for ${userId}:`, error);
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
    const { userId } = req.params;
    const topN = req.query.top_n ? parseInt(req.query.top_n, 10) : 8; // Lấy topN từ query hoặc mặc định
    console.log(`[NODE CTRL getRecsUser] Request for userId: ${userId}, topN: ${topN}`);

    const interactedPids = await getUserInteractionHistory(userId);
    console.log(`[NODE CTRL getRecsUser] Interacted PIDs for ${userId}:`, interactedPids);

    // Gọi service Node.js, service này sẽ gọi script Python
    const resultFromPython = await recommenderService.getUserRecommendations(userId.toString(), topN, interactedPids);
    
    // >>> LOG QUAN TRỌNG NHẤT <<<
    console.log(`[NODE CTRL getRecsUser] Result from Python Service for ${userId}:`, JSON.stringify(resultFromPython, null, 2));

    if (!interactedPids || interactedPids.length === 0) { // Kiểm tra lại điều kiện này
        console.warn(`[NODE CTRL getRecsUser] INTERACTION HISTORY IS EMPTY for ${userId}. Python will use cold start.`);
        // Nếu ở đây rỗng, thì getUserInteractionHistory có vấn đề
    }
    
    if (resultFromPython && resultFromPython.error) {
        console.warn(`[NODE CTRL getRecsUser] Error from Python Service:`, resultFromPython.error);
        // ... (xử lý lỗi và return)
        return res.status(400).json({ error: resultFromPython.error, recommendations: [] });
    }
    
    // Đảm bảo trả về đúng cấu trúc dù resultFromPython.recommendations có thể undefined
    const recommendationsToSend = resultFromPython?.recommendations || [];
    const messageToSend = resultFromPython?.message || (recommendationsToSend.length === 0 ? "Không tìm thấy gợi ý phù hợp." : undefined);

    res.status(200).json({ 
        recommendations: recommendationsToSend,
        ...(messageToSend && { message: messageToSend }) // Chỉ thêm message nếu có
    });
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