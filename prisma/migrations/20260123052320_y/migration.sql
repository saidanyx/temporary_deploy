/*
  Warnings:

  - You are about to drop the column `invoice_id` on the `withdrawals` table. All the data in the column will be lost.
  - You are about to drop the column `tx_hash` on the `withdrawals` table. All the data in the column will be lost.
  - Changed the type of `status` on the `withdrawals` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "wallets" DROP CONSTRAINT "wallets_user_id_fkey";

-- DropForeignKey
ALTER TABLE "withdrawals" DROP CONSTRAINT "withdrawals_user_id_fkey";

-- DropIndex
DROP INDEX "withdrawals_status_idx";

-- DropIndex
DROP INDEX "withdrawals_user_id_idx";

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "balance_reserved" DECIMAL(65,30) NOT NULL DEFAULT 0,
ALTER COLUMN "balance_real" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "withdrawals" DROP COLUMN "invoice_id",
DROP COLUMN "tx_hash",
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "fail_reason" TEXT,
ADD COLUMN     "idempotency" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "provider_ref" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "commission" SET DATA TYPE DECIMAL(65,30),
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL,
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "processed_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "payout_jobs" (
    "id" BIGSERIAL NOT NULL,
    "withdrawal_id" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payout_jobs_withdrawal_id_key" ON "payout_jobs"("withdrawal_id");

-- CreateIndex
CREATE INDEX "payout_jobs_status_next_run_at_idx" ON "payout_jobs"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "withdrawals_status_created_at_idx" ON "withdrawals"("status", "created_at");

-- CreateIndex
CREATE INDEX "withdrawals_user_id_created_at_idx" ON "withdrawals"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_jobs" ADD CONSTRAINT "payout_jobs_withdrawal_id_fkey" FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
