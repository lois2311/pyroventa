import { supabaseAdmin } from './supabaseAdmin.js'

/**
 * Verifica que una fila referenciada desde el body pertenezca al tenant del token.
 * Un id ausente (null/undefined) se considera válido — la referencia es opcional.
 */
export async function tenantOwns(table, id, tenantId) {
  if (!id) return true
  const { data } = await supabaseAdmin.from(table).select('id').eq('id', id).eq('tenant_id', tenantId).single()
  return !!data
}
