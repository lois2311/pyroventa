import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = process.env.SUPABASE_URL
const supabaseService = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseService) {
  console.warn('[PyroVenta API] Variables SUPABASE_URL y SUPABASE_SERVICE_KEY no configuradas.')
}

// El cliente admin usa la service key → bypasea RLS
// NUNCA exponer esta instancia al browser
export const supabaseAdmin = createClient(
  supabaseUrl     || 'https://placeholder.supabase.co',
  supabaseService || 'placeholder'
)
