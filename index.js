const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

const BASE_URL = 'https://mangafire.to';
const API_BASE = 'https://mangafire.to/ajax';

// Helper function to generate headers
const getHeaders = (referer = BASE_URL) => ({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': referer,
  'X-Requested-With': 'XMLHttpRequest',
  'Origin': BASE_URL
});

// =========================
// ROUTES
// =========================

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'MangaFire Scraper API',
    version: '1.0.0',
    endpoints: {
      search: 'GET /api/search?q=<query>&page=<page>',
      trending: 'GET /api/trending',
      recent: 'GET /api/recent?page=<page>',
      manga: 'GET /api/manga/:id',
      chapters: 'GET /api/manga/:id/chapters',
      read: 'GET /api/read/:mangaId/:chapterId',
      filter: 'GET /api/filter?type=<type>&genre=<genre>&status=<status>&page=<page>'
    }
  });
});

// Search manga
app.get('/api/search', async (req, res) => {
  try {
    const { q, page = 1 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    const url = `${BASE_URL}/filter`;
    const params = {
      keyword: q,
      page: page
    };

    const response = await axios.get(url, { 
      params,
      headers: getHeaders() 
    });
    
    const $ = cheerio.load(response.data);
    const results = [];
    
    $('.unit').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').first().attr('href');
      const title = $el.find('.info .name').text().trim();
      const image = $el.find('img').attr('data-src') || $el.find('img').attr('src');
      const meta = $el.find('.meta').text().trim();
      
      if (link && title) {
        results.push({
          id: link.split('/').filter(Boolean).pop(),
          title,
          url: `${BASE_URL}${link}`,
          image: image ? (image.startsWith('http') ? image : `${BASE_URL}${image}`) : null,
          meta
        });
      }
    });

    const hasNextPage = $('.pagination .next:not(.disabled)').length > 0;

    res.json({
      query: q,
      page: parseInt(page),
      results,
      hasNextPage
    });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get trending manga
app.get('/api/trending', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}/home`, { 
      headers: getHeaders() 
    });
    
    const $ = cheerio.load(response.data);
    const trending = [];
    
    $('.trending .swiper-slide, .rank .unit').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').first().attr('href');
      const title = $el.find('.info .name, .name').text().trim();
      const image = $el.find('img').attr('data-src') || $el.find('img').attr('src');
      
      if (link && title) {
        trending.push({
          id: link.split('/').filter(Boolean).pop(),
          title,
          url: `${BASE_URL}${link}`,
          image: image ? (image.startsWith('http') ? image : `${BASE_URL}${image}`) : null
        });
      }
    });

    res.json({ trending });
  } catch (error) {
    console.error('Trending error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get recent updates
app.get('/api/recent', async (req, res) => {
  try {
    const { page = 1 } = req.query;
    
    const response = await axios.get(`${BASE_URL}/recent/${page}`, { 
      headers: getHeaders() 
    });
    
    const $ = cheerio.load(response.data);
    const recent = [];
    
    $('.original .unit').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a.poster').attr('href');
      const title = $el.find('.info .name').text().trim();
      const image = $el.find('img').attr('data-src') || $el.find('img').attr('src');
      const chapter = $el.find('.chapter').text().trim();
      
      if (link && title) {
        recent.push({
          id: link.split('/').filter(Boolean).pop(),
          title,
          url: `${BASE_URL}${link}`,
          image: image ? (image.startsWith('http') ? image : `${BASE_URL}${image}`) : null,
          latestChapter: chapter
        });
      }
    });

    const hasNextPage = $('.pagination .next:not(.disabled)').length > 0;

    res.json({
      page: parseInt(page),
      recent,
      hasNextPage
    });
  } catch (error) {
    console.error('Recent error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get manga details
app.get('/api/manga/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `${BASE_URL}/manga/${id}`;
    
    const response = await axios.get(url, { headers: getHeaders() });
    const $ = cheerio.load(response.data);
    
    const title = $('.info h1').text().trim();
    const image = $('.poster img').attr('src');
    const description = $('.summary .content').text().trim();
    const status = $('.status').text().trim();
    const author = $('.author a').text().trim();
    const genres = [];
    
    $('.genres a').each((i, el) => {
      genres.push($(el).text().trim());
    });
    
    const alternativeTitles = [];
    $('.alternative').each((i, el) => {
      alternativeTitles.push($(el).text().trim());
    });

    res.json({
      id,
      title,
      url,
      image,
      description,
      status,
      author,
      genres,
      alternativeTitles
    });
  } catch (error) {
    console.error('Manga details error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get manga chapters
app.get('/api/manga/:id/chapters', async (req, res) => {
  try {
    const { id } = req.params;
    const url = `${BASE_URL}/manga/${id}`;
    
    const response = await axios.get(url, { headers: getHeaders() });
    const $ = cheerio.load(response.data);
    
    const chapters = [];
    
    $('#chapters .item, .chapter-item').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').attr('href');
      const chapterNum = $el.find('.name').text().trim();
      const date = $el.find('.date, .time').text().trim();
      
      if (link) {
        const chapterId = link.split('/').filter(Boolean).pop();
        chapters.push({
          id: chapterId,
          number: chapterNum,
          url: `${BASE_URL}${link}`,
          date
        });
      }
    });

    res.json({
      mangaId: id,
      chapters
    });
  } catch (error) {
    console.error('Chapters error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Read chapter (get pages)
app.get('/api/read/:mangaId/:chapterId', async (req, res) => {
  try {
    const { mangaId, chapterId } = req.params;
    const url = `${BASE_URL}/read/${mangaId}/${chapterId}`;
    
    const response = await axios.get(url, { headers: getHeaders() });
    const $ = cheerio.load(response.data);
    
    const pages = [];
    
    // Try to extract from image sources
    $('.page-img img, .reader-img img, #images img').each((i, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src) {
        pages.push({
          page: i + 1,
          image: src.startsWith('http') ? src : `${BASE_URL}${src}`
        });
      }
    });
    
    // If no images found, try to extract from script
    if (pages.length === 0) {
      const scriptContent = $('script:contains("images")').html() || '';
      const imageMatches = scriptContent.match(/images\s*=\s*(\[.*?\])/);
      
      if (imageMatches) {
        try {
          const imagesArray = JSON.parse(imageMatches[1]);
          imagesArray.forEach((img, idx) => {
            pages.push({
              page: idx + 1,
              image: img.startsWith('http') ? img : `${BASE_URL}${img}`
            });
          });
        } catch (e) {
          console.error('Failed to parse images array');
        }
      }
    }

    const chapterTitle = $('.chapter-name, .heading').text().trim();
    
    res.json({
      mangaId,
      chapterId,
      title: chapterTitle,
      url,
      pages,
      totalPages: pages.length
    });
  } catch (error) {
    console.error('Read error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Filter/Browse manga
app.get('/api/filter', async (req, res) => {
  try {
    const { type, genre, status, page = 1 } = req.query;
    
    const params = { page };
    if (type) params.type = type;
    if (genre) params.genre = genre;
    if (status) params.status = status;
    
    const response = await axios.get(`${BASE_URL}/filter`, { 
      params,
      headers: getHeaders() 
    });
    
    const $ = cheerio.load(response.data);
    const results = [];
    
    $('.unit').each((i, el) => {
      const $el = $(el);
      const link = $el.find('a').first().attr('href');
      const title = $el.find('.info .name').text().trim();
      const image = $el.find('img').attr('data-src') || $el.find('img').attr('src');
      const meta = $el.find('.meta').text().trim();
      
      if (link && title) {
        results.push({
          id: link.split('/').filter(Boolean).pop(),
          title,
          url: `${BASE_URL}${link}`,
          image: image ? (image.startsWith('http') ? image : `${BASE_URL}${image}`) : null,
          meta
        });
      }
    });

    const hasNextPage = $('.pagination .next:not(.disabled)').length > 0;

    res.json({
      filters: { type, genre, status },
      page: parseInt(page),
      results,
      hasNextPage
    });
  } catch (error) {
    console.error('Filter error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MangaFire API running on http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT} for available endpoints`);
});

module.exports = app;
