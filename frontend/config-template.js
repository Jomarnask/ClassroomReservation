// only temporary, will be replaced with environment variables in production
const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_PUBLISHABLE_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY_HERE';


const supabaseClient = (typeof supabase !== 'undefined' && supabase.createClient)
? supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
: (typeof window !== 'undefined' && window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null);

if (typeof window !== 'undefined') {
window.supabaseClient = supabaseClient;
}