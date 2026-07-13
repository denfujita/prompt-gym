ALTER TABLE "run_event" ADD COLUMN "turn_id" uuid;--> statement-breakpoint
UPDATE "run_event" AS event
SET "turn_id" = turn_row."id"
FROM "turn" AS turn_row
WHERE event."turn_id" IS NULL
  AND event."attempt_id" = turn_row."attempt_id"
  AND event."public_payload"->>'turnId' = turn_row."id"::text;--> statement-breakpoint
ALTER TABLE "run_event" ADD CONSTRAINT "run_event_turn_id_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turn"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_event_turn_sequence_idx" ON "run_event" USING btree ("turn_id","sequence");--> statement-breakpoint
CREATE INDEX "usage_turn_idx" ON "usage_item" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "verification_turn_idx" ON "verification_run" USING btree ("turn_id");
