DROP INDEX "purchases_buyerId_productId_unq";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "currency" SET DEFAULT 'RON';--> statement-breakpoint
ALTER TABLE "purchases" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_buyerId_productId_unq" ON "purchases" USING btree ("buyer_id","product_id") WHERE status = 'paid';
