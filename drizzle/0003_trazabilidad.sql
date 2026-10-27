ALTER TABLE "recall_cases" ADD COLUMN "outreach_ref" text;--> statement-breakpoint
ALTER TABLE "serial_lookups" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "serial_lookups" ADD COLUMN "contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "serial_lookups" ADD COLUMN "outreach_ref" text;