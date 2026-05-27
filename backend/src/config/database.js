const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = require('./environment');

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  throw new Error(
    '[Supabase] SUPABASE_URL and SUPABASE_SECRET_KEY must be set in environment variables.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

module.exports = supabase;
