CREATE TYPE "public"."deployment_environment" AS ENUM('TEST', 'PRODUCTION');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('ACTIVE', 'INACTIVE', 'ROLLED_BACK');--> statement-breakpoint
CREATE TYPE "public"."version_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"environment" "deployment_environment" DEFAULT 'TEST' NOT NULL,
	"status" "deployment_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_by" uuid NOT NULL,
	"deployed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN "status" "version_status" DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_version_id_agent_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deployments_tenant_idx" ON "deployments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "deployments_agent_idx" ON "deployments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "deployments_version_idx" ON "deployments" USING btree ("version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "active_deployment_per_agent_env_idx" ON "deployments" USING btree ("agent_id","environment") WHERE status = 'ACTIVE';