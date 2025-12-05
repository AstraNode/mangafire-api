const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://mangafire.to';

app.use(cors());
app.use(express.json());

// Browser Configuration
const getBrowserOptions = async () => {
    // Check if running on Vercel (Production)
    // Vercel usually defines process.env.VERCEL or AWS_LAMBDA_FUNCTION_NAME
    const isProduction = process.env.VERCEL || process.env.AWS_REGION;
    
    if (!isProduction) {
        // Local Development (Uses your local Chrome)
        // You might need to install 'puppeteer' devDependency for local testing if you haven't
        return {
            executablePath: require('puppeteer').executablePath(), 
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: "new"
        };
    } else {
        // Vercel Production Configuration
        // This sets up the compressed Chromium binary
        chromium.setGraphicsMode = false;
        
        return {
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        };
    }
};

// Helper: Run Puppeteer Task
const runPuppeteer = async (url, type = 'html') => {
    let browser = null;
    try {
        const options = await getBrowserOptions();
        browser = await puppeteer.launch(options);
        const page = await browser.newPage();
        
        // Mimic real user
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
        
        // Block heavy resources to save memory/speed
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Navigate
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

        // Return Data
        if (type === 'html') {
            return await page.content();
        } 
        if (type === 'json') {
            const content = await page.evaluate(() => document.body.innerText);
            return JSON.parse(content);
        }

    } catch (error) {
        console.error("Puppeteer Error:", error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
};

const extractId = (url) => url ? url.split('.').pop() : null;

// ==========================================
// 1. SEARCH
// ==========================================
app.get('/api/search/:keyword', async (req, res) => {
    try {
        const { keyword } = req.params;
        const html = await runPuppeteer(`${BASE_URL}/filter?keyword=${encodeURIComponent(keyword)}`);
        const $ = cheerio.load(html);
        const results = [];

        $('.original .unit').each((i, el) => {
            const $el = $(el);
            const link = $el.find('a').attr('href');
            const id = extractId(link);
            const image = $el.find('img').attr('src');
            const title = $el.find('.info a').first().text().trim();
            const type = $el.find('.type').text().trim();
            const status = $el.find('.status').text().trim();

            if (id && title) {
                results.push({ id, title, image, type, status, link: `${BASE_URL}${link}` });
            }
        });

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Search failed', details: error.message });
    }
});

// ==========================================
// 2. MANGA DETAILS
// ==========================================
app.get('/api/manga/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const html = await runPuppeteer(`${BASE_URL}/manga/dummy.${id}`);
        const $ = cheerio.load(html);

        const title = $('h1[itemprop="name"]').text().trim();
        const image = $('.poster img').attr('src');
        const description = $('.description').text().trim();
        const genres = [];
        $('.meta .genres a').each((i, el) => genres.push($(el).text().trim()));
        
        const getMeta = (label) => $('.meta span').filter((i, el) => $(el).text().includes(label)).next().text().trim();

        res.json({
            id,
            title: title || 'Unknown',
            image,
            description,
            genres,
            author: getMeta('Author:'),
            status: getMeta('Status:'),
            type: getMeta('Type:'),
            banner: image
        });
    } catch (error) {
        res.status(500).json({ error: 'Details failed', details: error.message });
    }
});

// ==========================================
// 3. GET CHAPTERS
// ==========================================
app.get('/api/manga/:id/chapters/:lang?', async (req, res) => {
    try {
        const { id } = req.params;
        const lang = req.params.lang || 'en';
        
        const data = await runPuppeteer(`${BASE_URL}/ajax/manga/${id}/chapter/${lang}`, 'json');
        
        if (data.status !== 200) throw new Error('API Error');

        const $ = cheerio.load(data.result);
        const chapters = [];

        $('.item').each((i, el) => {
            const $el = $(el);
            const link = $el.find('a').attr('href');
            const id = $el.find('a').attr('data-id');
            const number = $el.find('a').attr('data-number');
            const title = $el.find('span').first().text().trim();

            if (id) {
                chapters.push({
                    id,
                    number,
                    title: title || `Chapter ${number}`,
                    url: `${BASE_URL}${link}`
                });
            }
        });

        res.json(chapters);
    } catch (error) {
        res.json([]);
    }
});

// ==========================================
// 4. GET IMAGES
// ==========================================
app.get('/api/chapter/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await runPuppeteer(`${BASE_URL}/ajax/read/chapter/${id}`, 'json');

        if (data.status === 200 && data.result && data.result.images) {
            const images = data.result.images.map(img => Array.isArray(img) ? img[0] : img);
            res.json(images);
        } else {
            throw new Error('Invalid structure');
        }
    } catch (error) {
        res.status(500).json({ error: 'Images failed', details: error.message });
    }
});

app.get('/', (req, res) => res.send('MangaFire Puppeteer API (v2 Stable) is Running!'));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
