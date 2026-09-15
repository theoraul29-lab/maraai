-- Trading Academy was replaced by Mara Missions. No route has served
-- /api/trading/* in a long time (confirmed: not registered in server/routes.ts),
-- and no code reads or writes these tables anymore (server/storage.ts's
-- CRUD methods and server/modules/search.ts's lessons query were removed
-- alongside this migration). Dropping them rather than leaving inert schema.

DROP TABLE IF EXISTS `trading_certificates`;
--> statement-breakpoint
DROP TABLE IF EXISTS `trading_lesson_progress`;
--> statement-breakpoint
DROP TABLE IF EXISTS `trading_lessons`;
--> statement-breakpoint
DROP TABLE IF EXISTS `trading_modules`;
