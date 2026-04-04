import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const { location_id, date } = req.query

  const day = date ? new Date(date) : new Date()
  day.setHours(0, 0, 0, 0)
  const dayEnd = new Date(day)
  dayEnd.setDate(dayEnd.getDate() + 1)

  let query = supabaseAdmin
    .from('invoices')
    .select('register_id, register_name, cashier_id, cashier_name, total, pay_method, status')
    .gte('created_at', day.toISOString())
    .lt('created_at',  dayEnd.toISOString())
    .eq('status', 'paid')

  if (location_id) query = query.eq('location_id', location_id)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  // Agrupar por caja
  const byRegister = {}
  ;(data || []).forEach(inv => {
    const key = inv.register_id || 'sin_caja'
    if (!byRegister[key]) {
      byRegister[key] = {
        register_id:   inv.register_id,
        register_name: inv.register_name || 'Sin caja asignada',
        cashier_name:  inv.cashier_name || null,
        total:         0,
        count:         0,
        by_method:     { cash: 0, transfer: 0, card: 0 },
      }
    }
    byRegister[key].total += inv.total || 0
    byRegister[key].count += 1
    if (inv.pay_method) byRegister[key].by_method[inv.pay_method] += inv.total || 0
    // Guardar último cajero visto (puede haber rotación)
    if (inv.cashier_name) byRegister[key].cashier_name = inv.cashier_name
  })

  const result = Object.values(byRegister)
    .map(r => ({ ...r, avg_ticket: r.count > 0 ? r.total / r.count : 0 }))
    .sort((a, b) => b.total - a.total)

  return res.status(200).json(result)
}
