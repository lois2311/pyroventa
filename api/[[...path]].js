import { handleCors } from './_lib/cors.js'
import { adminLogin } from './_lib/adminLogin.js'
import {
  superLogin,
  superTenantsList,
  superTenantsCreate,
  superTenantsPatch,
  superTenantAdminCreate,
  superTenantLocationCreate,
  superMetrics,
} from './_lib/superRoutes.js'
import { authLogin, publicTenantGet } from './_lib/routes/authRoutes.js'
import {
  locationsGet,
  locationsCreate,
  locationsUpdate,
  locationsDelete,
  locationCatalogConfigGet,
  locationCatalogConfigPut,
  printerUploadLogo,
  printerConfigBatchPut,
} from './_lib/routes/locationRoutes.js'
import {
  PRODUCT_SUBROUTES,
  productsGet,
  productsCreate,
  productsBulk,
  productsBulkDelete,
  productsUploadImage,
  productsUpdate,
  productsDelete,
  categoriesGet,
  categoriesCreate,
} from './_lib/routes/catalogRoutes.js'
import {
  sellersGet,
  sellersCreate,
  sellersUpdate,
  sellersDelete,
  registersGet,
  registersCreate,
  registersUpdate,
  registersDelete,
} from './_lib/routes/userRoutes.js'
import { closuresSummary, closuresList, closuresCreate } from './_lib/routes/closureRoutes.js'
import {
  invoicesCreate,
  invoicesPending,
  invoicesHistory,
  invoicesPay,
  invoicesCancel,
  invoicesEdit,
  invoicesRefund,
  invoicesGetByCode,
} from './_lib/routes/invoiceRoutes.js'
import {
  reportDaily,
  reportSellers,
  reportLocations,
  reportRegisters,
  reportSellerDetail,
  reportRegisterDetail,
  reportTopProducts,
  reportByCategory,
  auditPriceChangesGet,
} from './_lib/routes/reportRoutes.js'
import {
  inventoryGet,
  inventoryAdjustPost,
} from './_lib/routes/inventoryRoutes.js'

// =====================================================
// PyroVenta — API Router (Modular Dispatcher)
// Consolida todas las rutas en una sola serverless function
// para mantenerse dentro del límite de 12 del plan Hobby de Vercel.
// =====================================================

export default async function handler(req, res) {
  try {
    return await route(req, res)
  } catch (err) {
    const { reportError } = await import('./_lib/sentry.js')
    await reportError(err, { url: req.url, method: req.method })
    if (!res.headersSent) res.status(500).json({ error: 'Error interno del servidor' })
  }
}

async function route(req, res) {
  if (handleCors(req, res)) return

  const url = req.url || ''
  const apiPath = url.split('?')[0].replace(/^\/api\/?/, '')
  const segments = apiPath.split('/').filter(Boolean)
  const route = '/' + segments.join('/')
  const method = req.method

  // ---- AUTH -----------------------------------------
  if (route === '/auth/login' && method === 'POST') return authLogin(req, res)
  if (route === '/auth/admin-login' && method === 'POST') return adminLogin(req, res)

  // ---- PÚBLICO (bootstrap de login por empresa) -----
  if (segments[0] === 'public' && segments[1] === 'tenant' && segments[2] && segments.length === 3 && method === 'GET') {
    return publicTenantGet(req, res, segments[2])
  }

  // ---- SUPER ADMIN ----------------------------------
  if (route === '/auth/super/login' && method === 'POST') return superLogin(req, res)
  if (route === '/super/tenants' && method === 'GET')     return superTenantsList(req, res)
  if (route === '/super/tenants' && method === 'POST')    return superTenantsCreate(req, res)
  if (segments[0] === 'super' && segments[1] === 'tenants' && segments[2] && !segments[3] && method === 'PATCH') {
    return superTenantsPatch(req, res, segments[2])
  }
  if (segments[0] === 'super' && segments[1] === 'tenants' && segments[2] && segments[3] === 'admin' && method === 'POST') {
    return superTenantAdminCreate(req, res, segments[2])
  }
  if (segments[0] === 'super' && segments[1] === 'tenants' && segments[2] && segments[3] === 'locations' && method === 'POST') {
    return superTenantLocationCreate(req, res, segments[2])
  }
  if (route === '/super/metrics' && method === 'GET')     return superMetrics(req, res)

  // ---- LOCATIONS ------------------------------------
  if (route === '/locations' && method === 'GET')  return locationsGet(req, res)
  if (route === '/locations' && method === 'POST') return locationsCreate(req, res)
  if (segments[0] === 'locations' && segments[1] && segments[2] === 'catalog-config' && method === 'GET') return locationCatalogConfigGet(req, res, segments[1])
  if (segments[0] === 'locations' && segments[1] && segments[2] === 'catalog-config' && method === 'PUT') return locationCatalogConfigPut(req, res, segments[1])
  if (segments[0] === 'locations' && segments[1] && method === 'PUT')    return locationsUpdate(req, res, segments[1])
  if (segments[0] === 'locations' && segments[1] && method === 'DELETE') return locationsDelete(req, res, segments[1])

  // ---- PRINTER & LOGO -------------------------------
  if (route === '/printer/upload-logo' && method === 'POST') return printerUploadLogo(req, res)
  if (route === '/printer/config'      && method === 'PUT')  return printerConfigBatchPut(req, res)

  // ---- PRODUCTS -------------------------------------
  if (route === '/products' && method === 'GET')   return productsGet(req, res)
  if (route === '/products' && method === 'POST')  return productsCreate(req, res)
  if (route === '/products/bulk' && method === 'POST') return productsBulk(req, res)
  if (route === '/products/bulk-delete' && method === 'POST') return productsBulkDelete(req, res)
  if (route === '/products/upload-image' && method === 'POST') return productsUploadImage(req, res)
  if (segments[0] === 'products' && segments[1] && !PRODUCT_SUBROUTES.includes(segments[1]) && method === 'PUT')    return productsUpdate(req, res, segments[1])
  if (segments[0] === 'products' && segments[1] && !PRODUCT_SUBROUTES.includes(segments[1]) && method === 'DELETE') return productsDelete(req, res, segments[1])

  // ---- CATEGORIES -----------------------------------
  if (route === '/categories' && method === 'GET')  return categoriesGet(req, res)
  if (route === '/categories' && method === 'POST') return categoriesCreate(req, res)

  // ---- SELLERS --------------------------------------
  if (route === '/sellers' && method === 'GET')  return sellersGet(req, res)
  if (route === '/sellers' && method === 'POST') return sellersCreate(req, res)
  if (segments[0] === 'sellers' && segments[1] && method === 'PUT')    return sellersUpdate(req, res, segments[1])
  if (segments[0] === 'sellers' && segments[1] && method === 'DELETE') return sellersDelete(req, res, segments[1])

  // ---- REGISTERS ------------------------------------
  if (route === '/registers' && method === 'GET')  return registersGet(req, res)
  if (route === '/registers' && method === 'POST') return registersCreate(req, res)
  if (segments[0] === 'registers' && segments[1] && method === 'PUT')    return registersUpdate(req, res, segments[1])
  if (segments[0] === 'registers' && segments[1] && method === 'DELETE') return registersDelete(req, res, segments[1])

  // ---- CIERRES DE CAJA ------------------------------
  if (route === '/closures/summary' && method === 'GET')  return closuresSummary(req, res)
  if (route === '/closures' && method === 'GET')          return closuresList(req, res)
  if (route === '/closures' && method === 'POST')         return closuresCreate(req, res)

  // ---- INVOICES -------------------------------------
  if (route === '/invoices' && method === 'POST') return invoicesCreate(req, res)
  if (route === '/invoices/pending' && method === 'GET') return invoicesPending(req, res)
  if (route === '/invoices/history' && method === 'GET') return invoicesHistory(req, res)
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'pay'    && method === 'POST') return invoicesPay(req, res, segments[1])
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'cancel' && method === 'POST') return invoicesCancel(req, res, segments[1])
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'edit'   && method === 'POST') return invoicesEdit(req, res, segments[1])
  if (segments[0] === 'invoices' && segments[1] && segments[2] === 'refund' && method === 'POST') return invoicesRefund(req, res, segments[1])
  if (segments[0] === 'invoices' && segments[1] && !segments[2] && method === 'GET') return invoicesGetByCode(req, res, segments[1])

  // ---- REPORTS --------------------------------------
  if (route === '/reports/daily'         && method === 'GET') return reportDaily(req, res)
  if (route === '/reports/sellers'       && method === 'GET') return reportSellers(req, res)
  if (route === '/reports/locations'     && method === 'GET') return reportLocations(req, res)
  if (route === '/reports/registers'     && method === 'GET') return reportRegisters(req, res)
  if (route === '/reports/seller-detail' && method === 'GET') return reportSellerDetail(req, res)
  if (route === '/reports/register-detail' && method === 'GET') return reportRegisterDetail(req, res)
  if (route === '/reports/top-products'  && method === 'GET') return reportTopProducts(req, res)
  if (route === '/reports/by-category'   && method === 'GET') return reportByCategory(req, res)

  // ---- AUDITORÍA ------------------------------------
  if (route === '/audit/price-changes' && method === 'GET') return auditPriceChangesGet(req, res)

  // ---- INVENTARIO & STOCK ---------------------------
  if (route === '/inventory'        && method === 'GET')  return inventoryGet(req, res)
  if (route === '/inventory/adjust' && method === 'POST') return inventoryAdjustPost(req, res)

  return res.status(404).json({ error: `Ruta no encontrada: ${method} /api${route}` })
}
