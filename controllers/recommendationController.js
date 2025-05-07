const recommenderService = require('../services/recommender.service');

exports.getRecommendationsForProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const topN = req.query.top_n ? parseInt(req.query.top_n, 10) : 10; // Mặc định là 10

        if (isNaN(topN) || topN <= 0) {
            return res.status(400).json({ error: 'Invalid top_n parameter. Must be a positive integer.' });
        }
        
        // productId có thể là số hoặc chuỗi, script Python sẽ xử lý
        if (!productId) {
             return res.status(400).json({ error: 'Product ID parameter is required.' });
        }

        console.log(`Controller: Received request for recommendations for productId: ${productId}, topN: ${topN}`);
        const result = await recommenderService.getRecommendations(productId, topN);

        if (result.error) {
            // Dựa vào nội dung lỗi từ Python script để quyết định status code
            // Ví dụ, nếu lỗi từ Python đã bao gồm thông tin về not found hoặc invalid input
            console.warn(`Controller: Error from recommender service for productId ${productId}:`, result.error);
            if (result.error.toLowerCase().includes("not found")) {
                return res.status(404).json(result);
            }
            // Các lỗi khác do input hoặc model không sẵn sàng có thể là 400 hoặc 503
            if (result.error.toLowerCase().includes("invalid product id") || result.error.toLowerCase().includes("format")) {
                 return res.status(400).json(result);
            }
            // Nếu lỗi liên quan đến file model không tồn tại, có thể coi là lỗi server chưa sẵn sàng
            if (result.error.toLowerCase().includes("file not found") || result.error.toLowerCase().includes("failed to load model")) {
                return res.status(503).json({ error: "Recommendation service is temporarily unavailable or model files are missing.", details: result.error});
            }
            return res.status(400).json(result); // Mặc định cho các lỗi khác từ Python script
        }
        res.status(200).json(result);
    } catch (error) {
        // Lỗi này thường là lỗi khi gọi service (ví dụ: Python process không spawn được)
        console.error("Controller: Internal server error in getRecommendationsForProduct:", error.message, error.stack);
        res.status(500).json({ error: 'Internal server error while fetching recommendations.', details: error.message });
    }
};

exports.listProducts = async (req, res) => {
    try {
        const page = req.query.page ? parseInt(req.query.page, 10) : 1;
        const perPage = req.query.per_page ? parseInt(req.query.per_page, 10) : 20;

        if (isNaN(page) || page <= 0) {
            return res.status(400).json({ error: 'Invalid page parameter. Must be a positive integer.' });
        }
        if (isNaN(perPage) || perPage <= 0) {
            return res.status(400).json({ error: 'Invalid per_page parameter. Must be a positive integer.' });
        }
        
        console.log(`Controller: Received request for product list: page=${page}, perPage=${perPage}`);
        const result = await recommenderService.getProducts(page, perPage);

        if (result.error || result.status === 'error') {
            console.warn(`Controller: Error from recommender service for product list:`, result.error || result.message);
            // Nếu lỗi liên quan đến file model không tồn tại
            if (result.error && result.error.toLowerCase().includes("file not found")) {
                 return res.status(503).json({ error: "Product data is temporarily unavailable or data files are missing.", details: result.error});
            }
            return res.status(500).json(result); // Lỗi chung từ Python
        }
        res.status(200).json(result);
    } catch (error) {
        console.error("Controller: Internal server error in listProducts:", error.message, error.stack);
        res.status(500).json({ error: 'Internal server error while fetching products.', details: error.message });
    }
};

// Endpoint quản trị để refresh model
exports.refreshModel = async (req, res) => {
    // LƯU Ý: Đây là một tác vụ chạy nền dài hạn.
    // Trong một ứng dụng thực tế, bạn không nên await ở đây.
    // Thay vào đó, bạn nên kích hoạt một job/task chạy nền và trả về 202 Accepted ngay.
    const forceCrawl = req.query.force_crawl === 'true'; // Ví dụ
    try {
        console.log(`Controller: Initiating model refresh (forceCrawl=${forceCrawl}).`);
        // Để chạy nền thực sự, không await:
        recommenderService.refreshDataAndModels(forceCrawl)
            .then(pythonResult => {
                // Log kết quả từ Python khi nó hoàn thành
                console.log("Controller: Python model refresh process finished.", pythonResult);
                // Ở đây bạn có thể gửi thông báo (webhook, socket, email) khi hoàn tất
            })
            .catch(pythonError => {
                console.error("Controller: Python model refresh process failed.", pythonError.message);
                // Xử lý lỗi chạy nền
            });

        // Trả về ngay lập tức cho client
        res.status(202).json({ message: "Model refresh process initiated. This may take a long time and will run in the background." });
        
    } catch (error) { // Lỗi này xảy ra nếu `recommenderService.refreshDataAndModels` throw ngay lập tức (ít khả năng nếu nó được thiết kế để chạy nền)
        console.error("Controller: Failed to initiate model refresh process:", error.message, error.stack);
        res.status(500).json({ error: 'Failed to initiate model refresh process.', details: error.message });
    }
};