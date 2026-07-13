ALTER TABLE "cost_reservation" DROP CONSTRAINT "cost_reservation_amount_ck";
--> statement-breakpoint
ALTER TABLE "cost_reservation" ADD CONSTRAINT "cost_reservation_amount_ck" CHECK ("cost_reservation"."reserved_nano_usd" > 0 and ("cost_reservation"."actual_nano_usd" is null or "cost_reservation"."actual_nano_usd" >= 0));
