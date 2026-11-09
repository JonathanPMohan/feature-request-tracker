-- Custom SQL migration file, put your code below! --
ALTER TABLE "user"
  ADD CONSTRAINT user_role_valid
  CHECK (role IN ('user', 'admin'));
--> statement-breakpoint
ALTER TABLE "user"
  ADD CONSTRAINT user_demo_not_admin
  CHECK (NOT (is_demo AND role = 'admin'));