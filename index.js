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
// You get these from your browser (F12 -> Network -> Click 'mangafire.to' -> Request Headers)
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
const COOKIE = process.env.MANGAFIRE_COOKIE || ""; // Read from Env Var

const client = axios.create({
    baseURL: BASE_URL,
    headers: {
        'User-Agent': USER_AGENT,
        'Cookie': COOKIE,
        'Referer': BASE_URL,
        'X-Requested-With': 'XMLHttpRequest'
    }
});

// Helper: Extract ID
const extractId = (url) => url ? url.split('.').pop() : null;

// ==========================================
// SEARCH
// ==========================================
app.get('/api/search/:keyword', async (req, res) => {
    try {
        const { keyword } = req.params;
        const { data } = await client.get(`/filter?keyword=${encodeURIComponent(keyword)}`);
        const $ = cheerio.load(data);
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
                results.push({ id, title, image, type, status });
            }
        });

        res.json(results);
    } catch (error) {
        // If 403, it means Cookie is invalid
        if (error.response && error.response.status === 403) {
            return res.status(403).json({ error: 'Cloudflare blocked request. Please update MANGAFIRE_COOKIE in Vercel.' });
        }
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// MANGA DETAILS
// ==========================================
app.get('/api/manga/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = await client.get(`/manga/dummy.${id}`);
        const $ = cheerio.load(data);

        const title = $('h1[itemprop="name"]').text().trim();
        const image = $('.poster img').attr('src');
        const description = $('.description').text().trim();
        const genres = [];
        $('.meta .genres a').each((i, el) => genres.push($(el).text().trim()));

        // Helper to grab sidebar info
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
// CHAPTER LIST (AJAX)
// ==========================================
app.get('/api/manga/:id/chapters/:lang?', async (req, res) => {
    try {
        const { id } = req.params;
        const lang = req.params.lang || 'en';
        
        // MangaFire AJAX call
        const { data } = await client.get(`/ajax/manga/${id}/chapter/${lang}`);
        
        if (data.status !== 200) throw new Error('API Error');

        const $ = cheerio.load(data.result);
        const chapters = [];

        $('.item').each((i, el) => {
            const $el = $(el);
            const link = $el.find('a').attr('href');
            // ID for fetching images is inside data-id attribute
            const id = $el.find('a').attr('data-id');
            const number = $el.find('a').attr('data-number');
            const title = $el.find('span').first().text().trim();

            if (id) {
                chapters.push({
                    id, // Important: This is the internal ID for images
                    number,
                    title: title || `Chapter ${number}`,
                    url: `${BASE_URL}${link}`
                });
            }
        });

        res.json(chapters);
    } catch (error) {
        console.error(error);
        res.json([]);
    }
});

// ==========================================
// CHAPTER IMAGES (AJAX)
// ==========================================
app.get('/api/chapter/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // The ID here must be the internal data-id we fetched in the chapter list
        const { data } = await client.get(`/ajax/read/chapter/${id}`);

        if (data.status === 200 && data.result && data.result.images) {
            // Flatten images [[url, w, h], ...] -> [url, ...]
            const images = data.result.images.map(img => Array.isArray(img) ? img[0] : img);
            res.json(images);
        } else {
            throw new Error('No images found');
        }
    } catch (error) {
        res.status(500).json({ error: 'Images failed' });
    }
});

app.get('/', (req, res) => res.send('MangaFire Lightweight API is Running!'));

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
