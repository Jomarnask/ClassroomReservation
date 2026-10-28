const fs = require('fs');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const content = `const SUPABASE_URL = ${JSON.stringify(url)};
const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(key)};
`;

fs.writeFileSync('config.js', content);
console.log('config.js generated');