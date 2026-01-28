-- Add QUEUED status to PromoDepositClaimStatus enum
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'PromoDepositClaimStatus' AND e.enumlabel = 'QUEUED'
  ) THEN
    ALTER TYPE "PromoDepositClaimStatus" ADD VALUE 'QUEUED';
  END IF;
END $$;
