-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('CRYPTOBOT', 'XROCKET', 'ADMIN');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('DEPOSIT', 'BET', 'WIN', 'REFUND', 'REFERRAL', 'CASHBACK', 'ADJUST', 'WITHDRAW', 'BONUS');

-- CreateEnum
CREATE TYPE "RefMode" AS ENUM ('FIX', 'PERCENT');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BonusType" AS ENUM ('DEPOSIT_15_NEWBIE', 'DAILY_RANDOM_10_5000');

-- CreateEnum
CREATE TYPE "BonusClaimStatus" AS ENUM ('ACTIVATED', 'CLAIMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PromoDepositClaimStatus" AS ENUM ('ACTIVATED', 'CLAIMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "NotifyStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'QUEUED', 'RUNNING', 'COMPLETED', 'CANCELED', 'FAILED');

-- CreateTable
CREATE TABLE "admin" (
    "id" BIGSERIAL NOT NULL,
    "bot_username" TEXT,
    "admin_ids" TEXT NOT NULL DEFAULT '',
    "fake_bets_enabled_default" BOOLEAN NOT NULL DEFAULT false,
    "fake_bets_min_sec_default" INTEGER NOT NULL DEFAULT 30,
    "fake_bets_max_sec_default" INTEGER NOT NULL DEFAULT 120,
    "game_channel_link" TEXT,
    "rules_channel_link" TEXT,
    "payments_channel_link" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "tg_id" BIGINT NOT NULL,
    "username" TEXT,
    "first_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "referrer_id" BIGINT,
    "ref_code" TEXT NOT NULL,
    "ref_mode" "RefMode" NOT NULL DEFAULT 'PERCENT',
    "ref_fix_amount" DECIMAL(18,6) NOT NULL DEFAULT 0.15,
    "ref_percent" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "captcha_passed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "user_id" BIGINT NOT NULL,
    "balance_real" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "provider" "Provider" NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "commission" DECIMAL(18,6) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "invoice_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_bonuses" (
    "id" BIGSERIAL NOT NULL,
    "referrer_id" BIGINT NOT NULL,
    "referral_id" BIGINT NOT NULL,
    "deposit_id" BIGINT,
    "mode" "RefMode" NOT NULL,
    "rate" DECIMAL(18,6),
    "fix_amount" DECIMAL(18,6),
    "bonus_amount" DECIMAL(18,6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonuses" (
    "id" BIGSERIAL NOT NULL,
    "type" "BonusType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_claims" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "bonus_type" "BonusType" NOT NULL,
    "day" DATE,
    "deposit_id" BIGINT,
    "amount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "BonusClaimStatus" NOT NULL DEFAULT 'CLAIMED',
    "reason" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonus_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_deposit_bonuses" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percent" DECIMAL(10,4) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_deposit_bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_deposit_claims" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "promo_id" BIGINT NOT NULL,
    "status" "PromoDepositClaimStatus" NOT NULL DEFAULT 'ACTIVATED',
    "deposit_id" BIGINT,
    "amount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "activated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(6),

    CONSTRAINT "promo_deposit_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications_outbox" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "status" "NotifyStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_campaigns" (
    "id" BIGSERIAL NOT NULL,
    "bonus_type" "BonusType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_by" BIGINT,

    CONSTRAINT "broadcast_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_tasks" (
    "id" BIGSERIAL NOT NULL,
    "campaign_id" BIGINT NOT NULL,
    "user_id" BIGINT NOT NULL,
    "status" "NotifyStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "broadcast_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_tg_id_key" ON "users"("tg_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_ref_code_key" ON "users"("ref_code");

-- CreateIndex
CREATE INDEX "users_referrer_id_idx" ON "users"("referrer_id");

-- CreateIndex
CREATE INDEX "deposits_user_id_idx" ON "deposits"("user_id");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_provider_invoice_id_key" ON "deposits"("provider", "invoice_id");

-- CreateIndex
CREATE INDEX "ledger_user_id_created_at_idx" ON "ledger"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_type_idx" ON "ledger"("type");

-- CreateIndex
CREATE INDEX "withdrawals_user_id_idx" ON "withdrawals"("user_id");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE INDEX "referral_bonuses_referrer_id_idx" ON "referral_bonuses"("referrer_id");

-- CreateIndex
CREATE INDEX "referral_bonuses_referral_id_idx" ON "referral_bonuses"("referral_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_bonuses_referrer_id_deposit_id_key" ON "referral_bonuses"("referrer_id", "deposit_id");

-- CreateIndex
CREATE UNIQUE INDEX "bonuses_type_key" ON "bonuses"("type");

-- CreateIndex
CREATE INDEX "bonus_claims_user_id_created_at_idx" ON "bonus_claims"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "bonus_claims_bonus_type_user_id_day_key" ON "bonus_claims"("bonus_type", "user_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "bonus_claims_bonus_type_deposit_id_key" ON "bonus_claims"("bonus_type", "deposit_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_deposit_bonuses_code_key" ON "promo_deposit_bonuses"("code");

-- CreateIndex
CREATE INDEX "promo_deposit_bonuses_expires_at_idx" ON "promo_deposit_bonuses"("expires_at");

-- CreateIndex
CREATE INDEX "promo_deposit_claims_user_id_status_activated_at_idx" ON "promo_deposit_claims"("user_id", "status", "activated_at");

-- CreateIndex
CREATE INDEX "promo_deposit_claims_deposit_id_idx" ON "promo_deposit_claims"("deposit_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_deposit_claims_user_id_promo_id_key" ON "promo_deposit_claims"("user_id", "promo_id");

-- CreateIndex
CREATE INDEX "notifications_outbox_status_created_at_idx" ON "notifications_outbox"("status", "created_at");

-- CreateIndex
CREATE INDEX "broadcast_campaigns_status_created_at_idx" ON "broadcast_campaigns"("status", "created_at");

-- CreateIndex
CREATE INDEX "broadcast_campaigns_bonus_type_idx" ON "broadcast_campaigns"("bonus_type");

-- CreateIndex
CREATE INDEX "broadcast_tasks_status_created_at_idx" ON "broadcast_tasks"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_tasks_campaign_id_user_id_key" ON "broadcast_tasks"("campaign_id", "user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_bonuses" ADD CONSTRAINT "referral_bonuses_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_bonuses" ADD CONSTRAINT "referral_bonuses_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_bonuses" ADD CONSTRAINT "referral_bonuses_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_claims" ADD CONSTRAINT "bonus_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_claims" ADD CONSTRAINT "bonus_claims_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_deposit_claims" ADD CONSTRAINT "promo_deposit_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_deposit_claims" ADD CONSTRAINT "promo_deposit_claims_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promo_deposit_bonuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_deposit_claims" ADD CONSTRAINT "promo_deposit_claims_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "deposits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications_outbox" ADD CONSTRAINT "notifications_outbox_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_tasks" ADD CONSTRAINT "broadcast_tasks_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "broadcast_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_tasks" ADD CONSTRAINT "broadcast_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
