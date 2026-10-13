# Worker del outbox de Vendra Pedidos

El outbox (`connect_outbox`) no se vacía solo: una función serverless no es un worker persistente.
Un planificador administrado llama a `GET|POST /api/internal/outbox/run` a intervalos.

## Configuración (decisión adoptada: Supabase `pg_cron` + `pg_net`)

1. En Vercel define la variable `CRON_SECRET` (un valor largo y aleatorio). Sin ella el endpoint responde 503.
2. En el SQL Editor de Supabase (extensiones `pg_cron` y `pg_net` habilitadas), reemplaza `<DOMINIO>` y `<CRON_SECRET>`:

```sql
select cron.schedule(
  'vendra-outbox-run',
  '* * * * *',                         -- cada minuto
  $$ select net.http_post(
       url     := 'https://<DOMINIO>/api/internal/outbox/run',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
       body    := '{}'::jsonb,
       timeout_milliseconds := 20000
     ) $$
);
-- Desactivar:  select cron.unschedule('vendra-outbox-run');
```

El secreto queda en el texto del job de `cron.job` (visible para quien administra la base de datos).
Si eso no es aceptable, guárdalo en Supabase Vault y léelo desde el job.

## Qué hace cada ejecución

- Procesa hasta 20 filas vencidas con handler (reintento con backoff exponencial + jitter; 5 intentos por defecto; luego `failed`).
- Reclama filas `processing` abandonadas (más de 5 min).
- Durante los primeros 5 minutos de cada hora aplica la retención: 30 días para procesados/ignorados/entregados,
  90 días para fallidos (`integration_events` y `connect_outbox`). Mensajes, conversaciones y pedidos no se borran.
- Responde solo conteos `{ claimed, delivered, retried, failed }`; nunca payloads.

## Variables de entorno de WhatsApp (Meta Cloud API)

| Variable | Uso |
|---|---|
| `META_APP_SECRET` | Secreto de la app de Meta: valida `X-Hub-Signature-256` del webhook. Sin ella el webhook responde 503. |
| `<access_token_secret_ref>` | Una variable por canal; `whatsapp_channels.access_token_secret_ref` guarda su NOMBRE (p. ej. `WA_TOKEN_PILOTO`), nunca el token. |

URL del webhook en Meta: `https://<DOMINIO>/api/integrations/whatsapp/meta/webhook`, con el
`webhook_verify_token` del canal. El canal se da de alta con SQL en el piloto (aún no hay pantalla):

```sql
insert into whatsapp_channels (tenant_id, location_id, phone_number_id, display_phone_number, webhook_verify_token, access_token_secret_ref)
values ('<tenant>', '<sede>', '<phone_number_id de Meta>', '+57 300 ••• 4567', '<token aleatorio>', 'WA_TOKEN_PILOTO');
```
