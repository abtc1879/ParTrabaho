import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Keep the app running for UI work even before env variables are set.
  // API calls will fail with clear Supabase errors until configured.
  console.warn("Missing Supabase env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY");
}

const authConfig = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  storage: typeof window !== "undefined" ? window.sessionStorage : undefined
};

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: authConfig
});
