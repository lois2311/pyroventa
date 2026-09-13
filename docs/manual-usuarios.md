# PyroVenta — Manual de usuarios y roles

## Los cuatro roles

| Rol | Qué hace | Cómo entra |
|---|---|---|
| **Superadministrador** | Ve y administra todos los puntos, el consolidado y la comparativa. Crea administradores y otros superadministradores. Único que edita productos, precios y puntos de venta. | Pantalla de inicio → **Ingreso administrativo** → usuario y contraseña |
| **Administrador** | Ve reportes, historial y cierres **solo de su punto**. Crea vendedores y cajeros de su punto, crea cajas y configura la impresora. Puede vender y cobrar. | **Ingreso administrativo** → usuario y contraseña |
| **Cajero** | Cobra, registra el método de pago, hace devoluciones y cierra caja. También puede vender. | Punto de venta → PIN de 4 dígitos |
| **Vendedor** | Arma el carrito y genera el código de la venta. No cobra. | Punto de venta → PIN de 4 dígitos |

## Crear el administrador de un punto (superadministrador)
1. Admin → **Usuarios** → **+ Nuevo**.
2. Nombre, rol **Administrador**.
3. Usuario (ej. `admin.norte`) y contraseña de mínimo 10 caracteres.
4. Marcar el punto que administra (solo uno) → **Guardar**.
5. Entregarle usuario y contraseña en persona.

## Crear un cajero o vendedor (administrador o superadministrador)
1. Admin → **Usuarios** → **+ Nuevo**.
2. Nombre, rol **Cajero** o **Vendedor**, PIN de 4 dígitos.
3. El administrador de punto no elige punto: queda en el suyo. El superadministrador marca en cuál(es) trabaja.
4. **Guardar**. La persona entra eligiendo su punto y escribiendo el PIN.

## Crear las cajas de un punto
Admin → **Cajas** → **+ Nueva caja** → nombre (ej. "Caja 2"). Norte: Caja 1. Sur: Caja 1 y Caja 2.

## Cambiar PIN o contraseña
Admin → Usuarios → **Editar** → escribir el nuevo PIN o contraseña. Si se deja vacío, no cambia. El PIN ya no se muestra en la lista por seguridad.

La contraseña de un **administrador** solo la puede restablecer el **superadministrador** desde Usuarios → Editar. En esta versión, un administrador no puede cambiar su propia contraseña desde el panel: si la olvida u olvidó, debe pedirle al superadministrador que le asigne una nueva.

## Desactivar a alguien que ya no trabaja
Admin → Usuarios → **Desactivar**. No se borra su historial de ventas.

## Reglas que el sistema no deja romper
- Un administrador no puede crear superadministradores ni administradores, ni verlos en la lista.
- Nadie puede cambiarse su propio rol, sus puntos ni desactivarse.
- Siempre debe quedar al menos un superadministrador activo.
- Un administrador no puede ver ventas, cierres ni usuarios del otro punto, aunque cambie la dirección de la página.

## Superadministrador: trabajar en un punto
En la barra superior, el selector de punto muestra **Todos los puntos** (solo administración) o el punto elegido. Para vender o cobrar, elegir un punto: aparecen los botones **Vender** y **Caja**.

Para el paso a paso de cómo desplegar esta versión en producción (migraciones, respaldo y orden de pasos), ver [`despliegue-fase1.md`](./despliegue-fase1.md).
