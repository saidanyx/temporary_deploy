"use strict";

const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

const { updateBalance } = require("./wallets");
const { addLedgerEntry } = require("./ledger");

function toNumber(x) {
  if (x == null) return 0;
  if (typeof x === "number") return x;
  if (typeof x === "bigint") return Number(x);
  if (typeof x === "string") return Number(x);
  if (typeof x?.toNumber === "function") return x.toNumber();
  if (typeof x?.toString === "function") return Number(x.toString());
  return Number(x);
}

function computeReferralBonus({ mode, percent, fixAmount, lossAmount }) {
  const loss = toNumber(lossAmount);
  if (!Number.isFinite(loss) || loss <= 0) return 0;

  if (mode === "FIX") {
    const fixed = toNumber(fixAmount);
    if (!Number.isFinite(fixed) || fixed <= 0) return 0;
    return fixed;
  }

  // default: PERCENT
  const p = toNumber(percent);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return (loss * p) / 100;
}

/**
 * Начисление реф. бонуса ТОЛЬКО за проигрыши (сумма = loss_amount).
 *
 * Важно:
 * - Источник истины: схема Prisma (`users.ref_mode`, `users.ref_percent`, `users.ref_fix_amount`)
 * - Все суммы в ₽
 * - ledger = delta (для реферера) ⇒ amount положительный
 *
 * @param {bigint} user_id - ID проигравшего пользователя (users.id)
 * @param {number} loss_amount - сумма проигрыша (в ₽, положительная)
 * @param {any} tx - Prisma client/tx
 */
async function calculateReferralBonus(user_id, loss_amount, tx = prisma) {
  const u = await tx.users.findUnique({
    where: { id: user_id },
    select: { referrer_id: true },
  });

  if (!u?.referrer_id) return { ok: true, skipped: "no_referrer" };

  const referrer = await tx.users.findUnique({
    where: { id: u.referrer_id },
    select: { id: true },
  });

  if (!referrer) return { ok: true, skipped: "referrer_not_found" };

  const admin = await tx.admin.findFirst({ select: { percent_referrals: true } });
  const percent = toNumber(admin?.percent_referrals ?? 0);
  const bonus = computeReferralBonus({ mode: "PERCENT", percent, fixAmount: 0, lossAmount: loss_amount });

  if (!bonus || bonus <= 0) return { ok: true, skipped: "zero_bonus" };

  // Каждая ставка/игровой раунд — отдельное событие проигрыша.
  // Уникального ключа события в схеме нет, поэтому дедупликацию не делаем.
  await tx.referral_bonuses.create({
    data: {
      referrer_id: referrer.id,
      referral_id: user_id,
      deposit_id: null,
      mode: "PERCENT",
      rate: percent,
      fix_amount: null,
      bonus_amount: bonus,
    },
  });

  await addLedgerEntry(
    referrer.id,
    "REFERRAL",
    bonus,
    "REAL",
    {
      referral_id: user_id,
      loss_amount: toNumber(loss_amount),
      mode: "PERCENT",
      rate: percent,
      fix_amount: null,
    },
    tx
  );

  await updateBalance(referrer.id, bonus, tx);

  return { ok: true, bonus };
}

async function getReferralStats(user_id) {
  const referral_count = await prisma.users.count({
    where: { referrer_id: user_id },
  });

  // Суммарный "оборот" ставок рефералов (по ledger.BET).
  // BET хранится как delta (отрицательное), поэтому берём abs().
  const referrals_bets_result = await prisma.ledger.aggregate({
    where: {
      user: { referrer_id: user_id },
      type: "BET",
    },
    _sum: { amount: true },
  });

  const referrals_bets = toNumber(referrals_bets_result?._sum?.amount || 0);

  const total_earnings_result = await prisma.referral_bonuses.aggregate({
    where: { referrer_id: user_id },
    _sum: { bonus_amount: true },
  });

  const total_earnings = toNumber(total_earnings_result?._sum?.bonus_amount || 0);

  const user = await prisma.users.findUnique({
    where: { id: user_id },
    select: { ref_code: true },
  });

  return {
    referral_count,
    referrals_losses: parseFloat(Math.abs(referrals_bets).toFixed(6)),
    total_earnings: parseFloat(total_earnings.toFixed(6)),
    ref_link: user?.ref_code || "",
  };
}

module.exports = { calculateReferralBonus, getReferralStats, computeReferralBonus, toNumber };
