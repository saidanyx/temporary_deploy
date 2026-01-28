/*
  Warnings:

  - You are about to drop the column `admin_ids` on the `admin` table. All the data in the column will be lost.
  - You are about to drop the column `bot_username` on the `admin` table. All the data in the column will be lost.
  - You are about to drop the column `fake_bets_max_sec_default` on the `admin` table. All the data in the column will be lost.
  - You are about to drop the column `fake_bets_min_sec_default` on the `admin` table. All the data in the column will be lost.
  - You are about to drop the column `game_channel_link` on the `admin` table. All the data in the column will be lost.
  - You are about to drop the column `payments_channel_link` on the `admin` table. All the data in the column will be lost.
  - You are about to drop the column `rules_channel_link` on the `admin` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `admin` table. All the data in the column will be lost.
  - Added the required column `game_channel_id` to the `admin` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payments_channel_id` to the `admin` table without a default value. This is not possible if the table is not empty.
  - Added the required column `address` to the `withdrawals` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "admin" DROP COLUMN "admin_ids",
DROP COLUMN "bot_username",
DROP COLUMN "fake_bets_max_sec_default",
DROP COLUMN "fake_bets_min_sec_default",
DROP COLUMN "game_channel_link",
DROP COLUMN "payments_channel_link",
DROP COLUMN "rules_channel_link",
DROP COLUMN "updated_at",
ADD COLUMN     "fake_bets_sec" INTEGER[] DEFAULT ARRAY[30, 120]::INTEGER[],
ADD COLUMN     "game_channel_id" BIGINT NOT NULL,
ADD COLUMN     "payments_channel_id" BIGINT NOT NULL;

-- AlterTable
ALTER TABLE "withdrawals" ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "tx_hash" TEXT;
