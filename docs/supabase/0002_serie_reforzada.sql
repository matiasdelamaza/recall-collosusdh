-- Migración 0002_serie_reforzada para Supabase (proyecto recall-collosusdh).
-- Agrega el resultado "tanda reforzada" (REINFORCED) a los enums de verificación y de consultas.
-- Aplicar a mano ANTES de desplegar el código que lo usa (en Vercel el build corre con SKIP_DB_MIGRATIONS=true).
-- No crea tablas: no requiere cambios de RLS ni de permisos. Registra la migración en el journal de Drizzle.
begin;

ALTER TYPE "public"."lookup_result" ADD VALUE 'REINFORCED' BEFORE 'NOT_IDENTIFIED';
ALTER TYPE "public"."serial_verification_status" ADD VALUE 'REINFORCED' BEFORE 'NOT_IDENTIFIED';

insert into drizzle.__drizzle_migrations (hash, created_at)
values ('7e9c64cd8ae35aa9b6621b625bbcb205688d1b3324b39713365e8c80562fbcc4', 1793104548459);

commit;
