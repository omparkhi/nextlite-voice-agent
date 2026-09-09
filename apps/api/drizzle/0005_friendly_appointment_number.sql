ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "appointment_number" varchar(50);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_appointment_number_idx" ON "appointments" ("appointment_number");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_tenant_appointment_number_idx" ON "appointments" ("tenant_id", "appointment_number");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_appointment_counters" (
	"tenant_id" uuid PRIMARY KEY NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
