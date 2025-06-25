CREATE TABLE `list` (
	`list_id` text PRIMARY KEY NOT NULL,
	`shop_id` text NOT NULL,
	`parfum_id` text NOT NULL,
	`price` real,
	`link` text,
	`is_deleted` integer DEFAULT false,
	`deleted_at` text,
	FOREIGN KEY (`shop_id`) REFERENCES `shop`(`shop_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parfum_id`) REFERENCES `parfum`(`parfum_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `parfum` (
	`parfum_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text NOT NULL,
	`is_deleted` integer DEFAULT false,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `shop` (
	`shop_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`is_deleted` integer DEFAULT false,
	`deleted_at` text
);
