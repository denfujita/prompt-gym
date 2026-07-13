CREATE TABLE "daily_cost_total" (
	"utc_day" text PRIMARY KEY NOT NULL,
	"actual_nano_usd" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
