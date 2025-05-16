// services/recommender.service.js
const { spawn } = require('child_process');
const path = require('path');

const PYTHON_INTERPRETER = process.env.PYTHON_PATH || 'python3';
const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'recommender_cli.py');

function runPythonScript(args) {
    return new Promise((resolve, reject) => {
        const options = {
            env: { ...process.env, PYTHONIOENCODING: 'UTF-8' },
        };

        // console.log(`[Service] Executing: ${PYTHON_INTERPRETER} "${SCRIPT_PATH}" ${args.join(' ')}`);
        const pyProcess = spawn(PYTHON_INTERPRETER, [SCRIPT_PATH, ...args], options);

        let resultJson = '';
        let errorOutput = '';

        pyProcess.stdout.on('data', (data) => { resultJson += data.toString('utf8'); });
        pyProcess.stderr.on('data', (data) => { errorOutput += data.toString('utf8'); });

        pyProcess.on('close', (code) => {
            if (errorOutput.trim()) { // Luôn log stderr nếu có nội dung
                console.warn(`[Service] Python script stderr (${args[0]}): ${errorOutput.substring(0, 1000)}`);
            }
            if (code !== 0) {
                console.error(`[Service] Python script execution failed with code ${code} for command ${args[0]}.`);
                try {
                    // Cố gắng parse lỗi từ stderr nếu nó là JSON
                    const pyError = JSON.parse(errorOutput.trim());
                    return reject(pyError); // {error: "message from python", trace: "..."}
                } catch (e) {
                    // Nếu stderr không phải JSON, trả về lỗi chung
                    return reject({ error: `Python script failed (code ${code}) for ${args[0]}. Output: ${errorOutput.substring(0, 500)}` });
                }
            }
            try {
                if (!resultJson.trim()) {
                    console.warn(`[Service] Python script for command ${args[0]} returned empty stdout.`);
                    if (args[0] === 'get_recommendations' || args[0] === 'get_user_recommendations') {
                        return resolve({ recommendations: [] });
                    }
                    if (args[0] === 'get_products') {
                        return resolve({ products: [], count: 0, page: 1, pages: 0, status: "success" });
                    }
                    return resolve({});
                }
                const jsonData = JSON.parse(resultJson);
                resolve(jsonData);
            } catch (parseError) {
                console.error(`[Service] Error parsing JSON from Python (${args[0]}):`, parseError, '\nRaw output:', resultJson.substring(0, 500));
                reject({ error: `Failed to parse JSON from Python script for ${args[0]}.`, details: resultJson.substring(0,200) });
            }
        });
        pyProcess.on('error', (err) => {
            console.error(`[Service] Failed to start Python subprocess for ${args[0]}:`, err);
            reject({ error: `Failed to start Python subprocess for ${args[0]}: ${err.message}` });
        });
    });
}

class RecommenderService {
    /**
     * Lấy gợi ý dựa trên sản phẩm (item-to-item precomputed).
     */
    async getRecommendations(productId, topN = 10) {
        if (!productId) return Promise.reject({ error: 'Product ID is required for getRecommendations.' });
        const args = ['get_recommendations', '--product_id', String(productId), '--top_n', String(topN)];
        return runPythonScript(args); // Python trả về { product_id_input: ..., recommendations: [...] } hoặc { error: ...}
    }

    /**
     * Lấy gợi ý cho người dùng dựa trên Content-Based Filtering động.
     * @param {string} userId - ID của người dùng.
     * @param {number} topN - Số lượng gợi ý.
     * @param {string[]} interactedProductIds - Mảng các product_id (dạng chuỗi) user đã tương tác.
     */
    async getUserRecommendations(userId, topN = 10, interactedProductIds = []) {
        if (!userId) return Promise.reject({ error: 'User ID is required for getUserRecommendations.' });
        
        const interactedProductIdsJson = JSON.stringify(interactedProductIds || []); // Đảm bảo là mảng và chuyển sang chuỗi JSON

        const args = [
            'get_user_recommendations', 
            '--user_id', String(userId), 
            '--top_n', String(topN),
            '--interacted_product_ids', interactedProductIdsJson 
        ];
        return runPythonScript(args); // Python trả về { user_id_input: ..., recommendations: [...] } hoặc { error: ...}
    }

    /**
     * Lấy danh sách sản phẩm với phân trang, lọc và sắp xếp.
     */
    async getProducts(options = {}) {
        const {
            page = 1,
            perPage = 20,
            category,
            province,
            minPrice, // Node.js controller sẽ gửi minPrice
            maxPrice, // Node.js controller sẽ gửi maxPrice
            sortBy    // Node.js controller sẽ gửi sortBy
        } = options;

        const args = [
            'get_products',
            '--page', String(page),
            '--per_page', String(perPage) // Script Python nhận --per_page
        ];
        
        if (category) args.push('--category', category);
        if (province) args.push('--province', province);
        // Script Python nhận --min_price, --max_price
        if (minPrice !== undefined && minPrice !== null) args.push('--min_price', String(minPrice));
        if (maxPrice !== undefined && maxPrice !== null) args.push('--max_price', String(maxPrice));
        if (sortBy) args.push('--sort_by', sortBy); // Script Python nhận --sort_by

        return runPythonScript(args); // Python trả về { products: [...], count: ..., page: ..., pages: ...} hoặc { error: ...}
    }
}

module.exports = new RecommenderService();