-- Enlaces temporales para que admin/owner establezcan su propia contraseña.
-- Solo se guarda el hash SHA-256 del token; el token en crudo viaja únicamente en la URL.
CREATE TABLE IF NOT EXISTS password_setup_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_by  UUID REFERENCES sellers(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS password_setup_tokens_hash_idx ON password_setup_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_setup_tokens_user_idx ON password_setup_tokens (user_id);

-- Solo la API (service role) accede: sin políticas, anon/authenticated no ven nada.
ALTER TABLE password_setup_tokens ENABLE ROW LEVEL SECURITY;

-- Consume el token y guarda la contraseña en UNA transacción.
-- Devuelve el id del usuario, o NULL si el token no es válido (inexistente, usado, revocado o vencido).
CREATE OR REPLACE FUNCTION consume_password_setup(p_token_hash TEXT, p_password_hash TEXT)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_user UUID;
BEGIN
  UPDATE password_setup_tokens SET used_at = now()
   WHERE token_hash = p_token_hash AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
   RETURNING user_id INTO v_user;
  IF v_user IS NULL THEN RETURN NULL; END IF;

  UPDATE sellers SET password_hash = p_password_hash
   WHERE id = v_user AND active AND role IN ('admin', 'owner');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'setup_target_invalid';  -- revierte también used_at
  END IF;
  RETURN v_user;
END $$;

REVOKE ALL ON FUNCTION consume_password_setup(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
