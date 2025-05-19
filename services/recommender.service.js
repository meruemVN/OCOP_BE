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

        // console.log(`[Service runPythonScript] Executing: ${PYTHON_INTERPRETER} "${SCRIPT_PATH}" ${args.join(' ')}`);
        const pyProcess = spawn(PYTHON_INTERPRETER, [SCRIPT_PATH, ...args], options);

        let resultJson = '';
        let errorOutput = '';

        pyProcess.stdout.on('data', (data) => {
            // console.log(`[Service runPythonScript STDOUT for ${args[0]}]: RAW CHUNK ->`, data); // Log raw buffer
            resultJson += data.toString('utf8');
            // console.log(`[Service runPythonScript STDOUT for ${args[0]}]: ACCUMULATED ->`, resultJson);
        });
        pyProcess.stderr.on('data', (data) => {
            // console.log(`[Service runPythonScript STDERR for ${args[0]}]: RAW CHUNK ->`, data);
            errorOutput += data.toString('utf8');
            // console.log(`[Service runPythonScript STDERR for ${args[0]}]: ACCUMULATED ->`, errorOutput);
        });

        pyProcess.on('close', (code) => {
            // console.log(`[Service runPythonScript CLOSE for ${args[0]}] Exit code: ${code}`);
            // console.log(`[Service runPythonScript CLOSE for ${args[0]}] Final accumulated stdout (resultJson):`, resultJson);
            // console.log(`[Service runPythonScript CLOSE for ${args[0]}] Final accumulated stderr (errorOutput):`, errorOutput);

            if (errorOutput.trim()) {
                console.warn(`[Service] Python script stderr (${args[0]}): ${errorOutput.substring(0, 1000)}`);
            }
            if (code !== 0) {
                console.error(`[Service] Python script execution failed with code ${code} for command ${args[0]}.`);
                try {
                    const pyError = JSON.parse(errorOutput.trim());
                    return reject(pyError);
                } catch (e) {
                    return reject({ error: `Python script failed (code ${code}) for ${args[0]}. Stderr: ${errorOutput.substring(0, 500)}` });
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
                // console.log(`[Service runPythonScript Before Parse for ${args[0]}] Attempting to parse stdout:`, resultJson);
                const jsonData = JSON.parse(resultJson);
                // console.log(`[Service runPythonScript After Parse for ${args[0]}] Parsed JSON:`, jsonData);
                resolve(jsonData);
            } catch (parseError) {
                console.error(`[Service] Error parsing JSON from Python (${args[0]}):`, parseError.message, '\nRaw output was:', resultJson.substring(0, 1000));
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
    async getRecommendations(productId, topN = 10) {
        if (!productId) return Promise.reject({ error: 'Product ID is required for getRecommendations.' });
        const args = ['get_recommendations', '--product_id', String(productId), '--top_n', String(topN)];
        return runPythonScript(args);
    }

    async getUserRecommendations(userId, topN = 10, interactedProductIds = []) {
        // ***** LỖI ĐÃ ĐƯỢC XÓA Ở ĐÂY *****
        // pyProcess.stdout.on('data', (data) => { ... }); // Dòng này và dòng stderr dưới đã bị xóa
        // pyProcess.stderr.on('data', (data) => { ... });
        // ***** KẾT THÚC PHẦN XÓA *****

        if (!userId) return Promise.reject({ error: 'User ID is required for getUserRecommendations.' });
        
        console.log(`[NODE SERVICE getUserRecommendations] Received interactedProductIds (array):`, interactedProductIds);
        const interactedProductIdsJson = JSON.stringify(interactedProductIds || []);
        console.log(`[NODE SERVICE getUserRecommendations] Sending --interacted_product_ids (JSON string): ${interactedProductIdsJson}`);

        const args = [
            'get_user_recommendations', 
            '--user_id', String(userId), 
            '--top_n', String(topN),
            '--interacted_product_ids', interactedProductIdsJson 
        ];
        return runPythonScript(args);
    }

    async getProducts(options = {}) {
        const { /* ... params ... */ } = options;
        // ... (logic tạo args như cũ)
        const args = [ /* ... */ ]; // Giữ nguyên logic tạo args của bạn
        // (Logic tạo args đầy đủ đã có ở các câu trả lời trước)
        const page = options.page || 1;
        const perPage = options.perPage || 12; // Sửa từ per_page ở đây để khớp với controller
        const { category, province, minPrice, maxPrice, sortBy, keyword } = options;

        const finalArgs = [
            'get_products',
            '--page', String(page),
            '--per_page', String(perPage)
        ];
        
        if (category) finalArgs.push('--category', category);
        if (province) finalArgs.push('--province', province);
        if (minPrice !== undefined && minPrice !== null) finalArgs.push('--min_price', String(minPrice));
        if (maxPrice !== undefined && maxPrice !== null) finalArgs.push('--max_price', String(maxPrice));
        if (sortBy) finalArgs.push('--sort_by', sortBy);
        if (keyword) finalArgs.push('--keyword', keyword); // Thêm keyword nếu controller gửi

        return runPythonScript(finalArgs);
    }
}

module.exports = new RecommenderService();