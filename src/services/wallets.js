// src/services/wallets.js
const { getPrisma } = require("../db/prisma");
const prisma = getPrisma();

async function getWallet(user_id, tx = prisma) {
  return tx.wallets.findUnique({
    where: { user_id },
  });
}

/**
 * Update (increment/decrement) user's REAL balance.
 *
 * IMPORTANT: "ledger = delta" ⇒ pass a delta (positive/negative) in RUB.
 *
 * @param {bigint} user_id
 * @param {number} amount - delta in RUB
 * @param {any} tx - Prisma client/tx (optional)
 */
async function updateBalance(user_id, amount, tx = prisma) {
  return tx.wallets.upsert({
    where: { user_id },
    create: {
      user_id,
      balance_real: amount,
    },
    update: {
      balance_real: { increment: amount },
    },
  });
}

module.exports = { getWallet, updateBalance };
