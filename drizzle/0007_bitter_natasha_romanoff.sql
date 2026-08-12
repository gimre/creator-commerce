CREATE TABLE "product_uploads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_uploads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner_id" text NOT NULL,
	"key" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "file_key" varchar(255);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "file_name" varchar(255);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "file_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "product_uploads" ADD CONSTRAINT "product_uploads_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_uploads_key_unq" ON "product_uploads" USING btree ("key");--> statement-breakpoint
CREATE INDEX "product_uploads_ownerId_idx" ON "product_uploads" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_fileKey_unq" ON "products" USING btree ("file_key");