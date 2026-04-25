const { createClient } = require("@supabase/supabase-js");
const { HttpError } = require("./http");

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new HttpError(503, "Supabase environment variables are missing.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function rpc(name, args = {}) {
  const { data, error } = await supabase().rpc(name, args);
  if (error) throw new HttpError(500, error.message);
  return data;
}

module.exports = { rpc, supabase };
