import { useState } from 'react'
import {
  Printer, CreditCard, Package, KeyRound, AlertTriangle, HelpCircle,
  LifeBuoy, CheckCircle2, MessageSquare, Loader2, ArrowLeft, Send, Phone,
} from 'lucide-react'
import Modal from './Modal.jsx'
import { SUPPORT_CATALOG, getQuickTips } from '../lib/supportCategories.js'
import { collectTechnicalContext } from '../lib/supportTelemetry.js'
import { buildWhatsAppSupportUrl } from '../lib/whatsappSupport.js'
import { useAuthStore } from '../store/authStore.js'
import { api } from '../lib/api.js'

const ICONS = {
  Printer,
  CreditCard,
  Package,
  KeyRound,
  AlertTriangle,
  HelpCircle,
}

export default function SupportModal({ onClose, contextData = {} }) {
  const { tenant, location, register, seller } = useAuthStore()

  const [category, setCategory] = useState(contextData.initialCategory || null)
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [description, setDescription] = useState('')
  const [contactPhone, setContactPhone] = useState(() => localStorage.getItem('pv_last_support_phone') || '')
  const [reporterName, setReporterName] = useState(() => seller?.name || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [createdResult, setCreatedResult] = useState(null) // { ticket, support_whatsapp }

  const handleSelectCategory = (cat) => {
    setCategory(cat)
    setSelectedIssue(null)
    setError(null)
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!category) return

    setLoading(true)
    setError(null)

    try {
      if (contactPhone.trim()) {
        localStorage.setItem('pv_last_support_phone', contactPhone.trim())
      }

      const technicalContext = collectTechnicalContext({
        location,
        register,
        activeInvoice: contextData.activeInvoice || null,
        qzStatus: contextData.qzStatus || null,
      })

      const body = {
        tenant_id: tenant?.id || contextData.tenantId,
        tenant_name: tenant?.name || contextData.tenantName || 'Empresa VENDRA',
        location_id: location?.id || null,
        location_name: location?.name || null,
        register_id: register?.id || null,
        register_name: register?.name || null,
        reported_by_id: seller?.id || null,
        reported_by_name: reporterName.trim() || seller?.name || 'Operador en tienda',
        reported_by_role: seller?.role || null,
        contact_phone: contactPhone.trim(),
        category: category.id,
        subcategory: selectedIssue?.id || null,
        description: description.trim() || selectedIssue?.label || 'Solicitud de asistencia',
        priority: category.defaultPriority || 'medium',
        technical_context: technicalContext,
      }

      const result = await api.post('/support/tickets', body)
      setCreatedResult(result)
    } catch (err) {
      setError(err.message || 'No se pudo registrar el ticket. Verifica tu conexión o contáctanos por WhatsApp.')
    } finally {
      setLoading(false)
    }
  }

  // --- Pantalla de Éxito con Botón a WhatsApp ---
  if (createdResult) {
    const { ticket, support_whatsapp } = createdResult
    const whatsappUrl = buildWhatsAppSupportUrl({
      supportPhone: support_whatsapp,
      ticketCode: ticket.ticket_code,
      tenantName: ticket.tenant_name,
      categoryLabel: category?.label,
      locationName: ticket.location_name,
      customText: ticket.description,
    })

    return (
      <Modal
        title="¡Ticket de soporte recibido!"
        icon={CheckCircle2}
        iconClassName="text-green-400"
        onClose={onClose}
        footer={
          <button type="button" onClick={onClose} className="btn-primary w-full">
            Listo, volver a la app
          </button>
        }
      >
        <div className="space-y-4 text-center sm:text-left">
          <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 text-center">
            <span className="eyebrow block text-brand-400">Número de ticket</span>
            <span className="font-mono text-2xl font-bold tracking-wider text-white">
              {ticket.ticket_code}
            </span>
            <p className="mt-1 text-xs text-gray-400">
              Nuestro equipo de soporte ya tiene este reporte en la mesa de ayuda.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-surface-400 p-4 space-y-3">
            <p className="text-sm font-medium text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-green-400" />
              Atención directa por WhatsApp
            </p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Para atención prioritaria o si tu caja está bloqueada, abre el chat directo con nuestro equipo técnico. El mensaje ya incluye el diagnóstico de tu punto de venta.
            </p>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-black transition-opacity hover:opacity-90 active:opacity-80"
            >
              <MessageSquare className="w-4 h-4" />
              Abrir WhatsApp con Soporte
            </a>
          </div>
        </div>
      </Modal>
    )
  }

  // --- Paso 1: Selección de Categoría ---
  if (!category) {
    return (
      <Modal
        title="Mesa de Soporte VENDRA"
        description="Selecciona la situación con la que necesitas asistencia:"
        icon={LifeBuoy}
        size="lg"
        onClose={onClose}
        footer={
          <button type="button" onClick={onClose} className="btn-ghost">
            Cerrar
          </button>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {SUPPORT_CATALOG.map((cat) => {
            const Icon = ICONS[cat.iconName] || HelpCircle
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat)}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-surface-400 p-3.5 text-left transition hover:border-brand-500/40 hover:bg-surface-300 active:scale-[0.99]"
              >
                <div className="rounded-lg bg-white/5 p-2 text-brand-400">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{cat.label}</p>
                  <p className="text-xs text-gray-400 line-clamp-2 mt-0.5">{cat.description}</p>
                </div>
              </button>
            )
          })}
        </div>
      </Modal>
    )
  }

  // --- Paso 2: Detalle del Problema y Envío ---
  const CategoryIcon = ICONS[category.iconName] || HelpCircle
  const activeTip = selectedIssue ? getQuickTips(category.id, selectedIssue.id) : null

  return (
    <Modal
      title={category.label}
      description="Elige el problema específico o describe la situación:"
      icon={CategoryIcon}
      size="lg"
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <button
            type="button"
            onClick={() => setCategory(null)}
            className="btn-ghost"
            disabled={loading}
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Categorías
          </button>
          <button
            type="submit"
            disabled={loading || !contactPhone.trim()}
            className="btn-primary"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" /> Enviar Ticket</>}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Problemas frecuentes de esta categoría */}
        {category.issues?.length > 0 && (
          <div>
            <span className="field-label mb-2 block">Problema frecuente:</span>
            <div className="space-y-2">
              {category.issues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => setSelectedIssue(issue)}
                  className={`w-full text-left rounded-xl border p-3 text-xs transition ${
                    selectedIssue?.id === issue.id
                      ? 'border-brand-500/60 bg-brand-500/10 text-white font-medium'
                      : 'border-white/10 bg-surface-400 text-gray-300 hover:border-white/20'
                  }`}
                >
                  {issue.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Consejo de auto-ayuda inmediata */}
        {activeTip && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <span className="font-semibold block mb-1">💡 Consejo rápido de solución:</span>
            {activeTip}
          </div>
        )}

        {/* Descripción libre opcional */}
        <div>
          <label htmlFor="sup-desc" className="field-label">
            Detalle adicional <span className="font-normal text-gray-400">(opcional)</span>
          </label>
          <textarea
            id="sup-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Escribe brevemente qué sucede o qué mensaje apareció..."
            className="input resize-none text-xs"
          />
        </div>

        {/* Teléfono de contacto */}
        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-white/10">
          <div>
            <label htmlFor="sup-phone" className="field-label flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-brand-400" />
              Teléfono / WhatsApp de contacto *
            </label>
            <input
              id="sup-phone"
              type="tel"
              required
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="300 123 4567"
              className="input font-mono text-sm"
            />
          </div>
          <div>
            <label htmlFor="sup-reporter" className="field-label">
              Nombre de quien reporta
            </label>
            <input
              id="sup-reporter"
              type="text"
              value={reporterName}
              onChange={(e) => setReporterName(e.target.value)}
              placeholder="Nombre del cajero o vendedor"
              className="input text-sm"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
