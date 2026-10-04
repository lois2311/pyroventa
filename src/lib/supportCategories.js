// =====================================================
// VENDRA POS — Catálogo de Escenarios de Soporte y Auto-Resolución
// =====================================================

export const SUPPORT_CATALOG = [
  {
    id: 'printer',
    label: 'Impresora / Periféricos',
    shortLabel: 'Impresora',
    iconName: 'Printer',
    description: 'Fallas de conexión con QZ Tray, corte de papel o recibos en blanco.',
    defaultPriority: 'medium',
    issues: [
      {
        id: 'qz_offline',
        label: 'QZ Tray no conecta / desconectado',
        tip: 'Verifica que la app QZ Tray esté abierta en la barra de tareas de Windows (ícono verde). Si no conecta, puedes imprimir usando la opción "Navegador" o "PDF" mientras tanto.',
      },
      {
        id: 'paper_jam',
        label: 'Papel atascado / no corta',
        tip: 'Abre la tapa de la impresora térmica, retira el papel sobrante y vuelve a cerrar firmemente hasta escuchar el clic. Prueba con el botón "Alimentar papel" (Feed).',
      },
      {
        id: 'blank_receipt',
        label: 'Recibo sale en blanco o desalineado',
        tip: 'Verifica que el rollo térmico esté en el sentido correcto (la cara térmica suele ser la exterior). Revisa en Admin -> Impresora si el ancho configurado es 58mm u 80mm.',
      },
    ],
  },
  {
    id: 'payment',
    label: 'Caja y Cobros',
    shortLabel: 'Cobros',
    iconName: 'CreditCard',
    description: 'Comprobantes de transferencia dudosos, datáfono o códigos no encontrados.',
    defaultPriority: 'high',
    issues: [
      {
        id: 'transfer_verification',
        label: 'Comprobante de Nequi / Bancolombia / Daviplata dudoso',
        tip: 'Verifica en la app oficial del negocio que el saldo haya ingresado y que coincida el número de aprobación M-XXXXX y la hora exacta.',
      },
      {
        id: 'pos_terminal_error',
        label: 'Datáfono aprobó pero no se registró en pantalla',
        tip: 'Si el voucher físico salió aprobado, puedes registrar la venta seleccionando "Tarjeta" en la pantalla de cobro para que quede cuadrada tu caja.',
      },
      {
        id: 'code_not_found',
        label: 'Código de 4 dígitos no aparece en caja o expiró',
        tip: 'Pide al vendedor que revise en su pantalla si la venta sigue abierta en su carrito o si generó un código nuevo.',
      },
      {
        id: 'refund_needed',
        label: 'Devolución de factura requerida',
        tip: 'En la pantalla de Caja puedes presionar el botón de devolución (↩) en las facturas de hoy indicando el motivo obligatorio.',
      },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventario y Precios',
    shortLabel: 'Inventario',
    iconName: 'Package',
    description: 'Existencias insuficientes, precios desactualizados o productos faltantes.',
    defaultPriority: 'medium',
    issues: [
      {
        id: 'out_of_stock',
        label: 'Venta bloqueada por existencia insuficiente',
        tip: 'El administrador de tu punto puede ingresar a Inventario y registrar una reposición rápida si el producto físico sí se encuentra disponible.',
      },
      {
        id: 'price_mismatch',
        label: 'El precio del sistema no coincide con la estantería',
        tip: 'El administrador o superadministrador puede ajustar el precio diferencial para este punto de venta desde Administración -> Productos.',
      },
      {
        id: 'missing_product',
        label: 'Producto no aparece en el catálogo del punto',
        tip: 'Revisa si el producto está habilitado para este punto de venta en Administración -> Puntos -> Configurar catálogo.',
      },
    ],
  },
  {
    id: 'auth',
    label: 'Cuentas y Acceso',
    shortLabel: 'Acceso',
    iconName: 'KeyRound',
    description: 'PIN bloqueado, olvido de credenciales o licencias vencidas.',
    defaultPriority: 'high',
    issues: [
      {
        id: 'pin_locked',
        label: 'PIN bloqueado por intentos fallidos (15 min)',
        tip: 'El sistema bloquea temporalmente por seguridad tras 5 intentos erróneos. Espera 15 minutos o pide a tu administrador que revise tu PIN asignado.',
      },
      {
        id: 'license_notice',
        label: 'Aviso de licencia por vencer o vencida',
        tip: 'Comunícate con el dueño de la empresa para renovar la vigencia del servicio con Flightdev.',
      },
    ],
  },
  {
    id: 'system',
    label: 'Error del Sistema / Bloqueo',
    shortLabel: 'Sistema',
    iconName: 'AlertTriangle',
    description: 'Pantalla congelada, fallas de conexión o errores en pantalla.',
    defaultPriority: 'critical',
    issues: [
      {
        id: 'app_frozen',
        label: 'Pantalla congelada o sin respuesta',
        tip: 'Recarga la página (F5 o deslizar hacia abajo). Tus datos están seguros y las ventas pendientes se conservan en la base de datos.',
      },
      {
        id: 'offline_sync',
        label: 'Sin conexión a internet / cola pendiente',
        tip: 'VENDRA POS funciona sin conexión guardando tus operaciones en el equipo. Apenas regrese la red se sincronizarán automáticamente.',
      },
    ],
  },
  {
    id: 'other',
    label: 'Otro / Duda Operativa',
    shortLabel: 'Otro',
    iconName: 'HelpCircle',
    description: 'Cualquier otra consulta, sugerencia o asistencia requerida.',
    defaultPriority: 'low',
    issues: [
      {
        id: 'general_question',
        label: 'Duda sobre el funcionamiento de la plataforma',
        tip: 'Puedes consultar los atajos presionando la tecla "?" en cualquier momento, o solicitar asistencia a nuestro equipo.',
      },
    ],
  },
]

export function getCategoryById(id) {
  return SUPPORT_CATALOG.find(c => c.id === id) || null
}

export function getQuickTips(categoryId, issueId) {
  const cat = getCategoryById(categoryId)
  if (!cat) return null
  const issue = cat.issues.find(i => i.id === issueId)
  return issue?.tip || null
}
