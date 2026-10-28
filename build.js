const fs = require('fs');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const content = `// Generated at build time from environment variables. Do not edit.
const SUPABASE_URL = ${JSON.stringify(url)};
const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(key)};

// Initialize global client using the window object created by the CDN
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

window.supabaseClient = supabaseClient;
`;

fs.writeFileSync('config.js', content);
console.log('config.js generated');