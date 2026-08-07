CREATE TABLE `audio_records` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_day_id` text,
	`file_path` text NOT NULL,
	`duration_secs` integer,
	`transcription` text,
	`insights` text,
	`status` text DEFAULT 'recorded',
	`created_at` text,
	FOREIGN KEY (`trading_day_id`) REFERENCES `trading_days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `candle_data` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_day_id` text,
	`instrument` text NOT NULL,
	`timeframe` text NOT NULL,
	`date_time` text NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real,
	`quantity` integer,
	FOREIGN KEY (`trading_day_id`) REFERENCES `trading_days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `coach_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_day_id` text,
	`question` text NOT NULL,
	`answer` text,
	`insight` text,
	`created_at` text,
	FOREIGN KEY (`trading_day_id`) REFERENCES `trading_days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `key_levels` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_day_id` text,
	`name` text NOT NULL,
	`price` real NOT NULL,
	FOREIGN KEY (`trading_day_id`) REFERENCES `trading_days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trade_images` (
	`id` text PRIMARY KEY NOT NULL,
	`trade_id` text,
	`file_path` text NOT NULL,
	`caption` text,
	`image_type` text,
	`created_at` text,
	FOREIGN KEY (`trade_id`) REFERENCES `trades`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`trading_day_id` text,
	`trade_number` integer NOT NULL,
	`instrument` text NOT NULL,
	`open_time` text NOT NULL,
	`close_time` text NOT NULL,
	`duration` text,
	`side` text NOT NULL,
	`entry_price` real NOT NULL,
	`exit_price` real NOT NULL,
	`contracts` integer NOT NULL,
	`points` real,
	`reais` real,
	`is_average` integer DEFAULT false,
	`mep` real,
	`men` real,
	`drawdown` real,
	`conviction` integer,
	`execution` integer,
	`what_i_saw_now` text,
	`retrospective` text,
	`created_at` text,
	FOREIGN KEY (`trading_day_id`) REFERENCES `trading_days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trading_days` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`wake_up_time` text,
	`sleep_quality` integer,
	`mental_state` text,
	`personal_note` text,
	`macro_calendar` text,
	`overnight_note` text,
	`general_bias` text,
	`total_points` real,
	`total_reais` real,
	`trades_right` integer,
	`trades_wrong` integer,
	`avg_conviction` real,
	`avg_execution` real,
	`bias_correct` integer,
	`pre_market_done` integer DEFAULT false,
	`overtrading` integer DEFAULT false,
	`honest_phrase` text,
	`retrospective` text,
	`emotional_post` text,
	`created_at` text,
	`updated_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trading_days_date_unique` ON `trading_days` (`date`);