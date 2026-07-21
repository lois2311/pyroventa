import { describe, it, expect } from 'vitest'
import { parseImageDataUrl, isAllowedImageUrl, imagePathFromUrl } from '../productImages.js'

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

describe('parseImageDataUrl', () => {
  it('acepta png/jpeg/webp en base64 y retorna mime, ext y buffer', () => {
    const out = parseImageDataUrl(`data:image/png;base64,${PNG_1PX}`)
    expect(out).not.toBeNull()
    expect(out.mime).toBe('image/png')
    expect(out.ext).toBe('png')
    expect(out.buffer.length).toBeGreaterThan(0)
  })

  it('rechaza mimes no permitidos y payloads malformados', () => {
    expect(parseImageDataUrl(`data:image/svg+xml;base64,${PNG_1PX}`)).toBeNull()
    expect(parseImageDataUrl(`data:image/gif;base64,${PNG_1PX}`)).toBeNull()
    expect(parseImageDataUrl('data:image/png;base64,!!!no-base64!!!')).toBeNull()
    expect(parseImageDataUrl('https://example.com/x.png')).toBeNull()
    expect(parseImageDataUrl(null)).toBeNull()
    expect(parseImageDataUrl('data:image/png;base64,')).toBeNull()
  })

  it('rechaza imágenes que exceden el tamaño máximo', () => {
    expect(parseImageDataUrl(`data:image/png;base64,${PNG_1PX}`, 10)).toBeNull()
  })
})

describe('isAllowedImageUrl', () => {
  const ctx = { supabaseUrl: 'https://abc.supabase.co', tenantId: 'tenant-1' }

  it('acepta solo URLs del bucket público dentro de la carpeta del tenant', () => {
    expect(isAllowedImageUrl('https://abc.supabase.co/storage/v1/object/public/product-images/tenant-1/foto.webp', ctx)).toBe(true)
  })

  it('rechaza otros hosts, otros tenants, subcarpetas y caracteres raros', () => {
    expect(isAllowedImageUrl('https://evil.com/storage/v1/object/public/product-images/tenant-1/x.webp', ctx)).toBe(false)
    expect(isAllowedImageUrl('https://abc.supabase.co/storage/v1/object/public/product-images/tenant-2/x.webp', ctx)).toBe(false)
    expect(isAllowedImageUrl('https://abc.supabase.co/storage/v1/object/public/product-images/tenant-1/../x.webp', ctx)).toBe(false)
    expect(isAllowedImageUrl('https://abc.supabase.co/storage/v1/object/public/otro-bucket/tenant-1/x.webp', ctx)).toBe(false)
    expect(isAllowedImageUrl(`https://abc.supabase.co/storage/v1/object/public/product-images/tenant-1/${'a'.repeat(600)}.webp`, ctx)).toBe(false)
    expect(isAllowedImageUrl(123, ctx)).toBe(false)
  })

  it('tolera SUPABASE_URL con slash final', () => {
    expect(isAllowedImageUrl('https://abc.supabase.co/storage/v1/object/public/product-images/tenant-1/foto.webp', { ...ctx, supabaseUrl: 'https://abc.supabase.co/' })).toBe(true)
  })
})

describe('imagePathFromUrl', () => {
  const opts = { supabaseUrl: 'https://abc.supabase.co' }

  it('extrae la ruta dentro del bucket desde la URL pública', () => {
    expect(imagePathFromUrl('https://abc.supabase.co/storage/v1/object/public/product-images/tenant-1/foto.webp', opts))
      .toBe('tenant-1/foto.webp')
  })

  it('retorna null para URLs ajenas al bucket', () => {
    expect(imagePathFromUrl('https://evil.com/storage/v1/object/public/product-images/t/x.webp', opts)).toBeNull()
    expect(imagePathFromUrl('https://abc.supabase.co/storage/v1/object/public/otro/t/x.webp', opts)).toBeNull()
    expect(imagePathFromUrl(null, opts)).toBeNull()
  })
})
