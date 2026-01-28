-- Add enum for withdrawal networks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WithdrawalNetwork') THEN
    CREATE TYPE "WithdrawalNetwork" AS ENUM ('TRC20', 'ERC20');
  END IF;
END$$;

-- Add columns (with safe defaults for existing rows)
ALTER TABLE "withdrawals"
  ADD COLUMN IF NOT EXISTS "network" "WithdrawalNetwork" NOT NULL DEFAULT 'TRC20',
  ADD COLUMN IF NOT EXISTS "comment" TEXT;

-- Make address required again (best-effort for existing rows)
UPDATE "withdrawals" SET "address" = '' WHERE "address" IS NULL;
ALTER TABLE "withdrawals" ALTER COLUMN "address" SET NOT NULL;

-- Optional: drop default to force explicit network in new code paths
ALTER TABLE "withdrawals" ALTER COLUMN "network" DROP DEFAULT;
