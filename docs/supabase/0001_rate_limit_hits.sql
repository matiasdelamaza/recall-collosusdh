-- Migración 0001_rate_limit_hits para Supabase (proyecto recall-collosusdh).
-- En Vercel el build corre con SKIP_DB_MIGRATIONS=true, así que las migraciones nuevas se aplican a mano
-- ANTES de desplegar el código que las usa. Incluye RLS y permisos para el rol de la app (recall_app),
-- igual que el resto de las tablas, y registra la migración en el journal de Drizzle.
begin;

CREATE TABLE "rate_limit_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "rate_limit_hits_lookup_idx" ON "rate_limit_hits" USING btree ("bucket","key","created_at");
CREATE INDEX "rate_limit_hits_created_at_idx" ON "rate_limit_hits" USING btree ("created_at");

alter table public.rate_limit_hits enable row level security;
grant select, insert, delete on public.rate_limit_hits to recall_app;
create policy recall_app_all on public.rate_limit_hits for all to recall_app using (true) with check (true);

insert into drizzle.__drizzle_migrations (hash, created_at)
values ('c19452a8fcc9934d346eec9bcc939a39d565b97ab584ff433f72bf29c20d4c93', 1793103534981);

commit;
