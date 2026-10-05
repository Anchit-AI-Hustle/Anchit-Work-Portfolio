// Shared Supabase client for serverless functions
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hlcjghpzxzatgjfwcoav.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_LM6iwPPkm-Bkcmx8_vTHig_GXNzYCTv';

let client = null;

function getSupabase() {
  if (!client && supabaseUrl && supabaseKey) {
    client = createClient(supabaseUrl, supabaseKey);
  }
  return client;
}

module.exports = { getSupabase, supabaseUrl, supabaseKey };
