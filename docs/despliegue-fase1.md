# Despliegue Fase 1 — Roles, puntos y separación

Guía para desplegar los cambios de roles (Superadministrador/owner,
administrador por punto, ingreso con usuario y contraseña) a producción.
Escrita para quien ejecuta el despliegue (dueño del negocio o quien lo
apoye técnicamente), no requiere conocer el código.

## 0. Pre-requisitos

Antes de tocar nada de esta fase, confirmar que estas tres migraciones
anteriores YA están aplicadas en la base de Supabase de producción:

- `2026-07-21_caja_v2.sql`
- `2026-08-03_invoice_idempotency.sql`
- `2026-08-03_transfer_provider.sql`

Si alguna falta, aplicarla primero y por separado (no forman parte de este
despliegue).

## 1. Ensayo previo en una base que NO sea la de producción

No probar nada de esto contra la base real primero. Ensayar en un branch de
Supabase (o una base local) que sea copia de la de producción:

1. Aplicar ahí las tres migraciones del paso 0 (si no las tiene) y luego
   `2026-09-12_roles_owner.sql`.
2. Desplegar el código de esta rama contra esa base (o correr localmente
   con `vercel dev` apuntando a esa base) y correr el checklist E2E manual
   completo (Task 10 del plan), es decir:

   1. Admin de PIN antiguo ya no entra con PIN.
   2. Owner entra con usuario/contraseña, ve "Todos los puntos", el
      comparativo y la pestaña Productos.
   3. Owner crea `admin.norte` con punto Norte; intentar asignarle Norte y
      Sur → error "exactamente un punto".
   4. `admin.norte` entra: resumen solo de Norte, sin selector de punto,
      sin comparativo, sin pestañas Productos; Puntos muestra solo Norte
      con nombre deshabilitado.
   5. `admin.norte` en Usuarios: rol solo ofrece Vendedor/Cajero; no ve al
      owner.
   6. `admin.norte` con DevTools llama `GET /api/reports/daily?location_id=<SUR>`
      → 403.
   7. Cajero Norte entra con PIN, ve Vender y Caja, cobra una venta.
   8. Vendedor Norte con su token llama `POST /api/invoices/<code>/pay` →
      403.
   9. Owner intenta desactivarse → botón no aparece; por API → 403. Con un
      solo owner, intentar degradarlo desde otro owner → 409.
   10. 5 contraseñas malas seguidas en el ingreso administrativo →
       bloqueo de 15 minutos.
   11. **Promover a un cajero existente a administrador**: su sesión de
       PIN anterior (el token de 7 días que tenía guardado en el
       navegador) debe recibir **401** en la siguiente petición — no debe
       poder seguir operando como si nada, ni tampoco heredar permisos de
       administrador con ese mismo token.

No continuar al paso 2 hasta que las 11 pruebas pasen.

## 2. Respaldo antes de migrar (producción)

Antes de correr `2026-09-12_roles_owner.sql` en producción, guardar quiénes
son hoy los administradores por PIN (la migración los va a desactivar,
porque el modelo nuevo exige usuario/contraseña para admin/owner):

```sql
SELECT id, name, pin FROM sellers WHERE role = 'admin' AND active;
```

Guardar el resultado completo (ids, nombres y PINs) en un lugar seguro
fuera de la base — es el respaldo para poder revertir.

### Rollback (si algo sale mal después de migrar)

1. Reactivar a los administradores de PIN que se guardaron en el paso
   anterior:

   ```sql
   UPDATE sellers SET active = true WHERE id IN (...);
   ```

   (reemplazar `(...)` por los ids guardados).

2. El rollback de base de datos **no basta por sí solo**: el código nuevo
   (esta rama) no tiene camino de PIN para administradores, así que
   también hay que **redesplegar el commit anterior** (el `master` de
   antes de este merge) en Vercel para que el login por PIN de esos
   administradores vuelva a funcionar.
3. Antes de poder reactivar administradores con PIN, hay que quitar la
   restricción que la migración agregó y que exige usuario/contraseña
   para admin/owner:

   ```sql
   ALTER TABLE sellers DROP CONSTRAINT sellers_credentials_by_role;
   ```

   Sin este paso, el `UPDATE` de reactivación puede fallar o dejar filas
   inconsistentes (admin activo sin usuario/contraseña y sin PIN
   utilizable por el código viejo).

## 3. Verificar el nombre de la restricción de rol

`2026-09-12_roles_owner.sql` reemplaza el CHECK de rol asumiendo que se
llama `sellers_role_check`. Confirmar antes de correr la migración:

```sql
SELECT conname FROM pg_constraint WHERE conrelid = 'sellers'::regclass;
```

Debe aparecer `sellers_role_check` en el listado. **Si el CHECK de rol
tiene otro nombre**, hay que editar la migración para soltar ese nombre en
vez de `sellers_role_check` antes de ejecutarla (de lo contrario el
`DROP CONSTRAINT IF EXISTS sellers_role_check` no hace nada y el `ADD
CONSTRAINT` puede chocar con el CHECK viejo).

## 4. Orden de despliegue en producción

Hacerlo **fuera del horario de venta** — entre el paso 2 y el paso 4 de
abajo ningún administrador puede iniciar sesión (los vendedores y cajeros
por PIN sí pueden seguir vendiendo con normalidad).

1. Correr en Supabase (producción), en este orden, las que falten:
   `2026-07-21_caja_v2.sql` → `2026-08-03_invoice_idempotency.sql` →
   `2026-08-03_transfer_provider.sql` → `2026-09-12_roles_owner.sql`.
2. Hacer merge/push del código **inmediatamente después** de la migración
   (Vercel despliega solo). No dejar la base migrada con el código viejo
   corriendo más tiempo del necesario.
3. Desde `/super`, en la empresa correspondiente, crear a Laura y a Julián
   como Superadministrador usando el botón **"Superadmin"** del panel
   (ahora pide usuario y contraseña).
4. Laura entra por "Ingreso administrativo" y:
   - Crea `admin.norte` y `admin.sur`.
   - Reasigna/crea cajeros y vendedores por punto.
   - Crea las cajas: Norte → Caja 1; Sur → Caja 1 y Caja 2.

## Aviso

Entre el paso 1 (migración) y el paso 4 (creación de los owners) **ningún
administrador puede iniciar sesión** — ni con PIN (ya no aplica a su rol)
ni con usuario/contraseña (todavía no existen esas cuentas). La venta en
el punto de venta (vendedores y cajeros con PIN) continúa sin
interrupción. Por eso el paso 2 debe hacerse enseguida después de migrar.
