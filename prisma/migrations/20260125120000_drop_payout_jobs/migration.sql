-- Drop legacy payout_jobs table (manual payouts are handled вне бота).
-- Safe to run even if table already dropped by previous manual steps.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payout_jobs') THEN
    DROP TABLE "payout_jobs";
  END IF;
END $$;
