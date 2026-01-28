-- Add admin config fields: percent_referrals + rules_text
ALTER TABLE "admin" ADD COLUMN IF NOT EXISTS "percent_referrals" DECIMAL(5,2) NOT NULL DEFAULT 5.00;
ALTER TABLE "admin" ADD COLUMN IF NOT EXISTS "rules_text" TEXT NOT NULL DEFAULT '';

-- Drop legacy numeric channel id fields (moved to *_channel_url)
ALTER TABLE "admin" DROP COLUMN IF EXISTS "game_channel_id";
ALTER TABLE "admin" DROP COLUMN IF EXISTS "payments_channel_id";
