// src/games/checkingBalance.js
const { getOrCreateUser } = require("../services/users");
const { updateBalance } = require("../services/wallets");
const { getPrisma } = require("../db/prisma");
const { insufficientFunds } = require("../ui/common");

const prisma = getPrisma();

/**
 * Verifies if the user has sufficient balance for the bet.
 * NOTE: this is a user-friendly pre-check; real enforcement is done atomically in DB.
 *
 * @param {Object} ctx - Telegram context.
 * @param {number} bet - Bet amount in rubles.
 * @param {Function} [backKb] - Optional function returning back keyboard.
 * @returns {Promise<{sufficient: boolean, balance: number, user: Object, dbUserId: BigInt}>}
 */
async function verifyBalance(ctx, bet, backKb = null) {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const dbUserId = user.id;

  // Prisma relation field is `wallets`
  const balanceRubles = Number(user.wallets?.balance_real ?? 0);

  if (balanceRubles < bet) {
    await insufficientFunds(ctx, backKb);
    return { sufficient: false, balance: balanceRubles, user, dbUserId };
  }

  return { sufficient: true, balance: balanceRubles, user, dbUserId };
}

/**
 * Atomically decrements user balance (if enough) and creates BET ledger entry.
 * Returns ok=false when balance is insufficient at commit time.
 */
async function deductBetWithLedgerAtomic(dbUserId, bet, meta) {
  const betAmount = Number(bet);
  if (!Number.isFinite(betAmount) || betAmount <= 0) {
    throw new Error("Invalid bet amount");
  }

  return prisma.$transaction(async (tx) => {
    // atomic check+decrement
    const updated = await tx.wallets.updateMany({
      where: {
        user_id: dbUserId,
        balance_real: { gte: betAmount },
      },
      data: {
        balance_real: { decrement: betAmount },
      },
    });

    if (!updated || updated.count === 0) {
      return { ok: false };
    }

    await createBetLedger(dbUserId, betAmount, meta, tx);

    const wallet = await tx.wallets.findUnique({ where: { user_id: dbUserId } });
    return { ok: true, wallet };
  });
}

/**
 * Checks balance and deducts bet (atomically) if sufficient funds.
 *
 * @param {Object} ctx - Telegram context.
 * @param {number} bet - Bet amount in rubles.
 * @param {Function} backKb - Function returning back keyboard.
 * @param {Object} meta - Metadata for ledger.
 * @returns {Promise<{user: Object, dbUserId: BigInt, balanceRubles: number} | null>}
 */
async function checkAndDeductBet(ctx, bet, backKb, meta) {
  const { sufficient, balance, user, dbUserId } = await verifyBalance(ctx, bet, backKb);
  if (!sufficient) return null;

  const res = await deductBetWithLedgerAtomic(dbUserId, bet, meta);
  if (!res.ok) {
    // race condition: balance changed since pre-check
    await insufficientFunds(ctx, backKb);
    return null;
  }

  return { user, dbUserId, balanceRubles: balance };
}

/**
 * Deducts bet from balance (non-atomic helper). Prefer deductBetWithLedgerAtomic.
 */
async function deductBet(dbUserId, bet) {
  await updateBalance(dbUserId, -Number(bet));
}

/**
 * Adds win/refund to balance.
 */
async function addWin(dbUserId, win) {
  await updateBalance(dbUserId, Number(win));
}

/**
 * Creates bet ledger entry (delta). BET is negative.
 */
async function createBetLedger(dbUserId, bet, meta, tx = prisma) {
  await tx.ledger.create({
    data: {
      user_id: dbUserId,
      type: "BET",
      amount: -Number(bet),
      meta: meta ?? undefined,
    },
  });
}

/**
 * Creates win ledger entry (delta). WIN is positive.
 */
async function createWinLedger(dbUserId, win, meta, tx = prisma) {
  await tx.ledger.create({
    data: {
      user_id: dbUserId,
      type: "WIN",
      amount: Number(win),
      meta: meta ?? undefined,
    },
  });
}

/**
 * Creates refund ledger entry (delta). REFUND is positive.
 */
async function createRefundLedger(dbUserId, amount, meta, tx = prisma) {
  await tx.ledger.create({
    data: {
      user_id: dbUserId,
      type: "REFUND",
      amount: Number(amount),
      meta: meta ?? undefined,
    },
  });
}

module.exports = {
  verifyBalance,
  checkAndDeductBet,
  deductBetWithLedgerAtomic,
  deductBet,
  addWin,
  createBetLedger,
  createWinLedger,
  createRefundLedger,
};
