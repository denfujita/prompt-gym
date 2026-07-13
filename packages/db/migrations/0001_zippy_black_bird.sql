CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'settled');--> statement-breakpoint
CREATE TABLE "cost_reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"utc_day" text NOT NULL,
	"reserved_nano_usd" bigint NOT NULL,
	"actual_nano_usd" bigint,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "cost_reservation_amount_ck" CHECK ("cost_reservation"."reserved_nano_usd" > 0 and ("cost_reservation"."actual_nano_usd" is null or ("cost_reservation"."actual_nano_usd" >= 0 and "cost_reservation"."actual_nano_usd" <= "cost_reservation"."reserved_nano_usd")))
);
--> statement-breakpoint
CREATE TABLE "eligibility_record" (
	"user_id" text PRIMARY KEY NOT NULL,
	"age_18_plus" boolean NOT NULL,
	"us_resident" boolean NOT NULL,
	"version" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "eligibility_required_truth_ck" CHECK ("eligibility_record"."age_18_plus" = true and "eligibility_record"."us_resident" = true)
);
--> statement-breakpoint
ALTER TABLE "dataset_release_episode" DROP CONSTRAINT "dataset_release_episode_attempt_id_attempt_id_fk";
--> statement-breakpoint
ALTER TABLE "leaderboard_entry" DROP CONSTRAINT "leaderboard_entry_challenge_version_id_challenge_version_id_fk";
--> statement-breakpoint
ALTER TABLE "leaderboard_entry" DROP CONSTRAINT "leaderboard_entry_task_instance_id_task_instance_id_fk";
--> statement-breakpoint
DROP INDEX "task_instance_assignment_uq";--> statement-breakpoint
DROP INDEX "leaderboard_exact_arena_idx";--> statement-breakpoint
ALTER TABLE "verification_run" ALTER COLUMN "private_result_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "challenge_slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "challenge_version" text NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "started_day" text NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "state" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "envelope" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leaderboard_entry" ADD COLUMN "challenge_slug" text NOT NULL;--> statement-breakpoint
ALTER TABLE "leaderboard_entry" ADD COLUMN "instance_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "turn" ADD COLUMN "state" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_reservation" ADD CONSTRAINT "cost_reservation_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_reservation_attempt_idx" ON "cost_reservation" USING btree ("attempt_id","status");--> statement-breakpoint
CREATE INDEX "cost_reservation_user_day_idx" ON "cost_reservation" USING btree ("user_id","utc_day","status");--> statement-breakpoint
CREATE INDEX "cost_reservation_day_idx" ON "cost_reservation" USING btree ("utc_day","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_one_active_user_uq" ON "attempt" USING btree ("user_id") WHERE "attempt"."status" in ('created', 'ready', 'running', 'awaiting_player');--> statement-breakpoint
CREATE UNIQUE INDEX "attempt_ranked_daily_challenge_uq" ON "attempt" USING btree ("user_id","challenge_slug","started_day") WHERE "attempt"."ranked" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "task_instance_seed_uq" ON "task_instance" USING btree ("challenge_version_id","seed_commitment","sandbox_image_digest");--> statement-breakpoint
CREATE INDEX "leaderboard_exact_arena_idx" ON "leaderboard_entry" USING btree ("arena_id","challenge_slug","instance_id","assisted","competition_tokens");--> statement-breakpoint
ALTER TABLE "leaderboard_entry" DROP COLUMN "challenge_version_id";--> statement-breakpoint
ALTER TABLE "leaderboard_entry" DROP COLUMN "task_instance_id";