import { supabaseAdmin } from '../_lib/supabaseAdmin.js'
import { handleCors }    from '../_lib/cors.js'
import { requireAdmin }  from '../_lib/auth.js'

export default async function handler(req, res) {
  if (handleCors(req, res)) return

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const auth = await requireAdmin(req, res)
  if (!auth) return

  const { products } = req.body || {}

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: 'Se requiere un arreglo de productos' })
  }

  // Validar estructura
  for (let i = 0; i < products.length; i++) {
    const p = products[i]
    if (!p.name?.trim()) {
      return res.status(400).json({ error: `Fila ${i + 1}: nombre de producto requerido` })
    }
    if (!Array.isArray(p.presentations) || p.presentations.length === 0) {
      return res.status(400).json({ error: `Producto "${p.name}": requiere al menos una presentación` })
    }
    for (let j = 0; j < p.presentations.length; j++) {
      const pres = p.presentations[j]
      if (!pres.label?.trim()) {
        return res.status(400).json({ error: `Producto "${p.name}", presentación ${j + 1}: label requerido` })
      }
      if (!pres.price || isNaN(pres.price) || pres.price <= 0) {
        return res.status(400).json({ error: `Producto "${p.name}", "${pres.label}": precio inválido` })
      }
    }
  }

  // Obtener o crear categorías
  const categoryNames = [...new Set(products.map(p => p.category?.trim()).filter(Boolean))]
  const categoryMap = {}

  if (categoryNames.length > 0) {
    // Traer categorías existentes
    const { data: existingCats } = await supabaseAdmin
      .from('categories')
      .select('id, name')

    const existingMap = {}
    ;(existingCats || []).forEach(c => {
      existingMap[c.name.toLowerCase()] = c.id
    })

    // Crear las que no existen
    for (const catName of categoryNames) {
      const key = catName.toLowerCase()
      if (existingMap[key]) {
        categoryMap[key] = existingMap[key]
      } else {
        const { data: newCat, error } = await supabaseAdmin
          .from('categories')
          .insert({ name: catName, active: true })
          .select('id')
          .single()
        if (error) {
          return res.status(500).json({ error: `Error creando categoría "${catName}": ${error.message}` })
        }
        categoryMap[key] = newCat.id
        existingMap[key] = newCat.id
      }
    }
  }

  // Insertar productos y presentaciones
  const results = { created: 0, skipped: 0, errors: [] }

  for (const p of products) {
    const catKey = p.category?.trim()?.toLowerCase()
    const categoryId = catKey ? categoryMap[catKey] || null : null

    // Verificar si el producto ya existe (por nombre exacto)
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .ilike('name', p.name.trim())
      .limit(1)

    if (existing && existing.length > 0) {
      results.skipped++
      continue
    }

    // Crear producto
    const { data: newProduct, error: prodErr } = await supabaseAdmin
      .from('products')
      .insert({
        name:        p.name.trim(),
        category_id: categoryId,
        description: p.description?.trim() || null,
        active:      true,
      })
      .select('id')
      .single()

    if (prodErr) {
      results.errors.push(`"${p.name}": ${prodErr.message}`)
      continue
    }

    // Crear presentaciones
    const presentations = p.presentations.map(pres => ({
      product_id: newProduct.id,
      label:      pres.label.trim(),
      price:      Number(pres.price),
      active:     true,
    }))

    const { error: presErr } = await supabaseAdmin
      .from('presentations')
      .insert(presentations)

    if (presErr) {
      results.errors.push(`"${p.name}" presentaciones: ${presErr.message}`)
      continue
    }

    results.created++
  }

  return res.status(200).json({
    message: `${results.created} producto(s) creado(s), ${results.skipped} omitido(s) (ya existían)`,
    ...results,
  })
}
