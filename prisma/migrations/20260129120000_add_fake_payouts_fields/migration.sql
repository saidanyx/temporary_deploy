-- Add fake payouts settings (similar to fake bets)
ALTER TABLE "admin" ADD COLUMN IF NOT EXISTS "fake_payouts_enabled_default" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin" ADD COLUMN IF NOT EXISTS "fake_payouts_sec" INTEGER[] NOT NULL DEFAULT ARRAY[120, 600]::INTEGER[];
