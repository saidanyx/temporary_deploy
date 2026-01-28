-- AlterTable
ALTER TABLE "admin" ALTER COLUMN "game_channel_id" DROP NOT NULL,
ALTER COLUMN "payments_channel_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "withdrawals" ALTER COLUMN "address" DROP NOT NULL;
