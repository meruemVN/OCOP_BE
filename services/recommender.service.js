const { spawn } = require('child_process');
const path = require('path');

// PYTHON_INTERPRETER có thể là 'python3', 'python', 
// hoặc đường dẫn tuyệt đối đến python.exe trong môi trường ảo của bạn
// Ví dụ: '/path/to/your/project/venv_recommender/bin/python'
const PYTHON_INTERPRETER = process.env.PYTHON_PATH || 'python3'; 
const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'recommender_cli.py'); 
// Giả sử service.js nằm trong project-nodejs/services/
// và script.py nằm trong project-nodejs/scripts/

function runPythonScript(args) {
    return new Promise((resolve, reject) => {
        const options = {
            env: {
                ...process.env, // Kế thừa các biến môi trường hiện tại
                PYTHONIOENCODING: 'UTF-8' // <<< THÊM DÒNG NÀY
            }
            // cwd: path.dirname(SCRIPT_PATH) // Nếu cần
        };

        // console.log(`Executing: ${PYTHON_INTERPRETER} "${SCRIPT_PATH}" ${args.join(' ')} with PYTHONIOENCODING=UTF-8`);
        const pyProcess = spawn(PYTHON_INTERPRETER, [SCRIPT_PATH, ...args], options); // <<< Truyền options vào đây
        
        let resultJson = '';
        let errorOutput = '';

        pyProcess.stdout.on('data', (data) => {
            resultJson += data.toString('utf8'); // Đảm bảo Node.js cũng đọc là utf8
        });
        pyProcess.stderr.on('data', (data) => {
            errorOutput += data.toString('utf8'); // Đảm bảo Node.js cũng đọc là utf8
        });
        
        pyProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Python script execution failed with code ${code}. Stderr: ${errorOutput.substring(0,1000)}`);
                return reject(new Error(`Python script failed (code ${code}). ${errorOutput.substring(0,500)}`));
            }
            try {
                const jsonData = JSON.parse(resultJson);
                resolve(jsonData);
            } catch (parseError) {
                console.error('Error parsing JSON from Python:', parseError, '\nRaw output was:', resultJson.substring(0, 500) + '...');
                reject(new Error('Failed to parse JSON from Python script.'));
            }
        });
        pyProcess.on('error', (err) => {
            console.error('Failed to start Python subprocess:', err);
            reject(new Error('Failed to start Python subprocess: ' + err.message));
        });
    });
}


class RecommenderService {
    async getRecommendations(productId, topN = 10) {
        if (!productId) throw new Error('Product ID is required.');
        const args = ['get_recommendations', '--product_id', String(productId), '--top_n', String(topN)];
        return runPythonScript(args);
    }

    async getProducts(page = 1, perPage = 20) {
        const args = ['get_products', '--page', String(page), '--per_page', String(perPage)];
        return runPythonScript(args);
    }
    // Không có hàm refresh ở đây vì model được tạo từ Colab
}
module.exports = new RecommenderService();