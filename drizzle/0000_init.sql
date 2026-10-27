CREATE TYPE "public"."bike_model" AS ENUM('COLLOSUS_DH7', 'COLLOSUS_DH9', 'NOT_SURE');--> statement-breakpoint
CREATE TYPE "public"."bike_size" AS ENUM('S', 'M', 'L', 'XL', 'NOT_SURE');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('REGISTERED', 'VALIDATED', 'CUSTOMER_CONTACTED', 'REPLACEMENT_FRAME_ASSIGNED', 'FRAME_IN_TRANSIT', 'FRAME_RECEIVED', 'SERVICE_SCHEDULED', 'REPLACED', 'CLOSED', 'MANUAL_REVIEW', 'INVALID_SERIAL', 'DUPLICATE_CASE', 'CUSTOMER_UNREACHABLE');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('SERIAL_PHOTO', 'BIKE_PHOTO', 'HEADTUBE_PHOTO', 'ADDITIONAL');--> statement-breakpoint
CREATE TYPE "public"."lookup_result" AS ENUM('AFFECTED', 'NOT_IDENTIFIED', 'INVALID', 'PENDING_DATABASE', 'RATE_LIMITED');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('NORMAL', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('REPLACEMENT', 'MANUAL_REVIEW', 'PENDING_DATABASE');--> statement-breakpoint
CREATE TYPE "public"."serial_verification_status" AS ENUM('AFFECTED', 'NOT_IDENTIFIED', 'UNVERIFIED', 'PENDING_DATABASE');--> statement-breakpoint
CREATE TYPE "public"."tri_state" AS ENUM('YES', 'NO', 'NOT_SURE');--> statement-breakpoint
CREATE TABLE "affected_serials" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "affected_serials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"serial_number" text NOT NULL,
	"serial_raw" text NOT NULL,
	"model" text,
	"size" text,
	"production_batch" text,
	"status" text DEFAULT 'RECALL' NOT NULL,
	"import_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid,
	"type" text NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" "file_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recall_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"customer_name" text NOT NULL,
	"rut" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"region" text NOT NULL,
	"city" text NOT NULL,
	"serial_number" text NOT NULL,
	"serial_raw" text NOT NULL,
	"model" "bike_model" NOT NULL,
	"size" "bike_size" NOT NULL,
	"dealer" text,
	"purchase_date" text,
	"serial_verification_status" serial_verification_status NOT NULL,
	"request_type" "request_type" NOT NULL,
	"priority" "priority" DEFAULT 'NORMAL' NOT NULL,
	"case_status" "case_status" DEFAULT 'REGISTERED' NOT NULL,
	"damage_reported" "tri_state" NOT NULL,
	"accident_reported" boolean DEFAULT false NOT NULL,
	"incident_description" text,
	"acknowledged_stop_riding" boolean DEFAULT false NOT NULL,
	"replacement_frame_serial" text,
	"replacement_frame_version" text,
	"assigned_to" text,
	"source" text DEFAULT 'WEB' NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"result_notified_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "serial_imports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "serial_imports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"filename" text NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"inserted_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"imported_by" text DEFAULT 'system' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serial_lookups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial_normalized" text NOT NULL,
	"result" "lookup_result" NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "affected_serials" ADD CONSTRAINT "affected_serials_import_id_serial_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."serial_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_case_id_recall_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."recall_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_case_id_recall_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."recall_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_recall_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."recall_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affected_serials_serial_number_idx" ON "affected_serials" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "analytics_events_name_idx" ON "analytics_events" USING btree ("name");--> statement-breakpoint
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_events_case_id_idx" ON "audit_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "case_files_case_id_idx" ON "case_files" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "case_notes_case_id_idx" ON "case_notes" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recall_cases_case_id_idx" ON "recall_cases" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "recall_cases_serial_number_idx" ON "recall_cases" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "recall_cases_email_idx" ON "recall_cases" USING btree ("email");--> statement-breakpoint
CREATE INDEX "recall_cases_rut_idx" ON "recall_cases" USING btree ("rut");--> statement-breakpoint
CREATE INDEX "recall_cases_case_status_idx" ON "recall_cases" USING btree ("case_status");--> statement-breakpoint
CREATE INDEX "recall_cases_created_at_idx" ON "recall_cases" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "serial_lookups_created_at_idx" ON "serial_lookups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "serial_lookups_ip_hash_idx" ON "serial_lookups" USING btree ("ip_hash");