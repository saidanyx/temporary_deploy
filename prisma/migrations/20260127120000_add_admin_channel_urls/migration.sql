-- Add channel URLs for info/support screen
ALTER TABLE "admin" ADD COLUMN "news_channel_url" TEXT;
ALTER TABLE "admin" ADD COLUMN "games_channel_url" TEXT;
ALTER TABLE "admin" ADD COLUMN "payments_channel_url" TEXT;
