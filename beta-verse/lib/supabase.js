// lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// 🔴 IMPORTANT: use the URL + anon key from
// Supabase Dashboard → Project Settings → API
export const SUPABASE_URL = "https://tsorwhukmyimalruxctn.supabase.co";

export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzb3J3aHVrbXlpbWFscnV4Y3RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzMTAyMDYsImV4cCI6MjA3MDg4NjIwNn0.yS3X1bgfwS8qu7NrTSdZIKbWkoTbMNulOD1RiW1HIMc"; // anon public key

// Optional: useful if you ever manually call functions via fetch()
export const FUNCTIONS_BASE = `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1`;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
