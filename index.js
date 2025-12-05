const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://mangafire.to';

app.use(cors());
app.use(express.json());

// 1. CONFIGURATION
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const COOKIE = process.env.MANGAFIRE_COOKIE || ""; 

const client = axios.create({
    baseURL: BASE_URL,
    headers: {
        'User-Agent': USER_AGENT,
        'Cookie': COOKIE,
        'Referer': BASE_URL,
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    },
    validateStatus: false // Prevent axios from crashing on 404/403
});

const extractId = (url) => url ? url.split('.').pop() : null;

// ==========================================
// SEARCH
// ==========================================
app.get('/api/search/:keyword', async (req, res) => {
    try {
        const { keyword } = req.params;
        const { data, status } = await client.get(`/filter?keyword=${encodeURIComponent(keyword)}`);
        
        const $ = cheerio.load(data);
        const pageTitle = $('title').text().trim();

        // CHECK FOR CLOUDFLARE BLOCK
        if (pageTitle.includes('Just a moment') || status === 403) {
            return res.status(403).json({ 
                error: 'Cloudflare Blocked Request', 
                message: 'Please update MANGAFIRE_COOKIE in Vercel environment variables.' 
            });
        }

        const results = [];
        $('.original .unit').each((i, el) => {
            const $el = $(el);
            const link = $el.find('a').attr('href');
            const id = extractId(link);
            const image = $el.find('img').attr('src');
            const title = $el.find('.info a').first().text().trim();
            const type = $el.find('.type').text().trim();
            const statusText = $el.find('.status').text().trim();

            if (id && title) {
                results.push({ id, title, image, type, status: statusText });
            }
        });

        res.json(results);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// MANGA DETAILS
// ==========================================
app.get('/api/manga/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Search specific ID to handle potential slug mismatches
        const { data, status } = await client.get(`/manga/dummy.${id}`);
        const $ = cheerio.load(data);
        const pageTitle = $('title').text().trim();

        // 1. CLOUDFLARE CHECK
        if (pageTitle.includes('Just a moment') || status === 403) {
            return res.status(403).json({ error: 'Cloudflare Blocked Request. Update Cookie.' });
        }

        // 2. 404 CHECK
        if (status === 404 || pageTitle.includes('404')) {
            return res.status(404).json({ error: 'Manga not found. Check ID.' });
        }

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
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// CHAPTER LIST
// ==========================================
app.get('/api/manga/:id/chapters/:lang?', async (req, res) => {
    try {
        const { id } = req.params;
        const lang = req.params.lang || 'en';
        
        const { data } = await client.get(`/ajax/manga/${id}/chapter/${lang}`);
        
        // API returns JSON, no need to load cheerio on 'data' directly
        if (data.result) {
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
            return res.json(chapters);
        }
        
        res.json([]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// CHAPTER IMAGES
// ==========================================
app.get('/api/chapter/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = await client.get(`/ajax/read/chapter/${id}`);

        if (data.result && data.result.images) {
            const images = data.result.images.map(img => Array.isArray(img) ? img[0] : img);
            res.json(images);
        } else {
            res.status(404).json({ error: 'No images found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => res.send('API Running'));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
