CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"timestamp" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"state" text NOT NULL,
	"created_at" bigint NOT NULL,
	"ended_at" bigint
);
--> statement-breakpoint
CREATE TABLE "github_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"github_user_id" integer NOT NULL,
	"github_username" text NOT NULL,
	"access_token" text NOT NULL,
	"scope" text NOT NULL,
	"connected_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loop_output_chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"loop_run_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"stream" text NOT NULL,
	"data" text NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loop_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"ralph_loop_id" text,
	"state" text NOT NULL,
	"config" text,
	"prompt" text,
	"worktree" text,
	"iterations" bigint DEFAULT 0 NOT NULL,
	"tokens_used" bigint DEFAULT 0 NOT NULL,
	"errors" bigint DEFAULT 0 NOT NULL,
	"started_at" bigint NOT NULL,
	"ended_at" bigint
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"type" text,
	"ralph_config" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	"user_id" text,
	"github_owner" text,
	"github_repo" text,
	"default_branch" text,
	"workspace_path" text,
	CONSTRAINT "projects_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loop_output_chunks" ADD CONSTRAINT "loop_output_chunks_loop_run_id_loop_runs_id_fk" FOREIGN KEY ("loop_run_id") REFERENCES "public"."loop_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loop_runs" ADD CONSTRAINT "loop_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loop_output_chunks_loop_run_id_sequence_idx" ON "loop_output_chunks" USING btree ("loop_run_id","sequence");