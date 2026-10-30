-- Migración 0007_ia para Supabase (proyecto recall-collosusdh): IA en la Bandeja.
-- Aplicar a mano ANTES de desplegar el código que la usa (en Vercel el build corre con SKIP_DB_MIGRATIONS=true).
-- Importante: el esquema de Drizzle nombra email_messages.ai_excluded_at en cada select/insert de email_messages,
-- así que sin esta migración se rompen la bandeja y el webhook de correos entrantes, no solo las funciones de IA.
-- Crea ai_knowledge (fichas de entrenamiento) y ai_summaries (resúmenes guardados), con RLS y permisos para el rol
-- de la app (recall_app) igual que el resto de las tablas, agrega la columna email_messages.ai_excluded_at y
-- registra la migración en el journal de Drizzle (hash = sha256 de drizzle/0007_ia.sql, created_at = "when" del journal).
-- La columna nueva no requiere permisos: recall_app ya tiene permisos sobre la tabla email_messages completa.
begin;

CREATE TABLE "ai_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
CREATE TABLE "ai_summaries" (
	"thread_key" text PRIMARY KEY NOT NULL,
	"last_message_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "email_messages" ADD COLUMN "ai_excluded_at" timestamp with time zone;

alter table public.ai_knowledge enable row level security;
grant select, insert, update, delete on public.ai_knowledge to recall_app;
create policy recall_app_all on public.ai_knowledge for all to recall_app using (true) with check (true);

alter table public.ai_summaries enable row level security;
grant select, insert, update on public.ai_summaries to recall_app;
create policy recall_app_all on public.ai_summaries for all to recall_app using (true) with check (true);

insert into drizzle.__drizzle_migrations (hash, created_at)
values ('87abd746a44f28631656ef5c299e386b2ae6e8f20fe83c29cf7a5e274cee0e8d', 1793373839155);

commit;
