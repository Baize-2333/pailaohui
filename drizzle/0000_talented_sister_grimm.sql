CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`updated` integer NOT NULL,
	`listed` integer NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`state` text NOT NULL
);
