// Local development config for PUP-CRS.
//
// 1. Copy this file to config.js:   copy config-template.js config.js
// 2. Replace the two placeholder values below.
//
// config.js is listed in .gitignore - never commit real values.
// In production, build.js generates config.js from environment variables instead
// (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, API_BASE_URL).

const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_PUBLISHABLE_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY_HERE';

// Initialize global client using the window object created by the CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

window.supabaseClient = supabaseClient;

// Base URL of the PHP REST API (use the https Render URL in production)
window.API_BASE_URL = 'http://localhost:8000';