ALTER TABLE "run_event" DROP CONSTRAINT "run_event_turn_id_turn_id_fk";
--> statement-breakpoint
ALTER TABLE "usage_item" DROP CONSTRAINT "usage_item_turn_id_turn_id_fk";
--> statement-breakpoint
ALTER TABLE "verification_run" DROP CONSTRAINT "verification_run_turn_id_turn_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "turn_attempt_id_id_uq" ON "turn" USING btree ("attempt_id","id");--> statement-breakpoint
ALTER TABLE "run_event" ADD CONSTRAINT "run_event_attempt_turn_fk" FOREIGN KEY ("attempt_id","turn_id") REFERENCES "public"."turn"("attempt_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_item" ADD CONSTRAINT "usage_item_attempt_turn_fk" FOREIGN KEY ("attempt_id","turn_id") REFERENCES "public"."turn"("attempt_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_run" ADD CONSTRAINT "verification_run_attempt_turn_fk" FOREIGN KEY ("attempt_id","turn_id") REFERENCES "public"."turn"("attempt_id","id") ON DELETE no action ON UPDATE no action;
