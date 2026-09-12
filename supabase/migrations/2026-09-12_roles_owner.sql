-- =====================================================
-- PyroVenta — Fase 1: Superadministrador y admins por punto
--
-- - Nuevo rol 'owner' (Superadministrador de la empresa: todos los puntos).
-- - Admin y owner entran con usuario + contraseña (bcrypt), no con PIN.
-- - Los admins actuales de PIN quedan DESACTIVADOS: no tienen usuario ni
--   contraseña y el login por PIN deja de aceptar administradores. Tras
--   correr esto, crear el Superadministrador desde el panel /super y que él
--   cree los administradores de cada punto.
--
-- Ejecutar en el SQL Editor de Supabase ANTES de desplegar el código.
-- NO destructivo (no borra filas).
-- =====================================================

ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_role_check;
ALTER TABLE sellers ADD CONSTRAINT sellers_role_check
  CHECK (role IN ('seller', 'cashier', 'admin', 'owner'));

ALTER TABLE sellers ADD COLUMN IF NOT EXISTS username      TEXT;
ALTER TABLE sellers ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE sellers ALTER COLUMN pin DROP NOT NULL;

-- Usuario siempre en minúsculas y único por empresa
ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_username_lower;
ALTER TABLE sellers ADD CONSTRAINT sellers_username_lower
  CHECK (username IS NULL OR username = lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS sellers_tenant_username
  ON sellers(tenant_id, username) WHERE username IS NOT NULL;

-- Admins de PIN existentes: se desactivan (ver encabezado)
UPDATE sellers SET active = false
WHERE role = 'admin' AND (username IS NULL OR password_hash IS NULL);

-- Un usuario ACTIVO debe tener las credenciales de su rol.
-- Los inactivos quedan libres para poder desactivar sin completar datos.
ALTER TABLE sellers DROP CONSTRAINT IF EXISTS sellers_credentials_by_role;
ALTER TABLE sellers ADD CONSTRAINT sellers_credentials_by_role CHECK (
  NOT active
  OR (role IN ('admin', 'owner') AND username IS NOT NULL AND password_hash IS NOT NULL)
  OR (role IN ('seller', 'cashier') AND pin IS NOT NULL)
);
