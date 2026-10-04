import { test, expect, signIn, TENANT, LOCATIONS } from './fixtures.js'

test.describe('Módulo de Soporte al Cliente y Mesa de Ayuda', () => {
  test('cajero reporta incidencia con wizard de 3 pasos y obtiene código VND', async ({ page, api }) => {
    // Interceptar creación de ticket
    api.on('POST', '/support/tickets', ({ body }) => ({
      ticket: {
        id: 'tick-test-123',
        ticket_code: 'VND-1001',
        category: body.category,
        priority: 'high',
        status: 'open',
        description: body.description,
        contact_phone: body.contact_phone,
        tenant_name: TENANT.name,
        location_name: LOCATIONS[0].name,
        created_at: new Date().toISOString(),
      },
    }))

    await signIn(page, 'cashier')
    await page.goto('/caja')

    // 1. Abrir modal desde Topbar
    const soporteBtn = page.getByRole('button', { name: /Soporte/i }).first()
    await expect(soporteBtn).toBeVisible()
    await soporteBtn.click()

    const modal = page.getByRole('dialog', { name: 'Mesa de Soporte VENDRA' })
    await expect(modal).toBeVisible()

    // 2. Seleccionar categoría: Impresora
    await page.getByRole('button', { name: /Impresora/i }).first().click()

    // 3. Seleccionar problema frecuente
    await page.getByRole('button', { name: /QZ Tray/i }).first().click()

    // 4. Completar teléfono y descripción adicional usando selectores directos
    await page.locator('#sup-phone').fill('3001234567')
    await page.locator('#sup-desc').fill('No corta el papel y no responde')

    // 5. Enviar ticket
    await page.getByRole('button', { name: /Enviar Ticket/i }).click()

    // 6. Verificar pantalla de confirmación
    await expect(page.getByText('¡Ticket de soporte recibido!')).toBeVisible()
    await expect(page.getByText('VND-1001')).toBeVisible()

    // 7. Verificar botón directo a WhatsApp
    const waLink = page.getByRole('link', { name: /Abrir WhatsApp con Soporte/i })
    await expect(waLink).toBeVisible()
    await expect(waLink).toHaveAttribute('href', /wa\.me/)
    await expect(waLink).toHaveAttribute('href', /VND-1001/)

    // 8. Cerrar modal y volver a la caja sin pérdida de estado
    await page.getByRole('button', { name: 'Listo, volver a la app' }).click()
    await expect(modal).toBeHidden()
    await expect(page).toHaveURL(/\/caja$/)

    // Confirmar que la API recibió la telemetría del navegador
    const calls = api.calls('POST', '/support/tickets')
    expect(calls).toHaveLength(1)
    expect(calls[0].body).toMatchObject({
      category: 'printer',
      contact_phone: '3001234567',
    })
    expect(calls[0].body.technical_context).toBeDefined()
    expect(calls[0].body.technical_context.url).toContain('/caja')
  })

  test('atajo de teclado F9 abre el modal de soporte en cualquier pantalla', async ({ page }) => {
    await signIn(page, 'seller')
    await page.goto('/vender')

    // Asegurar foco fuera de inputs antes de presionar F9
    await page.locator('body').click({ position: { x: 5, y: 700 } })
    await page.keyboard.press('F9')

    const modal = page.getByRole('dialog', { name: 'Mesa de Soporte VENDRA' })
    await expect(modal).toBeVisible()

    // Cerrar modal usando el botón Cerrar del pie
    await modal.getByRole('button', { name: 'Cerrar' }).last().click()
    await expect(modal).toBeHidden()
  })

  test('superadmin gestiona incidencias en Mesa de Soporte', async ({ page, api }) => {
    const mockTickets = [
      {
        id: 'tick-e2e-1',
        ticket_code: 'VND-1002',
        category: 'payment',
        priority: 'urgent',
        status: 'open',
        description: 'Transacción Nequi no refleja comprobante',
        contact_phone: '3109876543',
        tenant_name: 'Pirotecnia La Chispa',
        location_name: 'Local Principal',
        seller_name: 'Carlos Rodríguez',
        created_at: new Date().toISOString(),
        technical_context: { route: '/caja', online: true, screen: '1920x1080', invoice_code: '4821' },
      },
    ]

    api.on('POST', '/auth/super/login', () => ({ token: 'mock-super-token' }))
    api.on('GET', '/super/tenants', () => [{ id: 't1', name: 'Pirotecnia La Chispa', active: true, slug: 'la-chispa', plan: 'standard', locations: [], owners: [] }])
    api.on('GET', /^\/super\/metrics/, () => ({ tenants: [] }))
    api.on('GET', /^\/super\/support\/tickets/, () => ({
      tickets: mockTickets,
      stats: { total: 1, open: 1, in_progress: 0, resolved: 0 },
    }))
    api.on('PATCH', /^\/super\/support\/tickets/, ({ body }) => {
      mockTickets[0] = { ...mockTickets[0], ...body }
      return { ticket: mockTickets[0] }
    })

    // Login superadmin vía formulario
    await page.goto('/super/login')
    await page.getByLabel('Email').fill('admin@vendra.co')
    await page.getByLabel('Contraseña').fill('superpass')
    await page.getByRole('button', { name: 'Ingresar' }).click()

    await expect(page).toHaveURL(/\/super$/)
    await page.waitForLoadState('networkidle')

    // Cambiar a la pestaña Mesa de Soporte
    const tabBtn = page.getByRole('button', { name: /Mesa de Soporte/i })
    await expect(tabBtn).toBeVisible()
    await tabBtn.click()

    await expect(page.getByText('Mesa de Soporte de Plataforma')).toBeVisible()

    // Verificar que el ticket VND-1002 aparece en la lista
    await expect(page.getByText('VND-1002')).toBeVisible()
    await expect(page.getByRole('table').getByText('Pirotecnia La Chispa')).toBeVisible()
    await expect(page.getByText('Cobros')).toBeVisible()

    // Contactar por WhatsApp desde la fila de la mesa
    const waRowLink = page.getByRole('link', { name: /WhatsApp/i }).first()
    await expect(waRowLink).toBeVisible()
    await expect(waRowLink).toHaveAttribute('href', /wa\.me\/573109876543/)

    // Abrir modal de inspección técnica
    await page.getByTitle('Ver diagnóstico y telemetría').first().click()
    const inspectionModal = page.getByRole('dialog', { name: /Diagnóstico: VND-1002/ })
    await expect(inspectionModal).toBeVisible()
    await expect(inspectionModal.getByText('Transacción Nequi no refleja comprobante')).toBeVisible()
    await expect(inspectionModal.getByText('1920x1080')).toBeVisible()
    await inspectionModal.getByRole('button', { name: 'Cerrar' }).last().click()
    await expect(inspectionModal).toBeHidden()

    // Atender el ticket (pasa a in_progress)
    await page.getByRole('button', { name: 'Atender' }).click()
    expect(mockTickets[0].status).toBe('in_progress')

    // Ahora aparece el botón "Resolver" en la fila
    await page.getByRole('button', { name: 'Resolver' }).click()
    const resolvingModal = page.getByRole('dialog', { name: /Resolver ticket: VND-1002/ })
    await expect(resolvingModal).toBeVisible()

    await resolvingModal.locator('textarea').fill('Se validó comprobante bancario en portal oficial')
    await resolvingModal.getByRole('button', { name: 'Confirmar Resolución' }).click()

    // Verificar que la API recibió la actualización
    const patchCalls = api.calls('PATCH', /^\/super\/support\/tickets/)
    expect(patchCalls.length).toBeGreaterThanOrEqual(2)
    expect(patchCalls[patchCalls.length - 1].body).toMatchObject({
      status: 'resolved',
      resolution_notes: 'Se validó comprobante bancario en portal oficial',
    })
  })
})
