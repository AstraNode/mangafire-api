import axios from 'axios';

// Default User Agent (Must look like a real browser)
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Read from Environment Variables (Vercel) or fallback
const baseURL = process.env.BASE_URL || 'https://mangafire.to';
const userAgent = process.env.USER_AGENT || DEFAULT_USER_AGENT;
// Important: If no cookie is in Env Vars, try without it (might work for some endpoints)
const cookie = process.env.MANGAFIRE_COOKIE || "usertype=guest;"; 

export const client = axios.create({
  baseURL: baseURL,
  headers: {
    'Cookie': cookie,
    'User-Agent': userAgent,
    'Referer': baseURL,
    'X-Requested-With': 'XMLHttpRequest', // Helps bypass some Cloudflare checks
    'Accept': 'application/json, text/javascript, */*; q=0.01'
  },
  timeout: 10000 // 10 second timeout to prevent hanging
});

// Add logic to log errors internally (helps debugging in Vercel logs)
client.interceptors.response.use(
  response => response,
  error => {
    console.error(`[Axios Error] URL: ${error.config?.url} | Status: ${error.response?.status}`);
    return Promise.reject(error);
  }
);
