DROP INDEX "comment_author_id_idx";--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "submission_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_submission_key_unique" UNIQUE("author_id","submission_key");