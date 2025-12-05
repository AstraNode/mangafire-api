import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Default User Agent (Must match the browser you got the cookie from)
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const client = axios.create({
  baseURL: process.env.BASE_URL || 'https://mangafire.to',
  headers: {
    // Read cookie from .env file
    Cookie: process.env.MANGAFIRE_COOKIE || "usertype=guest;", 
    "User-Agent": process.env.USER_AGENT || USER_AGENT,
    Referer: "https://mangafire.to/",
    "X-Requested-With": "XMLHttpRequest", // Helps with AJAX endpoints
  }
});
