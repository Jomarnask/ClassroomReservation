const fs = require('fs');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
// Base URL of the PHP API (your Render service). Locally it falls back to the dev server.
const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8000';

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

// On Vercel a missing API_BASE_URL would silently point the site at localhost.
if (process.env.VERCEL && !process.env.API_BASE_URL) {
  console.error('Missing API_BASE_URL (the https URL of the PHP API on Render)');
  process.exit(1);
}

const content = `// Generated at build time from environment variables. Do not edit.
const SUPABASE_URL = ${JSON.stringify(url)};
const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(key)};

// Initialize global client using the window object created by the CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

window.supabaseClient = supabaseClient;
window.API_BASE_URL = ${JSON.stringify(apiBaseUrl)};
`;

fs.writeFileSync('config.js', content);
console.log('config.js generated');