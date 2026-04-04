import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAdmin }  from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  // GET — catálogo con presentaciones y stock por punto de venta
  if (req.method === 'GET') {
    const { location_id } = req.query

    // Productos con categorías y presentaciones
    const { data: products, error } = await supabaseAdmin
      .from('products')
      .select(`
        id, name, description, active,
        categories ( id, name, icon, sort_order ),
        presentations ( id, label, price, active )
      `)
      .eq('active', true)
      .order('name')

    if (error) return res.status(500).json({ error: error.message })

    // Filtrar presentaciones activas
    let result = products.map(p => ({
      ...p,
      presentations: (p.presentations || []).filter(pr => pr.active)
    }))

    // Agregar stock si se provee location_id
    if (location_id) {
      const { data: stockRows } = await supabaseAdmin
        .from('stock')
        .select('product_id, quantity')
        .eq('location_id', location_id)

      const stockMap = {}
      ;(stockRows || []).forEach(s => { stockMap[s.product_id] = s.quantity })

      result = result.map(p => ({ ...p, stock_quantity: stockMap[p.id] ?? 0 }))
    }

    // Ordenar por categoría sort_order
    result.sort((a, b) => {
      const sortA = a.categories?.sort_order ?? 99
      const sortB = b.categories?.sort_order ?? 99
      return sortA - sortB || a.name.localeCompare(b.name, 'es')
    })

    res.setHeader('Cache-Control', 'public, max-age=300') // 5 min
    return res.status(200).json(result)
  }

  // POST — crear producto (admin)
  if (req.method === 'POST') {
    const auth = await requireAdmin(req, res)
    if (!auth) return

    const { name, category_id, description, presentations = [] } = req.body || {}
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' })

    // Crear producto
    const { data: product, error: prodErr } = await supabaseAdmin
      .from('products')
      .insert({ name, category_id, description })
      .select()
      .single()

    if (prodErr) return res.status(500).json({ error: prodErr.message })

    // Crear presentaciones
    if (presentations.length > 0) {
      const rows = presentations.map(p => ({
        product_id: product.id,
        label:      p.label,
        price:      p.price,
      }))
      await supabaseAdmin.from('presentations').insert(rows)
    }

    // Retornar producto completo
    const { data: full } = await supabaseAdmin
      .from('products')
      .select('*, categories(*), presentations(*)')
      .eq('id', product.id)
      .single()

    return res.status(201).json(full)
  }

  return res.status(405).json({ error: 'Método no permitido' })
}
