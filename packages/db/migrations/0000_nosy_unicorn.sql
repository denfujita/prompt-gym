CREATE TYPE "public"."artifact_kind" AS ENUM('file', 'snapshot', 'report');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('created', 'ready', 'running', 'awaiting_player', 'solved', 'failed', 'cancelled', 'expired', 'budget_exhausted');--> statement-breakpoint
CREATE TYPE "public"."challenge_kind" AS ENUM('visual', 'artifact', 'data');--> statement-breakpoint
CREATE TYPE "public"."event_actor" AS ENUM('system', 'player', 'model', 'tool', 'verifier');--> statement-breakpoint
CREATE TYPE "public"."turn_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "arena" (
	"id" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL,
	"model_alias" text NOT NULL,
	"resolved_model" text NOT NULL,
	"reasoning_effort" text NOT NULL,
	"response_verbosity" text NOT NULL,
	"price_version" text NOT NULL,
	"sandbox_image_digest" text NOT NULL,
	"ranked" boolean NOT NULL,
	"closed_reason" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"kind" "artifact_kind" NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"byte_length" bigint NOT NULL,
	"public_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_handle" text NOT NULL,
	"arena_id" text NOT NULL,
	"challenge_version_id" uuid NOT NULL,
	"task_instance_id" text NOT NULL,
	"ranked" boolean NOT NULL,
	"assisted" boolean DEFAULT false NOT NULL,
	"status" "attempt_status" NOT NULL,
	"prompts_used" integer DEFAULT 0 NOT NULL,
	"tool_actions_used" integer DEFAULT 0 NOT NULL,
	"competition_tokens" integer DEFAULT 0 NOT NULL,
	"actual_cost_nano_usd" bigint DEFAULT 0 NOT NULL,
	"max_prompts" integer NOT NULL,
	"max_tool_actions_per_turn" integer NOT NULL,
	"max_competition_tokens" integer NOT NULL,
	"max_actual_cost_nano_usd" bigint NOT NULL,
	"last_event_sequence" integer DEFAULT 0 NOT NULL,
	"last_event_hash" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_counters_nonnegative_ck" CHECK ("attempt"."prompts_used" >= 0 and "attempt"."tool_actions_used" >= 0 and "attempt"."competition_tokens" >= 0 and "attempt"."actual_cost_nano_usd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "baseline_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_instance_id" text NOT NULL,
	"arena_id" text NOT NULL,
	"strategy" text NOT NULL,
	"replicate" integer NOT NULL,
	"episode_object_key" text NOT NULL,
	"passed" boolean NOT NULL,
	"competition_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_slug" text NOT NULL,
	"version" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"generator_digest" text NOT NULL,
	"verifier_digest" text NOT NULL,
	"tool_schema_digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge" (
	"slug" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" "challenge_kind" NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"version" text NOT NULL,
	"operational" boolean DEFAULT true NOT NULL,
	"research" boolean NOT NULL,
	"public_replay" boolean NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"attempt_id" uuid,
	"entry_type" text NOT NULL,
	"amount_nano_usd" bigint NOT NULL,
	"utc_day" text NOT NULL,
	"reservation_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_release_episode" (
	"release_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"episode_sha256" text NOT NULL,
	"deletion_state" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "dataset_release_episode_release_id_attempt_id_pk" PRIMARY KEY("release_id","attempt_id")
);
--> statement-breakpoint
CREATE TABLE "dataset_release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" text NOT NULL,
	"state" text NOT NULL,
	"manifest_object_key" text NOT NULL,
	"manifest_sha256" text NOT NULL,
	"episode_count" integer NOT NULL,
	"tombstone_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fraud_signal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"attempt_id" uuid,
	"signal_type" text NOT NULL,
	"severity" integer NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fraud_signal_severity_ck" CHECK ("fraud_signal"."severity" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "leaderboard_entry" (
	"attempt_id" uuid PRIMARY KEY NOT NULL,
	"arena_id" text NOT NULL,
	"challenge_version_id" uuid NOT NULL,
	"task_instance_id" text NOT NULL,
	"public_handle" text NOT NULL,
	"competition_tokens" integer NOT NULL,
	"turns" integer NOT NULL,
	"assisted" boolean NOT NULL,
	"solved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"actor" "event_actor" NOT NULL,
	"event_type" text NOT NULL,
	"public_payload" jsonb NOT NULL,
	"previous_hash" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_instance" (
	"id" text PRIMARY KEY NOT NULL,
	"challenge_version_id" uuid NOT NULL,
	"instance_class" text NOT NULL,
	"seed_commitment" text NOT NULL,
	"sandbox_image_digest" text NOT NULL,
	"assigned_day" text NOT NULL,
	"seed_slot" integer NOT NULL,
	"private_locator" text NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_instance_seed_slot_ck" CHECK ("task_instance"."seed_slot" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "turn" (
	"id" uuid PRIMARY KEY NOT NULL,
	"attempt_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"prompt" text NOT NULL,
	"status" "turn_status" NOT NULL,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "turn_prompt_length_ck" CHECK (char_length("turn"."prompt") between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "usage_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"turn_id" uuid,
	"provider" text NOT NULL,
	"provider_response_id" text NOT NULL,
	"resolved_model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"cached_input_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"reasoning_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"image_tokens" integer NOT NULL,
	"tool_units" integer NOT NULL,
	"price_version" text NOT NULL,
	"actual_cost_nano_usd" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"turn_id" uuid,
	"passed" boolean NOT NULL,
	"verifier_digest" text NOT NULL,
	"public_feedback" text NOT NULL,
	"private_result_ref" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_arena_id_arena_id_fk" FOREIGN KEY ("arena_id") REFERENCES "public"."arena"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_challenge_version_id_challenge_version_id_fk" FOREIGN KEY ("challenge_version_id") REFERENCES "public"."challenge_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_task_instance_id_task_instance_id_fk" FOREIGN KEY ("task_instance_id") REFERENCES "public"."task_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_run" ADD CONSTRAINT "baseline_run_task_instance_id_task_instance_id_fk" FOREIGN KEY ("task_instance_id") REFERENCES "public"."task_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baseline_run" ADD CONSTRAINT "baseline_run_arena_id_arena_id_fk" FOREIGN KEY ("arena_id") REFERENCES "public"."arena"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_version" ADD CONSTRAINT "challenge_version_challenge_slug_challenge_slug_fk" FOREIGN KEY ("challenge_slug") REFERENCES "public"."challenge"("slug") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_release_episode" ADD CONSTRAINT "dataset_release_episode_release_id_dataset_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."dataset_release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_release_episode" ADD CONSTRAINT "dataset_release_episode_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_signal" ADD CONSTRAINT "fraud_signal_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entry" ADD CONSTRAINT "leaderboard_entry_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entry" ADD CONSTRAINT "leaderboard_entry_arena_id_arena_id_fk" FOREIGN KEY ("arena_id") REFERENCES "public"."arena"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entry" ADD CONSTRAINT "leaderboard_entry_challenge_version_id_challenge_version_id_fk" FOREIGN KEY ("challenge_version_id") REFERENCES "public"."challenge_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entry" ADD CONSTRAINT "leaderboard_entry_task_instance_id_task_instance_id_fk" FOREIGN KEY ("task_instance_id") REFERENCES "public"."task_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_event" ADD CONSTRAINT "run_event_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_instance" ADD CONSTRAINT "task_instance_challenge_version_id_challenge_version_id_fk" FOREIGN KEY ("challenge_version_id") REFERENCES "public"."challenge_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_item" ADD CONSTRAINT "usage_item_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_item" ADD CONSTRAINT "usage_item_turn_id_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turn"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_run" ADD CONSTRAINT "verification_run_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_run" ADD CONSTRAINT "verification_run_turn_id_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turn"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arena_season_idx" ON "arena" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_object_key_uq" ON "artifact" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "artifact_attempt_idx" ON "artifact" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "attempt_user_status_idx" ON "attempt" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "attempt_arena_instance_idx" ON "attempt" USING btree ("arena_id","task_instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baseline_instance_strategy_replicate_uq" ON "baseline_run" USING btree ("task_instance_id","arena_id","strategy","replicate");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_version_slug_version_uq" ON "challenge_version" USING btree ("challenge_slug","version");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_user_version_uq" ON "consent_record" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "consent_user_recorded_idx" ON "consent_record" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_user_day_idx" ON "credit_ledger" USING btree ("user_id","utc_day");--> statement-breakpoint
CREATE INDEX "credit_ledger_day_idx" ON "credit_ledger" USING btree ("utc_day");--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_release_version_uq" ON "dataset_release" USING btree ("version");--> statement-breakpoint
CREATE INDEX "fraud_signal_user_idx" ON "fraud_signal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leaderboard_exact_arena_idx" ON "leaderboard_entry" USING btree ("arena_id","challenge_version_id","task_instance_id","assisted","competition_tokens");--> statement-breakpoint
CREATE UNIQUE INDEX "run_event_attempt_sequence_uq" ON "run_event" USING btree ("attempt_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "run_event_attempt_hash_uq" ON "run_event" USING btree ("attempt_id","hash");--> statement-breakpoint
CREATE UNIQUE INDEX "task_instance_assignment_uq" ON "task_instance" USING btree ("challenge_version_id","assigned_day","seed_slot","instance_class");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_attempt_ordinal_uq" ON "turn" USING btree ("attempt_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_provider_response_uq" ON "usage_item" USING btree ("provider","provider_response_id");--> statement-breakpoint
CREATE INDEX "usage_attempt_idx" ON "usage_item" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "verification_attempt_idx" ON "verification_run" USING btree ("attempt_id");