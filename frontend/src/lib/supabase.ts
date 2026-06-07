import { createClient } from '@supabase/supabase-js'

// Fallback placeholders prevent createClient from throwing when env vars are
// absent (e.g. local dev without .env.local). getSession() will fail with a
// network error, which AuthContext catches and resolves to user=null.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key',
)
