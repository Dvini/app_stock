import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_ID = "Qwen3-1.7B-q4f16_1-MLC";
const REPO_URL = `https://huggingface.co/mlc-ai/${MODEL_ID}/resolve/main/`;
const OUTPUT_DIR = path.join(__dirname, '../public/models', MODEL_ID);

// Files to always download
const STATIC_FILES = [
    "mlc-chat-config.json",
    "ndarray-cache.json",
    "tokenizer.json",
    "tokenizer_config.json"
];

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const downloadFile = (filename) => {
    return new Promise((resolve, reject) => {
        const destPath = path.join(OUTPUT_DIR, filename);
        if (fs.existsSync(destPath)) {
            // Check if file is non-empty (simple check)
            const stats = fs.statSync(destPath);
            if (stats.size > 0) {
                console.log(`[SKIP] ${filename} already exists.`);
                resolve();
                return;
            }
        }

        const url = `${REPO_URL}${filename}`;
        console.log(`[DOWNLOADING] ${url}...`);

        const file = fs.createWriteStream(destPath);

        const request = (inputUrl) => {
            https.get(inputUrl, (response) => {
                // Handle Redirects
                if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                    let newUrl = response.headers.location;
                    if (!newUrl) {
                        file.close();
                        fs.unlink(destPath, () => { });
                        reject(new Error(`Redirect with no location header for ${filename}`));
                        return;
                    }

                    // Resolve relative URLs
                    if (newUrl.startsWith('/')) {
                        const originalUrl = new URL(inputUrl);
                        newUrl = `${originalUrl.protocol}//${originalUrl.host}${newUrl}`;
                    }

                    // console.log(`  -> Redirecting to ${newUrl}`);
                    request(newUrl);
                    return;
                }

                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlink(destPath, () => { });
                    reject(new Error(`Failed to download ${filename}: Status ${response.statusCode}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                file.close();
                fs.unlink(destPath, () => { });
                reject(err);
            });
        };

        request(url);
    });
};

const main = async () => {
    try {
        console.log(`Checking/Downloading model to: ${OUTPUT_DIR}`);

        // 1. Download static config files
        for (const file of STATIC_FILES) {
            await downloadFile(file);
        }

        // 2. Read ndarray-cache.json to find binary weights
        const cachePath = path.join(OUTPUT_DIR, "ndarray-cache.json");
        if (!fs.existsSync(cachePath)) {
            throw new Error("ndarray-cache.json failed to download");
        }

        const cacheContent = fs.readFileSync(cachePath, 'utf-8');
        const cache = JSON.parse(cacheContent);

        if (!cache.records) {
            throw new Error("ndarray-cache.json does not contain 'records'.");
        }

        // 3. Download weight files
        // records is typically [{ "name": "...", "dataPath": "params_shard_0.bin", ... }]
        // We need to extract unique dataPaths
        const dataPaths = new Set(cache.records.map(r => r.dataPath));

        for (const dataPath of dataPaths) {
            await downloadFile(dataPath);
        }

        console.log("Model download complete!");
        process.exit(0);

    } catch (error) {
        console.error("Error downloading model:", error);
        process.exit(1);
    }
};

main();
