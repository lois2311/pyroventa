# PLAN MAESTRO DE DESARROLLO
# VENDRA PEDIDOS

**Versión:** 1.0  
**Estado:** Plan base para aprobación y ejecución incremental  
**Producto:** Vendra POS  
**Nombre comercial del módulo:** Vendra Pedidos  
**Nombre técnico interno:** `connect`  
**Estrategia:** Monolito modular, desarrollo incremental y lanzamiento mediante piloto controlado.

---

## 1. Visión del producto

Vendra Pedidos será el módulo de Vendra POS que permitirá a los comercios centralizar la atención de clientes, administrar conversaciones de WhatsApp, generar cotizaciones, recibir pedidos y coordinar sus domicilios desde una misma plataforma.

La solución debe reducir el trabajo manual de atender consultas, evitar que se pierdan oportunidades de venta y proporcionar trazabilidad desde la primera conversación hasta la entrega del pedido.

### Objetivos de negocio

1. Convertir conversaciones y cotizaciones en pedidos registrados y gestionables.
2. Centralizar las conversaciones de WhatsApp dentro de Vendra.
3. Permitir que los operadores atiendan conversaciones manualmente cuando la automatización no sea suficiente.
4. Gestionar pagos mediante contraentrega o transferencia con verificación manual.
5. Coordinar domiciliarios propios del comercio.
6. Ofrecer el módulo a múltiples empresas mediante suscripciones y configuración por comercio.
7. Construir una solución reutilizable, sin desarrollar un chatbot independiente para cada cliente.

### Principios arquitectónicos

- Vendra conserva la autoridad sobre catálogo, precios, pedidos, pagos registrados y entregas.
- WhatsApp es un canal de comunicación, no la base de datos comercial.
- Una conversación no equivale a un pedido.
- Un pedido no equivale a una factura.
- La aceptación comercial no implica automáticamente autorización de despacho.
- El módulo no debe alterar los flujos actuales de caja, facturación ni inventario.
- Las funcionalidades se activan mediante configuración y permisos por comercio.
- La fiabilidad, el aislamiento entre empresas y la trazabilidad son requisitos de primera clase.

---

## 2. Alcance inicial del piloto

### Contexto operativo

El primer despliegue se realizará con un cliente que opera en una sola ciudad y dispone de una sede principal desde la cual se despachan todos los pedidos.

| Variable | Decisión para el piloto |
|---|---|
| Clientes empresariales | 1 |
| Ciudad | 1 |
| Sede de despacho | 1 |
| Canal de WhatsApp | 1 número inicialmente |
| Inventario | Fuera del alcance |
| Catálogo y precios | Reutilizar Vendra |
| Domiciliarios | Personal propio del comercio |
| Pago | Contraentrega o transferencia manual |
| Facturación POS | Fuera del flujo automático del piloto |
| IA generativa | No necesaria inicialmente |
| Arquitectura | Backend y base de datos actuales |
| Multiempresa | Obligatorio desde el diseño |

Aunque el piloto opere con una sola sede, las entidades nuevas deberán incorporar el aislamiento por comercio y sede que corresponda, de acuerdo con el modelo existente.

### Funcionalidades incluidas

1. Configuración comercial del módulo.
2. Catálogo público con precios vigentes.
3. Cotizador sin creación de factura.
4. Formulario web para recibir pedidos.
5. Gestión de clientes y direcciones.
6. Bandeja de conversaciones de WhatsApp.
7. Envío y recepción de mensajes.
8. Atención humana y automatizaciones deterministas.
9. Gestión de solicitudes de pedido.
10. Verificación manual de transferencias.
11. Gestión de domiciliarios.
12. Asignación y seguimiento de entregas.
13. Notificaciones de cambios de estado.
14. Auditoría, reintentos y monitoreo.
15. Métricas operativas y comerciales básicas.

### Fuera del alcance inicial

- Gestión o reserva de inventario.
- Asignación automática entre múltiples sedes.
- Optimización de rutas.
- Red de domiciliarios compartida entre comercios.
- Cobros con pasarela de pago integrada.
- Conversión automática de pedidos en facturas.
- Chatbot avanzado con IA generativa.
- Microservicios independientes.
- Aplicaciones móviles nativas.
- Integraciones con múltiples proveedores de WhatsApp simultáneamente.

Estas funcionalidades podrán evaluarse después del piloto, según evidencia de uso y necesidades comerciales.

---

## 3. Arquitectura objetivo

La implementación inicial utilizará el backend, frontend y base de datos existentes.

```text
                   CLIENTES FINALES
                          |
               +----------+----------+
               |                     |
            WhatsApp             Formulario web
               |                     |
               v                     v
        Adaptador WhatsApp      API pública segura
               |                     |
               +----------+----------+
                          |
                          v
                 VENDRA PEDIDOS
                          |
          +---------------+---------------+
          |               |               |
          v               v               v
     Conversaciones     Pedidos       Domicilios
          |               |               |
          +---------------+---------------+
                          |
                          v
                    Supabase / DB
                          |
              +-----------+-----------+
              |                       |
              v                       v
       Catálogo y precios       Eventos / Outbox
          existentes                  |
                                      v
                              Worker administrado
                                      |
                                      v
                           Notificaciones externas
```

### Organización del código

El módulo se organizará por dominios internos:

- `connect/conversations`
- `connect/orders`
- `connect/payments`
- `connect/deliveries`
- `connect/settings`
- `connect/integrations/whatsapp`
- `connect/events`

Los nombres exactos deberán adaptarse a las convenciones reales del repositorio.

No se crearán servicios independientes por dominio. Los módulos podrán compartir infraestructura, autenticación y base de datos, pero deberán mantener responsabilidades y contratos explícitos.

---

## 4. Roadmap maestro por fases

### Fase 0. Gobierno del proyecto y decisiones de arquitectura

**Objetivo:** cerrar las decisiones que afectan el modelo de datos, la seguridad y el funcionamiento comercial.

Actividades:

- Revisar la especificación técnica existente.
- Confirmar los estados y transiciones del pedido.
- Separar aceptación comercial, autorización de despacho y entrega.
- Definir la tarifa fija inicial de domicilio y su configuración.
- Definir cómo se identifica y autoriza a un domiciliario.
- Definir retención de mensajes, datos personales y evidencias de pago.
- Comparar Meta Cloud API directa y Twilio para el onboarding de comercios colombianos.
- Definir la solución de ejecución del worker y procesamiento de eventos.
- Determinar el alcance mínimo de las pantallas.
- Establecer pruebas de regresión para el POS.

**Entregables:**

- Decisiones arquitectónicas registradas (ADR).
- Diagrama de arquitectura aprobado.
- Máquina de estados documentada.
- Modelo de permisos preliminar.
- Plan de implementación por PR.
- Criterios de aceptación globales.

**Criterio de salida:** no quedan decisiones críticas sin resolver para iniciar las migraciones de la primera fase.

---

### Fase 1. Fundación técnica y seguridad

**Objetivo:** preparar una base segura para desarrollar el módulo sin afectar las operaciones existentes.

Actividades:

- Crear las migraciones versionadas necesarias.
- Incorporar permisos de gestión de pedidos, conversaciones y domicilios.
- Reutilizar el sistema de autenticación existente.
- Crear utilidades de autorización por tenant y sede.
- Establecer convenciones de auditoría.
- Definir configuración por comercio.
- Preparar pruebas de aislamiento.
- Revisar índices, restricciones únicas y claves foráneas.
- Verificar compatibilidad con el dispatcher actual de API.

**Entidades iniciales propuestas:**

- `order_settings`
- `whatsapp_channels`, si el modelo de canal se necesita en esta fase
- Tablas de permisos o seeds, según la arquitectura existente

Las demás entidades se introducirán cuando el dominio que las utiliza esté listo. No se crearán tablas sin necesidad demostrada.

**Criterios de aceptación:**

- Un usuario de un comercio no puede acceder a datos de otro.
- Los permisos nuevos no amplían indebidamente los permisos actuales.
- Las migraciones pueden aplicarse en un entorno de prueba.
- La suite actual del POS continúa pasando.
- No se realizan cambios en producción.

---

### Fase 2. Catálogo público y cotizador

**Objetivo:** permitir que un cliente consulte productos y precios y obtenga una cotización verificable.

Actividades:

- Crear una proyección pública del catálogo.
- Reutilizar la lógica de precios existente.
- Exponer únicamente productos autorizados para publicación.
- Validar presentaciones y cantidades.
- Calcular subtotal, tarifa de domicilio y total.
- Establecer vigencia de la cotización.
- Implementar límites de solicitudes públicas.
- Evitar que el cliente envíe precios arbitrarios.
- Validar que el producto continúe activo al confirmar.

**Criterios de aceptación:**

- Los precios se calculan en el servidor.
- El catálogo público no expone datos administrativos ni credenciales.
- Un producto inactivo no puede incluirse en una nueva solicitud.
- Los cambios de precio requieren una nueva confirmación.
- No se crean facturas ni movimientos de inventario.
- Las rutas existentes del POS permanecen intactas.

---

### Fase 3. Dominio de pedidos y gestión comercial

**Objetivo:** completar el ciclo de vida de una solicitud externa independientemente de WhatsApp.

Actividades:

- Registrar clientes y teléfonos normalizados.
- Administrar direcciones de entrega.
- Crear solicitudes idempotentes.
- Guardar un snapshot de productos, precios y cantidades.
- Registrar el origen de la solicitud.
- Implementar estados comerciales.
- Registrar método y estado del pago.
- Permitir aceptación, rechazo y cancelación.
- Mantener un historial de cambios.
- Vincular opcionalmente la solicitud con una conversación.
- Implementar una vista inicial de gestión.

**Modelo de estados propuesto:**

```text
Solicitud:
draft
  -> submitted
  -> under_review
       -> accepted
       -> rejected
       -> cancelled

Pago:
cash_on_delivery
transfer_pending
  -> proof_submitted
  -> manually_verified
  -> rejected

Despacho:
not_ready
  -> ready_for_dispatch
  -> assigned
  -> picked_up
  -> delivered
  -> delivery_failed
```

Los estados anteriores son una base conceptual. Antes de programar se debe acordar el contrato definitivo y qué transiciones son válidas.

**Reglas críticas:**

- Aceptar comercialmente un pedido no verifica el pago.
- Un pedido rechazado no puede despacharse.
- Una transferencia pendiente no equivale a una transferencia confirmada.
- No se crea factura automáticamente.
- Una repetición de solicitud no genera un segundo pedido.
- Las operaciones sensibles registran quién las ejecutó.

**Criterio de salida:** se puede crear, revisar, aceptar o rechazar una solicitud completa sin depender de WhatsApp.

---

### Fase 4. Interfaz administrativa y formulario web

**Objetivo:** hacer operable el módulo dentro de Vendra antes de conectar tráfico real de WhatsApp.

Pantallas:

1. Inicio y métricas de pedidos.
2. Bandeja de pedidos.
3. Detalle del pedido.
4. Configuración comercial.
5. Gestión de domicilios.
6. Gestión de domiciliarios.
7. Formulario público.
8. Estados vacíos, errores, carga y confirmación.

El diseño debe reutilizar el sistema visual y los patrones de navegación actuales del POS.

**Criterios de aceptación:**

- El operador puede gestionar un pedido de principio a fin.
- Los filtros y acciones respetan permisos y alcance por sede.
- El formulario funciona en escritorio y móvil.
- Los errores de validación son comprensibles.
- No se duplican acciones por doble clic o reintentos.
- Las pantallas son accesibles y muestran claramente los estados.

**Hito:** primera versión funcional de Vendra Pedidos, todavía sin integración real de WhatsApp.

---

### Fase 5. Infraestructura de eventos y fiabilidad

**Objetivo:** garantizar que los mensajes y notificaciones no se pierdan ni generen efectos duplicados.

Actividades:

- Implementar registro durable de eventos entrantes.
- Implementar deduplicación mediante identificadores únicos.
- Crear una outbox transaccional para mensajes salientes.
- Configurar un worker administrado.
- Añadir reintentos con espera exponencial y jitter.
- Registrar errores definitivos y permitir su revisión.
- Medir retrasos, intentos y fallos.
- Correlacionar los eventos con conversaciones y pedidos.

**Criterios de aceptación:**

- Repetir un evento no duplica su efecto comercial.
- Una caída del proveedor no elimina una notificación pendiente.
- Un fallo del worker no bloquea las rutas de atención.
- Los eventos agotados quedan visibles para soporte.
- Las credenciales y los datos personales no aparecen en logs.
- Los reintentos no provocan mensajes ni pedidos duplicados.

No se considerará lista la integración de producción si las notificaciones críticas dependen exclusivamente de ejecutar trabajo en segundo plano dentro de una solicitud HTTP.

---

### Fase 6. Integración de WhatsApp

**Objetivo:** conectar el número del comercio y gestionar las conversaciones desde Vendra.

Actividades:

- Ejecutar la prueba de onboarding del proveedor elegido.
- Implementar el adaptador de WhatsApp.
- Configurar verificación y validación de firmas de webhooks.
- Resolver la asociación entre canal, comercio y sede.
- Recibir mensajes entrantes y estados de entrega.
- Persistir mensajes con una política de retención definida.
- Mostrar conversaciones en la bandeja.
- Permitir respuesta humana.
- Gestionar errores de envío.
- Implementar plantillas aprobadas cuando sean necesarias.
- Automatizar preguntas frecuentes y enlaces al catálogo o formulario.
- Transferir la conversación al operador cuando el flujo no pueda continuar.

**Criterios de aceptación:**

- El número conectado corresponde al comercio autorizado.
- Un canal desconectado no puede originar nuevas solicitudes.
- Los mensajes duplicados se procesan una sola vez.
- El operador puede responder desde Vendra.
- Los errores del proveedor son visibles y recuperables.
- La ventana de atención y las políticas de plantillas se respetan.
- Los datos de un comercio no se mezclan con los de otro.

**Hito:** un cliente puede consultar productos, cotizar, solicitar un pedido y recibir actualizaciones desde WhatsApp.

---

### Fase 7. Gestión de domicilios

**Objetivo:** completar la operación logística del piloto.

Actividades:

- Configurar la tarifa fija inicial.
- Registrar domiciliarios del comercio.
- Crear entregas asociadas a pedidos autorizados.
- Asignar manualmente el domiciliario.
- Crear una vista móvil autenticada.
- Mostrar únicamente las entregas asignadas.
- Permitir marcar recogida y entrega.
- Registrar novedades e intentos fallidos.
- Notificar cambios relevantes al operador y al cliente.

**Criterios de aceptación:**

- Solo los pedidos autorizados pueden despacharse.
- Un domiciliario no puede ver entregas de otro.
- No se puede marcar como entregado un pedido no recogido.
- Las transiciones inválidas se rechazan en el servidor.
- El historial de entrega es auditable.
- La operación puede pausarse cuando el comercio alcance su capacidad.

La primera versión no incluirá optimización de rutas, asignación automática geográfica ni gestión de inventario.

---

### Fase 8. Pruebas integrales, piloto y lanzamiento

**Objetivo:** comprobar que la solución funciona bajo condiciones reales de operación.

Actividades:

- Ejecutar pruebas funcionales y de regresión.
- Probar el flujo desde WhatsApp hasta entrega.
- Simular desconexiones y duplicados.
- Validar permisos con usuarios reales.
- Capacitar al operador y a los domiciliarios.
- Configurar alertas y procedimientos de soporte.
- Realizar una prueba de carga acorde con el volumen esperado.
- Lanzar primero con un grupo controlado de usuarios.
- Ampliar gradualmente la operación.
- Revisar métricas y errores antes de activar más sedes o clientes.

**Criterios de salida:**

- No hay fallos críticos de aislamiento o autorización.
- Las pruebas de regresión del POS pasan.
- No se generan facturas ni movimientos de inventario inesperados.
- Los pedidos y las notificaciones son trazables.
- Existe un procedimiento de desconexión del canal y recuperación operativa.
- El comercio puede completar el proceso sin depender del equipo de desarrollo para cada pedido.

---

### Fase 9. Escalamiento comercial

**Objetivo:** convertir el piloto en un producto comercializable para otros clientes.

Actividades:

- Diseñar onboarding autoservicio de comercios.
- Permitir configuración independiente por tenant.
- Incorporar múltiples canales cuando sea necesario.
- Ampliar cobertura a otras ciudades y sedes.
- Configurar tarifas y políticas por zona.
- Medir costos y margen por comercio.
- Diseñar planes comerciales por capacidad y funcionalidades.
- Evaluar IA generativa con base en las consultas reales.
- Evaluar conversión explícita de pedido a factura POS.
- Preparar procedimientos de soporte, portabilidad y desconexión.

No se iniciará esta fase hasta validar el piloto y sus costos operativos.

---

## 5. Plan de trabajo por PR

| PR | Entrega | Dependencia |
|---|---|---|
| PR-01 | Fundación, permisos, migraciones y aislamiento | Fase 0 |
| PR-02 | Catálogo público y cotizador | PR-01 |
| PR-03 | Solicitudes, clientes, direcciones y pagos | PR-02 |
| PR-04 | Interfaz administrativa y formulario | PR-03 |
| PR-05 | Eventos, outbox y worker | PR-03 |
| PR-06 | Adaptador de WhatsApp y bandeja | PR-05 y decisión del proveedor |
| PR-07 | Domicilios y vista móvil del repartidor | PR-03 y autorización de despacho |
| PR-08 | Pruebas integrales, observabilidad y lanzamiento | PR-04 a PR-07 |
| PR-09 | Mejoras comerciales y expansión | Validación del piloto |

Cada PR debe tener alcance acotado, pruebas, revisión del diff y criterios de aceptación. Si un PR resulta demasiado grande, debe dividirse antes de implementarlo.

---

## 6. Seguridad, calidad y fiabilidad

Estas obligaciones aplican a todas las fases, no solamente a una etapa final.

### Seguridad

- Autorización explícita en cada ruta.
- Filtros por tenant y sede en toda consulta.
- Validación de webhooks y firmas del proveedor.
- Secretos fuera del código y de los logs.
- Protección de endpoints públicos mediante límites de uso.
- Tokens opacos para consultas públicas de pedidos.
- Acceso mínimo necesario para domiciliarios.
- Retención y eliminación de datos conforme a la política definida.

### Integridad comercial

- Precios calculados en el servidor.
- Snapshot de los artículos y valores cotizados.
- Idempotencia en creación y mutaciones críticas.
- Separación de pedido, pago, factura y entrega.
- Auditoría de aceptación, rechazo, verificación y despacho.
- Prohibición de crear facturas automáticamente durante el piloto.

### Calidad

- Pruebas unitarias de reglas de dominio.
- Pruebas de integración con Supabase.
- Pruebas de autorización entre tenants.
- Pruebas de transiciones de estado.
- Pruebas de webhooks duplicados y fuera de orden.
- Pruebas de regresión del POS.
- Pruebas de interfaz y accesibilidad.
- Validación de recuperación tras fallos.

---

## 7. Métricas para evaluar el piloto

### Métricas comerciales

- Consultas recibidas.
- Cotizaciones generadas.
- Solicitudes de pedido creadas.
- Pedidos aceptados y rechazados.
- Conversión de consulta a pedido.
- Tiempo promedio de respuesta.
- Tiempo entre pedido y aceptación.

### Métricas logísticas

- Pedidos pendientes de despacho.
- Tiempo hasta asignación.
- Tiempo de entrega.
- Entregas fallidas.
- Pedidos cancelados.
- Pedidos pendientes de verificación de pago.

### Métricas técnicas

- Mensajes entrantes y salientes.
- Mensajes fallidos y reintentados.
- Eventos duplicados.
- Tiempo de procesamiento de eventos.
- Errores por proveedor.
- Incidentes por tenant.
- Costo variable de mensajería por comercio.

### Métricas económicas

- Ingreso mensual por comercio.
- Costo de mensajería por comercio.
- Costo de infraestructura incremental.
- Tiempo de soporte por cliente.
- Margen de contribución del módulo.

Durante el piloto se establecerá una línea base. Los objetivos numéricos definitivos se fijarán después de observar el volumen real, en lugar de inventar una tasa de conversión o un costo objetivo sin datos.

---

## 8. Estrategia de pruebas y despliegue

Cada fase debe ejecutarse en un entorno de desarrollo y validarse en un entorno de pruebas antes de desplegarse.

### Proceso por PR

1. Revisar los archivos que se van a modificar.
2. Implementar exclusivamente el alcance aprobado.
3. Ejecutar pruebas específicas.
4. Ejecutar la suite de regresión relevante.
5. Revisar aislamiento, permisos y cambios de esquema.
6. Verificar que el diff no contenga cambios ajenos al objetivo.
7. Documentar resultados y riesgos.
8. Solicitar revisión y aprobación antes de integrar.

Las migraciones deberán estar versionadas y ser revisadas antes de su aplicación en producción. No se debe asumir que el esquema de producción coincide exactamente con el del repositorio sin verificarlo.

### Condiciones para el lanzamiento

- Configuración del comercio validada.
- Número de WhatsApp conectado y probado.
- Operadores capacitados.
- Domiciliarios con acceso mínimo necesario.
- Pruebas integrales satisfactorias.
- Alertas y registros operativos activos.
- Procedimiento de contingencia documentado.
- Plan de reversión o desactivación disponible.

---

## 9. Gestión de decisiones pendientes

Las siguientes decisiones deben quedar registradas antes de las fases que dependen de ellas:

| Decisión | Fecha límite funcional |
|---|---|
| Proveedor de WhatsApp | Antes de PR-06 |
| Tarifa fija y política de cobertura | Antes de finalizar PR-02 |
| Aceptación comercial frente a autorización de despacho | Antes de PR-03 |
| Modelo de acceso de domiciliarios | Antes de PR-07 |
| Retención de mensajes y evidencias | Antes de PR-05 y PR-06 |
| Worker y mecanismo de ejecución | Antes de PR-05 |
| Conversión explícita a factura | Fuera del piloto; aprobación posterior |

Las decisiones no deben quedar únicamente en conversaciones. Deben registrarse en documentos de arquitectura o decisiones técnicas versionadas dentro del repositorio.

---

## 10. Estimación de esfuerzo

La estimación inicial para el conjunto de funcionalidades se encuentra en el orden de 165–290 horas de desarrollo, sujeta a validación del repositorio, integración elegida, alcance de la interfaz y complejidad real de la operación.

Esta cifra es orientativa y no incluye necesariamente tiempos de aprobación de Meta, onboarding de números, capacitación del cliente, esperas externas ni soporte posterior al lanzamiento.

El calendario se definirá una vez que se conozcan las horas disponibles por semana y se confirme el alcance final de los PR.

---

## 11. Criterios de finalización del producto

Vendra Pedidos se considerará listo para su primera versión comercial cuando:

1. Un comercio pueda conectar y administrar su canal de WhatsApp.
2. Las conversaciones puedan atenderse desde Vendra.
3. Una consulta pueda convertirse en cotización y luego en solicitud de pedido.
4. Los precios y totales se calculen correctamente en el backend.
5. Los pedidos puedan aceptarse, rechazarse y cancelarse.
6. Los pagos manuales tengan estados y auditoría.
7. Los domiciliarios puedan recibir y completar entregas autorizadas.
8. Los errores de integración sean detectables y recuperables.
9. No existan accesos cruzados entre comercios.
10. El POS existente mantenga sus flujos actuales sin regresiones.
11. El piloto tenga métricas suficientes para evaluar la viabilidad comercial.
12. El módulo pueda configurarse para un segundo cliente sin duplicar código ni crear un sistema independiente.

## 12. Instrucción operativa para los agentes de desarrollo

Este documento será la referencia maestra del proyecto.

Los agentes deben:

- Consultarlo antes de iniciar una nueva fase.
- Implementar una fase o PR a la vez.
- Inspeccionar el código real antes de modificarlo.
- Reutilizar componentes y reglas existentes cuando corresponda.
- No inventar estructuras que contradigan la arquitectura actual.
- No adelantar funcionalidades de fases posteriores.
- No ejecutar cambios en producción sin aprobación expresa.
- Documentar las decisiones, pruebas, archivos modificados y riesgos.
- Detenerse cuando una decisión pendiente afecte la integridad de los datos, la seguridad o la compatibilidad del POS.

El avance entre fases requiere cumplir los criterios de aceptación y revisar el resultado de la fase anterior.

---

## Resultado esperado

Un módulo integrado en Vendra POS que permita gestionar conversaciones, pedidos, pagos manuales y domicilios de manera confiable, comenzando con un cliente y una ciudad y evolucionando posteriormente a una solución multiempresa configurable y comercializable.
