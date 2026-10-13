import { test, expect, signIn, fail } from './fixtures.js'

// Vendra Pedidos (PR-06): bandeja de conversaciones de WhatsApp con la API simulada.
const SHOTS = process.env.SHOTS_DIR
if (process.env.E2E_W) test.use({ viewport: { width: Number(process.env.E2E_W), height: 800 } })
const ago = (min) => new Date(Date.now() - min * 60000).toISOString()
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}-${page.viewportSize().width}.png` })

const CONVERSATIONS = [
  { id: 'c1', location_id: 'l1', status: 'open', last_message_at: ago(3), last_inbound_at: ago(3), last_message_preview: 'Hola, ¿tienen volcanes para el sábado?', window_open: true,
    customer: { name: 'Ana Pérez', phone: '+573001234567' } },
  { id: 'c2', location_id: 'l1', status: 'open', last_message_at: ago(60 * 30), last_inbound_at: ago(60 * 30), last_message_preview: 'Gracias, quedo atenta', window_open: false,
    customer: { name: null, phone: '+573109876543' } },
]
const message = (id, direction, body, min, status = 'received') => ({ id, direction, type: 'text', body, status, created_at: ago(min) })
const MESSAGES = {
  c1: { conversation: { id: 'c1', status: 'open', window_open: true }, next_before: null, messages: [
    message('m1', 'inbound', 'Hola, ¿tienen volcanes para el sábado?', 5),
    message('m2', 'outbound', 'Hola Ana, sí tenemos. ¿Cuántos necesitas?', 4, 'delivered'),
    message('m3', 'inbound', 'Unos 20, ¿cuánto sale el domicilio?', 3),
  ] },
  c2: { conversation: { id: 'c2', status: 'open', window_open: false }, next_before: ago(60 * 40), messages: [
    message('m4', 'inbound', 'Gracias, quedo atenta', 60 * 30),
    message('m5', 'outbound', 'No pudimos enviar este mensaje', 60 * 29, 'failed'),
  ] },
}

test.beforeEach(async ({ page, api }) => {
  await signIn(page, 'owner')
  api.on('GET', '/orders/conversations', () => CONVERSATIONS)
  api.on('GET', /^\/orders\/conversations\/[^/]+\/messages$/, ({ path }) => MESSAGES[path.split('/')[3]])
})

test('cola y chat: abrir una conversación muestra el historial y el estado de cada mensaje', async ({ page }) => {
  await page.goto('/admin?tab=conversaciones')
  await expect(page.getByRole('heading', { name: 'Conversaciones', exact: true })).toBeVisible()
  const queue = page.getByRole('region', { name: 'Cola de conversaciones' })
  await expect(queue.getByRole('listitem')).toHaveCount(2)
  await expect(queue.getByText('Fuera de la ventana de 24 h')).toHaveCount(1)
  await shot(page, 'conv-cola')

  await queue.getByRole('button', { name: /Ana Pérez/ }).click()
  const log = page.getByRole('log', { name: 'Mensajes' })
  await expect(log.getByText('Unos 20, ¿cuánto sale el domicilio?')).toBeVisible()
  await expect(log.getByText('Entregado')).toBeVisible()
  // En pantallas angostas la cola se oculta al abrir el chat (maestro → detalle)
  if (page.viewportSize().width >= 1024) await expect(queue.getByRole('button', { name: /Ana Pérez/ })).toHaveAttribute('aria-current', 'true')
  else await expect(page.getByRole('button', { name: 'Volver a la cola' })).toBeVisible()
  await shot(page, 'conv-chat')
})

test('responder: envía con Idempotency-Key, limpia el campo y no envía vacío', async ({ page, api }) => {
  api.on('POST', /\/messages$/, ({ body }) => message('m9', 'outbound', body.text, 0, 'queued'))
  await page.goto('/admin?tab=conversaciones')
  await page.getByRole('button', { name: /Ana Pérez/ }).click()
  const send = page.getByRole('button', { name: 'Enviar' })
  await expect(send).toBeDisabled()
  await page.getByLabel('Respuesta').fill('El domicilio cuesta $5.000')
  await send.click()
  await expect(page.getByLabel('Respuesta')).toHaveValue('')
  const [call] = api.calls('POST', /\/messages$/)
  expect(call.body).toEqual({ text: 'El domicilio cuesta $5.000' })
  expect(call.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
})

test('fuera de la ventana de 24 h: no se puede responder y se explica por qué', async ({ page, api }) => {
  await page.goto('/admin?tab=conversaciones')
  await page.getByRole('button', { name: /\+573109876543/ }).click()
  await expect(page.getByLabel('Respuesta')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'plantillas aprobadas' })).toBeVisible()
  await expect(page.getByText('No enviado')).toBeVisible()
  await shot(page, 'conv-ventana')
  expect(api.calls('POST', /\/messages$/)).toHaveLength(0)
})

test('mensajes anteriores y error del servidor al responder', async ({ page, api }) => {
  api.on('GET', /\/messages$/, ({ path, query }) => query.before
    ? { conversation: MESSAGES.c1.conversation, next_before: null, messages: [message('m0', 'inbound', 'Mensaje antiguo', 120)] }
    : MESSAGES[path.split('/')[3]])
  api.on('POST', /\/messages$/, () => fail(409, 'Pasaron más de 24 h desde el último mensaje del cliente.'))
  await page.goto('/admin?tab=conversaciones')
  await page.getByRole('button', { name: /Ana Pérez/ }).click()
  await page.getByLabel('Respuesta').fill('Hola')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Pasaron más de 24 h' })).toBeVisible()
  await expect(page.getByLabel('Respuesta')).toHaveValue('Hola') // no se pierde lo escrito
})

test('estado vacío', async ({ page, api }) => {
  api.on('GET', '/orders/conversations', () => [])
  await page.goto('/admin?tab=conversaciones')
  await expect(page.getByText('No hay conversaciones abiertas')).toBeVisible()
  if (page.viewportSize().width >= 1024) await expect(page.getByText('Elige una conversación')).toBeVisible() // en móvil el panel de chat vacío no se muestra
})
