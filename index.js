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

// Browser Options Configuration
const getBrowserOptions = async () => {
    // If running locally, use full puppeteer. If on Vercel, use chromium layer.
    const isLocal = !process.env.AWS_REGION && !process.env.VERCEL;
    
    if (isLocal) {
        return {
            executablePath: require('puppeteer').executablePath(),
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            headless: "new"
        };
    } else {
        return {
            executablePath: await chromium.executablePath(),
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
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
        
        // Optimize: Block images/fonts to save bandwidth
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Go to URL
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // If we just need the HTML
        if (type === 'html') {
            const content = await page.content();
            return content;
        } 
        
        // If we need JSON (for AJAX calls), we extract it from body
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

// Helper: Extract ID
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
        // Search by ID trick to get to the page
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
        res.status(500).json({ error: 'Details failed' });
    }
});

// ==========================================
// 3. GET CHAPTERS
// ==========================================
app.get('/api/manga/:id/chapters/:lang?', async (req, res) => {
    try {
        const { id } = req.params;
        const lang = req.params.lang || 'en';
        
        // Fetch the AJAX endpoint directly using Puppeteer to handle cookies
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
        res.json([]); // Return empty on fail
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
            // Flatten images array [[url, w, h], ...] -> [url, ...]
            const images = data.result.images.map(img => Array.isArray(img) ? img[0] : img);
            res.json(images);
        } else {
            throw new Error('Invalid structure');
        }
    } catch (error) {
        res.status(500).json({ error: 'Images failed' });
    }
});

app.get('/', (req, res) => res.send('MangaFire Puppeteer API is Running!'));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
